import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('knm nodes list', () => {
  it('renders the simulated node table', async () => {
    const { stdout } = await execFileAsync('npm', ['run', '--silent', 'cli', '--', 'nodes', 'list'])

    assert.match(stdout, /Berlin Producer/)
    assert.match(stdout, /Community API/)
    assert.match(stdout, /6 nodes/)
  })

  it('returns a versioned JSON envelope and applies filters', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', 'nodes', 'list',
      '--management', 'external', '--function', 'seed', '--output', 'json'
    ])
    const result = JSON.parse(stdout) as { schemaVersion: number; data: { total: number; nodes: Array<{ id: string }> } }

    assert.equal(result.schemaVersion, 1)
    assert.equal(result.data.total, 1)
    assert.equal(result.data.nodes[0]?.id, 'node-community-seed')
  })

  it('rejects invalid filters with exit code 2', async () => {
    await assert.rejects(
      execFileAsync('npm', ['run', '--silent', 'cli', '--', 'nodes', 'list', '--network', 'invalid']),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        assert.equal(result.code, 2)
        assert.match(result.stderr, /Invalid --network value/)
        return true
      }
    )
  })
})
