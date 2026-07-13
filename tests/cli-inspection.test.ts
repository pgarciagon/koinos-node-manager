import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { LegacyMultiserviceInspectionAdapter } from '../src/adapters/inspection/legacy-multiservice-inspection-adapter.js'
import { TelenoInspectionAdapter } from '../src/adapters/inspection/teleno-inspection-adapter.js'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import {
  FakeProbeTransport,
  FakeSshAliasResolver,
  type FakeProbeScenario
} from '../src/adapters/simulation/fake-probe-transport.js'
import { addSshConnection } from '../src/core/connections.js'
import { addInventoryNode } from '../src/core/node-inventory.js'
import { createNodeInspectionApi } from '../src/core/node-inspection-api.js'
import type { ApplicationContext, InventorySource } from '../src/cli/application-context.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'
import { runInteractiveSession } from '../src/cli/interactive/interactive-session.js'
import { getBuildIdentity } from '../src/core/build-identity.js'
import { FakeInteractiveTerminal, lines } from './helpers/fake-interactive-terminal.js'
import { INSPECTION_CHAIN_ID, INSPECTION_NOW, completeInspectionPayloads } from './helpers/inspection-fixtures.js'

const roots: string[] = []
const now = () => new Date(INSPECTION_NOW)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup(probeScenario: FakeProbeScenario = {
  outcome: 'success',
  payloads: completeInspectionPayloads()
}) {
  const home = await mkdtemp(join(tmpdir(), 'knm-cli-inspection-'))
  roots.push(home)
  const paths = resolveInventoryPaths({ env: { KNM_HOME: home } })
  const inventory = new FileSystemInventoryRepository(paths, { now })
  const connections = new FileSystemConnectionStateRepository(paths, { now })
  const aliasResolver = new FakeSshAliasResolver(['configured-private-alias'])
  const probeTransport = new FakeProbeTransport(probeScenario)
  await addSshConnection({ repository: connections, aliasResolver, probeTransport, now }, {
    id: 'legacy-target', hostAlias: 'configured-private-alias'
  })
  await addInventoryNode(inventory, {
    id: 'legacy-node',
    displayName: 'Legacy Node',
    management: 'connected',
    origin: 'imported',
    flavor: 'legacy-microservices',
    network: 'testnet',
    location: 'remote',
    environment: 'linux',
    authorityLevel: 'observe',
    connectionRef: 'connection:legacy-target',
    functions: ['observer', 'producer']
  }, now)
  const contextFor = (_source: InventorySource): ApplicationContext => ({
    nodeRepository: inventory,
    inventoryRepository: inventory,
    connectionStateRepository: connections,
    aliasResolver,
    probeTransport,
    inspectionAdapters: [new LegacyMultiserviceInspectionAdapter(), new TelenoInspectionAdapter()],
    now,
    inventorySource: { kind: 'local' },
    paths
  })
  const dependencies = { registry: cliCommandRegistry, createApplicationContext: contextFor }
  const execute = (args: readonly string[]) => executeCommand({ args, inventorySource: { kind: 'local' } }, dependencies)
  return { home, paths, inventory, connections, probeTransport, contextFor, dependencies, execute }
}

