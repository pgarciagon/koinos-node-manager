import type {
  AgentDiscoveryDocument,
  AgentPairingRequest,
  AgentPairingResponse,
  AgentProbeRequest,
  AgentProbeResponse,
  AgentRevocationRequest,
  AgentRevocationResponse
} from '../domain/agent-protocol.js'
import type { AgentConnectionRecord } from '../domain/connection.js'

export type AgentEndpoint = Pick<AgentConnectionRecord, 'endpoint' | 'endpointPolicy'>

export interface AgentClient {
  discover(target: AgentEndpoint, timeoutMs: number): Promise<AgentDiscoveryDocument>
  pair(target: AgentEndpoint, request: AgentPairingRequest, timeoutMs: number): Promise<AgentPairingResponse>
  probe(target: AgentEndpoint, credential: string, request: AgentProbeRequest, timeoutMs: number): Promise<AgentProbeResponse>
  revoke(target: AgentEndpoint, credential: string, request: AgentRevocationRequest, timeoutMs: number): Promise<AgentRevocationResponse>
}
