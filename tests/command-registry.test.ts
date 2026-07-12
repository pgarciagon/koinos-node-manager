import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CommandRegistry, type CommandDefinition } from '../src/cli/command-registry.js'

const runtime = {
  applicationContext: () => {
    throw new Error('The test command does not require an application context.')
  },
  applicationContextFor: () => {
    throw new Error('The test command does not require an application context.')
  },
  executeCommand: async () => ({ code: 0, commandName: 'test' }),
  registry: new CommandRegistry(),
  inventorySource: { kind: 'simulation' as const, scenario: 'default' },
  terminalWidth: 120
}

function command(path: CommandDefinition['path'], output: string): CommandDefinition {
  return {
    path,
    commandName: path.join('.'),
    summary: output,
    usage: `knm ${path.join(' ')}`,
    options: [],
    run: async () => output
  }
}

describe('CommandRegistry', () => {
  it('registers and resolves commands independently', async () => {
    const registry = new CommandRegistry()
      .register(command(['version'], 'version'))
      .register(command(['nodes', 'list'], 'nodes'))

    const resolved = registry.resolve(['nodes', 'list', '--output', 'json'])
    assert.equal(resolved?.definition.commandName, 'nodes.list')
    assert.deepEqual(resolved?.args, ['--output', 'json'])
    assert.equal(await resolved?.definition.run(resolved.args, runtime), 'nodes')
  })

  it('rejects duplicate command paths at registration time', () => {
    const registry = new CommandRegistry().register(command(['version'], 'first'))
    assert.throws(() => registry.register(command(['version'], 'second')), /already registered/)
  })
})
