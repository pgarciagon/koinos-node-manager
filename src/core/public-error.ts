import { ApplicationError } from './application-error.js'

export type PublicApplicationError = {
  code: string
  severity: 'warning' | 'error' | 'unsafe'
  retryable: boolean
  message: string
  nextAction: string
}

export function toPublicApplicationError(error: unknown): PublicApplicationError {
  if (error instanceof ApplicationError) {
    return {
      code: error.code,
      severity: error.severity,
      retryable: error.retryable,
      message: error.message,
      nextAction: error.nextAction
    }
  }
  return {
    code: 'APPLICATION_OPERATION_FAILED',
    severity: 'error',
    retryable: false,
    message: 'The application operation did not complete safely.',
    nextAction: 'Retry the reviewed operation or inspect local diagnostics.'
  }
}
