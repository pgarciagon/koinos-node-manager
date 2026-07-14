import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import type { OnboardingJournal, OnboardingJournalRepository } from '../../core/onboarding-journal.js'
import type { InventoryPaths } from './inventory-paths.js'

export type OnboardingJournalOptions = {
  faultInjector?: (stage: 'temporary-synced' | 'before-rename' | 'before-clear') => void | Promise<void>
}

export class FileSystemOnboardingJournalRepository implements OnboardingJournalRepository {
  readonly #faultInjector: OnboardingJournalOptions['faultInjector']

  constructor(readonly paths: InventoryPaths, options: OnboardingJournalOptions = {}) {
    this.#faultInjector = options.faultInjector
  }

  async read(): Promise<OnboardingJournal | null> {
    const raw = await readFile(this.paths.onboardingJournalFile, 'utf8').catch((error: unknown) => {
      if (isCode(error, 'ENOENT')) return undefined
      throw journalError()
    })
    if (raw === undefined) return null
    try {
      const value = JSON.parse(raw) as unknown
      if (!validJournal(value)) throw new Error('invalid')
      return structuredClone(value)
    } catch {
      throw new ApplicationError({
        code: 'ONBOARDING_JOURNAL_INVALID',
        exitCode: EXIT_CODES.configuration,
        severity: 'error',
        retryable: false,
        message: 'The private onboarding recovery journal is invalid.',
        nextAction: 'Run "knm doctor" and preserve the journal for manual recovery review.'
      })
    }
  }

  async prepare(journal: OnboardingJournal): Promise<void> {
    if (await this.read() !== null) {
      throw new ApplicationError({
        code: 'ONBOARDING_COMMIT_INTERRUPTED',
        exitCode: EXIT_CODES.stalePlan,
        severity: 'error',
        retryable: true,
        message: 'A previous onboarding commit requires reconciliation.',
        nextAction: 'Run "knm onboarding reconcile" before applying another review.'
      })
    }
    await mkdir(this.paths.rootDirectory, { recursive: true, mode: 0o700 })
    await chmod(this.paths.rootDirectory, 0o700)
    const temporary = `${this.paths.onboardingJournalFile}.${process.pid}.${randomUUID()}.tmp`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, 'utf8')
      await handle.sync()
      await this.#faultInjector?.('temporary-synced')
    } finally {
      await handle.close()
    }
    try {
      await this.#faultInjector?.('before-rename')
      await rename(temporary, this.paths.onboardingJournalFile)
      await chmod(this.paths.onboardingJournalFile, 0o600)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }

  async clear(reviewId: string): Promise<void> {
    const journal = await this.read()
    if (journal !== null && journal.reviewId !== reviewId) throw journalError()
    await this.#faultInjector?.('before-clear')
    await unlink(this.paths.onboardingJournalFile).catch((error: unknown) => {
      if (!isCode(error, 'ENOENT')) throw journalError()
    })
  }

  async diagnose(): Promise<{ status: 'pass' | 'warning' | 'fail'; summary: string; nextAction?: string }> {
    try {
      const journal = await this.read()
      return journal === null
        ? { status: 'pass', summary: 'No onboarding commit journal is pending.' }
        : { status: 'warning', summary: 'An onboarding commit journal is pending reconciliation.', nextAction: 'Run "knm onboarding reconcile" before starting another onboarding operation.' }
    } catch {
      return { status: 'fail', summary: 'The onboarding commit journal cannot be validated.', nextAction: 'Preserve the private journal and inspect local storage before retrying.' }
    }
  }
}

function validJournal(value: unknown): value is OnboardingJournal {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.schemaVersion === 1
    && typeof record.reviewId === 'string' && /^onboarding_[0-9a-f]{16}$/.test(record.reviewId)
    && typeof record.digest === 'string' && /^[0-9a-f]{64}$/.test(record.digest)
    && Number.isSafeInteger(record.expectedConnectionRevision)
    && Number.isSafeInteger(record.expectedInventoryRevision)
    && typeof record.preparedAt === 'string' && !Number.isNaN(Date.parse(record.preparedAt))
    && typeof record.connection === 'object' && record.connection !== null
    && typeof record.accessProfile === 'object' && record.accessProfile !== null
    && typeof record.node === 'object' && record.node !== null
    && !/(?:password|passphrase|token|secret|private[-_ ]?key)\s*[:=]/i.test(JSON.stringify(value))
}

function journalError(): ApplicationError {
  return new ApplicationError({
    code: 'ONBOARDING_COMMIT_INTERRUPTED',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: true,
    message: 'The onboarding commit journal could not be updated safely.',
    nextAction: 'Run "knm doctor" and reconcile the pending onboarding operation.'
  })
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code
}
