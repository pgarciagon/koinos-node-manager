export type ManagementClass = 'managed' | 'connected' | 'external' | 'discovered'
export type NodeOrigin = 'provisioned' | 'adopted' | 'imported' | 'discovered'
export type AuthorityLevel = 'none' | 'observe' | 'limited' | 'full'
export type VerificationState = 'verified' | 'detected' | 'observed' | 'declared' | 'unknown'
export type NodeFlavorId = 'teleno-monolith' | 'legacy-microservices' | 'unknown'
export type NetworkName = 'mainnet' | 'testnet' | 'custom' | 'unknown'
export type LocationKind = 'local' | 'remote' | 'external' | 'unknown'
export type NodeEnvironment = 'mac' | 'linux' | 'nas' | 'appliance' | 'unknown'
export type NodeHealth = 'healthy' | 'degraded' | 'unreachable' | 'unknown'
export type NodeFunction = 'observer' | 'producer' | 'seed' | 'api' | 'backup-source'
export type FunctionState = 'enabled' | 'disabled' | 'verified' | 'observed' | 'declared' | 'unknown'

export type NodeAuthority = {
  inspect: boolean
  configure: boolean
  startStop: boolean
  upgrade: boolean
  backup: boolean
  restore: boolean
  logs: boolean
  producerControl: boolean
  walletAccess: boolean
}

export type NodeManagement = {
  class: ManagementClass
  origin: NodeOrigin
  authorityLevel: AuthorityLevel
  authority: NodeAuthority
}

export type NodeFlavor = {
  id: NodeFlavorId
  version?: string
  confidence: VerificationState
}

export type NodeNetwork = {
  name: NetworkName
  chainId?: string
  verification: VerificationState
}

export type NodeLocation = {
  kind: LocationKind
  environment: NodeEnvironment
  connectionRef?: string
}

export type NodeFunctions = Record<NodeFunction, FunctionState>

export type NodeEndpointKind = 'p2p' | 'jsonrpc' | 'grpc' | 'admin' | 'backup'
export type EndpointScope = 'local' | 'private' | 'public' | 'unknown'

export type NodeEndpoint = {
  kind: NodeEndpointKind
  scope: EndpointScope
  address: string
  verification: VerificationState
}

export type NodeIdentityEvidence = {
  peerId?: string
  runtimeInstanceId?: string
  producerAddress?: string
}

export type NodeProvenance = {
  discoveredAt?: string
  importedAt?: string
  provisionedAt?: string
  adoptedAt?: string
  source: string
}

export type NodeRecord = {
  id: string
  displayName: string
  management: NodeManagement
  flavor: NodeFlavor
  network: NodeNetwork
  location: NodeLocation
  functions: NodeFunctions
  endpoints: NodeEndpoint[]
  identity: NodeIdentityEvidence
  provenance: NodeProvenance
  health: NodeHealth
  lastObservedAt?: string
}

export const NODE_FUNCTIONS: readonly NodeFunction[] = [
  'observer',
  'producer',
  'seed',
  'api',
  'backup-source'
]
