import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TelenoInspectionAdapter } from '../src/adapters/inspection/teleno-inspection-adapter.js'
import { FakeProbeTransport } from '../src/adapters/simulation/fake-probe-transport.js'
import type { RuntimeInspectionRequest } from '../src/core/runtime-inspection-adapter.js'
import { INSPECTION_SECTIONS } from '../src/domain/inspection.js'
import { INSPECTION_NOW, telenoStatusPayload } from './helpers/inspection-fixtures.js'
import { runtimeInspectionAdapterContractSuite } from './helpers/runtime-inspection-adapter-contract.js'

function request(transport: FakeProbeTransport): RuntimeInspectionRequest {
  return {
    target: {
      nodeId: 'teleno-node',
      displayName: 'Teleno Node',
      flavor: 'teleno-monolith',
      expectedNetwork: 'testnet',
    },
    sections: INSPECTION_SECTIONS,
    timeoutMs: 10_000,
    capturedAt: INSPECTION_NOW,
    probe: {
      execute: (kind, timeoutMs) => transport.execute({
        connection: {
          id: 'teleno-target', kind: 'ssh', hostAlias: 'private-teleno-alias',
          createdAt: INSPECTION_NOW, updatedAt: INSPECTION_NOW, lastTest: null
        },
        kind,
        timeoutMs
      })
    }
  }
}

runtimeInspectionAdapterContractSuite({
  name: 'Teleno',
  createAdapter: () => new TelenoInspectionAdapter(),
  createRequest: () => request(new FakeProbeTransport({
    outcome: 'success',
    payloads: { 'node.teleno.status': telenoStatusPayload() }
  }))
})

describe('TelenoInspectionAdapter', () => {
  it('maps the existing node.get_status surface into the shared inspection contract', async () => {
    const transport = new FakeProbeTransport({
      outcome: 'success', payloads: { 'node.teleno.status': telenoStatusPayload() }
    })
    const adapter = new TelenoInspectionAdapter()
    const snapshot = await adapter.inspect(request(transport))
    assert.equal(adapter.contractVersion, '1.0.0')
    assert.equal(snapshot.overview.runtime.availability === 'available' && snapshot.overview.runtime.value.flavor, 'teleno-monolith')
    assert.equal(snapshot.overview.build.availability === 'available' && snapshot.overview.build.value.version, '1.4.0')
    assert.equal(snapshot.components.availability, 'available')
    assert.equal(snapshot.components.value.find((component) => component.name === 'chain')?.state.availability, 'available')
    assert.equal(snapshot.components.value.find((component) => component.name === 'chain')?.state.value, 'running')
    assert.equal(snapshot.components.value.find((component) => component.name === 'p2p')?.available.availability, 'unavailable')
    assert.equal(snapshot.chain.head.availability === 'available' && snapshot.chain.head.value.height, 1200)
    assert.equal(snapshot.chain.lastIrreversibleBlock.availability === 'available' && snapshot.chain.lastIrreversibleBlock.value, 1198)
    assert.equal(snapshot.governance.configuredProposalIds.availability, 'unavailable')
    assert.equal(snapshot.governance.configuredProposalIds.reason, 'capability-not-exposed')
    assert.equal(snapshot.capabilities.governance, false)
    assert.equal(snapshot.capabilities.producer, false)
    assert.deepEqual(transport.requests.map((item) => item.kind), ['node.teleno.status'])
    assert.doesNotMatch(JSON.stringify(snapshot), /private-runtime-name|private-teleno-alias/)
  })

  it('rejects malformed and unsupported status responses with stable typed errors', async () => {
    const malformed = new FakeProbeTransport({ outcome: 'success', payloads: { 'node.teleno.status': '{ unsafe' } })
    await assert.rejects(new TelenoInspectionAdapter().inspect(request(malformed)), (error: unknown) => {
      assert.equal((error as { code: string; exitCode: number }).code, 'INSPECTION_RESPONSE_MALFORMED')
      assert.equal((error as { exitCode: number }).exitCode, 40)
      return true
    })
    const unsupported = new FakeProbeTransport({ outcome: 'unsupported' })
    await assert.rejects(new TelenoInspectionAdapter().inspect(request(unsupported)), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INSPECTION_PROBE_UNSUPPORTED')
      return true
    })
  })
})
