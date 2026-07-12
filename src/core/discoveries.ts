import { createHash } from 'node:crypto'
import { ApplicationError } from './application-error.js'
import { getConnection } from './connections.js'
import type { ConnectionStateRepository } from './connection-state-repository.js'
import { EXIT_CODES } from './exit-codes.js'
import { getNode } from './get-node.js'
import type { NodeRepository } from './node-repository.js'
import type { ReadOnlyProbeTransport, SshAliasResolver } from './probe-transport.js'
import { parsePeerManifest, parseTelenoHostManifest } from './teleno-discovery-adapter.js'
import type { DiscoveryRecord, HostDiscoveryRecord, PeerDiscoveryRecord } from '../domain/connection.js'

export type DiscoveryServices = {
  repository: ConnectionStateRepository
  nodeRepository: NodeRepository
  aliasResolver: SshAliasResolver
  probeTransport: ReadOnlyProbeTransport
  now?: () => Date
}

export async function discoverHost(
  services: DiscoveryServices,
  connectionId: string,
  timeoutMs: number
): Promise<{ discovery: HostDiscoveryRecord; revision: number }> {
  const connection = await configuredConnection(services, connectionId)
  const response = await services.probeTransport.execute({ connection, kind: 'host.inventory', timeoutMs })
  requireSuccessfulProbe(response.outcome)
  if (response.payload === null) throw malformedProbe()
  const findings = parseTelenoHostManifest(response.payload)
  const captured = (services.now ?? (() => new Date()))()
  const discovery: HostDiscoveryRecord = {
    id: discoveryId('host', connectionId, captured.toISOString(), response.payload),
    kind: 'host',
    status: 'active',
    source: { connectionId },
    capturedAt: captured.toISOString(),
    expiresAt: new Date(captured.getTime() + 15 * 60 * 1000).toISOString(),
    dismissedAt: null,
    findings
  }
  const snapshot = await services.repository.read()
  const saved = await services.repository.save({
    connections: snapshot.connections,
    discoveries: [...snapshot.discoveries, discovery],
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  return { discovery, revision: saved.revision }
}

export async function discoverPeers(
  services: DiscoveryServices,
  nodeId: string,
  timeoutMs: number,
  save: boolean
): Promise<{ discovery: PeerDiscoveryRecord; revision: number | null }> {
  const node = await getNode(services.nodeRepository, nodeId)
  const reference = node.declared.location.connectionRef
  if (reference === undefined || !reference.startsWith('connection:')) {
    throw new ApplicationError({
      code: 'NODE_CONNECTION_REFERENCE_REQUIRED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'Peer discovery requires a node with a Phase 3 connection reference.',
      nextAction: 'Adopt or update the node using an existing connection reference.'
    })
  }
  const connectionId = reference.slice('connection:'.length)
  const connection = await configuredConnection(services, connectionId)
  const response = await services.probeTransport.execute({ connection, kind: 'peers.snapshot', timeoutMs })
  requireSuccessfulProbe(response.outcome)
  if (response.payload === null) throw malformedProbe()
  const peers = parsePeerManifest(response.payload)
  const captured = (services.now ?? (() => new Date()))()
  const discovery: PeerDiscoveryRecord = {
    id: discoveryId('peers', nodeId, captured.toISOString(), response.payload),
    kind: 'peers',
    status: 'active',
    source: { nodeId, connectionId },
    capturedAt: captured.toISOString(),
    expiresAt: new Date(captured.getTime() + 5 * 60 * 1000).toISOString(),
    dismissedAt: null,
    findings: { total: peers.length, peers }
  }
  if (!save) return { discovery, revision: null }
  const snapshot = await services.repository.read()
  const saved = await services.repository.save({
    connections: snapshot.connections,
    discoveries: [...snapshot.discoveries, discovery],
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  return { discovery, revision: saved.revision }
}

export async function listDiscoveries(repository: ConnectionStateRepository): Promise<readonly DiscoveryRecord[]> {
  return [...structuredClone((await repository.read()).discoveries)].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
}

export async function getDiscovery(repository: ConnectionStateRepository, discoveryIdValue: string): Promise<DiscoveryRecord> {
  const discovery = (await repository.read()).discoveries.find((candidate) => candidate.id === discoveryIdValue)
  if (discovery === undefined) throw discoveryNotFound()
  return structuredClone(discovery)
}

export async function dismissDiscovery(
  repository: ConnectionStateRepository,
  discoveryIdValue: string
): Promise<{ discovery: DiscoveryRecord; revision: number }> {
  const snapshot = await repository.read()
  const index = snapshot.discoveries.findIndex((candidate) => candidate.id === discoveryIdValue)
  if (index < 0) throw discoveryNotFound()
  const current = snapshot.discoveries[index] as DiscoveryRecord
  const dismissedAt = new Date().toISOString()
  const discovery = { ...structuredClone(current), status: 'dismissed' as const, dismissedAt }
  const discoveries = [...snapshot.discoveries]
  discoveries[index] = discovery
  const saved = await repository.save({
    connections: snapshot.connections,
    discoveries,
    adoptionReviews: snapshot.adoptionReviews
  }, snapshot.revision)
  return { discovery, revision: saved.revision }
}

function discoveryId(kind: string, source: string, capturedAt: string, payload: string): string {
  return `discovery_${createHash('sha256').update(`${kind}\0${source}\0${capturedAt}\0${payload}`).digest('hex').slice(0, 16)}`
}

async function configuredConnection(services: DiscoveryServices, connectionId: string) {
  const connection = await getConnection(services.repository, connectionId)
  if (!await services.aliasResolver.hasExactAlias(connection.hostAlias)) {
    throw new ApplicationError({
      code: 'SSH_ALIAS_NOT_CONFIGURED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'The stored SSH alias is no longer configured.',
      nextAction: 'Restore the exact private SSH alias before running discovery.'
    })
  }
  return connection
}

function requireSuccessfulProbe(outcome: string): void {
  if (outcome === 'success') return
  const code = outcome === 'unsupported' ? 'DISCOVERY_PROBE_UNSUPPORTED'
    : outcome === 'malformed' ? 'DISCOVERY_PROBE_MALFORMED'
      : outcome === 'timeout' ? 'DISCOVERY_TIMEOUT'
        : outcome === 'authentication-failed' ? 'DISCOVERY_AUTHENTICATION_FAILED'
          : 'DISCOVERY_UNREACHABLE'
  throw new ApplicationError({
    code,
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: outcome !== 'unsupported' && outcome !== 'malformed',
    message: 'The bounded read-only discovery probe did not succeed.',
    nextAction: 'Check the private alias, read-only manifest, reachability, and authentication without exposing target details.'
  })
}

function malformedProbe(): ApplicationError {
  return new ApplicationError({
    code: 'DISCOVERY_PROBE_MALFORMED',
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: false,
    message: 'The discovery probe returned no usable versioned payload.',
    nextAction: 'Install or regenerate the read-only inspection manifest.'
  })
}

function discoveryNotFound(): ApplicationError {
  return new ApplicationError({
    code: 'DISCOVERY_NOT_FOUND',
    exitCode: EXIT_CODES.notFound,
    severity: 'error',
    retryable: false,
    message: 'The requested discovery evidence was not found.',
    nextAction: 'Run "knm discoveries list" to inspect retained evidence.'
  })
}
