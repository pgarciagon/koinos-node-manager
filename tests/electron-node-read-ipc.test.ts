import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toPublicApplicationError } from '../src/core/public-error.js'
import {
  assertNodeDirectoryIpcRequest,
  parseNodeInspectionIpcRequest
} from '../src/electron/node-read-ipc.js'

describe('Electron node-read IPC input boundary', () => {
  it('accepts only the empty directory request', () => {
    assert.doesNotThrow(() => assertNodeDirectoryIpcRequest([]))
    assert.throws(() => assertNodeDirectoryIpcRequest([{}]), hasTypedInvalidRequest)
  })

  it('accepts exactly one valid stable node ID', () => {
    assert.equal(parseNodeInspectionIpcRequest(['berlin-observer']), 'berlin-observer')
    for (const request of [[], ['berlin-observer', {}], [{}], ['UPPERCASE'], ['../private'], ['']]) {
      assert.throws(() => parseNodeInspectionIpcRequest(request), hasTypedInvalidRequest)
    }
  })

  it('converts malformed input into a stable sanitized desktop error', () => {
    let caught: unknown
    try { parseNodeInspectionIpcRequest(['../private']) } catch (error: unknown) { caught = error }
    const result = toPublicApplicationError(caught)
    assert.deepEqual(result, {
      code: 'INVALID_ELECTRON_NODE_REQUEST',
      severity: 'error',
      retryable: false,
      message: 'The node inspection request must contain one valid stable node ID.',
      nextAction: 'Return to Nodes and select one listed node.'
    })
    assert.doesNotMatch(JSON.stringify(result), /private/)
  })
})

function hasTypedInvalidRequest(error: unknown): boolean {
  assert.equal((error as { code?: string }).code, 'INVALID_ELECTRON_NODE_REQUEST')
  return true
}
