import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ApplicationError } from '../../core/application-error.js'
import {
  CONNECTION_STATE_SCHEMA_VERSION,
  emptyConnectionState,
  type ConnectionStateDiagnosticCheck,
  type ConnectionStateDiagnosticReport,
  type ConnectionStateRepository,
  type ConnectionStateSnapshot,
  type ConnectionStateWrite
} from '../../core/connection-state-repository.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import { assertValidConnectionState, validateConnectionState } from '../../core/validate-connection-state.js'
import type { AdoptionReview, ConnectionRecord, DiscoveryRecord } from '../../domain/connection.js'
import type { NodeAccessProfile, OnboardingReviewRecord } from '../../domain/onboarding.js'
import type { InventoryPaths } from './inventory-paths.js'

type Decoded =
  | { kind: 'current'; snapshot: ConnectionStateSnapshot }
  | {
      kind: 'legacy'
      revision: number
      connections: readonly ConnectionRecord[]
      discoveries: readonly DiscoveryRecord[]
      adoptionReviews: readonly AdoptionReview[]
    }
  | { kind: 'invalid'; reason: 'syntax' | 'schema' | 'records' }

export type FileSystemConnectionStateOptions = {
  now?: () => Date
  maxBackups?: number
  faultInjector?: (stage: 'temporary-synced' | 'before-rename') => void | Promise<void>
}

export class FileSystemConnectionStateRepository implements ConnectionStateRepository {
  readonly #now: () => Date
  readonly #maxBackups: number
  readonly #faultInjector: FileSystemConnectionStateOptions['faultInjector']

  constructor(readonly paths: InventoryPaths, options: FileSystemConnectionStateOptions = {}) {
    this.#now = options.now ?? (() => new Date())
    this.#maxBackups = options.maxBackups ?? 10
    this.#faultInjector = options.faultInjector
  }

  async read(): Promise<ConnectionStateSnapshot> {
    try {
      const raw = await this.#readFile()
      if (raw === undefined) return emptyConnectionState()
      const decoded = decode(raw)
      if (decoded.kind === 'current') return structuredClone(decoded.snapshot)
      if (decoded.kind === 'legacy') return this.#migrate()
      await this.#quarantine(decoded.reason)
      throw quarantinedError()
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error
      throw persistenceError('The local connection state could not be read safely.')
    }
  }

