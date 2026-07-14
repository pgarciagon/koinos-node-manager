import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PublicKoinosRpcInspectionAdapter } from '../src/adapters/inspection/public-koinos-rpc-inspection-adapter.js'
import { FakeProbeTransport } from '../src/adapters/simulation/fake-probe-transport.js'
import type { RuntimeInspectionRequest } from '../src/core/runtime-inspection-adapter.js'
import type { PublicRpcConnectionRecord } from '../src/domain/connection.js'
import { INSPECTION_NOW, jsonRpc } from './helpers/inspection-fixtures.js'
import { runtimeInspectionAdapterContractSuite } from './helpers/runtime-inspection-adapter-contract.js'

const connection: PublicRpcConnectionRecord = {
  id: 'quick-observer', kind: 'public-rpc', endpoint: 'https://private.invalid/', endpointPolicy: 'https-private-reviewed',
  createdAt: INSPECTION_NOW, updatedAt: INSPECTION_NOW, lastTest: null
}

const MAINNET_CHAIN_ID = 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA=='
const TESTNET_CHAIN_ID = 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=='

function request(chainId = TESTNET_CHAIN_ID): RuntimeInspectionRequest {
  const transport = new FakeProbeTransport({
    outcome: 'success',
    payloads: {
      'node.multiservice.chain-id': jsonRpc({ chain_id: chainId }),
      'node.multiservice.chain-head': jsonRpc({
        head_topology: { id: `0x${'1'.repeat(64)}`, height: '1200' },
        last_irreversible_block: '1198',
        head_block_time: String(Date.parse(INSPECTION_NOW) - 30_000)
      }),
      'node.multiservice.p2p-status': jsonRpc({ enabled: true })
    }
  })
  return {
    target: { nodeId: 'quick-observer', displayName: 'Quick Observer', flavor: 'unknown', expectedNetwork: 'unknown' },
    sections: ['overview', 'components', 'chain', 'governance'], timeoutMs: 10_000, capturedAt: INSPECTION_NOW,
    probe: { execute: (kind, timeoutMs) => transport.execute({ connection, kind, timeoutMs }) }
  }
}

runtimeInspectionAdapterContractSuite({ name: 'public Koinos RPC', createAdapter: () => new PublicKoinosRpcInspectionAdapter(), createRequest: request })

describe('public Koinos RPC inspection', () => {
  it('reports public chain facts while keeping host, producer, and governance facts unavailable', async () => {
    const snapshot = await new PublicKoinosRpcInspectionAdapter().inspect(request())
    assert.equal(snapshot.overview.network.availability, 'available')
    if (snapshot.overview.network.availability === 'available') assert.equal(snapshot.overview.network.value.name, 'testnet')
    assert.equal(snapshot.chain.head.availability, 'available')
    assert.equal(snapshot.components.availability, 'unavailable')
    assert.equal(snapshot.producer.configured.availability, 'unavailable')
    assert.equal(snapshot.governance.configuredProposalIds.availability, 'unavailable')
    assert.equal(snapshot.capabilities.components, false)
    assert.equal(snapshot.warnings[0]?.code, 'QUICK_INSPECTION_LIMITED')
  })

  it('recognizes the canonical Koinos mainnet chain identity', async () => {
    const snapshot = await new PublicKoinosRpcInspectionAdapter().inspect(request(MAINNET_CHAIN_ID))
    assert.equal(snapshot.overview.network.availability, 'available')
    if (snapshot.overview.network.availability === 'available') assert.equal(snapshot.overview.network.value.name, 'mainnet')
  })

  it('fails closed when neither identity nor head evidence is usable', async () => {
    const broken = request()
    broken.probe = { execute: async () => ({ outcome: 'malformed', durationMs: 1, payload: null }) }
    await assert.rejects(new PublicKoinosRpcInspectionAdapter().inspect(broken), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ONBOARDING_RESPONSE_MALFORMED')
      return true
    })
  })
})
