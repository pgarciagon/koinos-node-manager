import { SimulatedNodeRepository } from '../adapters/simulation/simulated-node-repository.js'
import { FileSystemInventoryRepository } from '../adapters/filesystem/file-system-inventory-repository.js'
import { FileSystemConnectionStateRepository } from '../adapters/filesystem/file-system-connection-state-repository.js'
import { resolveInventoryPaths, type InventoryPaths } from '../adapters/filesystem/inventory-paths.js'
import { SshConfigAliasResolver } from '../adapters/ssh/ssh-config-alias-resolver.js'
import { SshReadOnlyProbeTransport } from '../adapters/ssh/ssh-read-only-probe-transport.js'
import { LegacyMultiserviceInspectionAdapter } from '../adapters/inspection/legacy-multiservice-inspection-adapter.js'
import { TelenoInspectionAdapter } from '../adapters/inspection/teleno-inspection-adapter.js'
import type { ConnectionStateRepository } from '../core/connection-state-repository.js'
import type { InventoryRepository, NodeRepository } from '../core/node-repository.js'
import type { ReadOnlyProbeTransport, SshAliasResolver } from '../core/probe-transport.js'
import type { RuntimeInspectionAdapter } from '../core/runtime-inspection-adapter.js'

export type InventorySource =
  | { kind: 'local' }
  | { kind: 'simulation'; scenario: string }

export const LOCAL_INVENTORY_SOURCE: InventorySource = Object.freeze({ kind: 'local' })

export type ApplicationContext = {
  nodeRepository: NodeRepository
  inventoryRepository: InventoryRepository | null
  connectionStateRepository: ConnectionStateRepository | null
  aliasResolver: SshAliasResolver
  probeTransport: ReadOnlyProbeTransport
  inspectionAdapters: readonly RuntimeInspectionAdapter[]
  now?: () => Date
  inventorySource: InventorySource
  paths: InventoryPaths
}

export function createApplicationContext(inventorySource: InventorySource): ApplicationContext {
  const paths = resolveInventoryPaths()
  const aliasResolver = new SshConfigAliasResolver()
  const probeTransport = new SshReadOnlyProbeTransport(
    process.env.KNM_SSH_CONFIG === undefined ? {} : { sshConfigFile: process.env.KNM_SSH_CONFIG }
  )
  const inspectionAdapters: readonly RuntimeInspectionAdapter[] = [
    new LegacyMultiserviceInspectionAdapter(),
    new TelenoInspectionAdapter()
  ]
  if (inventorySource.kind === 'simulation') {
    return {
      nodeRepository: SimulatedNodeRepository.forScenario(inventorySource.scenario),
      inventoryRepository: null,
      connectionStateRepository: null,
      aliasResolver,
      probeTransport,
      inspectionAdapters,
      inventorySource: structuredClone(inventorySource),
      paths
    }
  }
  const repository = new FileSystemInventoryRepository(paths)
  const connectionStateRepository = new FileSystemConnectionStateRepository(paths)
  return {
    nodeRepository: repository,
    inventoryRepository: repository,
    connectionStateRepository,
    aliasResolver,
    probeTransport,
    inspectionAdapters,
    inventorySource: structuredClone(inventorySource),
    paths
  }
}
