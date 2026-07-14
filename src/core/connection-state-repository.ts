import type { AdoptionReview, ConnectionRecord, DiscoveryRecord } from '../domain/connection.js'
import type { NodeAccessProfile, OnboardingReviewRecord } from '../domain/onboarding.js'

export const CONNECTION_STATE_SCHEMA_VERSION = 2

export type ConnectionStateSnapshot = {
  schemaVersion: typeof CONNECTION_STATE_SCHEMA_VERSION
  revision: number
  updatedAt: string | null
  connections: readonly ConnectionRecord[]
  discoveries: readonly DiscoveryRecord[]
  adoptionReviews: readonly AdoptionReview[]
  accessProfiles: readonly NodeAccessProfile[]
  onboardingReviews: readonly OnboardingReviewRecord[]
}

export type ConnectionStateWrite = Pick<ConnectionStateSnapshot, 'connections' | 'discoveries' | 'adoptionReviews'>
  & Partial<Pick<ConnectionStateSnapshot, 'accessProfiles' | 'onboardingReviews'>>

export type ConnectionStateDiagnosticCheck = {
  id: string
  status: 'pass' | 'warning' | 'fail'
  summary: string
  nextAction?: string
}

export type ConnectionStateDiagnosticReport = {
  healthy: boolean
  checks: readonly ConnectionStateDiagnosticCheck[]
}

export interface ConnectionStateRepository {
  read(): Promise<ConnectionStateSnapshot>
  save(state: ConnectionStateWrite, expectedRevision: number): Promise<ConnectionStateSnapshot>
  diagnose(): Promise<ConnectionStateDiagnosticReport>
  recoverLatestBackup(): Promise<ConnectionStateSnapshot>
}

export function emptyConnectionState(): ConnectionStateSnapshot {
  return {
    schemaVersion: CONNECTION_STATE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: null,
    connections: [],
    discoveries: [],
    adoptionReviews: [],
    accessProfiles: [],
    onboardingReviews: []
  }
}
