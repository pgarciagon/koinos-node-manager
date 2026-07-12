import type { NodeRecord } from '../domain/node.js'

export interface NodeRepository {
  list(): Promise<readonly NodeRecord[]>
}

export const INVENTORY_SCHEMA_VERSION = 1

export type InventorySnapshot = {
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION
  revision: number
  updatedAt: string | null
  nodes: readonly NodeRecord[]
}

export type InventoryDiagnosticStatus = 'pass' | 'warning' | 'fail'

export type InventoryDiagnosticCheck = {
  id: string
  status: InventoryDiagnosticStatus
  summary: string
  nextAction?: string
}

export type InventoryDiagnosticReport = {
  healthy: boolean
  checks: readonly InventoryDiagnosticCheck[]
}

export interface InventoryRepository extends NodeRepository {
  read(): Promise<InventorySnapshot>
  save(nodes: readonly NodeRecord[], expectedRevision: number): Promise<InventorySnapshot>
  diagnose(): Promise<InventoryDiagnosticReport>
  recoverLatestBackup(): Promise<InventorySnapshot>
}
