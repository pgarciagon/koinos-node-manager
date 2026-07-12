import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulationScenarios } from '../src/adapters/simulation/scenarios.js'
import { getBuildIdentity } from '../src/core/build-identity.js'
import { createApplicationContext } from '../src/cli/application-context.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'
import { runInteractiveSession } from '../src/cli/interactive/interactive-session.js'
import { FakeInteractiveTerminal, lines } from './helpers/fake-interactive-terminal.js'

const dependencies = {
  registry: cliCommandRegistry,
  createApplicationContext
}
const scenarios = new Map(simulationScenarios.map((scenario) => [
  scenario.id,
  scenario.nodes.map((node) => node.id)
]))

function run(terminal: FakeInteractiveTerminal, initialScenario = 'default') {
  const initialSource = { kind: 'simulation' as const, scenario: initialScenario }
  return runInteractiveSession({
    terminal,
    executeCommand: (args, options = {}) => executeCommand({
      args,
      inventorySource: options.inventorySource ?? initialSource,
      ...(options.terminalWidth === undefined ? {} : { terminalWidth: options.terminalWidth })
    }, dependencies),
    registry: cliCommandRegistry,
    identity: getBuildIdentity(),
    initialSource,
    scenarios,
    nodeIdsForSource: async (source) => source.kind === 'simulation' ? scenarios.get(source.scenario) ?? [] : []
  })
}

describe('interactive session', () => {
  it('rejects an unknown initial scenario before reading terminal input', async () => {
    const terminal = new FakeInteractiveTerminal(lines('/exit'))
    await assert.rejects(run(terminal, 'missing'), /Unknown initial simulation scenario/)
    assert.deepEqual(terminal.prompts, [])
    assert.equal(terminal.closed, true)
  })

  it('runs multiple product and meta commands with session-local scenario switching', async () => {
    const terminal = new FakeInteractiveTerminal(lines(
      '/help',
      '/commands',
      '/status',
      'nodes list --health degraded',
      'nodes show node-home-observer --section verified --output json',
      '/scenario stale-health',
      'nodes list --staleness stale --output json',
      '/history',
      '/exit'
    ))

    assert.equal(await run(terminal), 0)
    assert.equal(terminal.closed, true)
    assert.match(terminal.output.join('\n'), /Mode: read-only simulation/)
    assert.match(terminal.output.join('\n'), /Metacommands:/)
    assert.match(terminal.output.join('\n'), /Product commands:/)
    assert.match(terminal.output.join('\n'), /Scenario changed to stale-health/)
    assert.match(terminal.output.join('\n'), /"schemaVersion": 2/)
    assert.match(terminal.output.join('\n'), /nodes list --staleness stale --output json/)
    assert.ok(terminal.prompts.some((prompt) => prompt.includes('[sim:stale-health]')))
    assert.deepEqual(terminal.errors, [])
  })

  it('reports invalid input and continues without evaluating shell syntax', async () => {
    const terminal = new FakeInteractiveTerminal(lines(
      'nodes list | echo unsafe',
      'interactive',
      'nodes missing',
      'nodes list --token raw-secret',
      '/history',
      '/exit'
    ))

    assert.equal(await run(terminal), 0)
    assert.match(terminal.errors.join('\n'), /Unsupported shell syntax/)
    assert.match(terminal.errors.join('\n'), /Unknown command/)
    assert.match(terminal.errors.join('\n'), /already running/)
    assert.doesNotMatch(terminal.output.join('\n'), /raw-secret/)
    assert.doesNotMatch(terminal.errors.join('\n'), /raw-secret/)
    assert.match(terminal.output.join('\n'), /--token \[REDACTED\]/)
  })

  it('handles clear, EOF, and consecutive Ctrl+C deterministically', async () => {
    const clearTerminal = new FakeInteractiveTerminal([...lines('/clear'), { kind: 'eof' }])
    assert.equal(await run(clearTerminal), 0)
    assert.equal(clearTerminal.clearCount, 1)

    const interruptTerminal = new FakeInteractiveTerminal([
      { kind: 'interrupt' },
      { kind: 'interrupt' }
    ])
    assert.equal(await run(interruptTerminal), 130)
    assert.match(interruptTerminal.output.join('\n'), /Press Ctrl\+C again to exit/)
  })

  it('installs sanitized history and registry-driven completion on the terminal', async () => {
    const terminal = new FakeInteractiveTerminal(lines('/exit'))
    await run(terminal)

    assert.equal(terminal.sanitizeHistory('unknown --token secret'), 'unknown --token [REDACTED]')
    assert.ok(terminal.complete('nodes l')[0].includes('list'))
    assert.ok(terminal.complete('/scenario sta')[0].includes('stale-health'))
  })

  it('wraps human output to terminal width while leaving JSON intact', async () => {
    const terminal = new FakeInteractiveTerminal(lines(
      'nodes list',
      'nodes show node-home-observer --section verified --output json',
      '/exit'
    ), 80)
    await run(terminal)

    const human = terminal.output.find((output) => output.includes('node-berlin-producer'))
    assert.ok(human)
    assert.ok(human.split('\n').every((line) => line.length <= 80))
    assert.match(terminal.output.join('\n'), /"schemaVersion": 2/)
  })

  it('reads the current terminal width again after a resize', async () => {
    const terminal = new FakeInteractiveTerminal(lines('nodes list', 'nodes list', '/exit'), 80)
    const observedWidths: Array<number | undefined> = []
    let commandCount = 0
    const exitCode = await runInteractiveSession({
      terminal,
      executeCommand: async (args, options = {}) => {
        observedWidths.push(options.terminalWidth)
        commandCount += 1
        if (commandCount === 1) terminal.setWidth(160)
        return executeCommand({
          args,
          inventorySource: options.inventorySource ?? { kind: 'simulation', scenario: 'default' },
          ...(options.terminalWidth === undefined ? {} : { terminalWidth: options.terminalWidth })
        }, dependencies)
      },
      registry: cliCommandRegistry,
      identity: getBuildIdentity(),
      initialSource: { kind: 'simulation', scenario: 'default' },
      scenarios,
      nodeIdsForSource: async (source) => source.kind === 'simulation' ? scenarios.get(source.scenario) ?? [] : []
    })

    assert.equal(exitCode, 0)
    assert.deepEqual(observedWidths, [80, 160])
  })
})
