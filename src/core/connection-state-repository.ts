import type { AdoptionReview, ConnectionRecord, DiscoveryRecord } from '../domain/connection.js'

export const CONNECTION_STATE_SCHEMA_VERSION = 1

export type ConnectionStateSnapshot = {
  schemaVersion: typeof CONNECTION_STATE_SCHEMA_VERSION
  revision: number
  updatedAt: string | null
  connections: readonly ConnectionRecord[]
  discoveries: readonly DiscoveryRecord[]
  adoptionReviews: readonly AdoptionReview[]
}

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
  save(
    state: Pick<ConnectionStateSnapshot, 'connections' | 'discoveries' | 'adoptionReviews'>,
    expectedRevision: number
  ): Promise<ConnectionStateSnapshot>
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
    adoptionReviews: []
  }
}