  async save(state: ConnectionStateWrite, expectedRevision: number): Promise<ConnectionStateSnapshot> {
    return this.#withLock(async () => {
      const current = await this.#loadLocked()
      if (current.revision !== expectedRevision) {
        throw new ApplicationError({
          code: 'CONNECTION_STATE_REVISION_CONFLICT',
          exitCode: EXIT_CODES.stalePlan,
          severity: 'error',
          retryable: true,
          message: 'Connection or discovery state changed after this operation was prepared.',
          nextAction: 'Inspect the latest state and repeat the operation.'
        })
      }
      const accessProfiles = state.accessProfiles ?? current.accessProfiles
      const onboardingReviews = state.onboardingReviews ?? current.onboardingReviews
      assertValidConnectionState({ ...state, accessProfiles, onboardingReviews })
      if (current.updatedAt !== null) await this.#backup(current.revision, 'write')
      const snapshot: ConnectionStateSnapshot = {
        schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
        revision: current.revision + 1,
        updatedAt: this.#now().toISOString(),
        connections: structuredClone(state.connections),
        discoveries: structuredClone(state.discoveries),
        adoptionReviews: structuredClone(state.adoptionReviews),
        accessProfiles: structuredClone(accessProfiles),
        onboardingReviews: structuredClone(onboardingReviews)
      }
      await this.#atomicWrite(snapshot)
      await this.#pruneBackups()
      return structuredClone(snapshot)
    })
  }

  async diagnose(): Promise<ConnectionStateDiagnosticReport> {
    const checks: ConnectionStateDiagnosticCheck[] = []
    try {
      const raw = await this.#readFile()
      if (raw === undefined) {
        checks.push({ id: 'connection-state-file', status: 'pass', summary: 'No connection state file exists; connections and discoveries are empty.' })
      } else {
        const decoded = decode(raw)
        checks.push(decoded.kind === 'invalid'
          ? { id: 'connection-state-file', status: 'fail', summary: 'Connection state is corrupt, unsafe, or uses an unsupported schema.', nextAction: 'Run a connection query to quarantine it, then use "knm doctor --recover-connection-state" if a valid backup exists.' }
          : decoded.kind === 'legacy'
            ? { id: 'connection-state-file', status: 'warning', summary: 'Supported legacy connection state is ready for backup and migration.', nextAction: 'Run "knm connections list" to migrate it.' }
            : { id: 'connection-state-file', status: 'pass', summary: `Connection state schema ${decoded.snapshot.schemaVersion}, revision ${decoded.snapshot.revision}, ${decoded.snapshot.connections.length} connection${decoded.snapshot.connections.length === 1 ? '' : 's'}, ${decoded.snapshot.accessProfiles.length} access profile${decoded.snapshot.accessProfiles.length === 1 ? '' : 's'}, ${decoded.snapshot.onboardingReviews.length} onboarding review${decoded.snapshot.onboardingReviews.length === 1 ? '' : 's'}, ${decoded.snapshot.discoveries.length} discover${decoded.snapshot.discoveries.length === 1 ? 'y' : 'ies'}, and ${decoded.snapshot.adoptionReviews.length} adoption review${decoded.snapshot.adoptionReviews.length === 1 ? '' : 's'} are valid.` })
        const mode = (await stat(this.paths.connectionStateFile)).mode
        checks.push((mode & 0o077) === 0
          ? { id: 'connection-state-permissions', status: 'pass', summary: 'The connection state file is private to the current user.' }
          : { id: 'connection-state-permissions', status: 'fail', summary: 'Connection state permissions allow group or other access.', nextAction: 'Restrict the file to the current user.' })
      }
      const backups = await this.#entries(this.paths.backupsDirectory, 'connection-state-')
      checks.push(backups.length === 0
        ? { id: 'connection-state-backups', status: 'warning', summary: 'No connection-state backup exists yet.', nextAction: 'A backup will be created before the next replacement or migration.' }
        : { id: 'connection-state-backups', status: 'pass', summary: `${backups.length} bounded connection-state backup${backups.length === 1 ? ' is' : 's are'} available.` })
      const evidence = await this.#entries(this.paths.quarantineDirectory, 'connection-state-corrupt-')
      checks.push(evidence.length === 0
        ? { id: 'connection-state-quarantine', status: 'pass', summary: 'No connection-state corruption evidence is present.' }
        : { id: 'connection-state-quarantine', status: 'warning', summary: `${evidence.length} sanitized connection-state corruption evidence record${evidence.length === 1 ? ' is' : 's are'} preserved.` })
      const lock = await this.#lockState()
      checks.push(lock === 'absent'
        ? { id: 'connection-state-lock', status: 'pass', summary: 'No connection-state writer lock is active.' }
        : { id: 'connection-state-lock', status: 'warning', summary: `A ${lock} connection-state writer lock is present.`, nextAction: lock === 'stale' ? 'Retry a write to reconcile the stale lock.' : 'Wait for the active operation to finish.' })
    } catch {
      checks.push({ id: 'connection-state-access', status: 'fail', summary: 'Connection-state paths could not be inspected safely.', nextAction: 'Check local ownership and permissions.' })
    }
    return { healthy: checks.every((check) => check.status !== 'fail'), checks }
  }

  async recoverLatestBackup(): Promise<ConnectionStateSnapshot> {
    return this.#withLock(async () => {
      const raw = await this.#readFile()
      if (raw !== undefined) {
        const decoded = decode(raw)
        if (decoded.kind !== 'invalid') {
          throw new ApplicationError({
            code: 'CONNECTION_STATE_RECOVERY_NOT_REQUIRED',
            exitCode: EXIT_CODES.invalidInput,
            severity: 'error',
            retryable: false,
            message: 'The active connection state is readable; backup recovery is not required.',
            nextAction: 'Use normal connection and discovery commands.'
          })
        }
        await this.#quarantine(decoded.reason, false)
      }
      const names = (await this.#entries(this.paths.backupsDirectory, 'connection-state-')).sort().reverse()
      for (const name of names) {
        const backup = await readFile(join(this.paths.backupsDirectory, name), 'utf8').catch(() => undefined)
        if (backup === undefined) continue
        const decoded = decode(backup)
        if (decoded.kind === 'invalid') continue
        const revision = decoded.kind === 'current' ? decoded.snapshot.revision : decoded.revision
        const recovered: ConnectionStateSnapshot = decoded.kind === 'current'
          ? { ...structuredClone(decoded.snapshot), revision: revision + 1, updatedAt: this.#now().toISOString() }
          : {
              schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
              revision: revision + 1,
              updatedAt: this.#now().toISOString(),
              connections: structuredClone(decoded.connections),
              discoveries: structuredClone(decoded.discoveries),
              adoptionReviews: structuredClone(decoded.adoptionReviews),
              accessProfiles: legacyAccessProfiles(decoded.connections),
              onboardingReviews: []
            }
        await this.#atomicWrite(recovered)
        return recovered
      }
      throw new ApplicationError({
        code: 'CONNECTION_STATE_BACKUP_NOT_FOUND',
        exitCode: EXIT_CODES.configuration,
        severity: 'error',
        retryable: false,
        message: 'No valid connection-state backup is available.',
        nextAction: 'Recreate connection references from verified SSH aliases and repeat discovery.'
      })
    })
  }

  async #migrate(): Promise<ConnectionStateSnapshot> {
    return this.#withLock(async () => {
      const raw = await this.#readFile()
      if (raw === undefined) return emptyConnectionState()
      const decoded = decode(raw)
      if (decoded.kind === 'current') return decoded.snapshot
      if (decoded.kind === 'invalid') {
        await this.#quarantine(decoded.reason, false)
        throw quarantinedError()
      }
      await this.#backup(decoded.revision, 'migration')
      const migrated: ConnectionStateSnapshot = {
        schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
        revision: decoded.revision + 1,
        updatedAt: this.#now().toISOString(),
        connections: structuredClone(decoded.connections),
        discoveries: structuredClone(decoded.discoveries),
        adoptionReviews: structuredClone(decoded.adoptionReviews),
        accessProfiles: legacyAccessProfiles(decoded.connections),
        onboardingReviews: []
      }
      await this.#atomicWrite(migrated)
      return migrated
    })
  }

  async #loadLocked(): Promise<ConnectionStateSnapshot> {
    const raw = await this.#readFile()
    if (raw === undefined) return emptyConnectionState()
    const decoded = decode(raw)
    if (decoded.kind === 'current') return decoded.snapshot
    if (decoded.kind === 'invalid') {
      await this.#quarantine(decoded.reason, false)
      throw quarantinedError()
    }
    await this.#backup(decoded.revision, 'migration')
    const migrated: ConnectionStateSnapshot = {
      schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
      revision: decoded.revision + 1,
      updatedAt: this.#now().toISOString(),
      connections: structuredClone(decoded.connections),
      discoveries: structuredClone(decoded.discoveries),
      adoptionReviews: structuredClone(decoded.adoptionReviews),
      accessProfiles: legacyAccessProfiles(decoded.connections),
      onboardingReviews: []
    }
    await this.#atomicWrite(migrated)
    return migrated
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#ensureDirectories()
    let handle
    try {
      handle = await open(this.paths.connectionStateLockFile, 'wx', 0o600)
    } catch (error: unknown) {
      if (isCode(error, 'EEXIST')) {
        if (await this.#lockState() === 'stale') {
          await unlink(this.paths.connectionStateLockFile).catch(() => undefined)
          return this.#withLock(operation)
        }
        throw new ApplicationError({
          code: 'CONNECTION_STATE_LOCKED',
          exitCode: EXIT_CODES.configuration,
          severity: 'error',
          retryable: true,
          message: 'Another process is changing connections or discoveries.',
          nextAction: 'Wait for that operation to finish, then retry.'
        })
      }
      throw persistenceError('The connection-state lock could not be created.')
    }
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: this.#now().toISOString() })}\n`)
      await handle.sync()
      return await operation()
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error
      throw persistenceError('The connection-state operation did not complete safely.')
    } finally {
      await handle.close().catch(() => undefined)
      await unlink(this.paths.connectionStateLockFile).catch(() => undefined)
    }
  }

  async #atomicWrite(snapshot: ConnectionStateSnapshot): Promise<void> {
    await this.#ensureDirectories()
    const temporary = join(this.paths.rootDirectory, `.connection-state-${process.pid}-${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
      await handle.sync()
      await this.#faultInjector?.('temporary-synced')
      await handle.close()
      handle = undefined
      await this.#faultInjector?.('before-rename')
      await rename(temporary, this.paths.connectionStateFile)
      await chmod(this.paths.connectionStateFile, 0o600)
      await syncDirectory(this.paths.rootDirectory)
    } finally {
      await handle?.close().catch(() => undefined)
      await unlink(temporary).catch(() => undefined)
    }
  }

  async #backup(revision: number, reason: 'write' | 'migration'): Promise<void> {
    await this.#ensureDirectories()
    const target = join(this.paths.backupsDirectory, `connection-state-r${revision}-${stamp(this.#now())}-${reason}-${randomUUID().slice(0, 8)}.json`)
    await copyFile(this.paths.connectionStateFile, target)
    await chmod(target, 0o600)
  }

  async #quarantine(reason: string, lock = true): Promise<void> {
    const operation = async () => {
      const raw = await this.#readFile()
      if (raw === undefined) return
      await this.#ensureDirectories()
      const target = join(this.paths.quarantineDirectory, `connection-state-corrupt-${stamp(this.#now())}-${reason}-${randomUUID().slice(0, 8)}.json`)
      const evidence = {
        schemaVersion: 1,
        kind: 'connection-state-corruption-evidence',
        reason,
        byteLength: Buffer.byteLength(raw),
        sha256: createHash('sha256').update(raw).digest('hex'),
        quarantinedAt: this.#now().toISOString()
      }
      const handle = await open(target, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await unlink(this.paths.connectionStateFile)
      await syncDirectory(this.paths.rootDirectory)
    }
    if (lock) await this.#withLock(operation)
    else await operation()
  }

  async #ensureDirectories(): Promise<void> {
    for (const directory of [this.paths.rootDirectory, this.paths.backupsDirectory, this.paths.quarantineDirectory]) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await chmod(directory, 0o700)
    }
  }

  async #readFile(): Promise<string | undefined> {
    return readFile(this.paths.connectionStateFile, 'utf8').catch((error: unknown) => {
      if (isCode(error, 'ENOENT')) return undefined
      throw error
    })
  }

  async #entries(directory: string, prefix: string): Promise<string[]> {
    return readdir(directory).then((names) => names.filter((name) => name.startsWith(prefix))).catch((error: unknown) => {
      if (isCode(error, 'ENOENT')) return []
      throw error
    })
  }

  async #pruneBackups(): Promise<void> {
    const names = (await this.#entries(this.paths.backupsDirectory, 'connection-state-')).sort().reverse()
    await Promise.all(names.slice(this.#maxBackups).map((name) => unlink(join(this.paths.backupsDirectory, name))))
  }

  async #lockState(): Promise<'absent' | 'active' | 'stale'> {
    const file = await stat(this.paths.connectionStateLockFile).catch((error: unknown) => {
      if (isCode(error, 'ENOENT')) return undefined
      throw error
    })
    if (file === undefined) return 'absent'
    if (this.#now().getTime() - file.mtimeMs < 5 * 60 * 1000) return 'active'
    const raw = await readFile(this.paths.connectionStateLockFile, 'utf8').catch(() => '')
    try {
      const parsed = JSON.parse(raw) as { pid?: unknown }
      if (Number.isSafeInteger(parsed.pid) && processIsAlive(Number(parsed.pid))) return 'active'
    } catch {
      // Invalid old locks are stale.
    }
    return 'stale'
  }
}

function decode(raw: string): Decoded {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'syntax' }
  }
  if (!isObject(value) || !Array.isArray(value.connections) || !Array.isArray(value.discoveries)) return { kind: 'invalid', reason: 'schema' }
  const adoptionReviews = Array.isArray(value.adoptionReviews) ? value.adoptionReviews : []
  const accessProfiles = Array.isArray(value.accessProfiles) ? value.accessProfiles : []
  const onboardingReviews = Array.isArray(value.onboardingReviews) ? value.onboardingReviews : []
  if (validateConnectionState({
    connections: value.connections,
    discoveries: value.discoveries,
    adoptionReviews,
    accessProfiles,
    onboardingReviews
  }).length > 0) return { kind: 'invalid', reason: 'records' }
  if (value.schemaVersion === CONNECTION_STATE_SCHEMA_VERSION
    && hasKeys(value, ['schemaVersion', 'revision', 'updatedAt', 'connections', 'discoveries', 'adoptionReviews', 'accessProfiles', 'onboardingReviews'])
    && validEnvelope(value)) {
    return {
      kind: 'current',
      snapshot: {
        schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
        revision: value.revision as number,
        updatedAt: value.updatedAt as string | null,
        connections: structuredClone(value.connections as ConnectionRecord[]),
        discoveries: structuredClone(value.discoveries as DiscoveryRecord[]),
        adoptionReviews: structuredClone(value.adoptionReviews as AdoptionReview[]),
        accessProfiles: structuredClone(value.accessProfiles as NodeAccessProfile[]),
        onboardingReviews: structuredClone(value.onboardingReviews as OnboardingReviewRecord[])
      }
    }
  }
  if ((value.schemaVersion === 0 || value.schemaVersion === 1)
    && (value.schemaVersion === 0
      ? hasKeys(value, ['schemaVersion', 'revision', 'connections', 'discoveries'])
      : hasKeys(value, ['schemaVersion', 'revision', 'updatedAt', 'connections', 'discoveries', 'adoptionReviews']))
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0) {
    return {
      kind: 'legacy',
      revision: Number(value.revision),
      connections: structuredClone(value.connections as ConnectionRecord[]),
      discoveries: structuredClone(value.discoveries as DiscoveryRecord[]),
      adoptionReviews: structuredClone(adoptionReviews as AdoptionReview[])
    }
  }
  return { kind: 'invalid', reason: 'schema' }
}

function legacyAccessProfiles(_connections: readonly ConnectionRecord[]): readonly NodeAccessProfile[] {
  return []
}

function validEnvelope(value: Record<string, unknown>): boolean {
  return Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && (value.updatedAt === null || (typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))))
}

function hasKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const set = new Set(keys)
  return Object.keys(value).every((key) => set.has(key)) && keys.every((key) => key in value)
}

function quarantinedError(): ApplicationError {
  return new ApplicationError({
    code: 'CONNECTION_STATE_QUARANTINED',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: false,
    message: 'Unsafe connection or discovery state was removed from service and recorded as sanitized quarantine evidence.',
    nextAction: 'Run "knm doctor" and recover a valid backup when available.'
  })
}

function persistenceError(message: string): ApplicationError {
  return new ApplicationError({
    code: 'CONNECTION_STATE_PERSISTENCE_FAILED',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: true,
    message,
    nextAction: 'Run "knm doctor" and inspect local ownership, permissions, and disk space.'
  })
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return !(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ESRCH')
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '')
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