describe('nodes inspect CLI and interactive parity', () => {
  it('renders complete human and versioned JSON snapshots without persisting runtime evidence', async () => {
    const { inventory, connections, probeTransport, contextFor, execute } = await setup()
    const inventoryRevision = (await inventory.read()).revision
    const connectionRevision = (await connections.read()).revision
    const jsonResult = await execute(['nodes', 'inspect', 'legacy-node', '--output', 'json'])
    assert.equal(jsonResult.code, 0)
    const envelope = JSON.parse(jsonResult.stdout ?? '{}') as {
      schemaVersion: number
      command: string
      query: { section: string }
      data: { snapshot: { schemaVersion: number; contractVersion: string; readOnly: boolean; governance: { configuredProposalIds: { availability: string } } }; runtimeChanged: boolean; persisted: boolean }
    }
    assert.equal(envelope.schemaVersion, 2)
    assert.equal(envelope.command, 'nodes.inspect')
    assert.equal(envelope.query.section, 'all')
    assert.equal(envelope.data.snapshot.schemaVersion, 1)
    assert.equal(envelope.data.snapshot.contractVersion, '1.0.0')
    assert.equal(envelope.data.snapshot.readOnly, true)
    assert.equal(envelope.data.snapshot.governance.configuredProposalIds.availability, 'available')
    assert.equal(envelope.data.runtimeChanged, false)
    assert.equal(envelope.data.persisted, false)
    assert.doesNotMatch(jsonResult.stdout ?? '', /configured-private-alias|127\.0\.0\.1|0\.0\.0\.0|HostIp|HostPort|koinos\/koinos-/)

    const context = contextFor({ kind: 'local' })
    const apiResult = await createNodeInspectionApi({
      nodeRepository: context.nodeRepository,
      connectionRepository: context.connectionStateRepository as FileSystemConnectionStateRepository,
      aliasResolver: context.aliasResolver,
      probeTransport: context.probeTransport,
      adapters: context.inspectionAdapters,
      now
    }).inspect({ nodeId: 'legacy-node', sections: ['overview', 'components', 'chain', 'governance'], timeoutMs: 10_000 })
    assert.equal(apiResult.apiVersion, '1.0.0')
    assert.equal(apiResult.runtimeChanged, false)
    assert.equal(apiResult.persisted, false)
    assert.deepEqual(apiResult.snapshot, envelope.data.snapshot)

    await assert.rejects(createNodeInspectionApi({
      nodeRepository: context.nodeRepository,
      connectionRepository: context.connectionStateRepository as FileSystemConnectionStateRepository,
      aliasResolver: context.aliasResolver,
      probeTransport: context.probeTransport,
      adapters: context.inspectionAdapters,
      now
    }).inspect({ nodeId: 'legacy-node', sections: ['logs' as never], timeoutMs: 10_000 }), (error: unknown) => {
      assert.equal((error as { code: string; exitCode: number }).code, 'INVALID_NODE_INSPECTION_REQUEST')
      assert.equal((error as { exitCode: number }).exitCode, 2)
      return true
    })

    const human = await execute(['nodes', 'inspect', 'legacy-node', '--section', 'components'])
    assert.equal(human.code, 0)
    assert.match(human.stdout ?? '', /Components/)
    assert.match(human.stdout ?? '', /chain/)
    assert.match(human.stdout ?? '', /No runtime or inventory state was changed/)
    assert.doesNotMatch(human.stdout ?? '', /Overview\n|Governance\n/)
    assert.doesNotMatch(human.stdout ?? '', /configured-private-alias|127\.0\.0\.1|0\.0\.0\.0|HostIp|HostPort/)
    assert.equal((await inventory.read()).revision, inventoryRevision)
    assert.equal((await connections.read()).revision, connectionRevision)
    assert.ok(probeTransport.requests.every((request) => request.kind.startsWith('node.')))
    assert.doesNotMatch(JSON.stringify(await connections.read()), /KNM_INSPECTION|head_topology|configuredProposal/)
  })

  it('keeps invalid input, missing references, unsupported flavor, and transport failures typed', async () => {
    const { inventory, connections, execute } = await setup()
    const invalid = await execute(['nodes', 'inspect', 'legacy-node', '--section', 'logs', '--output', 'json'])
    assert.equal(invalid.code, 2)
    assert.equal((JSON.parse(invalid.stderr ?? '{}') as { errors: Array<{ code: string }> }).errors[0]?.code, 'INVALID_CLI_INPUT')
    const invalidTimeout = await execute(['nodes', 'inspect', 'legacy-node', '--timeout-ms', '999'])
    assert.equal(invalidTimeout.code, 2)

    await addInventoryNode(inventory, {
      id: 'unconnected-node', displayName: 'Unconnected Node', management: 'connected', origin: 'imported',
      flavor: 'legacy-microservices', network: 'testnet', location: 'remote', environment: 'linux',
      authorityLevel: 'observe', functions: ['observer']
    }, now)
    const missingReference = await execute(['nodes', 'inspect', 'unconnected-node', '--output', 'json'])
    assert.equal(missingReference.code, 4)
    assert.equal((JSON.parse(missingReference.stderr ?? '{}') as { errors: Array<{ code: string }> }).errors[0]?.code, 'NODE_CONNECTION_REFERENCE_REQUIRED')

    await addInventoryNode(inventory, {
      id: 'unknown-node', displayName: 'Unknown Node', management: 'connected', origin: 'imported',
      flavor: 'unknown', network: 'testnet', location: 'remote', environment: 'linux', authorityLevel: 'observe',
      connectionRef: 'connection:legacy-target', functions: ['observer']
    }, now)
    const unsupported = await execute(['nodes', 'inspect', 'unknown-node', '--output', 'json'])
    assert.equal(unsupported.code, 40)
    assert.equal((JSON.parse(unsupported.stderr ?? '{}') as { errors: Array<{ code: string }> }).errors[0]?.code, 'NODE_INSPECTION_FLAVOR_UNSUPPORTED')
    assert.equal((await connections.read()).connections.length, 1)

    const failed = await setup({ outcome: 'authentication-failed' })
    const authentication = await failed.execute(['nodes', 'inspect', 'legacy-node', '--output', 'json'])
    assert.equal(authentication.code, 40)
    assert.equal((JSON.parse(authentication.stderr ?? '{}') as { errors: Array<{ code: string }> }).errors[0]?.code, 'INSPECTION_AUTHENTICATION_FAILED')
    assert.doesNotMatch(authentication.stderr ?? '', /configured-private-alias|127\.0\.0\.1|password=|publickey credential/i)
  })

  it('uses the same command handler, node completion, and public DTO after repository restart', async () => {
    const { paths, probeTransport, contextFor, dependencies } = await setup()
    const terminal = new FakeInteractiveTerminal(lines(
      'nodes inspect legacy-node --section governance --output json',
      '/exit'
    ))
    const result = await runInteractiveSession({
      terminal,
      executeCommand: (args, options = {}) => executeCommand({
        args,
        inventorySource: options.inventorySource ?? { kind: 'local' },
        ...(options.terminalWidth === undefined ? {} : { terminalWidth: options.terminalWidth })
      }, dependencies),
      registry: cliCommandRegistry,
      identity: getBuildIdentity(),
      initialSource: { kind: 'local' },
      scenarios: new Map(),
      nodeIdsForSource: async () => (await contextFor({ kind: 'local' }).nodeRepository.list()).map((node) => node.id)
    })
    assert.equal(result, 0)
    assert.ok(terminal.complete('nodes inspect leg')[0].includes('legacy-node'))
    assert.ok(terminal.complete('nodes inspect legacy-node --section gov')[0].includes('governance'))
    assert.match(terminal.output.join('\n'), /"command": "nodes.inspect"/)
    assert.match(terminal.output.join('\n'), /"governance"/)
    assert.doesNotMatch(terminal.output.join('\n'), /configured-private-alias|127\.0\.0\.1|0\.0\.0\.0|HostIp|HostPort/)
    assert.deepEqual(terminal.errors, [])

    const restartedInventory = new FileSystemInventoryRepository(paths, { now })
    const restartedConnections = new FileSystemConnectionStateRepository(paths, { now })
    const restartedContext: ApplicationContext = {
      nodeRepository: restartedInventory,
      inventoryRepository: restartedInventory,
      connectionStateRepository: restartedConnections,
      aliasResolver: new FakeSshAliasResolver(['configured-private-alias']),
      probeTransport,
      inspectionAdapters: [new LegacyMultiserviceInspectionAdapter(), new TelenoInspectionAdapter()],
      now,
      inventorySource: { kind: 'local' },
      paths
    }
    const restarted = await executeCommand({
      args: ['nodes', 'inspect', 'legacy-node', '--section', 'chain', '--output', 'json'],
      inventorySource: { kind: 'local' }
    }, { registry: cliCommandRegistry, createApplicationContext: () => restartedContext })
    assert.equal(restarted.code, 0)
    assert.match(restarted.stdout ?? '', /"chain"/)
    assert.equal((await restartedInventory.list())[0]?.id, 'legacy-node')
  })
})
