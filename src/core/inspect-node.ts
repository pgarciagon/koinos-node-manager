import { ApplicationError } from './application-error.js'
import type { ConnectionStateRepository } from './connection-state-repository.js'
import { getConnection } from './connections.js'
import { EXIT_CODES } from './exit-codes.js'
import { getNode } from './get-node.js'
import type { NodeRepository } from './node-repository.js'
import { resolveNodeView } from './node-view.js'
import type { ReadOnlyProbeTransport, SshAliasResolver } from './probe-transport.js'
import type { RuntimeInspectionAdapter } from './runtime-inspection-adapter.js'
import { sanitizeInspectionSnapshot } from './sanitize-inspection.js'
import type { InspectionSection, PublicNodeInspectionSnapshot } from '../domain/inspection.js'

export type NodeInspectionServices = {
  nodeRepository: NodeRepository
  connectionRepository: ConnectionStateRepository
  aliasResolver: SshAliasResolver
  probeTransport: ReadOnlyProbeTransport
  adapters: readonly RuntimeInspectionAdapter[]
  now?: () => Date
}

export async function inspectNode(
  services: NodeInspectionServices,
  nodeId: string,
  sections: readonly InspectionSection[],
  timeoutMs: number
): Promise<PublicNodeInspectionSnapshot> {
  const node = await getNode(services.nodeRepository, nodeId)
  if (!node.management.authority.inspect) {
    throw new ApplicationError({
      code: 'NODE_INSPECTION_AUTHORITY_REQUIRED',
      exitCode: EXIT_CODES.safetyBlocked,
      severity: 'unsafe',
      retryable: false,
      message: 'The inventory record does not grant read-only inspection authority.',
      nextAction: 'Review the inventory authority and connection evidence before contacting the node.'
    })
  }
  const resolved = resolveNodeView(node)
  const reference = resolved.location.connectionRef ?? node.declared.location.connectionRef
  if (reference === undefined || !reference.startsWith('connection:')) {
    throw new ApplicationError({
      code: 'NODE_CONNECTION_REFERENCE_REQUIRED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'Read-only node inspection requires an opaque connection reference.',
      nextAction: 'Add a private SSH connection reference to the inventory node, then retry.'
    })
  }
  const connectionId = reference.slice('connection:'.length)
  const connection = await getConnection(services.connectionRepository, connectionId)
  if (!await services.aliasResolver.hasExactAlias(connection.hostAlias)) {
    throw new ApplicationError({
      code: 'SSH_ALIAS_NOT_CONFIGURED',
      exitCode: EXIT_CODES.configuration,
      severity: 'error',
      retryable: false,
      message: 'The stored SSH alias is no longer an exact configured Host entry.',
      nextAction: 'Restore the private exact SSH alias before running read-only inspection.'
    })
  }
  const adapter = services.adapters.find((candidate) => candidate.flavor === resolved.flavor.id)
  if (adapter === undefined) {
    throw new ApplicationError({
      code: 'NODE_INSPECTION_FLAVOR_UNSUPPORTED',
      exitCode: EXIT_CODES.transportUnavailable,
      severity: 'error',
      retryable: false,
      message: 'No read-only inspection adapter supports the inventory runtime flavor.',
      nextAction: 'Declare a supported runtime flavor or install a matching versioned inspection adapter.'
    })
  }
  const capturedAt = (services.now ?? (() => new Date()))().toISOString()
  const snapshot = await adapter.inspect({
    target: {
      nodeId: node.id,
      displayName: node.displayName,
      flavor: resolved.flavor.id,
      expectedNetwork: resolved.network.name,
      ...(resolved.network.chainId === undefined ? {} : { expectedChainId: resolved.network.chainId })
    },
    sections: [...new Set(sections)],
    timeoutMs: normalizeTimeout(timeoutMs),
    capturedAt,
    probe: {
      execute: (kind, probeTimeoutMs) => services.probeTransport.execute({
        connection,
        kind,
        timeoutMs: probeTimeoutMs
      })
    }
  })
  const publicSnapshot = sanitizeInspectionSnapshot(snapshot)
  if (publicSnapshot.node.id !== node.id || publicSnapshot.node.flavor !== resolved.flavor.id) {
    throw new ApplicationError({
      code: 'INSPECTION_RUNTIME_MISMATCH',
      exitCode: EXIT_CODES.transportUnavailable,
      severity: 'error',
      retryable: false,
      message: 'Runtime inspection evidence does not match the requested inventory target.',
      nextAction: 'Verify the opaque connection reference and runtime flavor without mutating the target.'
    })
  }
  return publicSnapshot
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value)) return 10_000
  return Math.max(1_000, Math.min(30_000, Math.trunc(value)))
}
