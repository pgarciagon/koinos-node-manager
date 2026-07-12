import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CliInputError } from '../src/cli/cli-input-error.js'
import { parseOutputFormat } from '../src/cli/output.js'

describe('output format contract', () => {
  it('defaults to table and accepts the structured JSON format', () => {
    assert.equal(parseOutputFormat(undefined), 'table')
    assert.equal(parseOutputFormat('table'), 'table')
    assert.equal(parseOutputFormat('json'), 'json')
  })

  it('rejects unsupported formats with a typed CLI error', () => {
    assert.throws(() => parseOutputFormat('yaml'), CliInputError)
  })
})
