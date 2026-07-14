import {
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject
} from 'node:crypto'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import {
  AGENT_CLOSED_PROBES,
  AGENT_MAX_PAIRING_LIFETIME_MS,
  KOINOS_NODE_AGENT_PROTOCOL_VERSION,
  type AgentDiscoveryDocument,
  type AgentPairingRequest,
  type AgentPairingResponse,
  type AgentProbeFacts,
  type AgentProbeResponse
} from '../domain/agent-protocol.js'

export type AgentIdentity = { publicKey: KeyObject; privateKey: KeyObject; publicKeyText: string; digest: string }

export function createAgentIdentity(): AgentIdentity {
  const keys = generateKeyPairSync('ed25519')
  const publicKeyText = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')
  return { ...keys, publicKeyText, digest: identityDigest(publicKeyText) }
}

export function identityDigest(publicKeyText: string): string {
  return createHash('sha256').update(publicKeyText).digest('hex')
}

export function createPairingSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function createPairingRequest(sessionId: string, secret: string): {
  request: AgentPairingRequest
  transcript: string
  clientPrivateKey: KeyObject
} {
  assertOpaque(sessionId, 'AGENT_PAIRING_SESSION_INVALID')
  assertPairingSecret(secret)
  const keys = generateKeyPairSync('ed25519')
  const clientPublicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')
  const clientNonce = randomBytes(24).toString('base64url')
  const transcript = pairingTranscript(sessionId, clientPublicKey, clientNonce)
  return {
    request: {
      schemaVersion: 1,
      protocolVersion: KOINOS_NODE_AGENT_PROTOCOL_VERSION,
      sessionId,
      clientPublicKey,
      clientNonce,
      secretProof: createHmac('sha256', secret).update(transcript).digest('base64url')
    },
    transcript,
    clientPrivateKey: keys.privateKey
  }
}

export function validatePairingRequest(request: AgentPairingRequest, secret: string): string {
  assertOnlyKeys(request, ['schemaVersion', 'protocolVersion', 'sessionId', 'clientPublicKey', 'clientNonce', 'secretProof'])
  assertProtocol(request.protocolVersion)
  if (request.schemaVersion !== 1) throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent pairing request schema is unsupported.')
  assertOpaque(request.sessionId, 'AGENT_PAIRING_SESSION_INVALID')
  assertEncoded(request.clientPublicKey, 56, 512)
  assertEncoded(request.clientNonce, 24, 128)
  assertEncoded(request.secretProof, 32, 128)
  const transcript = pairingTranscript(request.sessionId, request.clientPublicKey, request.clientNonce)
  const expected = Buffer.from(createHmac('sha256', secret).update(transcript).digest('base64url'))
  const actual = Buffer.from(request.secretProof)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw agentError('AGENT_PAIRING_REJECTED', false, 'The pairing proof was rejected.')
  }
  return transcript
}

export function signPairingResponse(
  identity: AgentIdentity,
  request: AgentPairingRequest,
  transcript: string,
  credential: string,
  credentialId: string,
  expiresAt: string
): AgentPairingResponse {
  const signed = responseTranscript(transcript, identity.digest, credentialId, expiresAt)
  return {
    schemaVersion: 1,
    protocolVersion: KOINOS_NODE_AGENT_PROTOCOL_VERSION,
    sessionId: request.sessionId,
    identityPublicKey: identity.publicKeyText,
    identityDigest: identity.digest,
    transcriptSignature: sign(null, Buffer.from(signed), identity.privateKey).toString('base64url'),
    credential,
    credentialId,
    scopes: ['inspect'],
    expiresAt
  }
}

