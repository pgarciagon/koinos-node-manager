import type { NetworkName, NodeFlavorId } from './node.js'

export const NODE_INSPECTION_SCHEMA_VERSION = 1 as const
export const NODE_INSPECTION_CONTRACT_VERSION = '1.0.0' as const

export const INSPECTION_SECTIONS = ['overview', 'components', 'chain', 'governance'] as const
export type InspectionSection = (typeof INSPECTION_SECTIONS)[number]

export const INSPECTION_AVAILABILITY_REASONS = [
  'not-requested',
  'capability-not-exposed',
  'probe-unsupported',
  'transport-unavailable',
  'malformed-response',
  'not-configured',
  'insufficient-evidence',
  'stale-evidence',
  'runtime-mismatch'
] as const
export type InspectionAvailabilityReason = (typeof INSPECTION_AVAILABILITY_REASONS)[number]

export type InspectionEvidenceSource =
  | 'docker'
  | 'configuration'
  | 'jsonrpc'
  | 'runtime-status'
  | 'derived'

export type InspectionEvidenceAuthority = 'reported' | 'observed' | 'verified'
export type InspectionEvidenceFreshness = 'fresh' | 'stale'

export type InspectionEvidence = {
  source: InspectionEvidenceSource
  observedAt: string
  freshness: InspectionEvidenceFreshness
  authority: InspectionEvidenceAuthority
}

export type AvailableInspectionValue<T> = {
  availability: 'available'
  value: T
  evidence: InspectionEvidence
}

export type UnavailableInspectionValue = {
  availability: 'unavailable'
  reason: InspectionAvailabilityReason
  evidence: InspectionEvidence
}

export type UnknownInspectionValue = {
  availability: 'unknown'
  reason: InspectionAvailabilityReason
  evidence: InspectionEvidence
}

export type InspectionValue<T> =
  | AvailableInspectionValue<T>
  | UnavailableInspectionValue
  | UnknownInspectionValue

export type RuntimeInspectionCapabilities = {
  overview: boolean
  components: boolean
  chain: boolean
  governance: boolean
  apis: boolean
  producer: boolean
  resources: boolean
}

export type InspectionComponentState =
  | 'running'
  | 'stopped'
  | 'restarting'
  | 'paused'
  | 'failed'
  | 'unknown'

export type InspectionComponent = {
  name: string
  available: InspectionValue<boolean>
  state: InspectionValue<InspectionComponentState>
  restartCount: InspectionValue<number>
  artifact: InspectionValue<{
    version?: string
    digest?: string
  }>
  uptimeSeconds: InspectionValue<number>
}

export type InspectionApi = {
  kind: 'jsonrpc' | 'grpc' | 'rest' | 'admin'
  scope: 'local' | 'private' | 'public' | 'unknown'
  exposed: boolean
}

export type InspectionOverview = {
  runtime: InspectionValue<{
    flavor: NodeFlavorId
    version?: string
  }>
  instance: InspectionValue<{ present: boolean }>
  network: InspectionValue<{
    name: NetworkName
    chainId?: string
  }>
  build: InspectionValue<{
    version?: string
    digest?: string
  }>
  supervisor: InspectionValue<'docker' | 'foreground' | 'launchd' | 'systemd' | 'unknown'>
  layout: InspectionValue<'legacy-services' | 'monolith'>
  uptimeSeconds: InspectionValue<number>
}

export type InspectionChain = {
  head: InspectionValue<{
    height: number
    blockId?: string
  }>
  lastIrreversibleBlock: InspectionValue<number>
  headAgeSeconds: InspectionValue<number>
  progress: InspectionValue<'advancing' | 'stalled'>
  blockStoreAgreement: InspectionValue<'agrees' | 'lagging' | 'mismatch'>
  forks: InspectionValue<{
    detected: boolean
    count: number
  }>
  p2pGossip: InspectionValue<boolean>
  peerCount: InspectionValue<number>
}

export type InspectionProducer = {
  configured: InspectionValue<boolean>
  effectiveEnabled: InspectionValue<boolean>
  addressPresent: InspectionValue<boolean>
  recentProduction: InspectionValue<{
    producedBlocks: number
    observationWindowBlocks: number
  }>
  productionPercentage: InspectionValue<number>
}

export type InspectionGovernance = {
  configuredProposalIds: InspectionValue<readonly string[]>
  effectiveProposalIds: InspectionValue<readonly string[]>
  observedProposalVotes: InspectionValue<readonly {
    proposalId: string
    blockHeight: number
  }[]>
  networkProposals: InspectionValue<readonly {
    proposalId: string
    status: string
    tally?: string
    threshold?: string
  }[]>
}

export type InspectionResources = {
  storage: InspectionValue<{
    totalBytes: number
    usedBytes: number
    freeBytes: number
  }>
  cpuPercent: InspectionValue<number>
  memoryBytes: InspectionValue<number>
}

export type InspectionWarning = {
  code: string
  severity: 'warning' | 'unsafe'
  summary: string
}

export type NodeInspectionSnapshot = {
  schemaVersion: typeof NODE_INSPECTION_SCHEMA_VERSION
  contractVersion: typeof NODE_INSPECTION_CONTRACT_VERSION
  node: {
    id: string
    displayName: string
    flavor: NodeFlavorId
  }
  capturedAt: string
  freshness: InspectionEvidenceFreshness
  readOnly: true
  capabilities: RuntimeInspectionCapabilities
  overview: InspectionOverview
  components: InspectionValue<readonly InspectionComponent[]>
  chain: InspectionChain
  apis: InspectionValue<readonly InspectionApi[]>
  producer: InspectionProducer
  governance: InspectionGovernance
  resources: InspectionResources
  warnings: readonly InspectionWarning[]
  evidence: readonly InspectionEvidence[]
}

export type PublicNodeInspectionSnapshot = NodeInspectionSnapshot
