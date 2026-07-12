import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('node detail and simulation CLI', () => {
  it('clearly separates all state layers in human-readable detail', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-nas-observer'
    ])
    assert.match(stdout, /NAS Observer \(node-nas-observer\)/)
    assert.match(stdout, /Management:\s+connected \/ imported/)
    assert.match(stdout, /Authority:\s+limited/)
    assert.match(stdout, /Declared state/)
    assert.match(stdout, /Desired state/)
    assert.match(stdout, /Observed state/)
    assert.match(stdout, /Verified state/)
    assert.match(stdout, /not verified/)
  })

  it('shows the complete compositional node through schema v2 JSON', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-home-observer', '--output', 'json'
    ])
    const result = JSON.parse(stdout) as {
      schemaVersion: number
      command: string
      query: { nodeId: string; section: string }
      data: { node: Record<string, unknown> }
    }
    assert.equal(result.schemaVersion, 2)
    assert.equal(result.command, 'nodes.show')
    assert.deepEqual(result.query, { nodeId: 'node-home-observer', section: 'all' })
    assert.deepEqual(
      ['declared', 'desired', 'observed', 'verified'].map((state) => state in result.data.node),
      [true, true, true, true]
    )
  })

  it('supports focused human and JSON state sections', async () => {
    const observed = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-nas-observer', '--section', 'observed'
    ])
    assert.match(observed.stdout, /Observed state/)
    assert.doesNotMatch(observed.stdout, /Declared state/)

    const desired = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-home-observer',
      '--section', 'desired', '--output', 'json'
    ])
    const result = JSON.parse(desired.stdout) as { data: { node: Record<string, unknown> } }
    assert.equal('desired' in result.data.node, true)
    assert.equal('observed' in result.data.node, false)
  })

  it('states explicitly when a record has never had a live observation', async () => {
    const { stdout } = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-community-api', '--section', 'observed'
    ])
    assert.match(stdout, /never had a live observation/)
  })

  it('shows stale observed state through human and JSON sections', async () => {
    const human = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'stale-health',
      'nodes', 'show', 'node-home-observer', '--section', 'observed'
    ])
    assert.match(human.stdout, /\(stale\)/)

    const structured = await execFileAsync('npm', [
      'run', '--silent', 'cli', '--', '--simulation', 'stale-health',
      'nodes', 'show', 'node-home-observer', '--section', 'observed', '--output', 'json'
    ])
    const result = JSON.parse(structured.stdout) as {
      data: { node: { observed: { freshness: string } } }
    }
    assert.equal(result.data.node.observed.freshness, 'stale')
  })

  it('returns a typed JSON not-found error and exit code 3', async () => {
    await assert.rejects(
      execFileAsync('npm', [
        'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'missing', '--output', 'json'
      ]),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        const envelope = JSON.parse(result.stderr) as { schemaVersion: number; errors: Array<{ code: string }> }
        assert.equal(result.code, 3)
        assert.equal(envelope.schemaVersion, 2)
        assert.equal(envelope.errors[0]?.code, 'NODE_NOT_FOUND')
        return true
      }
    )
  })

  it('rejects an unknown detail section with exit code 2', async () => {
    await assert.rejects(
      execFileAsync('npm', [
        'run', '--silent', 'cli', '--', '--simulation', 'default', 'nodes', 'show', 'node-home-observer', '--section', 'runtime'
      ]),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        assert.equal(result.code, 2)
        assert.match(result.stderr, /Invalid --section value/)
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
