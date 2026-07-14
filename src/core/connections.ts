import { ApplicationError } from './application-error.js'
import type { ConnectionStateRepository } from './connection-state-repository.js'
import { EXIT_CODES } from './exit-codes.js'
import type { NodeRepository } from './node-repository.js'
import type { ReadOnlyProbeTransport, SshAliasResolver } from './probe-transport.js'
import { assertConnectionId, assertSshHostAlias } from './validate-connection-state.js'
import type { ConnectionRecord, ConnectionTestEvidence, ConnectionTestOutcome } from '../domain/connection.js'

export type ConnectionServices = {
  repository: ConnectionStateRepository
  aliasResolver: SshAliasResolver
  probeTransport: ReadOnlyProbeTransport
  now?: () => Date
}

export async function listConnections(repository: ConnectionStateRepository): Promise<readonly ConnectionRecord[]> {
  return [...structuredClone((await repository.read()).connections)].sort((left, right) => left.id.localeCompare(right.id))
}

export async function getConnection(repository: ConnectionStateRepository, id: string): Promise<ConnectionRecord> {
  assertConnectionId(id)
  const connection = (await repository.read()).connections.find((candidate) => candidate.id === id)
  if (connection === undefined) throw connectionNotFound(id)
  return structuredClone(connection)
}