export function verifyPairingResponse(
  response: AgentPairingResponse,
  expectedSessionId: string,
  expectedIdentityDigest: string,
  transcript: string,
  now: Date
): void {
  assertOnlyKeys(response, ['schemaVersion', 'protocolVersion', 'sessionId', 'identityPublicKey', 'identityDigest', 'transcriptSignature', 'credential', 'credentialId', 'scopes', 'expiresAt'])
  assertProtocol(response.protocolVersion)
  if (response.schemaVersion !== 1 || response.sessionId !== expectedSessionId || response.scopes.length !== 1 || response.scopes[0] !== 'inspect') {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent pairing response is malformed.')
  }
  const digest = identityDigest(response.identityPublicKey)
  if (digest !== response.identityDigest || digest !== expectedIdentityDigest) {
    throw agentError('AGENT_IDENTITY_CHANGED', false, 'The agent identity does not match the reviewed fingerprint.')
  }
  if (Date.parse(response.expiresAt) <= now.getTime()) throw agentError('AGENT_CREDENTIAL_EXPIRED', true, 'The issued inspection credential is already expired.')
  assertCredential(response.credential)
  assertOpaque(response.credentialId, 'AGENT_PROTOCOL_MALFORMED')
  const publicKey = keyFromText(response.identityPublicKey)
  const signed = responseTranscript(transcript, response.identityDigest, response.credentialId, response.expiresAt)
  if (!verify(null, Buffer.from(signed), publicKey, Buffer.from(response.transcriptSignature, 'base64url'))) {
    throw agentError('AGENT_POSSESSION_PROOF_INVALID', false, 'The agent did not prove possession of the reviewed identity key.')
  }
}

export function validateDiscovery(document: AgentDiscoveryDocument): void {
  assertOnlyKeys(document, ['schemaVersion', 'protocolVersion', 'identityPublicKey', 'identityDigest', 'runtimeFlavor', 'scopes', 'probes', 'build', 'readOnly'])
  if (!Array.isArray(document.scopes) || !Array.isArray(document.probes) || typeof document.build !== 'object' || document.build === null) {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent discovery document is malformed.')
  }
  assertOnlyKeys(document.build, ['version', 'artifactDigest', 'signature'])
  assertProtocol(document.protocolVersion)
  if (document.schemaVersion !== 1 || document.readOnly !== true || document.scopes.length !== 1 || document.scopes[0] !== 'inspect') {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent discovery document is malformed.')
  }
  if (identityDigest(document.identityPublicKey) !== document.identityDigest) throw agentError('AGENT_IDENTITY_CHANGED', false, 'The agent identity fingerprint is inconsistent.')
  if (document.probes.some((probe) => !AGENT_CLOSED_PROBES.includes(probe))) throw agentError('AGENT_PROBE_NOT_ALLOWED', false, 'The agent advertised an unsupported probe.')
  if (!/^[0-9a-f]{64}$/.test(document.build.artifactDigest) || document.build.signature.length < 32) throw agentError('AGENT_BUILD_UNTRUSTED', false, 'The agent build metadata is not signed correctly.')
  const buildStatement = JSON.stringify({
    protocolVersion: document.protocolVersion,
    version: document.build.version,
    artifactDigest: document.build.artifactDigest
  })
  if (!verify(null, Buffer.from(buildStatement), keyFromText(document.identityPublicKey), Buffer.from(document.build.signature, 'base64url'))) {
    throw agentError('AGENT_BUILD_UNTRUSTED', false, 'The agent build metadata signature is invalid.')
  }
}

export function validateAgentProbeResponse(response: AgentProbeResponse, requestId: string, kind: string): AgentProbeFacts | null {
  assertOnlyKeys(response, ['schemaVersion', 'protocolVersion', 'requestId', 'outcome', 'durationMs', 'facts'])
  assertProtocol(response.protocolVersion)
  if (response.schemaVersion !== 1 || response.requestId !== requestId || response.durationMs < 0 || response.durationMs > 30_000) {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent probe response is malformed.')
  }
  if (response.outcome !== 'success') return null
  if (response.facts === null || response.facts.kind !== kind) throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent returned facts for a different probe.')
  if (JSON.stringify(response).length > 256 * 1024) throw agentError('AGENT_RESPONSE_OVERSIZED', false, 'The agent response exceeded the bounded size limit.')
  rejectUnexpectedKeys(response.facts)
  return structuredClone(response.facts)
}

