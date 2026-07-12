import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SimulatedNodeRepository } from '../src/adapters/simulation/simulated-node-repository.js'
import { listNodes, type ListNodesQuery } from '../src/core/list-nodes.js'

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

  const filterCases: ReadonlyArray<{
    name: string
    query: ListNodesQuery
    expectedIds: readonly string[]
  }> = [
    { name: 'management', query: { management: 'connected' }, expectedIds: ['node-nas-observer'] },
    { name: 'origin', query: { origin: 'provisioned' }, expectedIds: ['node-home-observer'] },
    { name: 'flavor', query: { flavor: 'legacy-microservices' }, expectedIds: ['node-berlin-producer'] },
    { name: 'network', query: { network: 'testnet' }, expectedIds: ['node-nas-observer'] },
    { name: 'location', query: { location: 'local' }, expectedIds: ['node-home-observer'] },
    { name: 'authority', query: { authority: 'none' }, expectedIds: ['peer-discovered-01'] },
    { name: 'function', query: { function: 'producer' }, expectedIds: ['node-berlin-producer'] },
    { name: 'health', query: { health: 'degraded' }, expectedIds: ['node-nas-observer'] },
    { name: 'staleness', query: { staleness: 'never' }, expectedIds: ['node-community-api'] }
  ]

  for (const filterCase of filterCases) {
    it(`filters independently by ${filterCase.name}`, async () => {
      const result = await listNodes(SimulatedNodeRepository.forScenario(), filterCase.query)
      assert.deepEqual(result.nodes.map((node) => node.id), filterCase.expectedIds)
    })
  }

  it('combines every filter without changing their semantics', async () => {
    const result = await listNodes(SimulatedNodeRepository.forScenario(), {
      management: 'managed',
      origin: 'adopted',
      flavor: 'legacy-microservices',
      network: 'mainnet',
      location: 'remote',
      authority: 'full',
      function: 'producer',
      health: 'healthy',
      staleness: 'fresh'
    })

    assert.deepEqual(result.nodes.map((node) => node.id), ['node-berlin-producer'])
  })

  it('filters stale evidence deterministically without a wall clock', async () => {
    const repository = SimulatedNodeRepository.forScenario('stale-health')
    assert.equal((await listNodes(repository, { staleness: 'stale' })).total, 5)
    assert.equal((await listNodes(repository, { staleness: 'fresh' })).total, 0)
    assert.deepEqual(
      (await listNodes(repository, { staleness: 'never' })).nodes.map((node) => node.id),
      ['node-community-api']
    )
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
