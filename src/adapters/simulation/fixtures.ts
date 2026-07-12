import type {
  NodeAuthority,
  NodeFunctions,
  NodeRecord,
  NodeRuntimeFacts
} from '../../domain/node.js'

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

const homeFacts: NodeRuntimeFacts = {
  flavor: { id: 'teleno-monolith', version: '1.1.0' },
  network: { name: 'mainnet', chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3qckQpFQVS6Q8=' },
  location: { kind: 'local', environment: 'mac', connectionRef: 'local-primary' },
  functions: functions({ observer: 'enabled', producer: 'disabled', seed: 'disabled', api: 'enabled', 'backup-source': 'disabled' }),
  endpoints: [{ kind: 'jsonrpc', scope: 'local', address: 'http://127.0.0.1:8080' }],
  identity: { runtimeInstanceId: 'teleno-mainnet-home' }
}

const berlinFacts: NodeRuntimeFacts = {
  flavor: { id: 'legacy-microservices', version: '4.0.0' },
  network: { name: 'mainnet', chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3qckQpFQVS6Q8=' },
  location: { kind: 'remote', environment: 'linux', connectionRef: 'ssh-berlin-producer' },
  functions: functions({ observer: 'enabled', producer: 'enabled', seed: 'enabled', api: 'disabled', 'backup-source': 'disabled' }),
  endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/producer.example/tcp/8888/p2p/<PEER_ID>' }],
  identity: { peerId: '<PEER_ID>', producerAddress: '<MAINNET_PRODUCER_ADDRESS>' }
}

const nasFacts: NodeRuntimeFacts = {
  flavor: { id: 'teleno-monolith', version: '1.1.0' },
  network: { name: 'testnet', chainId: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==' },
  location: { kind: 'remote', environment: 'nas', connectionRef: 'ssh-home-nas' },
  functions: functions({ observer: 'enabled', producer: 'disabled', seed: 'enabled', api: 'disabled', 'backup-source': 'disabled' }),
  endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/nas-seed.example/tcp/28888/p2p/<PEER_ID>' }],
  identity: { peerId: '<PEER_ID>' }
}

const apiFacts: NodeRuntimeFacts = {
  flavor: { id: 'unknown' },
  network: { name: 'mainnet' },
  location: { kind: 'external', environment: 'unknown' },
  functions: functions({ observer: 'enabled', api: 'enabled' }),
  endpoints: [{ kind: 'jsonrpc', scope: 'public', address: 'https://api.example/jsonrpc' }],
  identity: {}
}

const seedFacts: NodeRuntimeFacts = {
  flavor: { id: 'unknown' },
  network: { name: 'mainnet' },
  location: { kind: 'external', environment: 'linux' },
  functions: functions({ observer: 'enabled', seed: 'enabled' }),
  endpoints: [{ kind: 'p2p', scope: 'public', address: '/dns4/seed.example/tcp/8888/p2p/<PEER_ID>' }],
  identity: { peerId: '<PEER_ID>' }
}

const discoveredFacts: NodeRuntimeFacts = {
  flavor: { id: 'unknown' },
  network: { name: 'mainnet' },
  location: { kind: 'unknown', environment: 'unknown' },
  functions: functions({ observer: 'enabled' }),
  endpoints: [{ kind: 'p2p', scope: 'unknown', address: '/ip4/<REDACTED>/tcp/8888/p2p/<PEER_ID>' }],
  identity: { peerId: '<PEER_ID>' }
}

export const simulatedNodes: readonly NodeRecord[] = [
  {
    id: 'node-home-observer',
    displayName: 'Home Observer',
    management: { class: 'managed', origin: 'provisioned', authorityLevel: 'full', authority: fullNodeAuthority },
    declared: structuredClone(homeFacts),
    desired: {
      flavor: structuredClone(homeFacts.flavor),
      network: structuredClone(homeFacts.network),
      location: structuredClone(homeFacts.location),
      functions: { observer: 'enabled', producer: 'disabled', api: 'enabled' }
    },
    observed: { ...structuredClone(homeFacts), health: 'healthy', observedAt: '2026-07-11T10:00:00Z', freshness: 'fresh' },
    verified: { ...structuredClone(homeFacts), verifiedAt: '2026-07-11T10:00:05Z' },
    provenance: { provisionedAt: '2026-07-01T10:00:00Z', source: 'node-manager' }
  },
  {
    id: 'node-berlin-producer',
    displayName: 'Berlin Producer',
    management: { class: 'managed', origin: 'adopted', authorityLevel: 'full', authority: fullNodeAuthority },
    declared: structuredClone(berlinFacts),
    desired: {
      flavor: structuredClone(berlinFacts.flavor),
      network: structuredClone(berlinFacts.network),
      location: structuredClone(berlinFacts.location),
      functions: { observer: 'enabled', producer: 'enabled', seed: 'enabled' }
    },
    observed: { ...structuredClone(berlinFacts), health: 'healthy', observedAt: '2026-07-11T09:59:30Z', freshness: 'fresh' },
    verified: { ...structuredClone(berlinFacts), verifiedAt: '2026-07-11T09:59:35Z' },
    provenance: { adoptedAt: '2026-07-05T14:30:00Z', source: 'operator-adoption' }
  },
  {
    id: 'node-nas-observer',
    displayName: 'NAS Observer',
    management: { class: 'connected', origin: 'imported', authorityLevel: 'limited', authority: limitedNasAuthority },
    declared: structuredClone(nasFacts),
    desired: null,
    observed: { ...structuredClone(nasFacts), health: 'degraded', observedAt: '2026-07-11T09:58:00Z', freshness: 'fresh' },
    verified: {
      network: structuredClone(nasFacts.network),
      functions: { producer: 'disabled' },
      verifiedAt: '2026-07-11T09:58:10Z'
    },
    provenance: { importedAt: '2026-07-08T11:00:00Z', source: 'adoption-candidate' }
  },
  {
    id: 'node-community-api',
    displayName: 'Community API',
    management: { class: 'external', origin: 'imported', authorityLevel: 'observe', authority: noAuthority },
    declared: structuredClone(apiFacts),
    desired: null,
    observed: null,
    verified: {
      network: structuredClone(apiFacts.network),
      functions: { api: 'enabled' },
      endpoints: structuredClone(apiFacts.endpoints),
      verifiedAt: '2026-07-09T08:00:00Z'
    },
    provenance: { importedAt: '2026-07-09T08:00:00Z', source: 'operator-import' }
  },
  {
    id: 'node-community-seed',
    displayName: 'Community Seed',
    management: { class: 'external', origin: 'imported', authorityLevel: 'observe', authority: noAuthority },
    declared: structuredClone(seedFacts),
    desired: null,
    observed: { ...structuredClone(seedFacts), health: 'healthy', observedAt: '2026-07-11T09:59:15Z', freshness: 'fresh' },
    verified: {
      network: structuredClone(seedFacts.network),
      functions: { seed: 'enabled' },
      endpoints: structuredClone(seedFacts.endpoints),
      identity: structuredClone(seedFacts.identity),
      verifiedAt: '2026-07-11T09:59:20Z'
    },
    provenance: { importedAt: '2026-07-09T08:10:00Z', source: 'community-catalog' }
  },
  {
    id: 'peer-discovered-01',
    displayName: 'Discovered Peer 01',
    management: { class: 'discovered', origin: 'discovered', authorityLevel: 'none', authority: noAuthority },
    declared: structuredClone(discoveredFacts),
    desired: null,
    observed: { ...structuredClone(discoveredFacts), health: 'unknown', observedAt: '2026-07-11T09:57:00Z', freshness: 'fresh' },
    verified: null,
    provenance: { discoveredAt: '2026-07-11T09:45:00Z', source: 'p2p-observation' }
  }
]
