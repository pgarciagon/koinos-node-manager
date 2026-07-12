import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import { emptyInventorySnapshot } from '../../core/node-inventory.js'
import {
  INVENTORY_SCHEMA_VERSION,
  type InventoryDiagnosticCheck,
  type InventoryDiagnosticReport,
  type InventoryRepository,
  type InventorySnapshot
} from '../../core/node-repository.js'
import { assertValidInventoryNodes, validateInventoryNodes } from '../../core/validate-node.js'
import type { NodeRecord } from '../../domain/node.js'
import type { InventoryPaths } from './inventory-paths.js'

export type InventoryWriteStage = 'temporary-opened' | 'temporary-synced' | 'before-rename' | 'after-rename'

export type FileSystemInventoryRepositoryOptions = {
  now?: () => Date
  maxBackups?: number
  faultInjector?: (stage: InventoryWriteStage) => void | Promise<void>
}

type DecodedInventory =
  | { kind: 'current'; snapshot: InventorySnapshot }
  | { kind: 'legacy'; revision: number; nodes: readonly NodeRecord[] }
  | { kind: 'invalid'; reason: 'syntax' | 'schema' | 'records' }

export class FileSystemInventoryRepository implements InventoryRepository {
  readonly #now: () => Date
  readonly #maxBackups: number
  readonly #faultInjector: ((stage: InventoryWriteStage) => void | Promise<void>) | undefined

