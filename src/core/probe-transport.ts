import type { ConnectionRecord, ConnectionTestOutcome } from '../domain/connection.js'

export const PROBE_KINDS = ['connection.handshake', 'host.inventory', 'peers.snapshot'] as const
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
