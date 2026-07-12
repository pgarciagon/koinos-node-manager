import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { simulationScenarios } from '../src/adapters/simulation/scenarios.js'
import { getBuildIdentity } from '../src/core/build-identity.js'
import { createApplicationContext, type ApplicationContext, type InventorySource } from '../src/cli/application-context.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'
import { runInteractiveSession } from '../src/cli/interactive/interactive-session.js'
import { FakeInteractiveTerminal, lines } from './helpers/fake-interactive-terminal.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'knm-interactive-inventory-'))
  roots.push(root)
  const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
  const repository = new FileSystemInventoryRepository(paths)
  const contextFor = (source: InventorySource): ApplicationContext => source.kind === 'simulation'
    ? createApplicationContext(source)
    : { nodeRepository: repository, inventoryRepository: repository, inventorySource: source, paths }
  const dependencies = { registry: cliCommandRegistry, createApplicationContext: contextFor }
  const scenarios = new Map(simulationScenarios.map((scenario) => [
    scenario.id,
    scenario.nodes.map((node) => node.id)
  ]))
  const run = (terminal: FakeInteractiveTerminal) => runInteractiveSession({
    terminal,
    executeCommand: (args, options = {}) => executeCommand({
      args,
      inventorySource: options.inventorySource ?? { kind: 'local' },
      ...(options.terminalWidth === undefined ? {} : { terminalWidth: options.terminalWidth })
    }, dependencies),
    registry: cliCommandRegistry,
    identity: getBuildIdentity(),
    initialSource: { kind: 'local' },
    scenarios,
    nodeIdsForSource: async (source) => (await contextFor(source).nodeRepository.list()).map((node) => node.id)
  })
  return { repository, run }
}

describe('interactive persisted inventory parity', () => {
  it('executes persisted add and refreshes node-ID completion without leaving the process', async () => {
    const { repository, run } = await setup()
    const terminal = new FakeInteractiveTerminal(lines(
      'nodes add --id prompt-observer --name "Prompt Observer" --network testnet',
      'nodes show prompt-observer --output json',
      '/status',
      '/exit'
    ))
    assert.equal(await run(terminal), 0)
    assert.deepEqual((await repository.list()).map((node) => node.id), ['prompt-observer'])
    assert.ok(terminal.complete('nodes show pro')[0].includes('prompt-observer'))
    assert.ok(terminal.prompts.every((prompt) => prompt.includes('[inventory:local]')))
    assert.match(terminal.output.join('\n'), /local persisted inventory/)
    assert.match(terminal.output.join('\n'), /"command": "nodes.show"/)
    assert.deepEqual(terminal.errors, [])
  })

  it('switches explicitly between read-only simulation and local persisted inventory', async () => {
    const { repository, run } = await setup()
    const terminal = new FakeInteractiveTerminal(lines(
      'nodes add --id local-node --name "Local Node"',
      '/scenario default',
      'nodes add --id forbidden-simulation-write --name "Blocked"',
      '/inventory',
      'nodes update local-node --name "Updated Local Node"',
      'nodes remove local-node --confirm local-node',
      '/exit'
    ))
    assert.equal(await run(terminal), 0)
    assert.deepEqual(await repository.list(), [])
    assert.match(terminal.errors.join('\n'), /SIMULATION_INVENTORY_READ_ONLY/)
    assert.match(terminal.output.join('\n'), /Switched to the local persisted inventory/)
    assert.match(terminal.output.join('\n'), /software was not uninstalled/)
    assert.ok(terminal.prompts.some((prompt) => prompt.includes('[sim:default]')))
    assert.ok(terminal.prompts.some((prompt) => prompt.includes('[inventory:local]')))
  })
})