  constructor(readonly paths: InventoryPaths, options: FileSystemInventoryRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date())
    this.#maxBackups = options.maxBackups ?? 10
    this.#faultInjector = options.faultInjector
  }

  async list(): Promise<readonly NodeRecord[]> {
    return structuredClone((await this.read()).nodes)
  }

  async read(): Promise<InventorySnapshot> {
    try {
      const raw = await this.#readInventoryFile()
      if (raw === undefined) return emptyInventorySnapshot()
      const decoded = decodeInventory(raw)
      if (decoded.kind === 'current') return structuredClone(decoded.snapshot)
      if (decoded.kind === 'legacy') return this.#migrateLegacyInventory()
      await this.#quarantineCurrentInventory(decoded.reason)
      throw quarantinedError()
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error
      throw persistenceError('The local inventory could not be read safely.', error)
    }
  }

  async save(nodes: readonly NodeRecord[], expectedRevision: number): Promise<InventorySnapshot> {
    assertValidInventoryNodes(nodes)
    return this.#withLock(async () => {
      const current = await this.#loadCurrentWhileLocked()
      if (current.revision !== expectedRevision) {
        throw new ApplicationError({
          code: 'INVENTORY_REVISION_CONFLICT',
          exitCode: EXIT_CODES.stalePlan,
          severity: 'error',
          retryable: true,
          message: 'The inventory changed after this operation was prepared.',
          nextAction: 'Inspect the latest inventory and repeat the metadata change.'
        })
      }
      if (current.updatedAt !== null) await this.#backupCurrentInventory(current.revision, 'write')
      const snapshot: InventorySnapshot = {
        schemaVersion: INVENTORY_SCHEMA_VERSION,
        revision: current.revision + 1,
        updatedAt: this.#now().toISOString(),
        nodes: structuredClone(nodes)
      }
      await this.#atomicWrite(snapshot)
      await this.#pruneBackups()
      return structuredClone(snapshot)
    })
  }

  async diagnose(): Promise<InventoryDiagnosticReport> {
    const checks: InventoryDiagnosticCheck[] = []
    try {
      const root = await stat(this.paths.rootDirectory).catch((error: unknown) => {
        if (isMissing(error)) return undefined
        throw error
      })
      if (root === undefined) {
        checks.push({ id: 'storage-root', status: 'pass', summary: 'The storage root will be created securely on the first inventory write.' })
      } else {
        const privateMode = (root.mode & 0o077) === 0
        checks.push(privateMode
          ? { id: 'storage-root', status: 'pass', summary: 'The storage root exists with private permissions.' }
          : { id: 'storage-root', status: 'fail', summary: 'The storage root permissions allow group or other access.', nextAction: 'Restrict the storage root to the current user before storing operational metadata.' })
      }

      const raw = await this.#readInventoryFile()
      if (raw === undefined) {
        checks.push({ id: 'inventory-file', status: 'pass', summary: 'No inventory file exists; the local inventory is empty.' })
      } else {
        const decoded = decodeInventory(raw)
        if (decoded.kind === 'invalid') {
          checks.push({ id: 'inventory-file', status: 'fail', summary: 'The inventory is corrupt, unsafe, or uses an unsupported schema.', nextAction: 'Run a normal inventory query to quarantine it, then use "knm doctor --recover-inventory" if a valid backup exists.' })
        } else if (decoded.kind === 'legacy') {
          checks.push({ id: 'inventory-file', status: 'warning', summary: 'A supported legacy inventory is ready for backup and migration.', nextAction: 'Run "knm nodes list" to perform the migration.' })
        } else {
          checks.push({ id: 'inventory-file', status: 'pass', summary: `Inventory schema ${decoded.snapshot.schemaVersion}, revision ${decoded.snapshot.revision}, and ${decoded.snapshot.nodes.length} record${decoded.snapshot.nodes.length === 1 ? '' : 's'} are valid.` })
        }
        const inventoryStat = await stat(this.paths.inventoryFile)
        checks.push((inventoryStat.mode & 0o077) === 0
          ? { id: 'inventory-permissions', status: 'pass', summary: 'The inventory file is private to the current user.' }
          : { id: 'inventory-permissions', status: 'fail', summary: 'The inventory file permissions allow group or other access.', nextAction: 'Restrict the inventory file to the current user.' })
      }

      const backups = await this.#directoryEntries(this.paths.backupsDirectory, 'inventory-')
      checks.push(backups.length > 0
        ? { id: 'inventory-backups', status: 'pass', summary: `${backups.length} bounded inventory backup${backups.length === 1 ? ' is' : 's are'} available for recovery.` }
        : { id: 'inventory-backups', status: 'warning', summary: 'No inventory backup exists yet.', nextAction: 'A backup will be created before the next replacement or migration.' })

      const quarantine = await this.#directoryEntries(this.paths.quarantineDirectory, 'inventory-corrupt-')
      checks.push(quarantine.length === 0
        ? { id: 'inventory-quarantine', status: 'pass', summary: 'No quarantined inventory files are present.' }
        : { id: 'inventory-quarantine', status: 'warning', summary: `${quarantine.length} sanitized corruption evidence record${quarantine.length === 1 ? ' is' : 's are'} preserved for review.` })

      const temporary = await this.#directoryEntries(this.paths.rootDirectory, '.inventory-')
      checks.push(temporary.length === 0
        ? { id: 'atomic-write-state', status: 'pass', summary: 'No interrupted temporary inventory writes are present.' }
        : { id: 'atomic-write-state', status: 'warning', summary: `${temporary.length} interrupted temporary write artifact${temporary.length === 1 ? '' : 's'} are isolated from the active inventory.` })

      const lockState = await this.#inspectLock()
      checks.push(lockState === 'absent'
        ? { id: 'inventory-lock', status: 'pass', summary: 'No inventory writer lock is active.' }
        : lockState === 'stale'
          ? { id: 'inventory-lock', status: 'warning', summary: 'A stale inventory writer lock is present.', nextAction: 'Retry an inventory write to reconcile the stale lock safely.' }
          : { id: 'inventory-lock', status: 'warning', summary: 'An inventory writer lock is currently active.', nextAction: 'Wait for the active inventory operation to finish.' })
    } catch (error: unknown) {
      checks.push({
        id: 'storage-access',
        status: 'fail',
        summary: 'The local inventory paths could not be inspected safely.',
        nextAction: 'Check directory ownership and permissions, then run "knm doctor" again.'
      })
    }
    return { healthy: checks.every((check) => check.status !== 'fail'), checks }
  }

  async recoverLatestBackup(): Promise<InventorySnapshot> {
    return this.#withLock(async () => {
      const raw = await this.#readInventoryFile()
      if (raw !== undefined) {
        const decoded = decodeInventory(raw)
        if (decoded.kind !== 'invalid') {
          throw new ApplicationError({
            code: 'INVENTORY_RECOVERY_NOT_REQUIRED',
            exitCode: EXIT_CODES.invalidInput,
            severity: 'error',
            retryable: false,
            message: 'The active inventory is readable; backup recovery is not required.',
            nextAction: 'Use normal inventory commands, or preserve and remove the active file manually only after review.'
          })
        }
        await this.#quarantineCurrentInventory(decoded.reason, false)
      }

      const backupNames = (await this.#directoryEntries(this.paths.backupsDirectory, 'inventory-')).sort().reverse()
      for (const name of backupNames) {
        const backupRaw = await readFile(join(this.paths.backupsDirectory, name), 'utf8').catch(() => undefined)
        if (backupRaw === undefined) continue
        const decoded = decodeInventory(backupRaw)
        if (decoded.kind === 'invalid') continue
        const revision = decoded.kind === 'current' ? decoded.snapshot.revision : decoded.revision
        const nodes = decoded.kind === 'current' ? decoded.snapshot.nodes : decoded.nodes
        const recovered: InventorySnapshot = {
          schemaVersion: INVENTORY_SCHEMA_VERSION,
          revision: revision + 1,
          updatedAt: this.#now().toISOString(),
          nodes: structuredClone(nodes)
        }
        await this.#atomicWrite(recovered)
        return structuredClone(recovered)
      }
      throw new ApplicationError({
        code: 'INVENTORY_BACKUP_NOT_FOUND',
        exitCode: EXIT_CODES.configuration,
        severity: 'error',
        retryable: false,
        message: 'No valid inventory backup is available for recovery.',
        nextAction: 'Review quarantined files or rebuild the inventory from verified metadata.'
      })
    })
  }

  async #migrateLegacyInventory(): Promise<InventorySnapshot> {
    return this.#withLock(async () => {
      const raw = await this.#readInventoryFile()
      if (raw === undefined) return emptyInventorySnapshot()
      const decoded = decodeInventory(raw)
      if (decoded.kind === 'current') return structuredClone(decoded.snapshot)
      if (decoded.kind === 'invalid') {
        await this.#quarantineCurrentInventory(decoded.reason, false)
        throw quarantinedError()
      }
      await this.#backupCurrentInventory(decoded.revision, 'migration')
      const migrated: InventorySnapshot = {
        schemaVersion: INVENTORY_SCHEMA_VERSION,
        revision: decoded.revision + 1,
        updatedAt: this.#now().toISOString(),
        nodes: structuredClone(decoded.nodes)
      }
      await this.#atomicWrite(migrated)
      await this.#pruneBackups()
      return structuredClone(migrated)
    })
  }

  async #loadCurrentWhileLocked(): Promise<InventorySnapshot> {
    const raw = await this.#readInventoryFile()
    if (raw === undefined) return emptyInventorySnapshot()
    const decoded = decodeInventory(raw)
    if (decoded.kind === 'current') return decoded.snapshot
    if (decoded.kind === 'invalid') {
      await this.#quarantineCurrentInventory(decoded.reason, false)
      throw quarantinedError()
    }
    await this.#backupCurrentInventory(decoded.revision, 'migration')
    const migrated: InventorySnapshot = {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      revision: decoded.revision + 1,
      updatedAt: this.#now().toISOString(),
      nodes: structuredClone(decoded.nodes)
    }
    await this.#atomicWrite(migrated)
    return migrated
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#ensureDirectories()
    let handle
    try {
      handle = await open(this.paths.lockFile, 'wx', 0o600)
    } catch (error: unknown) {
      if (isAlreadyExists(error)) {
        if (await this.#inspectLock() === 'stale') {
          await unlink(this.paths.lockFile).catch((unlinkError: unknown) => {
            if (!isMissing(unlinkError)) throw unlinkError
          })
          return this.#withLock(operation)
        }
        throw new ApplicationError({
          code: 'INVENTORY_LOCKED',
          exitCode: EXIT_CODES.configuration,
          severity: 'error',
          retryable: true,
          message: 'Another process is changing the local inventory.',
          nextAction: 'Wait for that operation to finish, then retry.'
        })
      }
      throw persistenceError('The inventory lock could not be created.', error)
    }
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: this.#now().toISOString() })}\n`, 'utf8')
      await handle.sync()
      return await operation()
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error
      throw persistenceError('The local inventory operation did not complete safely.', error)
    } finally {
      await handle.close().catch(() => undefined)
      await unlink(this.paths.lockFile).catch(() => undefined)
    }
  }

  async #atomicWrite(snapshot: InventorySnapshot): Promise<void> {
    await this.#ensureDirectories()
    const temporary = join(this.paths.rootDirectory, `.inventory-${process.pid}-${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, 'wx', 0o600)
      await this.#faultInjector?.('temporary-opened')
      await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
      await handle.sync()
      await this.#faultInjector?.('temporary-synced')
      await handle.close()
      handle = undefined
      await this.#faultInjector?.('before-rename')
      await rename(temporary, this.paths.inventoryFile)
      await chmod(this.paths.inventoryFile, 0o600)
      await this.#faultInjector?.('after-rename')
      await syncDirectory(this.paths.rootDirectory)
    } finally {
      await handle?.close().catch(() => undefined)
      await unlink(temporary).catch(() => undefined)
    }
  }

  async #backupCurrentInventory(revision: number, reason: 'write' | 'migration'): Promise<void> {
    await this.#ensureDirectories()
    const name = `inventory-r${revision}-${stamp(this.#now())}-${reason}-${randomUUID().slice(0, 8)}.json`
    const destination = join(this.paths.backupsDirectory, name)
    await copyFile(this.paths.inventoryFile, destination)
    await chmod(destination, 0o600)
  }

  async #quarantineCurrentInventory(reason: string, acquireLock = true): Promise<void> {
    const operation = async () => {
      await this.#ensureDirectories()
      const raw = await this.#readInventoryFile()
      if (raw === undefined) return
      const destination = join(
        this.paths.quarantineDirectory,
        `inventory-corrupt-${stamp(this.#now())}-${reason}-${randomUUID().slice(0, 8)}.json`
      )
      const evidence = {
        schemaVersion: 1,
        kind: 'inventory-corruption-evidence',
        reason,
        byteLength: Buffer.byteLength(raw),
        sha256: createHash('sha256').update(raw).digest('hex'),
        quarantinedAt: this.#now().toISOString()
      }
      const handle = await open(destination, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await unlink(this.paths.inventoryFile)
      await syncDirectory(this.paths.rootDirectory)
    }
    if (acquireLock) await this.#withLock(operation)
    else await operation()
  }

  async #pruneBackups(): Promise<void> {
    const names = (await this.#directoryEntries(this.paths.backupsDirectory, 'inventory-')).sort().reverse()
    await Promise.all(names.slice(this.#maxBackups).map((name) => unlink(join(this.paths.backupsDirectory, name))))
  }

  async #ensureDirectories(): Promise<void> {
    await mkdir(this.paths.rootDirectory, { recursive: true, mode: 0o700 })
    await chmod(this.paths.rootDirectory, 0o700)
    for (const directory of [this.paths.backupsDirectory, this.paths.quarantineDirectory]) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await chmod(directory, 0o700)
    }
  }

  async #readInventoryFile(): Promise<string | undefined> {
    return readFile(this.paths.inventoryFile, 'utf8').catch((error: unknown) => {
      if (isMissing(error)) return undefined
      throw error
    })
  }

  async #directoryEntries(directory: string, prefix: string): Promise<string[]> {
    return readdir(directory).then((names) => names.filter((name) => basename(name).startsWith(prefix))).catch((error: unknown) => {
      if (isMissing(error)) return []
      throw error
    })
  }

  async #inspectLock(): Promise<'absent' | 'active' | 'stale'> {
    const lockStat = await stat(this.paths.lockFile).catch((error: unknown) => {
      if (isMissing(error)) return undefined
      throw error
    })
    if (lockStat === undefined) return 'absent'
    const age = this.#now().getTime() - lockStat.mtimeMs
    if (age < 5 * 60 * 1000) return 'active'
    const raw = await readFile(this.paths.lockFile, 'utf8').catch(() => '')
    let pid: number | undefined
    try {
      const parsed = JSON.parse(raw) as { pid?: unknown }
      if (Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0) pid = Number(parsed.pid)
    } catch {
      pid = undefined
    }
    return pid !== undefined && processIsAlive(pid) ? 'active' : 'stale'
  }
}

