import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('node detail and simulation CLI', () => {
  it('shows a human-readable node detail', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', 'nodes', 'show', 'node-nas-observer'
    ])
    assert.match(stdout, /NAS Observer \(node-nas-observer\)/)
    assert.match(stdout, /Management:\s+connected \/ imported \/ limited/)
    assert.match(stdout, /Endpoints:/)
  })

  it('shows a node through the versioned JSON envelope', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', 'nodes', 'show', 'node-home-observer', '--output', 'json'
    ])
    const result = JSON.parse(stdout) as { command: string; data: { node: { id: string } } }
    assert.equal(result.command, 'nodes.show')
    assert.equal(result.data.node.id, 'node-home-observer')
  })

  it('returns a typed JSON not-found error and exit code 3', async () => {
    await assert.rejects(
      execFileAsync('npm', [
        'run', '--silent', 'cli', '--', 'nodes', 'show', 'missing', '--output', 'json'
      ]),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        const envelope = JSON.parse(result.stderr) as { errors: Array<{ code: string }> }
        assert.equal(result.code, 3)
        assert.equal(envelope.errors[0]?.code, 'NODE_NOT_FOUND')
        return true
      }
    )
  })

  it('lists simulation scenarios without exposing their node payloads', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', 'simulation', 'scenarios', '--output', 'json'
    ])
    const result = JSON.parse(stdout) as { data: { scenarios: Array<Record<string, unknown>> } }
    assert.deepEqual(result.data.scenarios.map((scenario) => scenario.id), [
      'default', 'empty', 'mixed-health', 'stale-health'
    ])
    assert.equal('nodes' in (result.data.scenarios[0] ?? {}), false)
  })

  it('selects an explicit empty scenario without persisted global state', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'empty', 'nodes', 'list'
    ])
    assert.match(stdout, /No nodes match the selected filters/)
  })
})
