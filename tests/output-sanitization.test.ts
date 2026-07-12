import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulatedNodes } from '../src/adapters/simulation/fixtures.js'
import { formatNodeDetail, formatNodeJson } from '../src/cli/output.js'

describe('node display sanitization', () => {
  it('redacts private endpoints and raw operational identities in human and JSON output', () => {
    const source = simulatedNodes.find((node) => node.id === 'node-home-observer')
    assert.ok(source)
    const node = structuredClone(source)
    node.declared.endpoints = [{ kind: 'admin', scope: 'private', address: 'https://private.internal/admin' }]
    node.declared.identity = {
      peerId: 'raw-peer-id',
      runtimeInstanceId: 'raw-runtime-id',
      producerAddress: 'raw-producer-address'
    }
    node.declared.location.connectionRef = 'ssh-config:private-node'
    node.desired = { location: { ...node.declared.location } }
    node.observed = null
    node.verified = null

    for (const output of [formatNodeDetail(node), formatNodeJson(node)]) {
      assert.doesNotMatch(output, /private\.internal/)
      assert.doesNotMatch(output, /raw-peer-id|raw-runtime-id|raw-producer-address/)
      assert.doesNotMatch(output, /ssh-config:private-node/)
      assert.match(output, /PRIVATE_ENDPOINT/)
      assert.match(output, /CONNECTION_REF_PRESENT|connection reference configured/)
    }
  })
})
