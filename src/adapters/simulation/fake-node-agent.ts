import { createHash, randomBytes, sign } from 'node:crypto'
import type { AgentClient, AgentEndpoint } from '../../core/agent-client.js'
import {
  agentError,
  assertPairingLifetime,
  createAgentIdentity,
  createPairingSecret,
  signPairingResponse,
  validatePairingRequest,
  type AgentIdentity
} from '../../core/agent-protocol.js'
import {
  AGENT_CLOSED_PROBES,
  KOINOS_NODE_AGENT_PROTOCOL_VERSION,
  type AgentDiscoveryDocument,
  type AgentPairingPayload,
  type AgentPairingRequest,
  type AgentPairingResponse,
  type AgentProbeFacts,
  type AgentProbeRequest,
  type AgentProbeResponse,
  type AgentRevocationRequest,
  type AgentRevocationResponse
} from '../../domain/agent-protocol.js'
import type { NodeFlavorId } from '../../domain/node.js'

type PairingSession = { secret: string; createdAt: Date; expiresAt: Date; consumed: boolean }

export type FakeNodeAgentOptions = {
  now?: () => Date
  endpoint?: string
  runtimeFlavor?: NodeFlavorId
  identity?: AgentIdentity
  facts?: Partial<Record<(typeof AGENT_CLOSED_PROBES)[number], AgentProbeFacts>>
  protocolVersion?: string
  responseDelayMs?: number
}

export class FakeNodeAgent implements AgentClient {
  readonly #now: () => Date
  readonly #endpoint: string
  readonly #runtimeFlavor: NodeFlavorId
  readonly #identity: AgentIdentity
  readonly #facts: Partial<Record<(typeof AGENT_CLOSED_PROBES)[number], AgentProbeFacts>>
  readonly #protocolVersion: string
  readonly #delayMs: number
  readonly #sessions = new Map<string, PairingSession>()
  readonly #credentials = new Map<string, { token: string; revoked: boolean; expiresAt: string }>()
  readonly requests: string[] = []

  constructor(options: FakeNodeAgentOptions = {}) {
    this.#now = options.now ?? (() => new Date())
    this.#endpoint = options.endpoint ?? 'https://127.0.0.1:9443'
    this.#runtimeFlavor = options.runtimeFlavor ?? 'legacy-microservices'
    this.#identity = options.identity ?? createAgentIdentity()
    this.#facts = options.facts ?? defaultFacts(this.#runtimeFlavor)
    this.#protocolVersion = options.protocolVersion ?? KOINOS_NODE_AGENT_PROTOCOL_VERSION
    this.#delayMs = options.responseDelayMs ?? 0
  }

