import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { simulatedNodes } from '../src/adapters/simulation/fixtures.js'
import type { NodeRecord } from '../src/domain/node.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'knm-inventory-test-'))
  roots.push(root)
  const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
  return { root, paths }
}

function fixture(index = 0): NodeRecord {
  const node = simulatedNodes[index]
  assert.ok(node)
  return structuredClone(node)
}

describe('filesystem inventory repository', () => {
  it('persists versioned revisions atomically with private permissions and bounded backups', async () => {
    const { paths } = await setup()
    const repository = new FileSystemInventoryRepository(paths, {
      now: () => new Date('2026-07-12T10:00:00.000Z'),
      maxBackups: 2
    })
    assert.deepEqual(await repository.read(), { schemaVersion: 1, revision: 0, updatedAt: null, nodes: [] })
    await repository.save([fixture(0)], 0)
    await repository.save([fixture(0), fixture(1)], 1)
    await repository.save([fixture(0), fixture(1), fixture(2)], 2)
    await repository.save([fixture(0)], 3)

    const snapshot = await repository.read()
    assert.equal(snapshot.revision, 4)
    assert.equal(snapshot.nodes.length, 1)
    assert.equal((await stat(paths.rootDirectory)).mode & 0o077, 0)
    assert.equal((await stat(paths.inventoryFile)).mode & 0o077, 0)
    assert.equal((await readdir(paths.backupsDirectory)).length, 2)
  })

  it('keeps the previous inventory readable when an atomic replacement fails before rename', async () => {
    const { paths } = await setup()
    const repository = new FileSystemInventoryRepository(paths)
    await repository.save([fixture(0)], 0)
    const failing = new FileSystemInventoryRepository(paths, {
      faultInjector: (stage) => {
        if (stage === 'before-rename') throw new Error('injected failure')
      }
    })
    await assert.rejects(failing.save([fixture(1)], 1), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVENTORY_PERSISTENCE_FAILED')
      return true
    })
    const preserved = await repository.read()
    assert.equal(preserved.revision, 1)
    assert.equal(preserved.nodes[0]?.id, fixture(0).id)
    assert.equal((await readdir(paths.rootDirectory)).some((name) => name.startsWith('.inventory-')), false)
  })

  it('backs up and migrates the supported legacy schema exactly once', async () => {
    const { paths } = await setup()
    await mkdir(paths.rootDirectory, { recursive: true })
    await writeFile(paths.inventoryFile, JSON.stringify({
      schemaVersion: 0,
      revision: 7,
      nodes: [fixture(0)]
    }))
    const repository = new FileSystemInventoryRepository(paths, {
      now: () => new Date('2026-07-12T10:00:00.000Z')
    })
    const migrated = await repository.read()
    assert.equal(migrated.schemaVersion, 1)
    assert.equal(migrated.revision, 8)
    assert.equal((await readdir(paths.backupsDirectory)).length, 1)
    assert.equal((await repository.read()).revision, 8)
    assert.equal((await readdir(paths.backupsDirectory)).length, 1)
  })

  it('quarantines corrupt data and explicitly recovers the newest valid backup', async () => {
    const { paths } = await setup()
    const repository = new FileSystemInventoryRepository(paths, {
      now: () => new Date('2026-07-12T10:00:00.000Z')
    })
    await repository.save([fixture(0)], 0)
    await repository.save([fixture(0), fixture(1)], 1)
    await writeFile(paths.inventoryFile, '{ not valid json')

    await assert.rejects(repository.read(), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVENTORY_QUARANTINED')
      return true
    })
    assert.equal((await readdir(paths.quarantineDirectory)).length, 1)
    const recovered = await repository.recoverLatestBackup()
    assert.equal(recovered.revision, 2)
    assert.deepEqual(recovered.nodes.map((node) => node.id), [fixture(0).id])
    assert.deepEqual((await repository.read()).nodes.map((node) => node.id), [fixture(0).id])
  })

  it('quarantines records containing raw secret fields without reproducing the secret', async () => {
    const { paths } = await setup()
    await mkdir(paths.rootDirectory, { recursive: true })
    const unsafe = { ...fixture(0), privateKey: 'raw-private-key-material' }
    await writeFile(paths.inventoryFile, JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-07-12T10:00:00.000Z',
      nodes: [unsafe]
    }))
    const repository = new FileSystemInventoryRepository(paths)
    await assert.rejects(repository.read(), (error: unknown) => {
      assert.doesNotMatch((error as Error).message, /raw-private-key-material/)
      assert.equal((error as { code: string }).code, 'INVENTORY_QUARANTINED')
      return true
    })
    const quarantined = await readdir(paths.quarantineDirectory)
    assert.equal(quarantined.length, 1)
    const evidence = await readFile(join(paths.quarantineDirectory, quarantined[0] as string), 'utf8')
    assert.doesNotMatch(evidence, /raw-private-key-material/)
    assert.match(evidence, /inventory-corruption-evidence/)
    assert.match(evidence, /sha256/)
  })

  it('detects concurrent writers through an exclusive inventory lock', async () => {
    const { paths } = await setup()
    await mkdir(paths.rootDirectory, { recursive: true })
    await writeFile(paths.lockFile, 'held', { mode: 0o600 })
    const repository = new FileSystemInventoryRepository(paths)
    await assert.rejects(repository.save([fixture(0)], 0), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVENTORY_LOCKED')
      return true
    })
  })

  it('rejects stale optimistic revisions instead of overwriting newer inventory', async () => {
    const { paths } = await setup()
    const repository = new FileSystemInventoryRepository(paths)
    await repository.save([fixture(0)], 0)
    await assert.rejects(repository.save([fixture(1)], 0), (error: unknown) => {
      const typed = error as { code: string; exitCode: number }
      assert.equal(typed.code, 'INVENTORY_REVISION_CONFLICT')
      assert.equal(typed.exitCode, 10)
      return true
    })
    assert.deepEqual((await repository.list()).map((node) => node.id), [fixture(0).id])
  })

  it('reconciles an old writer lock when its process no longer exists', async () => {
    const { paths } = await setup()
    await mkdir(paths.rootDirectory, { recursive: true })
    await writeFile(paths.lockFile, JSON.stringify({ pid: 99999999, createdAt: '2020-01-01T00:00:00.000Z' }))
    await utimes(paths.lockFile, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'))
    const repository = new FileSystemInventoryRepository(paths)
    const saved = await repository.save([fixture(0)], 0)
    assert.equal(saved.revision, 1)
  })

  it('reports schema, permissions, backup, quarantine, and atomic-write readiness', async () => {
    const { paths } = await setup()
    const repository = new FileSystemInventoryRepository(paths)
    await repository.save([fixture(0)], 0)
    const report = await repository.diagnose()
    assert.equal(report.healthy, true)
    assert.deepEqual(report.checks.map((check) => check.id), [
      'storage-root',
      'inventory-file',
      'inventory-permissions',
      'inventory-backups',
      'inventory-quarantine',
      'atomic-write-state',
      'inventory-lock'
    ])
    await chmod(paths.inventoryFile, 0o644)
    const unsafePermissions = await repository.diagnose()
    assert.equal(unsafePermissions.healthy, false)
    assert.equal(unsafePermissions.checks.find((check) => check.id === 'inventory-permissions')?.status, 'fail')
  })
})