export function assertPairingLifetime(createdAt: Date, expiresAt: Date): void {
  const lifetime = expiresAt.getTime() - createdAt.getTime()
  if (lifetime <= 0 || lifetime > AGENT_MAX_PAIRING_LIFETIME_MS) throw agentError('AGENT_PAIRING_EXPIRED', false, 'The pairing session lifetime is invalid or expired.')
}

export function assertProtocol(version: string): void {
  if (version === KOINOS_NODE_AGENT_PROTOCOL_VERSION) return
  throw agentError('AGENT_PROTOCOL_INCOMPATIBLE', false, 'The node agent protocol version is incompatible.')
}

function pairingTranscript(sessionId: string, clientPublicKey: string, clientNonce: string): string {
  return JSON.stringify({ protocolVersion: KOINOS_NODE_AGENT_PROTOCOL_VERSION, sessionId, clientPublicKey, clientNonce, scope: 'inspect' })
}

function responseTranscript(transcript: string, identity: string, credentialId: string, expiresAt: string): string {
  return JSON.stringify({ transcript, identity, credentialId, expiresAt, scope: 'inspect' })
}

function keyFromText(value: string): KeyObject {
  try {
    return createPublicKey({ key: Buffer.from(value, 'base64url'), type: 'spki', format: 'der' })
  } catch {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent identity key is malformed.')
  }
}

function rejectUnexpectedKeys(facts: AgentProbeFacts): void {
  const allowed: Readonly<Record<AgentProbeFacts['kind'], readonly string[]>> = {
    'node.multiservice.components': ['kind', 'components'],
    'node.multiservice.chain-head': ['kind', 'head'],
    'node.multiservice.chain-id': ['kind', 'chainId'],
    'node.multiservice.chain-forks': ['kind', 'forkCount'],
    'node.multiservice.block-store-head': ['kind', 'head'],
    'node.multiservice.p2p-status': ['kind', 'enabled'],
    'node.multiservice.config': ['kind', 'configuration'],
    'node.multiservice.resources': ['kind', 'storage'],
    'node.teleno.status': ['kind', 'status']
  }
  if (Object.keys(facts).some((key) => !allowed[facts.kind].includes(key))) throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent response contains unsupported fields.')
}

function assertOnlyKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent protocol object contains unsupported fields.')
  }
}

function assertPairingSecret(value: string): void {
  if (/^[A-Za-z0-9_-]{43,128}$/.test(value)) return
  throw agentError('AGENT_PAIRING_REJECTED', false, 'The pairing secret is malformed.')
}

function assertCredential(value: string): void {
  if (/^[A-Za-z0-9_-]{43,512}$/.test(value)) return
  throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The issued credential is malformed.')
}

function assertOpaque(value: string, code: string): void {
  if (/^[A-Za-z0-9_-]{8,128}$/.test(value)) return
  throw agentError(code, false, 'The agent session reference is malformed.')
}

function assertEncoded(value: string, minimum: number, maximum: number): void {
  if (value.length >= minimum && value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value)) return
  throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent cryptographic field is malformed.')
}

export function agentError(code: string, retryable: boolean, message: string): ApplicationError {
  return new ApplicationError({
    code,
    exitCode: code.includes('PROTOCOL') || code.includes('IDENTITY') || code.includes('PAIRING')
      ? EXIT_CODES.safetyBlocked
      : EXIT_CODES.transportUnavailable,
    severity: code.includes('IDENTITY') || code.includes('POSSESSION') ? 'unsafe' : 'error',
    retryable,
    message,
    nextAction: 'Create a fresh read-only pairing session and review the agent identity before retrying.'
  })
}