  issuePairingPayload(lifetimeMs = 5 * 60 * 1000): AgentPairingPayload {
    const createdAt = this.#now()
    const expiresAt = new Date(createdAt.getTime() + lifetimeMs)
    assertPairingLifetime(createdAt, expiresAt)
    const sessionId = randomBytes(18).toString('base64url')
    const secret = createPairingSecret()
    this.#sessions.set(sessionId, { secret, createdAt, expiresAt, consumed: false })
    return { endpoint: this.#endpoint, sessionId, secret, identityDigest: this.#identity.digest, expiresAt: expiresAt.toISOString() }
  }

  async discover(_target: AgentEndpoint, timeoutMs: number): Promise<AgentDiscoveryDocument> {
    await this.#boundedDelay(timeoutMs)
    this.requests.push('discover')
    const artifactDigest = createHash('sha256').update('deterministic-reference-agent').digest('hex')
    const buildStatement = JSON.stringify({ protocolVersion: this.#protocolVersion, version: '0.1.0-reference', artifactDigest })
    return {
      schemaVersion: 1,
      protocolVersion: this.#protocolVersion as '1.0.0',
      identityPublicKey: this.#identity.publicKeyText,
      identityDigest: this.#identity.digest,
      runtimeFlavor: this.#runtimeFlavor,
      scopes: ['inspect'],
      probes: [...AGENT_CLOSED_PROBES],
      build: {
        version: '0.1.0-reference',
        artifactDigest,
        signature: sign(null, Buffer.from(buildStatement), this.#identity.privateKey).toString('base64url')
      },
      readOnly: true
    }
  }

  async pair(_target: AgentEndpoint, request: AgentPairingRequest, timeoutMs: number): Promise<AgentPairingResponse> {
    await this.#boundedDelay(timeoutMs)
    this.requests.push('pair')
    const session = this.#sessions.get(request.sessionId)
    if (session === undefined) throw agentError('AGENT_PAIRING_REJECTED', false, 'The pairing session was not found.')
    if (session.consumed) throw agentError('AGENT_PAIRING_REPLAYED', false, 'The single-use pairing session was already consumed.')
    if (session.expiresAt.getTime() <= this.#now().getTime()) throw agentError('AGENT_PAIRING_EXPIRED', false, 'The pairing session expired.')
    const transcript = validatePairingRequest(request, session.secret)
    session.consumed = true
    const credential = randomBytes(48).toString('base64url')
    const credentialId = randomBytes(16).toString('base64url')
    const expiresAt = new Date(this.#now().getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
    this.#credentials.set(credentialId, { token: credential, revoked: false, expiresAt })
    return signPairingResponse(this.#identity, request, transcript, credential, credentialId, expiresAt)
  }

  async probe(_target: AgentEndpoint, credential: string, request: AgentProbeRequest, timeoutMs: number): Promise<AgentProbeResponse> {
    await this.#boundedDelay(timeoutMs)
    this.requests.push(`probe:${request.kind}`)
    if (request.protocolVersion !== KOINOS_NODE_AGENT_PROTOCOL_VERSION || !AGENT_CLOSED_PROBES.includes(request.kind)) {
      throw agentError('AGENT_PROTOCOL_INCOMPATIBLE', false, 'The probe protocol is incompatible.')
    }
    const stored = [...this.#credentials.values()].find((candidate) => candidate.token === credential)
    if (stored === undefined || stored.revoked || Date.parse(stored.expiresAt) <= this.#now().getTime()) {
      return response(request, 'authentication-failed', null)
    }
    const facts = this.#facts[request.kind]
    return facts === undefined ? response(request, 'unsupported', null) : response(request, 'success', facts)
  }

  async revoke(_target: AgentEndpoint, credential: string, request: AgentRevocationRequest, timeoutMs: number): Promise<AgentRevocationResponse> {
    await this.#boundedDelay(timeoutMs)
    this.requests.push('revoke')
    const stored = this.#credentials.get(request.credentialId)
    if (stored === undefined || stored.token !== credential) throw agentError('AGENT_CREDENTIAL_UNAVAILABLE', false, 'The inspection credential could not be revoked.')
    stored.revoked = true
    return { schemaVersion: 1, revoked: true }
  }

  async #boundedDelay(timeoutMs: number): Promise<void> {
    if (this.#delayMs > timeoutMs) throw agentError('AGENT_TIMEOUT', true, 'The node agent request timed out.')
    if (this.#delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.#delayMs))
  }
}

function response(request: AgentProbeRequest, outcome: AgentProbeResponse['outcome'], facts: AgentProbeFacts | null): AgentProbeResponse {
  return { schemaVersion: 1, protocolVersion: KOINOS_NODE_AGENT_PROTOCOL_VERSION, requestId: request.requestId, outcome, durationMs: 5, facts }
}

function defaultFacts(flavor: NodeFlavorId): Partial<Record<(typeof AGENT_CLOSED_PROBES)[number], AgentProbeFacts>> {
  if (flavor === 'teleno-monolith') {
    return {
      'node.teleno.status': {
        kind: 'node.teleno.status',
        status: { version: '1.4.0', headHeight: 1200, lastIrreversibleBlock: 1198, services: { chain: true, block_store: true, p2p: true } }
      }
    }
  }
  const digest = `sha256:${'a'.repeat(64)}`
  const chainId = 'EiB0ZXN0bmV0X2NoYWluLWlkLWZpeHR1cmU_=='
  const blockId = `0x${'1'.repeat(64)}`
  return {
    'node.multiservice.components': {
      kind: 'node.multiservice.components',
      components: [
        { service: 'chain', status: 'running', restartCount: 0, artifactVersion: '2.6.0', artifactDigest: digest, exposure: [] },
        { service: 'block_store', status: 'running', restartCount: 0, artifactVersion: '2.6.0', artifactDigest: digest, exposure: [] },
        { service: 'p2p', status: 'running', restartCount: 0, artifactVersion: '2.6.0', artifactDigest: digest, exposure: ['public'] },
        { service: 'jsonrpc', status: 'running', restartCount: 0, artifactVersion: '2.6.0', artifactDigest: digest, exposure: ['loopback'] }
      ]
    },
    'node.multiservice.chain-head': { kind: 'node.multiservice.chain-head', head: { height: 1200, blockId, lastIrreversibleBlock: 1198 } },
    'node.multiservice.chain-id': { kind: 'node.multiservice.chain-id', chainId },
    'node.multiservice.chain-forks': { kind: 'node.multiservice.chain-forks', forkCount: 0 },
    'node.multiservice.block-store-head': { kind: 'node.multiservice.block-store-head', head: { height: 1200, blockId } },
    'node.multiservice.p2p-status': { kind: 'node.multiservice.p2p-status', enabled: true },
    'node.multiservice.config': { kind: 'node.multiservice.config', configuration: { producerAddressPresent: false, instancePresent: true, configuredProposalIds: [] } },
    'node.multiservice.resources': { kind: 'node.multiservice.resources', storage: { totalBytes: 1_000_000_000, usedBytes: 400_000_000, freeBytes: 600_000_000 } }
  }
}
