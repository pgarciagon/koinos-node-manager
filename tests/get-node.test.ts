import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SimulatedNodeRepository } from '../src/adapters/simulation/simulated-node-repository.js'
import { ApplicationError } from '../src/core/application-error.js'
import { getNode } from '../src/core/get-node.js'

describe('getNode', () => {
  it('returns the exact inventory record by stable node ID', async () => {
    const node = await getNode(SimulatedNodeRepository.forScenario(), 'node-nas-observer')
    assert.equal(node.displayName, 'NAS Observer')
    assert.equal(node.management.class, 'connected')
  })

  it('returns a typed not-found error', async () => {
    await assert.rejects(
      getNode(SimulatedNodeRepository.forScenario(), 'missing'),
      (error: unknown) => {
        assert.ok(error instanceof ApplicationError)
        assert.equal(error.code, 'NODE_NOT_FOUND')
        assert.equal(error.exitCode, 3)
        return true
      }
    )
  })
})
