import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { NodeReadlineTerminal } from '../src/cli/interactive/node-readline-terminal.js'

describe('NodeReadlineTerminal', () => {
  it('settles a pending read as EOF when the input stream closes', async () => {
    const input = new PassThrough() as unknown as NodeJS.ReadStream
    const output = new PassThrough() as unknown as NodeJS.WriteStream
    const error = new PassThrough() as unknown as NodeJS.WriteStream
    const terminal = new NodeReadlineTerminal({ input, output, error, noColor: true })

    const pending = terminal.readLine('knm> ')
    input.end()

    assert.deepEqual(await pending, { kind: 'eof' })
    terminal.close()
  })
})
