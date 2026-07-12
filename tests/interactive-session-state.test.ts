import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createInteractiveSessionState,
  reduceInteractiveSession
} from '../src/cli/interactive/interactive-session-state.js'

describe('interactive session state', () => {
  it('tracks lifecycle, sanitized history, scenario, and last result deterministically', () => {
    let state = createInteractiveSessionState({ kind: 'simulation', scenario: 'default' })
    state = reduceInteractiveSession(state, { type: 'read-started' })
    state = reduceInteractiveSession(state, { type: 'line-received', line: 'nodes list --token secret' })
    state = reduceInteractiveSession(state, {
      type: 'inventory-source-changed',
      inventorySource: { kind: 'simulation', scenario: 'stale-health' }
    })
    state = reduceInteractiveSession(state, { type: 'command-started' })
    state = reduceInteractiveSession(state, {
      type: 'command-finished',
      result: { code: 0, commandName: 'nodes.list' }
    })

    assert.equal(state.phase, 'idle')
    assert.deepEqual(state.inventorySource, { kind: 'simulation', scenario: 'stale-health' })
    assert.deepEqual(state.history, ['nodes list --token [REDACTED]'])
    assert.deepEqual(state.lastResult, { code: 0, commandName: 'nodes.list' })
  })

  it('counts consecutive idle interrupts and rejects events after closure', () => {
    let state = createInteractiveSessionState({ kind: 'simulation', scenario: 'default' })
    state = reduceInteractiveSession(state, { type: 'idle-interrupted' })
    state = reduceInteractiveSession(state, { type: 'idle-interrupted' })
    assert.equal(state.consecutiveIdleInterrupts, 2)
    state = reduceInteractiveSession(state, { type: 'closing' })
    state = reduceInteractiveSession(state, { type: 'closed' })
    assert.throws(() => reduceInteractiveSession(state, { type: 'read-started' }), /session is closed/)
  })
})
