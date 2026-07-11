import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SimulatedNodeRepository } from '../src/adapters/simulation/simulated-node-repository.js'
import { listNodes } from '../src/core/list-nodes.js'

describe('listNodes', () => {
  it('lists all simulated nodes in display-name order', async () => {
    const result = await listNodes(SimulatedNodeRepository.forScenario())

    assert.equal(result.total, 6)
    assert.deepEqual(result.nodes.map((node) => node.displayName), [
      'Berlin Producer',
      'Community API',
      'Community Seed',
      'Discovered Peer 01',
      'Home Observer',
      'NAS Observer'
    ])
  })

  it('filters independently by management, network, function, and health', async () => {
    const result = await listNodes(SimulatedNodeRepository.forScenario(), {
      management: 'managed',
      network: 'mainnet',
      function: 'producer',
      health: 'healthy'
    })

    assert.equal(result.total, 1)
    assert.equal(result.nodes[0]?.id, 'node-berlin-producer')
  })

  it('does not expose internal fixture references that can be mutated by callers', async () => {
    const repository = SimulatedNodeRepository.forScenario()
    const first = await repository.list()
    const mutable = first[0] as { displayName: string }
    mutable.displayName = 'Changed'

    const second = await repository.list()
    assert.notEqual(second[0]?.displayName, 'Changed')
  })
})
