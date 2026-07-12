import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApplicationContext } from '../src/cli/application-context.js'
import { runCli } from '../src/cli/batch-cli.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'

const dependencies = {
  registry: cliCommandRegistry,
  createApplicationContext
}

describe('shared command executor', () => {
  const cases: ReadonlyArray<{ args: readonly string[]; scenario?: string }> = [
    { args: ['--help'] },
    { args: ['version', '--output', 'json'] },
    { args: ['nodes', 'list', '--health', 'degraded'] },
    { args: ['nodes', 'show', 'node-home-observer', '--section', 'verified', '--output', 'json'] },
    { args: ['nodes', 'missing', '--output', 'json'] },
    { args: ['nodes', 'show', 'missing'] },
    { args: ['nodes', 'list', '--staleness', 'stale'], scenario: 'stale-health' }
  ]

  for (const testCase of cases) {
    it(`keeps batch parity for ${testCase.args.join(' ')}`, async () => {
      const scenario = testCase.scenario ?? 'default'
      const batchArgs = ['--simulation', scenario, ...testCase.args]
      const batch = await runCli(batchArgs)
      const shared = await executeCommand({
        args: testCase.args,
        inventorySource: { kind: 'simulation', scenario }
      }, dependencies)

      assert.deepEqual(shared, batch)
    })
  }

  it('runs repeatedly with isolated application contexts in one process', async () => {
    const defaultResult = await executeCommand({
      args: ['nodes', 'list', '--staleness', 'fresh', '--output', 'json'],
      inventorySource: { kind: 'simulation', scenario: 'default' }
    }, dependencies)
    const staleResult = await executeCommand({
      args: ['nodes', 'list', '--staleness', 'stale', '--output', 'json'],
      inventorySource: { kind: 'simulation', scenario: 'stale-health' }
    }, dependencies)

    const defaultEnvelope = JSON.parse(defaultResult.stdout ?? '{}') as { data: { total: number } }
    const staleEnvelope = JSON.parse(staleResult.stdout ?? '{}') as { data: { total: number } }
    assert.equal(defaultEnvelope.data.total, 5)
    assert.equal(staleEnvelope.data.total, 5)
  })
})
