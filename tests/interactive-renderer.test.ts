import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderInteractivePrompt, wrapInteractiveOutput } from '../src/cli/interactive/interactive-renderer.js'
import { createInteractiveSessionState } from '../src/cli/interactive/interactive-session-state.js'

describe('interactive renderer', () => {
  it('keeps status visible with and without ANSI color', () => {
    const state = createInteractiveSessionState({ kind: 'simulation', scenario: 'mixed-health' })
    const plain = renderInteractivePrompt(state, false)
    const colored = renderInteractivePrompt(state, true)

    assert.equal(plain, '[sim:mixed-health] knm> ')
    assert.match(colored, /\u001b\[/)
    assert.match(colored, /sim:mixed-health/)
    assert.match(colored, /knm>/)
  })

  it('wraps long human lines to the requested width', () => {
    const wrapped = wrapInteractiveOutput('one two three four five six seven eight', 20)
    assert.ok(wrapped.split('\n').every((line) => line.length <= 20))
    const indented = wrapInteractiveOutput('  one two three four five six seven eight', 20)
    assert.ok(indented.split('\n').slice(1).every((line) => line.startsWith('  ')))
  })
})
