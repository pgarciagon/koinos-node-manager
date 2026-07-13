import type { ProbeKind } from '../../src/core/probe-transport.js'

export const INSPECTION_NOW = '2026-07-13T10:00:00.000Z'
export const INSPECTION_CHAIN_ID = 'EiB0ZXN0bmV0X2NoYWluLWlkLWZpeHR1cmU_=='
export const INSPECTION_HEAD_ID = `0x${'1'.repeat(64)}`
export const INSPECTION_PROPOSAL_ID = 'A'.repeat(43)

export function completeInspectionPayloads(
  overrides: Partial<Record<ProbeKind, string>> = {}
): Partial<Record<ProbeKind, string>> {
  return {
    'node.multiservice.components': componentPayload(),
    'node.multiservice.chain-head': jsonRpc({
      head_topology: { id: INSPECTION_HEAD_ID, height: '1200' },
      last_irreversible_block: '1198',
      head_block_time: String(Date.parse(INSPECTION_NOW) - 30_000)
    }),
    'node.multiservice.chain-id': jsonRpc({ chain_id: INSPECTION_CHAIN_ID }),
    'node.multiservice.chain-forks': jsonRpc({
      last_irreversible_block: { id: `0x${'0'.repeat(64)}`, height: '1198' },
      fork_heads: [{ id: INSPECTION_HEAD_ID, height: '1200' }]
    }),
    'node.multiservice.block-store-head': jsonRpc({ topology: { id: INSPECTION_HEAD_ID, height: '1200' } }),
    'node.multiservice.p2p-status': jsonRpc({ enabled: true }),
    'node.multiservice.config': [
      'KNM_INSPECTION_CONFIG_V1',
      `configuredProposal=${INSPECTION_PROPOSAL_ID}`,
      'producerAddressPresent=true',
      'instancePresent=true',
      'productionPercentage=75'
    ].join('\n'),
    'node.multiservice.resources': [
      'KNM_INSPECTION_RESOURCES_V1',
      JSON.stringify({
        schemaVersion: 1,
        storage: {
          totalBytes: 1_000_000_000,
          usedBytes: 400_000_000,
          freeBytes: 600_000_000
        }
      })
    ].join('\n'),
    ...overrides
  }
}

export function componentPayload(overrides: readonly Record<string, unknown>[] = []): string {
  const digest = `sha256:${'a'.repeat(64)}`
  const records: Record<string, unknown>[] = [
    {
      service: 'chain', status: 'running', restartCount: 0,
      image: 'koinos/koinos-chain:v2.6.0', imageId: digest,
      startedAt: '2026-07-13T09:00:00.000Z', ports: {}
    },
    {
      service: 'block_store', status: 'running', restartCount: 1,
      image: 'koinos/koinos-block-store:v2.6.0', imageId: digest,
      startedAt: '2026-07-13T09:00:05.000Z', ports: {}
    },
    {
      service: 'p2p', status: 'running', restartCount: 0,
      image: 'koinos/koinos-p2p:v2.6.0', imageId: digest,
      startedAt: '2026-07-13T09:00:10.000Z',
      ports: { '8888/tcp': [{ HostIp: '0.0.0.0', HostPort: '8888' }] }
    },
    {
      service: 'block_producer', status: 'running', restartCount: 0,
      image: 'koinos/koinos-block-producer:v2.6.0', imageId: digest,
      startedAt: '2026-07-13T09:00:15.000Z', ports: {}
    },
    {
      service: 'jsonrpc', status: 'running', restartCount: 0,
      image: 'koinos/koinos-jsonrpc:v2.6.0', imageId: digest,
      startedAt: '2026-07-13T09:00:20.000Z',
      ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }] }
    },
    ...overrides
  ]
  return ['KNM_INSPECTION_COMPONENTS_V1', ...records.map((record) => JSON.stringify(record))].join('\n')
}

export function telenoStatusPayload(overrides: Record<string, unknown> = {}): string {
  return jsonRpc({
    node: 'private-runtime-name',
    version: '1.4.0',
    mode: 'monolith',
    head_height: 1200,
    last_irreversible_block: 1198,
    services: {
      chain: true,
      block_store: true,
      mempool: true,
      contract_meta_store: true,
      transaction_store: true,
      account_history: true
    },
    ...overrides
  })
}

export function jsonRpc(result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: 'knm-inspection', result })
}
