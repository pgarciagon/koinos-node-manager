import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { completeInteractiveLine } from '../src/cli/interactive/interactive-completion.js'

const options = {
  registry: cliCommandRegistry,
  scenarioIds: ['default', 'empty', 'mixed-health', 'stale-health'],
  nodeIds: () => ['node-home-observer', 'node-nas-observer'],
  connectionIds: () => ['test-target'],
  discoveryIds: () => ['discovery_1234567890abcdef'],
  adoptionIds: () => ['adoption_1234567890abcdef'],
  excludedCommandNames: ['interactive']
}

describe('interactive completion', () => {
  it('completes registry roots and grouped commands', () => {
    assert.ok(completeInteractiveLine('n', options)[0].includes('nodes'))
    assert.equal(completeInteractiveLine('i', options)[0].includes('interactive'), false)
    assert.deepEqual(completeInteractiveLine('nodes l', options), [['list'], 'l'])
  })

  it('completes registry options and enum values', () => {
    assert.ok(completeInteractiveLine('nodes list --st', options)[0].includes('--staleness'))
    assert.deepEqual(completeInteractiveLine('nodes list --staleness st', options), [['stale'], 'st'])
  })

  it('completes node IDs from the current scenario', () => {
    assert.deepEqual(
      completeInteractiveLine('nodes show node-h', options),
      [['node-home-observer'], 'node-h']
    )
  })

  it('completes metacommands and scenarios', () => {
    assert.ok(completeInteractiveLine('/he', options)[0].includes('/help'))
    assert.deepEqual(completeInteractiveLine('/scenario sta', options), [['stale-health'], 'sta'])
  })

  it('completes nested Phase 3 paths and dynamic identifiers', () => {
    assert.deepEqual(completeInteractiveLine('connections add s', options), [['ssh'], 's'])
    assert.deepEqual(completeInteractiveLine('connections show test', options), [['test-target'], 'test'])
    assert.deepEqual(completeInteractiveLine('discover host --connection test', options), [['test-target'], 'test'])
    assert.deepEqual(completeInteractiveLine('nodes adoption p', options), [['plan'], 'p'])
    assert.deepEqual(completeInteractiveLine('nodes adoption apply adoption_', options), [['adoption_1234567890abcdef'], 'adoption_'])
  })
})
