import type {
  NodeAuthority,
  NodeEnvironment,
  NodeFlavor,
  NodeFunctions,
  NodeNetwork,
  NodeRecord,
  NodeEndpointKind,
  EndpointScope
} from './node.js'

export const CONNECTION_KINDS = ['ssh', 'public-rpc', 'agent'] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

export const CONNECTION_TEST_OUTCOMES = [
  'success',
  'authentication-failed',
  'timeout',
  'unreachable',
  'malformed',
  'unsupported'
] as const
export type ConnectionTestOutcome = (typeof CONNECTION_TEST_OUTCOMES)[number]

export type ConnectionTestEvidence = {
  outcome: ConnectionTestOutcome
  testedAt: string
  durationMs: number
}

export type BaseConnectionRecord = {
  id: string
  createdAt: string
  updatedAt: string
  lastTest: ConnectionTestEvidence | null
}

export type SshConnectionRecord = BaseConnectionRecord & {
  kind: 'ssh'
  hostAlias: string
}

export type PublicRpcConnectionRecord = BaseConnectionRecord & {
  kind: 'public-rpc'
  endpoint: string
  endpointPolicy: 'https-public' | 'https-private-reviewed' | 'http-loopback-development'
}

export const AGENT_SCOPES = ['inspect'] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

export type AgentConnectionRecord = BaseConnectionRecord & {
  kind: 'agent'
  endpoint: string
  endpointPolicy: 'https-public' | 'https-private-reviewed' | 'http-loopback-development'
  pinnedAgentIdentityDigest: string
  credentialRef: string
  protocolVersion: string
  runtimeFlavor: NodeFlavor['id']
  scopes: readonly AgentScope[]
}

export type ConnectionRecord = SshConnectionRecord | PublicRpcConnectionRecord | AgentConnectionRecord

export const SUPERVISOR_KINDS = ['foreground', 'launchd', 'systemd', 'docker', 'unknown'] as const
export type SupervisorKind = (typeof SUPERVISOR_KINDS)[number]

export const RUNTIME_KINDS = ['native', 'container', 'legacy-services', 'unknown'] as const
export type RuntimeKind = (typeof RUNTIME_KINDS)[number]

export type DiscoveredEndpoint = {
  kind: NodeEndpointKind
  scope: EndpointScope
}

export type HostDiscoveryFacts = {
  flavor: NodeFlavor
  network: NodeNetwork
  environment: NodeEnvironment
  supervisor: { kind: SupervisorKind; serviceRef?: string }
  runtime: { kind: RuntimeKind; version?: string }
  instance: {
    baseDirRef?: string
    ports: Readonly<Record<string, number>>
  }
  artifact: {
    version?: string
    digest?: string
  }
  functions: NodeFunctions
  endpoints: readonly DiscoveredEndpoint[]
  identity: {
    peerIdPresent: boolean
    runtimeInstanceIdPresent: boolean
    producerAddressPresent: boolean
  }
  capabilities: NodeAuthority
  evidenceCompleteness: 'complete' | 'partial'
}

export type PeerDiscoveryFact = {
  network: NodeNetwork
  functions: Partial<NodeFunctions>
  endpointScopes: readonly EndpointScope[]
  peerIdPresent: boolean
}

export type HostDiscoveryRecord = {
  id: string
  kind: 'host'
  status: 'active' | 'dismissed'
  source: { connectionId: string }
  capturedAt: string
  expiresAt: string
  dismissedAt: string | null
  findings: HostDiscoveryFacts
}

export type PeerDiscoveryRecord = {
  id: string
  kind: 'peers'
  status: 'active' | 'dismissed'
  source: { nodeId: string; connectionId: string }
  capturedAt: string
  expiresAt: string
  dismissedAt: string | null
  findings: { total: number; peers: readonly PeerDiscoveryFact[] }
}

export type DiscoveryRecord = HostDiscoveryRecord | PeerDiscoveryRecord

export type AdoptionDisposition = 'managed-adopted' | 'connected-limited'

export type AdoptionReview = {
  id: string
  schemaVersion: 1
  digest: string
  discoveryId: string
  connectionStateRevision: number
  inventoryRevision: number
  createdAt: string
  expiresAt: string
  disposition: AdoptionDisposition
  node: NodeRecord
  application: { appliedAt: string; nodeId: string } | null
}