export async function addSshConnection(
  services: ConnectionServices,
  input: { id: string; hostAlias: string }
): Promise<{ connection: ConnectionRecord; revision: number }> {
  assertConnectionId(input.id)
  assertSshHostAlias(input.hostAlias)
  if (!await services.aliasResolver.hasExactAlias(input.hostAlias)) {
    throw new ApplicationError({
      code: 'SSH_ALIAS_NOT_CONFIGURED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'The requested SSH alias is not an exact Host entry in the configured SSH config.',
      nextAction: 'Add a private exact Host alias to SSH config, then retry without providing a hostname, user, or key path.'
    })
  }
  const snapshot = await services.repository.read()
  if (snapshot.connections.some((connection) => connection.id === input.id)) {
    throw new ApplicationError({
      code: 'CONNECTION_ID_CONFLICT',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: `Connection ID "${input.id}" already exists.`,
      nextAction: 'Choose another stable ID or inspect the existing connection.'
    })
  }
  if (snapshot.connections.some((connection) => connection.kind === 'ssh' && connection.hostAlias === input.hostAlias)) {
    throw new ApplicationError({
      code: 'SSH_ALIAS_CONFLICT',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'That SSH alias is already referenced by another connection.',
      nextAction: 'Reuse the existing connection ID or configure a distinct alias.'
    })
  }
  const timestamp = (services.now ?? (() => new Date()))().toISOString()
  const connection: ConnectionRecord = {
    id: input.id,
    kind: 'ssh',
    hostAlias: input.hostAlias,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastTest: null
  }
  const saved = await services.repository.save({
    connections: [...snapshot.connections, connection],
    discoveries: snapshot.discoveries,
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  return { connection: structuredClone(connection), revision: saved.revision }
}

export async function testConnection(
  services: ConnectionServices,
  connectionId: string,
  timeoutMs: number
): Promise<{ connection: ConnectionRecord; evidence: ConnectionTestEvidence; revision: number }> {
  const connection = await getConnection(services.repository, connectionId)
  if (connection.kind !== 'ssh') {
    throw new ApplicationError({
      code: 'CONNECTION_TEST_UNSUPPORTED',
      exitCode: EXIT_CODES.transportUnavailable,
      severity: 'error',
      retryable: false,
      message: 'This connection kind uses its onboarding-specific verification path.',
      nextAction: 'Use the corresponding onboarding status or node inspection command.'
    })
  }
  if (!await services.aliasResolver.hasExactAlias(connection.hostAlias)) {
    throw new ApplicationError({
      code: 'SSH_ALIAS_NOT_CONFIGURED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'The stored SSH alias is no longer an exact configured Host entry.',
      nextAction: 'Restore the private SSH alias or remove the stale connection reference.'
    })
  }
  const response = await services.probeTransport.execute({ connection, kind: 'connection.handshake', timeoutMs })
  const evidence: ConnectionTestEvidence = {
    outcome: response.outcome,
    testedAt: (services.now ?? (() => new Date()))().toISOString(),
    durationMs: response.durationMs
  }
  const snapshot = await services.repository.read()
  const index = snapshot.connections.findIndex((candidate) => candidate.id === connectionId)
  if (index < 0) throw connectionNotFound(connectionId)
  const updated = { ...snapshot.connections[index] as ConnectionRecord, updatedAt: evidence.testedAt, lastTest: evidence }
  const connections = [...snapshot.connections]
  connections[index] = updated
  const saved = await services.repository.save({
    connections,
    discoveries: snapshot.discoveries,
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  if (evidence.outcome !== 'success') throw probeOutcomeError(evidence.outcome)
  return { connection: structuredClone(updated), evidence, revision: saved.revision }
}

export async function removeConnection(
  repository: ConnectionStateRepository,
  nodeRepository: NodeRepository,
  connectionId: string,
  confirmation: string
): Promise<{ connection: ConnectionRecord; revision: number }> {
  assertConnectionId(connectionId)
  if (confirmation !== connectionId) {
    throw new ApplicationError({
      code: 'CONNECTION_REMOVE_CONFIRMATION_MISMATCH',
      exitCode: EXIT_CODES.safetyBlocked,
      severity: 'unsafe',
      retryable: false,
      message: 'Connection removal confirmation does not match the target ID.',
      nextAction: `Review the reference, then repeat with "--confirm ${connectionId}".`
    })
  }
  const snapshot = await repository.read()
  const connection = snapshot.connections.find((candidate) => candidate.id === connectionId)
  if (connection === undefined) throw connectionNotFound(connectionId)
  const nodeReference = `connection:${connectionId}`
  if ((await nodeRepository.list()).some((node) => node.declared.location.connectionRef === nodeReference)) {
    throw referencedConnectionError('an inventory node')
  }
  if (snapshot.discoveries.some((discovery) => discovery.source.connectionId === connectionId)) {
    throw referencedConnectionError('discovery evidence')
  }
  const saved = await repository.save({
    connections: snapshot.connections.filter((candidate) => candidate.id !== connectionId),
    discoveries: snapshot.discoveries,
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  return { connection: structuredClone(connection), revision: saved.revision }
}

export type PublicConnection = {
  id: string
  kind: ConnectionRecord['kind']
  capabilityClass: 'ssh-observe' | 'public-observe' | 'paired-inspect'
  privateCoordinatesConfigured: true
  hostAlias?: '<SSH_ALIAS_PRESENT>'
  endpointClass?: 'public-https' | 'reviewed-private-https' | 'loopback-development'
  identityPinned?: true
  credentialReferenceConfigured?: true
  protocolVersion?: string
  runtimeFlavor?: string
  scopes?: readonly ['inspect']
  createdAt: string
  updatedAt: string
  lastTest: ConnectionRecord['lastTest']
}

export function sanitizeConnection(connection: ConnectionRecord): PublicConnection {
  const common = {
    id: connection.id,
    kind: connection.kind,
    privateCoordinatesConfigured: true as const,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastTest: structuredClone(connection.lastTest)
  }
  if (connection.kind === 'ssh') return { ...common, capabilityClass: 'ssh-observe', hostAlias: '<SSH_ALIAS_PRESENT>' }
  if (connection.kind === 'public-rpc') {
    return { ...common, capabilityClass: 'public-observe', endpointClass: publicEndpointClass(connection.endpointPolicy) }
  }
  return {
    ...common,
    capabilityClass: 'paired-inspect',
    endpointClass: publicEndpointClass(connection.endpointPolicy),
    identityPinned: true,
    credentialReferenceConfigured: true,
    protocolVersion: connection.protocolVersion,
    runtimeFlavor: connection.runtimeFlavor,
    scopes: ['inspect']
  }
}

function publicEndpointClass(policy: 'https-public' | 'https-private-reviewed' | 'http-loopback-development') {
  if (policy === 'https-public') return 'public-https' as const
  if (policy === 'https-private-reviewed') return 'reviewed-private-https' as const
  return 'loopback-development' as const
}

function connectionNotFound(id: string): ApplicationError {
  return new ApplicationError({
    code: 'CONNECTION_NOT_FOUND',
    exitCode: EXIT_CODES.notFound,
    severity: 'error',
    retryable: false,
    message: `Connection "${id}" was not found.`,
    nextAction: 'Run "knm connections list" to inspect available references.'
  })
}

function probeOutcomeError(outcome: ConnectionTestOutcome): ApplicationError {
  const code = outcome === 'authentication-failed'
    ? 'CONNECTION_AUTHENTICATION_FAILED'
    : outcome === 'timeout'
      ? 'CONNECTION_TIMEOUT'
      : outcome === 'unsupported'
        ? 'CONNECTION_PROBE_UNSUPPORTED'
        : outcome === 'malformed'
          ? 'CONNECTION_PROBE_MALFORMED'
          : 'CONNECTION_UNREACHABLE'
  return new ApplicationError({
    code,
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: outcome !== 'unsupported' && outcome !== 'malformed',
    message: 'The bounded read-only connection probe did not succeed.',
    nextAction: 'Check the private SSH alias, authentication, reachability, and probe manifest without exposing connection details.'
  })
}

function referencedConnectionError(reference: string): ApplicationError {
  return new ApplicationError({
    code: 'CONNECTION_STILL_REFERENCED',
    exitCode: EXIT_CODES.safetyBlocked,
    severity: 'unsafe',
    retryable: false,
    message: `The connection is still referenced by ${reference}.`,
    nextAction: 'Remove or replace dependent local metadata before deleting the connection reference.'
  })
}
