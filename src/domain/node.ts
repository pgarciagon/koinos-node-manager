export const MANAGEMENT_CLASSES = ['managed', 'connected', 'external', 'discovered'] as const
export type ManagementClass = (typeof MANAGEMENT_CLASSES)[number]

export const NODE_ORIGINS = ['provisioned', 'adopted', 'imported', 'discovered'] as const
export type NodeOrigin = (typeof NODE_ORIGINS)[number]

export const AUTHORITY_LEVELS = ['none', 'observe', 'limited', 'full'] as const
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number]

export const NODE_FLAVORS = ['teleno-monolith', 'legacy-microservices', 'unknown'] as const
export type NodeFlavorId = (typeof NODE_FLAVORS)[number]

export const NETWORKS = ['mainnet', 'testnet', 'custom', 'unknown'] as const
export type NetworkName = (typeof NETWORKS)[number]

export const LOCATION_KINDS = ['local', 'remote', 'external', 'unknown'] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export const NODE_ENVIRONMENTS = ['mac', 'linux', 'nas', 'appliance', 'unknown'] as const
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number]

export const NODE_HEALTH_STATES = ['healthy', 'degraded', 'unreachable', 'unknown'] as const
export type NodeHealth = (typeof NODE_HEALTH_STATES)[number]

export const OBSERVATION_FRESHNESS_STATES = ['fresh', 'stale', 'never'] as const
export type ObservationFreshness = (typeof OBSERVATION_FRESHNESS_STATES)[number]

export const NODE_FUNCTIONS = ['observer', 'producer', 'seed', 'api', 'backup-source'] as const
export type NodeFunction = (typeof NODE_FUNCTIONS)[number]
export type FunctionState = 'enabled' | 'disabled' | 'unknown'

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
}

export type NodeNetwork = {
  name: NetworkName
  chainId?: string
}

export type NodeLocation = {
  kind: LocationKind
  environment: NodeEnvironment
  connectionRef?: string
}

export type NodeFunctions = Record<NodeFunction, FunctionState>

export type NodeEndpointKind = 'p2p' | 'jsonrpc' | 'grpc' | 'admin' | 'backup'
export const ENDPOINT_SCOPES = ['local', 'private', 'public', 'unknown'] as const
export type EndpointScope = (typeof ENDPOINT_SCOPES)[number]

export type NodeEndpoint = {
  kind: NodeEndpointKind
  scope: EndpointScope
  address: string
}

export type NodeIdentityEvidence = {
  peerId?: string
  runtimeInstanceId?: string
  producerAddress?: string
}

export type NodeSupervisorFacts = {
  kind: 'foreground' | 'launchd' | 'systemd' | 'docker' | 'unknown'
  serviceRef?: string
}

export type NodeRuntimeDescriptor = {
  kind: 'native' | 'container' | 'legacy-services' | 'unknown'
  version?: string
}

export type NodeInstanceFacts = {
  baseDirRef?: string
  ports: Readonly<Record<string, number>>
}

export type NodeArtifactFacts = {
  version?: string
  digest?: string
}

export type NodeRuntimeFacts = {
  flavor: NodeFlavor
  network: NodeNetwork
  location: NodeLocation
  functions: NodeFunctions
  endpoints: NodeEndpoint[]
  identity: NodeIdentityEvidence
  supervisor?: NodeSupervisorFacts
  runtime?: NodeRuntimeDescriptor
  instance?: NodeInstanceFacts
  artifact?: NodeArtifactFacts
}

export type NodeDeclaredState = NodeRuntimeFacts

export type NodeDesiredState = {
  flavor?: NodeFlavor
  network?: NodeNetwork
  location?: NodeLocation
  functions?: Partial<NodeFunctions>
  supervisor?: NodeSupervisorFacts
  runtime?: NodeRuntimeDescriptor
  instance?: NodeInstanceFacts
  artifact?: NodeArtifactFacts
}

export type NodeObservedState = NodeRuntimeFacts & {
  health: NodeHealth
  observedAt: string
  freshness: Exclude<ObservationFreshness, 'never'>
}

export type NodeVerifiedState = {
  flavor?: NodeFlavor
  network?: NodeNetwork
  location?: NodeLocation
  functions?: Partial<NodeFunctions>
  endpoints?: NodeEndpoint[]
  identity?: NodeIdentityEvidence
  supervisor?: NodeSupervisorFacts
  runtime?: NodeRuntimeDescriptor
  instance?: NodeInstanceFacts
  artifact?: NodeArtifactFacts
  verifiedAt: string
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
  declared: NodeDeclaredState
  desired: NodeDesiredState | null
  observed: NodeObservedState | null
  verified: NodeVerifiedState | null
  provenance: NodeProvenance
}
