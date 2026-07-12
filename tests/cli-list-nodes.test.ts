import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('knm nodes list', () => {
  it('renders the effective inventory table with authority and freshness', async () => {
    const { stdout } = await execFileAsync('npm', ['run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'list'])

    assert.match(stdout, /Berlin Producer/)
    assert.match(stdout, /Community API/)
    assert.match(stdout, /AUTHORITY/)
    assert.match(stdout, /FRESHNESS/)
    assert.match(stdout, /6 nodes/)
  })

  it('returns a schema v2 JSON envelope and applies every filter', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'list',
      '--management', 'connected',
      '--origin', 'imported',
      '--flavor', 'teleno-monolith',
      '--network', 'testnet',
      '--location', 'remote',
      '--authority', 'limited',
      '--function', 'observer',
      '--health', 'degraded',
      '--staleness', 'fresh',
      '--output', 'json'
    ])
    const result = JSON.parse(stdout) as {
      schemaVersion: number
      query: Record<string, string>
      data: { total: number; nodes: Array<{ id: string }> }
    }

    assert.equal(result.schemaVersion, 2)
    assert.deepEqual(result.query, {
      management: 'connected',
      origin: 'imported',
      flavor: 'teleno-monolith',
      network: 'testnet',
      location: 'remote',
      authority: 'limited',
      function: 'observer',
      health: 'degraded',
      staleness: 'fresh'
    })
    assert.equal(result.data.total, 1)
    assert.equal(result.data.nodes[0]?.id, 'node-nas-observer')
  })

  it('filters stale and never-observed records explicitly', async () => {
    const stale = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'stale-health',
      'nodes', 'list', '--staleness', 'stale', '--output', 'json'
    ])
    const staleResult = JSON.parse(stale.stdout) as { data: { total: number } }
    assert.equal(staleResult.data.total, 5)

    const never = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'list', '--staleness', 'never', '--output', 'json'
    ])
    const neverResult = JSON.parse(never.stdout) as { data: { nodes: Array<{ id: string }> } }
    assert.deepEqual(neverResult.data.nodes.map((node) => node.id), ['node-community-api'])
  })

  it('queries the mixed-health scenario through both human and JSON output', async () => {
    const human = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'mixed-health',
      'nodes', 'list', '--health', 'unreachable'
    ])
    assert.match(human.stdout, /Home Observer/)
    assert.match(human.stdout, /unreachable/)

    const structured = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'mixed-health',
      'nodes', 'list', '--health', 'unreachable', '--output', 'json'
    ])
    const result = JSON.parse(structured.stdout) as { data: { nodes: Array<{ id: string }> } }
    assert.deepEqual(result.data.nodes.map((node) => node.id), ['node-home-observer'])
  })

  it('rejects invalid filters with exit code 2', async () => {
    await assert.rejects(
      execFileAsync('npm', ['run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'list', '--staleness', 'expired']),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        assert.equal(result.code, 2)
        assert.match(result.stderr, /Invalid --staleness value/)
        return true
      }
    )
  })
})
