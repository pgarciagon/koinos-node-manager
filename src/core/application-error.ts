import type { ApplicationExitCode } from './exit-codes.js'

export type ErrorSeverity = 'warning' | 'error' | 'unsafe'

export type ApplicationErrorDetails = {
  code: string
  exitCode: ApplicationExitCode
  severity: ErrorSeverity
  retryable: boolean
  message: string
  nextAction: string
}

export class ApplicationError extends Error {
  readonly code: string
  readonly exitCode: ApplicationExitCode
  readonly severity: ErrorSeverity
  readonly retryable: boolean
  readonly nextAction: string

  constructor(details: ApplicationErrorDetails) {
    super(details.message)
    this.name = 'ApplicationError'
    this.code = details.code
    this.exitCode = details.exitCode
    this.severity = details.severity
    this.retryable = details.retryable
    this.nextAction = details.nextAction
  }
}
