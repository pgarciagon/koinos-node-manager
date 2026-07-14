import type { ConnectionStateRepository } from './connection-state-repository.js'
import type { NodeRepository } from './node-repository.js'
import { listNodes } from './list-nodes.js'
import { resolveNodeView } from './node-view.js'
import { selectAccessBinding } from './node-access.js'
import { assertValidInventoryNodes } from './validate-node.js'
import {
  NODE_DIRECTORY_CONTRACT_VERSION,
  NODE_DIRECTORY_SCHEMA_VERSION,
  type PublicNodeDirectory,
  type PublicNodeSummary
} from '../domain/node-directory.js'
import { ACCESS_MODES, type AccessMode, type NodeAccessProfile } from '../domain/onboarding.js'
import type { ConnectionRecord } from '../domain/connection.js'

export const NODE_DIRECTORY_API_VERSION = '1.0.0' as const

export interface NodeDirectoryApi {
  list(): Promise<PublicNodeDirectory>
}

export type NodeDirectoryServices = {
  nodeRepository: NodeRepository
  connectionRepository: ConnectionStateRepository
}

export function createNodeDirectoryApi(services: NodeDirectoryServices): NodeDirectoryApi {
  return {
    async list(): Promise<PublicNodeDirectory> {
      const result = await listNodes(services.nodeRepository)
      assertValidInventoryNodes(result.nodes)
      const connectionState = await services.connectionRepository.read()
      const nodes = result.nodes.map((node): PublicNodeSummary => {
        const resolved = resolveNodeView(node)
        const profile = connectionState.accessProfiles.find((candidate) => candidate.nodeId === node.id)
        const access = accessSummary(profile, connectionState.connections, resolved.location.connectionRef)
        return {
          nodeId: node.id,
          displayName: node.displayName,
          network: resolved.network.name,
          runtimeFlavor: resolved.flavor.id,
          availableAccessModes: access.available,
          preferredAccessMode: access.preferred
        }
      })
      return {
        schemaVersion: NODE_DIRECTORY_SCHEMA_VERSION,
        contractVersion: NODE_DIRECTORY_CONTRACT_VERSION,
        nodes,
        total: nodes.length,
        readOnly: true
      }
    }
  }
}

function accessSummary(
  profile: NodeAccessProfile | undefined,
  connections: readonly ConnectionRecord[],
  legacyReference: string | undefined
): { available: readonly AccessMode[]; preferred: AccessMode | null } {
  if (profile !== undefined) {
    const available = ACCESS_MODES.filter((mode) => canSelect(profile, connections, mode))
    const preferred = selectedMode(profile, connections)
    return { available, preferred }
  }
  const connection = connectionForReference(connections, legacyReference)
  const mode = connection === undefined ? null : modeForConnection(connection)
  return { available: mode === null ? [] : [mode], preferred: mode }
}

function canSelect(profile: NodeAccessProfile, connections: readonly ConnectionRecord[], mode: AccessMode): boolean {
  try {
    selectAccessBinding(profile, connections, mode)
    return true
  } catch {
    return false
  }
}

function selectedMode(profile: NodeAccessProfile, connections: readonly ConnectionRecord[]): AccessMode | null {
  try {
    return selectAccessBinding(profile, connections).binding.mode
  } catch {
    return null
  }
}

function connectionForReference(
  connections: readonly ConnectionRecord[],
  reference: string | undefined
): ConnectionRecord | undefined {
  if (reference === undefined || !reference.startsWith('connection:')) return undefined
  return connections.find((connection) => connection.id === reference.slice('connection:'.length))
}

function modeForConnection(connection: ConnectionRecord): AccessMode {
  if (connection.kind === 'agent') return 'full'
  if (connection.kind === 'public-rpc') return 'quick'
  return 'expert'
}
