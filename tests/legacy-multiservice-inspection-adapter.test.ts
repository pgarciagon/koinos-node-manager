import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LegacyMultiserviceInspectionAdapter } from '../src/adapters/inspection/legacy-multiservice-inspection-adapter.js'
import { FakeProbeTransport } from '../src/adapters/simulation/fake-probe-transport.js'
import type { RuntimeInspectionRequest } from '../src/core/runtime-inspection-adapter.js'
import type { ConnectionTestOutcome } from '../src/domain/connection.js'
import { INSPECTION_SECTIONS } from '../src/domain/inspection.js'
import {
  INSPECTION_CHAIN_ID,
  INSPECTION_HEAD_ID,
  INSPECTION_NOW,
  INSPECTION_PROPOSAL_ID,
  completeInspectionPayloads,
  componentPayload,
  jsonRpc
} from './helpers/inspection-fixtures.js'
import { runtimeInspectionAdapterContractSuite } from './helpers/runtime-inspection-adapter-contract.js'

function request(transport: FakeProbeTransport, overrides: Partial<RuntimeInspectionRequest['target']> = {}): RuntimeInspectionRequest {
  return {
    target: {
      nodeId: 'legacy-node',
      displayName: 'Legacy Node',
      flavor: 'legacy-microservices',
      expectedNetwork: 'testnet',
      expectedChainId: INSPECTION_CHAIN_ID,
      ...overrides
    },
    sections: INSPECTION_SECTIONS,
    timeoutMs: 10_000,
    capturedAt: INSPECTION_NOW,
    probe: {
      execute: (kind, timeoutMs) => transport.execute({
        connection: {
          id: 'legacy-target', kind: 'ssh', hostAlias: 'private-host-alias',
          createdAt: INSPECTION_NOW, updatedAt: INSPECTION_NOW, lastTest: null
        },
        kind,
        timeoutMs
      })
    }
  }
}

runtimeInspectionAdapterContractSuite({
  name: 'legacy multiservice',
  createAdapter: () => new LegacyMultiserviceInspectionAdapter(),
  createRequest: () => request(new FakeProbeTransport({
    outcome: 'success',
    payloads: completeInspectionPayloads()
  }))
})

