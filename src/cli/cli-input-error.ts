import { ApplicationError } from '../core/application-error.js'
import { EXIT_CODES } from '../core/exit-codes.js'

export class CliInputError extends ApplicationError {
  constructor(message: string, nextAction = 'Run "knm --help" to inspect command usage.') {
    super({
      code: 'INVALID_CLI_INPUT',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message,
      nextAction
    })
    this.name = 'CliInputError'
  }
}
