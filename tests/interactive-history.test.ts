import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  INTERACTIVE_HISTORY_LIMIT,
  addInteractiveHistory,
  sanitizeInteractiveHistory
} from '../src/cli/interactive/interactive-history.js'

describe('interactive history', () => {
  it('redacts sensitive option values before storing or displaying them', () => {
    assert.equal(
      sanitizeInteractiveHistory('connections add ssh --host-alias private-alias --token super-secret --password=hunter2 --connection-ref connection:private-node'),
      'connections add ssh --host-alias [REDACTED] --token [REDACTED] --password=[REDACTED] --connection-ref [REDACTED]'
    )
    assert.equal(
      sanitizeInteractiveHistory('unknown --secret "two words" --private-key=\'three words\''),
      'unknown --secret [REDACTED] --private-key=[REDACTED]'
    )
  })

  it('omits empty and consecutive duplicate entries and remains bounded', () => {
    let history: readonly string[] = []
    history = addInteractiveHistory(history, '')
    history = addInteractiveHistory(history, 'nodes list')
    history = addInteractiveHistory(history, 'nodes list')
    for (let index = 0; index < INTERACTIVE_HISTORY_LIMIT + 10; index += 1) {
      history = addInteractiveHistory(history, `version ${index}`)
    }

    assert.equal(history.length, INTERACTIVE_HISTORY_LIMIT)
    assert.equal(history.at(-1), `version ${INTERACTIVE_HISTORY_LIMIT + 9}`)
  })
})
