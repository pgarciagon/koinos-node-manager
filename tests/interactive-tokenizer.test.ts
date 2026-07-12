import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CliInputError } from '../src/cli/cli-input-error.js'
import {
  MAX_INTERACTIVE_INPUT_LENGTH,
  tokenizeInteractiveInput
} from '../src/cli/interactive/interactive-tokenizer.js'

describe('interactive tokenizer', () => {
  it('tokenizes ordinary, quoted, empty, and escaped values', () => {
    assert.deepEqual(tokenizeInteractiveInput('nodes list --network mainnet'), [
      'nodes', 'list', '--network', 'mainnet'
    ])
    assert.deepEqual(tokenizeInteractiveInput('nodes show "node with spaces"'), [
      'nodes', 'show', 'node with spaces'
    ])
    assert.deepEqual(tokenizeInteractiveInput("command '' \"\" 'it\\\'s' \"a\\\"b\""), [
      'command', '', '', "it's", 'a"b'
    ])
  })

  for (const input of [
    'nodes list | other',
    'nodes list && other',
    'nodes list; other',
    'nodes list > output',
    'nodes list $(other)',
    'nodes list `other`'
  ]) {
    it(`rejects shell syntax: ${input}`, () => {
      assert.throws(() => tokenizeInteractiveInput(input), CliInputError)
    })
  }

  it('rejects unterminated quotes and oversized input', () => {
    assert.throws(() => tokenizeInteractiveInput("nodes show 'missing"), /Unterminated single-quoted/)
    assert.throws(() => tokenizeInteractiveInput('x'.repeat(MAX_INTERACTIVE_INPUT_LENGTH + 1)), /character limit/)
  })

  it('keeps shell-like characters inert inside quoted values', () => {
    assert.deepEqual(tokenizeInteractiveInput("nodes show 'literal|value'"), ['nodes', 'show', 'literal|value'])
  })
})
