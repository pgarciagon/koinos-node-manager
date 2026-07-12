import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulatedNodes } from '../src/adapters/simulation/fixtures.js'
import { resolveNodeView } from '../src/core/node-view.js'
import type { NodeRecord } from '../src/domain/node.js'

describe('resolveNodeView', () => {
  it('resolves verified facts before observed facts and declared facts', () => {
    const source = simulatedNodes.find((node) => node.id === 'node-nas-observer')
    assert.ok(source)
    const node = structuredClone(source)
    node.declared.network = { name: 'custom' }
    assert.ok(node.observed)
    node.observed.network = { name: 'testnet' }
    assert.ok(node.verified)
    node.verified.network = { name: 'mainnet' }

    assert.equal(resolveNodeView(node).network.name, 'mainnet')
  })

  it('uses observed facts before declared facts when no verification exists', () => {
    const source = simulatedNodes.find((node) => node.id === 'peer-discovered-01')
    assert.ok(source)
    const node = structuredClone(source)
    node.declared.flavor = { id: 'unknown' }
    assert.ok(node.observed)
    node.observed.flavor = { id: 'teleno-monolith', version: '1.1.0' }

    assert.equal(resolveNodeView(node).flavor.id, 'teleno-monolith')
  })

  it('never treats desired intent as observed fact', () => {
    const source = simulatedNodes.find((node) => node.id === 'node-home-observer')
    assert.ok(source)
    const node: NodeRecord = structuredClone(source)
    assert.ok(node.desired)
    node.desired.functions = { producer: 'enabled' }

    assert.equal(resolveNodeView(node).functions.producer, 'disabled')
  })

  it('marks records without live evidence as never observed and unknown health', () => {
    const source = simulatedNodes.find((node) => node.id === 'node-community-api')
    assert.ok(source)
    const resolved = resolveNodeView(source)

    assert.equal(resolved.freshness, 'never')
    assert.equal(resolved.health, 'unknown')
    assert.equal(resolved.observedAt, undefined)
  })
})
