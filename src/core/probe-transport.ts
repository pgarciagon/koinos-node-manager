import type { ConnectionRecord, ConnectionTestOutcome } from '../domain/connection.js'

export const RUNTIME_INSPECTION_PROBE_KINDS = [
  'node.multiservice.components',
  'node.multiservice.chain-head',
  'node.multiservice.chain-id',
  'node.multiservice.chain-forks',
  'node.multiservice.block-store-head',
  'node.multiservice.p2p-status',
  'node.multiservice.config',
  'node.multiservice.resources',
  'node.teleno.status'
] as const
export type RuntimeInspectionProbeKind = (typeof RUNTIME_INSPECTION_PROBE_KINDS)[number]

export const PROBE_KINDS = [
  'connection.handshake',
  'host.inventory',
  'peers.snapshot',
  ...RUNTIME_INSPECTION_PROBE_KINDS
] as const
export type ProbeKind = (typeof PROBE_KINDS)[number]

export type ProbeRequest = {
  connection: ConnectionRecord
  kind: ProbeKind
  timeoutMs: number
}

export type ProbeResponse = {
  outcome: ConnectionTestOutcome
  durationMs: number
  payload: string | null
}

export interface ReadOnlyProbeTransport {
  execute(request: ProbeRequest): Promise<ProbeResponse>
}

export interface SshAliasResolver {
  hasExactAlias(alias: string): Promise<boolean>
}
