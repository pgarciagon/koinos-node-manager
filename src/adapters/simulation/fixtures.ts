import type { NodeAuthority, NodeFunctions, NodeRecord } from '../../domain/node.js'

const noAuthority: NodeAuthority = {
  inspect: false,
  configure: false,
  startStop: false,
  upgrade: false,
  backup: false,
  restore: false,
  logs: false,
  producerControl: false,
  walletAccess: false
}

const fullNodeAuthority: NodeAuthority = {
  inspect: true,
  configure: true,
  startStop: true,
  upgrade: true,
  backup: true,
  restore: true,
  logs: true,
  producerControl: true,
  walletAccess: false
}

const limitedNasAuthority: NodeAuthority = {
  ...noAuthority,
  inspect: true,
  configure: true,
  startStop: true,
  logs: true
}

function functions(states: Partial<NodeFunctions>): NodeFunctions {
  return {
    observer: 'unknown',
    producer: 'unknown',
    seed: 'unknown',
    api: 'unknown',
    'backup-source': 'unknown',
    ...states
  }
}

export const simulatedNodes: readonly NodeRecord[] = [
  {
    id: 'node-home-observer',
    displayName: 'Home Observer',
    management: { class: 'managed', origin: 'provisioned', authorityLevel: 'full', authority: fullNodeAuthority },
    flavor: { id: 'teleno-monolith', version: '1.1.0', confidence: 'verified' },
    network: { name: 'mainnet', chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3qckQpFQVS6Q8=', verification: 'verified' },
    location: { kind: 'local', environment: 'mac', connectionRef: 'local-primary' },
    functions: functions({ observer: 'enabled', producer: 'disabled', seed: 'disabled', api: 'enabled', 'backup-source': 'disabled' }),
    endpoints: [{ kind: 'jsonrpc', scope: 'local', address: 'http://127.0.0.1:8080', verification: 'verified' }],
    identity: { runtimeInstanceId: 'teleno-mainnet-home' },
    provenance: { provisionedAt: '2026-07-01T10:00:00Z', source: 'node-manager' },
    health: 'healthy',
    lastObservedAt: '2026-07-11T10:00:00Z'
  },
  {
    id: 'node-berlin-producer',
    displayName: 'Berlin Producer',
    management: { class: 'managed', origin: 'adopted', authorityLevel: 'full', authority: fullNodeAuthority },
    flavor: { id: 'legacy-microservices', version: '4.0.0', confidence: 'verified' },
    network: { name: 'mainnet', chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3qckQpFQVS6Q8=', verification: 'verified' },
    location: { kind: 'remote', environment: 'linux', connectionRef: 'ssh-berlin-producer' },
    functions: functions({ observer: 'enabled', producer: 'enabled', seed: 'enabled', api: 'disabled', 'backup-source': 'disabled' }),
    endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/producer.example/tcp/8888/p2p/<PEER_ID>', verification: 'verified' }],
    identity: { peerId: '<PEER_ID>', producerAddress: '<MAINNET_PRODUCER_ADDRESS>' },
    provenance: { adoptedAt: '2026-07-05T14:30:00Z', source: 'operator-adoption' },
    health: 'healthy',
    lastObservedAt: '2026-07-11T09:59:30Z'
  },
  {
    id: 'node-nas-observer',
    displayName: 'NAS Observer',
    management: { class: 'connected', origin: 'imported', authorityLevel: 'limited', authority: limitedNasAuthority },
    flavor: { id: 'teleno-monolith', version: '1.1.0', confidence: 'detected' },
    network: { name: 'testnet', chainId: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==', verification: 'verified' },
    location: { kind: 'remote', environment: 'nas', connectionRef: 'ssh-home-nas' },
    functions: functions({ observer: 'enabled', producer: 'disabled', seed: 'declared', api: 'disabled', 'backup-source': 'disabled' }),
    endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/nas-seed.example/tcp/28888/p2p/<PEER_ID>', verification: 'observed' }],
    identity: { peerId: '<PEER_ID>' },
    provenance: { importedAt: '2026-07-08T11:00:00Z', source: 'adoption-candidate' },
    health: 'degraded',
    lastObservedAt: '2026-07-11T09:58:00Z'
  },
  {
    id: 'node-community-api',
    displayName: 'Community API',
    management: { class: 'external', origin: 'imported', authorityLevel: 'observe', authority: noAuthority },
    flavor: { id: 'unknown', confidence: 'unknown' },
    network: { name: 'mainnet', verification: 'observed' },
    location: { kind: 'external', environment: 'unknown' },
    functions: functions({ observer: 'observed', api: 'verified' }),
    endpoints: [{ kind: 'jsonrpc', scope: 'public', address: 'https://api.example/jsonrpc', verification: 'verified' }],
    identity: {},
    provenance: { importedAt: '2026-07-09T08:00:00Z', source: 'operator-import' },
    health: 'healthy',
    lastObservedAt: '2026-07-11T09:59:00Z'
  },
  {
    id: 'node-community-seed',
    displayName: 'Community Seed',
    management: { class: 'external', origin: 'imported', authorityLevel: 'observe', authority: noAuthority },
    flavor: { id: 'unknown', confidence: 'unknown' },
    network: { name: 'mainnet', verification: 'verified' },
    location: { kind: 'external', environment: 'linux' },
    functions: functions({ observer: 'observed', seed: 'verified' }),
    endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/seed.example/tcp/8888/p2p/<PEER_ID>', verification: 'verified' }],
    identity: { peerId: '<PEER_ID>' },
    provenance: { importedAt: '2026-07-09T08:10:00Z', source: 'community-catalog' },
    health: 'healthy',
    lastObservedAt: '2026-07-11T09:59:15Z'
  },
  {
    id: 'peer-discovered-01',
    displayName: 'Discovered Peer 01',
    management: { class: 'discovered', origin: 'discovered', authorityLevel: 'none', authority: noAuthority },
    flavor: { id: 'unknown', confidence: 'unknown' },
    network: { name: 'mainnet', verification: 'observed' },
    location: { kind: 'unknown', environment: 'unknown' },
    functions: functions({ observer: 'observed' }),
    endpoints: [{ kind: 'p2p', scope: 'unknown', address: '/ip4/<REDACTED>/tcp/8888/p2p/<PEER_ID>', verification: 'observed' }],
    identity: { peerId: '<PEER_ID>' },
    provenance: { discoveredAt: '2026-07-11T09:45:00Z', source: 'p2p-observation' },
    health: 'unknown',
    lastObservedAt: '2026-07-11T09:57:00Z'
  }
]
