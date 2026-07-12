import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CliInputError } from '../src/cli/cli-input-error.js'
import { errorEnvelope, exitCodeFor } from '../src/cli/envelope.js'
import { EXIT_CODES } from '../src/core/exit-codes.js'

describe('stable CLI exit-code contract', () => {
  it('keeps every documented category at its assigned numeric code', () => {
    assert.deepEqual(EXIT_CODES, {
      success: 0,
      invalidInput: 2,
      notFound: 3,
      configuration: 4,
      stalePlan: 10,
      safetyBlocked: 20,
      executionFailed: 30,
      transportUnavailable: 40
    })
  })

  it('maps typed CLI input failures to code 2 and a stable JSON error', () => {
    const error = new CliInputError('Invalid example input.')
    const envelope = JSON.parse(errorEnvelope('example.command', error)) as {
      command: string
      errors: Array<{ code: string; retryable: boolean }>
    }

    assert.equal(exitCodeFor(error), EXIT_CODES.invalidInput)
    assert.equal(envelope.command, 'example.command')
    assert.equal(envelope.errors[0]?.code, 'INVALID_CLI_INPUT')
    assert.equal(envelope.errors[0]?.retryable, false)
  })
})
