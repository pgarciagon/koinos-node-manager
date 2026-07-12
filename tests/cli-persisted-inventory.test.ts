import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function isolatedHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'knm-cli-inventory-'))
  roots.push(root)
  return root
}

async function cli(home: string, args: readonly string[]) {
  return execFileAsync('npm', ['run', '--silent', 'cli', '--', ...args], {
    env: { ...process.env, KNM_HOME: home }
  })
}

describe('persisted inventory CLI', () => {
  it('persists add, update, show, list, and inventory-only remove across process restarts', async () => {
    const home = await isolatedHome()
    const initial = await cli(home, ['nodes', 'list', '--output', 'json'])
    assert.equal((JSON.parse(initial.stdout) as { data: { total: number } }).data.total, 0)

    const added = await cli(home, [
      'nodes', 'add', '--id', 'local-observer', '--name', 'Local Observer',
      '--management', 'managed', '--origin', 'provisioned', '--flavor', 'teleno-monolith',
      '--network', 'testnet', '--location', 'local', '--environment', 'mac',
      '--authority', 'full', '--function', 'observer', '--connection-ref', 'local-runtime:observer',
      '--output', 'json'
    ])
    const addedEnvelope = JSON.parse(added.stdout) as {
      command: string
      data: { revision: number; node: { desired: { functions: { producer: string } }; declared: { location: { connectionRef: string } } } }
    }
    assert.equal(addedEnvelope.command, 'nodes.add')
    assert.equal(addedEnvelope.data.revision, 1)
    assert.equal(addedEnvelope.data.node.desired.functions.producer, 'disabled')
    assert.equal(addedEnvelope.data.node.declared.location.connectionRef, '<CONNECTION_REF_PRESENT>')

    const restartedList = await cli(home, ['nodes', 'list', '--output', 'json'])
    assert.deepEqual(
      (JSON.parse(restartedList.stdout) as { data: { nodes: Array<{ id: string }> } }).data.nodes.map((node) => node.id),
      ['local-observer']
    )
    const updated = await cli(home, [
      'nodes', 'update', 'local-observer', '--name', 'Renamed Observer', '--network', 'mainnet', '--output', 'json'
    ])
    assert.equal((JSON.parse(updated.stdout) as { data: { revision: number } }).data.revision, 2)
    const detail = await cli(home, ['nodes', 'show', 'local-observer', '--output', 'json'])
    assert.match(detail.stdout, /Renamed Observer/)
    assert.doesNotMatch(detail.stdout, /local-runtime:observer/)

    const removed = await cli(home, ['nodes', 'remove', 'local-observer', '--confirm', 'local-observer', '--output', 'json'])
    const removal = JSON.parse(removed.stdout) as { data: { inventoryOnly: boolean; runtimeChanged: boolean; dataDeleted: boolean } }
    assert.deepEqual(removal.data, {
      revision: 3,
      removedNode: { id: 'local-observer', displayName: 'Renamed Observer' },
      inventoryOnly: true,
      runtimeChanged: false,
      dataDeleted: false
    })
    assert.equal((JSON.parse((await cli(home, ['nodes', 'list', '--output', 'json'])).stdout) as { data: { total: number } }).data.total, 0)
  })

  it('rejects duplicates, unsafe references, confirmation mismatches, and simulation writes with stable errors', async () => {
    const home = await isolatedHome()
    await cli(home, ['nodes', 'add', '--id', 'observer-one', '--name', 'Observer One'])
    await assert.rejects(cli(home, ['nodes', 'add', '--id', 'observer-one', '--name', 'Duplicate', '--output', 'json']), (error: unknown) => {
      const result = error as { code: number; stderr: string }
      assert.equal(result.code, 2)
      assert.equal((JSON.parse(result.stderr) as { errors: Array<{ code: string }> }).errors[0]?.code, 'NODE_ID_CONFLICT')
      return true
    })
    await assert.rejects(cli(home, [
      'nodes', 'add', '--id', 'unsafe-ref', '--name', 'Unsafe Ref', '--connection-ref', 'password=raw-secret-material'
    ]), (error: unknown) => {
      const result = error as { code: number; stderr: string }
      assert.equal(result.code, 2)
      assert.doesNotMatch(result.stderr, /raw-secret-material/)
      return true
    })
    await assert.rejects(cli(home, ['nodes', 'remove', 'observer-one', '--confirm', 'other']), (error: unknown) => {
      assert.equal((error as { code: number }).code, 20)
      return true
    })
    await assert.rejects(cli(home, [
      '--simulation', 'default', 'nodes', 'add', '--id', 'sim-write', '--name', 'Simulation Write'
    ]), (error: unknown) => {
      const result = error as { code: number; stderr: string }
      assert.equal(result.code, 20)
      assert.match(result.stderr, /SIMULATION_INVENTORY_READ_ONLY/)
      return true
    })
    assert.doesNotMatch(await readFile(join(home, 'inventory.json'), 'utf8'), /raw-secret-material/)
  })

  it('reports paths and doctor checks, quarantines corruption, and recovers an explicit backup', async () => {
    const home = await isolatedHome()
    const paths = JSON.parse((await cli(home, ['paths', '--output', 'json'])).stdout) as {
      data: { paths: { inventoryFile: string; source: string } }
    }
    assert.equal(paths.data.paths.inventoryFile, join(home, 'inventory.json'))
    assert.equal(paths.data.paths.source, 'KNM_HOME')

    await cli(home, ['nodes', 'add', '--id', 'recoverable-node', '--name', 'Original Name'])
    await cli(home, ['nodes', 'update', 'recoverable-node', '--name', 'Changed Name'])
    const healthy = JSON.parse((await cli(home, ['doctor', '--output', 'json'])).stdout) as {
      data: { healthy: boolean; checks: Array<{ id: string }> }
    }
    assert.equal(healthy.data.healthy, true)
    assert.ok(healthy.data.checks.some((check) => check.id === 'inventory-backups'))

    await writeFile(join(home, 'inventory.json'), '{ corrupt inventory')
    await assert.rejects(cli(home, ['nodes', 'list', '--output', 'json']), (error: unknown) => {
      const result = error as { code: number; stderr: string }
      assert.equal(result.code, 4)
      assert.equal((JSON.parse(result.stderr) as { errors: Array<{ code: string }> }).errors[0]?.code, 'INVENTORY_QUARANTINED')
      return true
    })
    const recovered = await cli(home, ['doctor', '--recover-inventory', '--output', 'json'])
    const recoveryEnvelope = JSON.parse(recovered.stdout) as { data: { recovered: { revision: number; nodes: number } } }
    assert.deepEqual(recoveryEnvelope.data.recovered, { revision: 2, nodes: 1 })
    const detail = await cli(home, ['nodes', 'show', 'recoverable-node'])
    assert.match(detail.stdout, /Original Name/)
    assert.doesNotMatch(detail.stdout, /Changed Name/)
  })
})
