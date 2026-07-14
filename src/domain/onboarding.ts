import type { ConnectionRecord } from './connection.js'
import type { PublicNodeInspectionSnapshot, RuntimeInspectionCapabilities } from './inspection.js'
import type { NodeRecord } from './node.js'

export const NODE_ONBOARDING_SCHEMA_VERSION = 1 as const
export const NODE_ONBOARDING_CONTRACT_VERSION = '1.0.0' as const
export const ONBOARDING_MODES = ['quick', 'full'] as const
export type OnboardingMode = (typeof ONBOARDING_MODES)[number]
export const ACCESS_MODES = ['quick', 'full', 'expert'] as const
export type AccessMode = (typeof ACCESS_MODES)[number]
export const ONBOARDING_STATUSES = [
  'validating',
  'probing',
  'pairing',
  'verifying',
  'review-ready',
  'committing',
  'committed',
  'cancelled',
  'failed'
] as const
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number]

export type AccessAuthority = 'public-observe' | 'paired-inspect' | 'ssh-observe'
export type AccessStatus = 'connected' | 'degraded' | 'unavailable'

export type NodeAccessBinding = {
  connectionRef: string
  mode: AccessMode
  capabilityClass: AccessAuthority
  verifiedAt: string
  enabled: boolean
}

export type NodeAccessProfile = {
  nodeId: string
  bindings: readonly NodeAccessBinding[]
  preferredInspectionMode: 'automatic' | AccessMode
}

export type NodeAccessSummary = {
  mode: AccessMode
  status: AccessStatus
  capabilities: RuntimeInspectionCapabilities
  authority: AccessAuthority
  lastVerifiedAt: string
  freshness: 'fresh' | 'stale'
  warnings: readonly string[]
}

export type OnboardingReviewRecord = {
  id: string
  schemaVersion: typeof NODE_ONBOARDING_SCHEMA_VERSION
  contractVersion: typeof NODE_ONBOARDING_CONTRACT_VERSION
  digest: string
  mode: OnboardingMode
  status: Extract<OnboardingStatus, 'pairing' | 'review-ready' | 'committed' | 'cancelled' | 'failed'>
  connectionStateRevision: number
  inventoryRevision: number
  createdAt: string
  expiresAt: string
  candidateConnection: ConnectionRecord
  candidateNode: NodeRecord
  inspection: PublicNodeInspectionSnapshot | null
  accessSummary: NodeAccessSummary
  pairingSessionRef?: string
  appliedAt: string | null
}

export type PublicOnboardingReview = {
  schemaVersion: typeof NODE_ONBOARDING_SCHEMA_VERSION
  contractVersion: typeof NODE_ONBOARDING_CONTRACT_VERSION
  id: string
  digest: string
  mode: OnboardingMode
  status: OnboardingReviewRecord['status']
  node: {
    id: string
    displayName: string
    existing: boolean
  }
  connectionKind: ConnectionRecord['kind']
  access: NodeAccessSummary
  inspection: PublicNodeInspectionSnapshot | null
  createdAt: string
  expiresAt: string
  appliedAt: string | null
  pairingSessionRef?: string
  readOnly: true
}

export type OnboardingEvent =
  | { type: 'start-validation' }
  | { type: 'start-probe' }
  | { type: 'start-pairing' }
  | { type: 'start-verification' }
  | { type: 'review-ready' }
  | { type: 'start-commit' }
  | { type: 'committed' }
  | { type: 'cancelled' }
  | { type: 'failed' }

export type OnboardingState = {
  status: 'idle' | OnboardingStatus
}
