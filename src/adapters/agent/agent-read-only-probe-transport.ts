import { randomBytes } from 'node:crypto'
import { encodeAgentFacts } from '../../core/agent-probe-codec.js'
import { decodeStoredAgentCredential } from '../../core/agent-credential.js'
import { validateAgentProbeResponse } from '../../core/agent-protocol.js'
import type { AgentClient } from '../../core/agent-client.js'
import type { ProbeRequest, ProbeResponse, ReadOnlyProbeTransport } from '../../core/probe-transport.js'
import type { SecretStore } from '../../core/secret-store.js'
import { AGENT_CLOSED_PROBES, type AgentClosedProbeKind } from '../../domain/agent-protocol.js'

export class AgentReadOnlyProbeTransport implements ReadOnlyProbeTransport {
  constructor(private readonly client: AgentClient, private readonly secrets: SecretStore) {}

  async execute(request: ProbeRequest): Promise<ProbeResponse> {
    if (request.connection.kind !== 'agent' || !AGENT_CLOSED_PROBES.includes(request.kind as AgentClosedProbeKind)) {
      return { outcome: 'unsupported', durationMs: 0, payload: null }
    }
    const stored = await this.secrets.get(request.connection.credentialRef)
    if (stored === null) return { outcome: 'authentication-failed', durationMs: 0, payload: null }
    const credential = decodeStoredAgentCredential(stored)
    const requestId = randomBytes(16).toString('base64url')
    const response = await this.client.probe(request.connection, credential.token, {
      schemaVersion: 1,
      protocolVersion: request.connection.protocolVersion as '1.0.0',
      requestId,
      kind: request.kind as AgentClosedProbeKind,
      timeoutMs: Math.max(1_000, Math.min(30_000, Math.trunc(request.timeoutMs)))
    }, request.timeoutMs)
    const facts = validateAgentProbeResponse(response, requestId, request.kind)
    return {
      outcome: response.outcome,
      durationMs: response.durationMs,
      payload: facts === null ? null : encodeAgentFacts(facts)
    }
  }
}
