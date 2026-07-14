import type { AccessMode } from './onboarding.js'
import type { NetworkName, NodeFlavorId } from './node.js'

export const NODE_DIRECTORY_SCHEMA_VERSION = 1 as const
export const NODE_DIRECTORY_CONTRACT_VERSION = '1.0.0' as const

export type PublicNodeSummary = {
  nodeId: string
  displayName: string
  network: NetworkName
  runtimeFlavor: NodeFlavorId
  availableAccessModes: readonly AccessMode[]
  preferredAccessMode: AccessMode | null
}

export type PublicNodeDirectory = {
  schemaVersion: typeof NODE_DIRECTORY_SCHEMA_VERSION
  contractVersion: typeof NODE_DIRECTORY_CONTRACT_VERSION
  nodes: readonly PublicNodeSummary[]
  total: number
  readOnly: true
}