function decodeInventory(raw: string): DecodedInventory {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'syntax' }
  }
  if (!isObject(value) || !Array.isArray(value.nodes)) return { kind: 'invalid', reason: 'schema' }
  const issues = validateInventoryNodes(value.nodes)
  if (issues.length > 0) return { kind: 'invalid', reason: 'records' }
  if (value.schemaVersion === INVENTORY_SCHEMA_VERSION) {
    if (!hasOnlyKeys(value, ['schemaVersion', 'revision', 'updatedAt', 'nodes'])
      || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
      || (value.updatedAt !== null && (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))))) {
      return { kind: 'invalid', reason: 'schema' }
    }
    return {
      kind: 'current',
      snapshot: {
        schemaVersion: INVENTORY_SCHEMA_VERSION,
        revision: value.revision as number,
        updatedAt: value.updatedAt as string | null,
        nodes: structuredClone(value.nodes as NodeRecord[])
      }
    }
  }
  if (value.schemaVersion === 0) {
    if (!hasOnlyKeys(value, ['schemaVersion', 'revision', 'nodes'])
      || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
      return { kind: 'invalid', reason: 'schema' }
    }
    return { kind: 'legacy', revision: value.revision as number, nodes: structuredClone(value.nodes as NodeRecord[]) }
  }
  return { kind: 'invalid', reason: 'schema' }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value)
}

function quarantinedError(): ApplicationError {
  return new ApplicationError({
    code: 'INVENTORY_QUARANTINED',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: false,
    message: 'The active inventory was corrupt or unsafe and has been moved to quarantine.',
    nextAction: 'Run "knm doctor" to inspect recovery readiness, then use "knm doctor --recover-inventory" when a valid backup exists.'
  })
}

function persistenceError(message: string, _cause: unknown): ApplicationError {
  return new ApplicationError({
    code: 'INVENTORY_PERSISTENCE_FAILED',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: true,
    message,
    nextAction: 'Run "knm doctor" and check local directory ownership, permissions, and available disk space.'
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z')
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return !(isNodeError(error) && error.code === 'ESRCH')
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') return
  const directory = await open(directoryPath, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}
