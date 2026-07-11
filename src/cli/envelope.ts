import { ApplicationError } from '../core/application-error.js'

export type StructuredError = {
  code: string
  severity: string
  retryable: boolean
  message: string
  nextAction: string
}

export function successEnvelope(command: string, data: unknown, context: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    ok: true,
    command,
    ...context,
    data,
    warnings: [],
    errors: []
  }, null, 2)
}

export function errorEnvelope(command: string, error: unknown): string {
  const structured = toStructuredError(error)
  return JSON.stringify({
    schemaVersion: 1,
    ok: false,
    command,
    data: null,
    warnings: [],
    errors: [structured]
  }, null, 2)
}

export function toStructuredError(error: unknown): StructuredError {
  if (error instanceof ApplicationError) {
    return {
      code: error.code,
      severity: error.severity,
      retryable: error.retryable,
      message: error.message,
      nextAction: error.nextAction
    }
  }
  const message = error instanceof Error ? error.message : 'Unknown CLI error.'
  return {
    code: 'INVALID_CLI_INPUT',
    severity: 'error',
    retryable: false,
    message,
    nextAction: 'Run "knm --help" to inspect command usage.'
  }
}

export function exitCodeFor(error: unknown): number {
  return error instanceof ApplicationError ? error.exitCode : 2
}
