import { SimulatedNodeRepository } from '../adapters/simulation/simulated-node-repository.js'
import { FileSystemInventoryRepository } from '../adapters/filesystem/file-system-inventory-repository.js'
import { FileSystemConnectionStateRepository } from '../adapters/filesystem/file-system-connection-state-repository.js'
import { resolveInventoryPaths, type InventoryPaths } from '../adapters/filesystem/inventory-paths.js'
import { SshConfigAliasResolver } from '../adapters/ssh/ssh-config-alias-resolver.js'
import { SshReadOnlyProbeTransport } from '../adapters/ssh/ssh-read-only-probe-transport.js'
import { LegacyMultiserviceInspectionAdapter } from '../adapters/inspection/legacy-multiservice-inspection-adapter.js'
import { TelenoInspectionAdapter } from '../adapters/inspection/teleno-inspection-adapter.js'
import { PublicKoinosRpcInspectionAdapter } from '../adapters/inspection/public-koinos-rpc-inspection-adapter.js'
import { PublicRpcReadOnlyProbeTransport } from '../adapters/rpc/public-rpc-read-only-probe-transport.js'
import { FileSystemOnboardingJournalRepository } from '../adapters/filesystem/file-system-onboarding-journal-repository.js'
import { HttpsAgentClient } from '../adapters/agent/https-agent-client.js'
import { AgentReadOnlyProbeTransport } from '../adapters/agent/agent-read-only-probe-transport.js'
import { OperatingSystemSecretStore, type SecretStore } from '../core/secret-store.js'
import type { AgentClient } from '../core/agent-client.js'
import type { ConnectionStateRepository } from '../core/connection-state-repository.js'
import type { InventoryRepository, NodeRepository } from '../core/node-repository.js'
import type { ReadOnlyProbeTransport, SshAliasResolver } from '../core/probe-transport.js'
import type { RuntimeInspectionAdapter } from '../core/runtime-inspection-adapter.js'
import type { OnboardingJournalRepository } from '../core/onboarding-journal.js'

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
  publicRpcTransport: ReadOnlyProbeTransport
  publicRpcAdapter: RuntimeInspectionAdapter
  onboardingJournalRepository: OnboardingJournalRepository | null
  agentClient: AgentClient
  agentProbeTransport: ReadOnlyProbeTransport
  secretStore: SecretStore
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
  const publicRpcTransport = new PublicRpcReadOnlyProbeTransport({ allowLoopbackHttp: process.env.KNM_ALLOW_LOOPBACK_HTTP === '1' })
  const publicRpcAdapter = new PublicKoinosRpcInspectionAdapter()
  const secretStore = new OperatingSystemSecretStore()
  const agentClient = new HttpsAgentClient({ allowLoopbackHttp: process.env.KNM_ALLOW_LOOPBACK_HTTP === '1' })
  const agentProbeTransport = new AgentReadOnlyProbeTransport(agentClient, secretStore)
  if (inventorySource.kind === 'simulation') {
    return {
      nodeRepository: SimulatedNodeRepository.forScenario(inventorySource.scenario),
      inventoryRepository: null,
      connectionStateRepository: null,
      aliasResolver,
      probeTransport,
      inspectionAdapters,
      publicRpcTransport,
      publicRpcAdapter,
      onboardingJournalRepository: null,
      agentClient,
      agentProbeTransport,
      secretStore,
      inventorySource: structuredClone(inventorySource),
      paths
    }
  }
  const repository = new FileSystemInventoryRepository(paths)
  const connectionStateRepository = new FileSystemConnectionStateRepository(paths)
  const onboardingJournalRepository = new FileSystemOnboardingJournalRepository(paths)
  return {
    nodeRepository: repository,
    inventoryRepository: repository,
    connectionStateRepository,
    aliasResolver,
    probeTransport,
    inspectionAdapters,
    publicRpcTransport,
    publicRpcAdapter,
    onboardingJournalRepository,
    agentClient,
    agentProbeTransport,
    secretStore,
    inventorySource: structuredClone(inventorySource),
    paths
  }
}