describe('LegacyMultiserviceInspectionAdapter', () => {
  it('normalizes complete Docker, configuration, and JSON-RPC evidence into a sanitized snapshot', async () => {
    const transport = new FakeProbeTransport({ outcome: 'success', payloads: completeInspectionPayloads() })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(transport))
    assert.equal(snapshot.schemaVersion, 1)
    assert.equal(snapshot.contractVersion, '1.0.0')
    assert.equal(snapshot.readOnly, true)
    assert.equal(snapshot.overview.runtime.availability, 'available')
    assert.equal(snapshot.overview.network.availability, 'available')
    assert.equal(snapshot.components.availability, 'available')
    assert.equal(snapshot.components.value.find((component) => component.name === 'chain')?.state.availability, 'available')
    assert.equal(snapshot.components.value.find((component) => component.name === 'chain')?.state.value, 'running')
    assert.equal(snapshot.components.value.find((component) => component.name === 'amqp')?.available.value, false)
    assert.deepEqual(snapshot.chain.head.availability === 'available' ? snapshot.chain.head.value : null, {
      height: 1200, blockId: INSPECTION_HEAD_ID
    })
    assert.equal(snapshot.chain.blockStoreAgreement.availability === 'available' && snapshot.chain.blockStoreAgreement.value, 'agrees')
    assert.equal(snapshot.chain.progress.availability === 'available' && snapshot.chain.progress.value, 'advancing')
    assert.equal(snapshot.chain.p2pGossip.availability === 'available' && snapshot.chain.p2pGossip.value, true)
    assert.equal(snapshot.chain.peerCount.availability, 'unavailable')
    assert.deepEqual(snapshot.governance.configuredProposalIds.availability === 'available'
      ? snapshot.governance.configuredProposalIds.value
      : null, [INSPECTION_PROPOSAL_ID])
    assert.equal(snapshot.governance.effectiveProposalIds.availability, 'unavailable')
    assert.equal(snapshot.governance.observedProposalVotes.availability, 'unavailable')
    assert.equal(snapshot.governance.networkProposals.availability, 'unavailable')
    assert.equal(snapshot.producer.configured.availability === 'available' && snapshot.producer.configured.value, true)
    assert.equal(snapshot.producer.effectiveEnabled.availability === 'available' && snapshot.producer.effectiveEnabled.value, true)
    assert.equal(snapshot.producer.addressPresent.availability === 'available' && snapshot.producer.addressPresent.value, true)
    assert.equal(snapshot.resources.storage.availability, 'available')
    assert.deepEqual(new Set(snapshot.evidence.map((evidence) => evidence.source)), new Set(['configuration', 'derived', 'docker', 'jsonrpc']))
    const serialized = JSON.stringify(snapshot)
    assert.doesNotMatch(serialized, /private-host-alias|127\.0\.0\.1|0\.0\.0\.0|koinos\/koinos-|HostPort|HostIp/)
  })

  it('returns explicit unavailable fields for partial capabilities without inventing facts', async () => {
    const transport = new FakeProbeTransport({
      outcome: 'unsupported',
      outcomes: { 'node.multiservice.components': 'success' },
      payloads: { 'node.multiservice.components': componentPayload() }
    })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(transport))
    assert.equal(snapshot.components.availability, 'available')
    assert.equal(snapshot.chain.head.availability, 'unavailable')
    assert.equal(snapshot.chain.head.reason, 'probe-unsupported')
    assert.equal(snapshot.governance.configuredProposalIds.availability, 'unavailable')
    assert.equal(snapshot.governance.configuredProposalIds.reason, 'probe-unsupported')
    assert.equal(snapshot.resources.storage.availability, 'unavailable')
  })

  it('keeps configured, effective, and address-presence producer evidence independent', async () => {
    const payloads = completeInspectionPayloads({
      'node.multiservice.components': componentPayload([{
        service: 'block_producer', status: 'exited', restartCount: 2,
        image: 'koinos/koinos-block-producer:v2.6.0', imageId: `sha256:${'c'.repeat(64)}`,
        startedAt: '2026-07-13T09:00:15.000Z', ports: {}
      }]),
      'node.multiservice.config': [
        'KNM_INSPECTION_CONFIG_V1',
        'producerAddressPresent=false',
        'instancePresent=true'
      ].join('\n')
    })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(
      new FakeProbeTransport({ outcome: 'success', payloads })
    ))
    assert.equal(snapshot.producer.configured.availability === 'available' && snapshot.producer.configured.value, true)
    assert.equal(snapshot.producer.effectiveEnabled.availability === 'available' && snapshot.producer.effectiveEnabled.value, false)
    assert.equal(snapshot.producer.addressPresent.availability === 'available' && snapshot.producer.addressPresent.value, false)
  })

  it('normalizes the fixed secondary producer service and includes it in effective state', async () => {
    const payloads = completeInspectionPayloads({
      'node.multiservice.components': componentPayload([
        {
          service: 'block_producer', status: 'exited', restartCount: 2,
          image: 'koinos/koinos-block-producer:v2.6.0', imageId: `sha256:${'c'.repeat(64)}`,
          startedAt: '2026-07-13T09:00:15.000Z', ports: {}
        },
        {
          service: 'block_producer_2', status: 'running', restartCount: 0,
          image: 'koinos/koinos-block-producer:v2.6.0', imageId: `sha256:${'e'.repeat(64)}`,
          startedAt: '2026-07-13T09:00:16.000Z', ports: {}
        }
      ])
    })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(
      new FakeProbeTransport({ outcome: 'success', payloads })
    ))
    const secondary = snapshot.components.availability === 'available'
      ? snapshot.components.value.find((component) => component.name === 'block_producer-secondary')
      : undefined
    assert.equal(secondary?.available.availability === 'available' && secondary.available.value, true)
    assert.equal(secondary?.state.availability === 'available' && secondary.state.value, 'running')
    assert.equal(snapshot.producer.effectiveEnabled.availability === 'available' && snapshot.producer.effectiveEnabled.value, true)
    assert.doesNotMatch(JSON.stringify(snapshot), /block_producer_2/)
  })

  it('detects fork evidence and unsafe public administrative exposure without publishing bindings', async () => {
    const payloads = completeInspectionPayloads({
      'node.multiservice.chain-forks': jsonRpc({
        last_irreversible_block: { id: `0x${'0'.repeat(64)}`, height: '1198' },
        fork_heads: [
          { id: INSPECTION_HEAD_ID, height: '1200' },
          { id: `0x${'3'.repeat(64)}`, height: '1199' }
        ]
      }),
      'node.multiservice.components': componentPayload([{
        service: 'amqp', status: 'running', restartCount: 0,
        image: 'koinos/koinos-amqp:v2.6.0', imageId: `sha256:${'d'.repeat(64)}`,
        startedAt: '2026-07-13T09:00:25.000Z',
        ports: { '5672/tcp': [
          { HostIp: '0.0.0.0', HostPort: '5672' },
          { HostIp: '0.0.0.0', HostPort: '15672' }
        ] }
      }])
    })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(
      new FakeProbeTransport({ outcome: 'success', payloads })
    ))
    assert.deepEqual(snapshot.chain.forks.availability === 'available' ? snapshot.chain.forks.value : null, {
      detected: true,
      count: 2
    })
    assert.ok(snapshot.warnings.some((warning) => warning.code === 'INSPECTION_PUBLIC_ADMIN_EXPOSURE'))
    assert.equal(snapshot.apis.availability === 'available'
      ? snapshot.apis.value.filter((api) => api.kind === 'admin' && api.scope === 'public').length
      : 0, 1)
    assert.doesNotMatch(JSON.stringify(snapshot), /0\.0\.0\.0|5672|HostIp|HostPort/)
  })

  it('does not report a mismatch when concurrent block-store evidence is newer than chain evidence', async () => {
    const payloads = completeInspectionPayloads({
      'node.multiservice.block-store-head': jsonRpc({
        topology: { id: `0x${'4'.repeat(64)}`, height: '1201' }
      })
    })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(
      new FakeProbeTransport({ outcome: 'success', payloads })
    ))
    assert.equal(snapshot.chain.blockStoreAgreement.availability, 'unknown')
    assert.equal(snapshot.chain.blockStoreAgreement.reason, 'insufficient-evidence')
    assert.ok(!snapshot.warnings.some((warning) => warning.code === 'INSPECTION_BLOCK_STORE_MISMATCH'))
  })

  it('reports stale, mismatched, failed-component, and malformed partial evidence safely', async () => {
    const payloads = completeInspectionPayloads({
      'node.multiservice.components': componentPayload([{
        service: 'mempool', status: 'dead', restartCount: 9,
        image: 'koinos/koinos-mempool:v2.6.0', imageId: `sha256:${'b'.repeat(64)}`,
        startedAt: '2026-07-13T08:00:00.000Z', ports: {}
      }]),
      'node.multiservice.chain-head': jsonRpc({
        head_topology: { id: INSPECTION_HEAD_ID, height: '1200' },
        last_irreversible_block: '1198',
        head_block_time: String(Date.parse(INSPECTION_NOW) - 900_000)
      }),
      'node.multiservice.block-store-head': jsonRpc({ topology: { id: `0x${'2'.repeat(64)}`, height: '1200' } }),
      'node.multiservice.config': 'unsafe raw configuration'
    })
    const transport = new FakeProbeTransport({ outcome: 'success', payloads })
    const snapshot = await new LegacyMultiserviceInspectionAdapter().inspect(request(transport, { expectedChainId: 'different_chain_id_123456' }))
    assert.equal(snapshot.chain.progress.availability === 'available' && snapshot.chain.progress.value, 'stalled')
    assert.equal(snapshot.freshness, 'stale')
    assert.equal(snapshot.chain.head.evidence.freshness, 'stale')
    assert.equal(snapshot.chain.blockStoreAgreement.availability === 'available' && snapshot.chain.blockStoreAgreement.value, 'mismatch')
    assert.equal(snapshot.governance.configuredProposalIds.availability, 'unavailable')
    assert.deepEqual(new Set(snapshot.warnings.map((warning) => warning.code)), new Set([
      'INSPECTION_CHAIN_ID_MISMATCH',
      'INSPECTION_BLOCK_STORE_MISMATCH',
      'INSPECTION_HEAD_STALE',
      'INSPECTION_COMPONENT_FAILED',
      'INSPECTION_PARTIAL_MALFORMED_EVIDENCE'
    ]))
    assert.doesNotMatch(JSON.stringify(snapshot), /unsafe raw configuration|different_chain_id_123456/)
  })

  it('maps complete authentication, timeout, unreachable, and malformed failures to stable transport errors', async () => {
    const cases: readonly [ConnectionTestOutcome, string][] = [
      ['authentication-failed', 'INSPECTION_AUTHENTICATION_FAILED'],
      ['timeout', 'INSPECTION_TIMEOUT'],
      ['unreachable', 'INSPECTION_UNREACHABLE'],
      ['malformed', 'INSPECTION_RESPONSE_MALFORMED']
    ]
    for (const [outcome, code] of cases) {
      const transport = new FakeProbeTransport({ outcome })
      await assert.rejects(new LegacyMultiserviceInspectionAdapter().inspect(request(transport)), (error: unknown) => {
        assert.equal((error as { code: string; exitCode: number }).code, code)
        assert.equal((error as { exitCode: number }).exitCode, 40)
        return true
      })
    }
    const missingPayload = new FakeProbeTransport({ outcome: 'success' })
    await assert.rejects(new LegacyMultiserviceInspectionAdapter().inspect(request(missingPayload)), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INSPECTION_RESPONSE_MALFORMED')
      return true
    })
  })
})
