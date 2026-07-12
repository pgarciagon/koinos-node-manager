import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import type { ConnectionRecord } from '../src/domain/connection.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'knm-connection-state-'))
  roots.push(root)
  return resolveInventoryPaths({ env: { KNM_HOME: root } })
}

function connection(id = 'testnet-observer'): ConnectionRecord {
  return {
    id,
    kind: 'ssh',
    hostAlias: `${id}-alias`,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    lastTest: null
  }
}

describe('filesystem connection-state repository', () => {
  it('persists private versioned state atomically and rejects stale revisions', async () => {
    const paths = await setup()
    const repository = new FileSystemConnectionStateRepository(paths, { now: () => new Date('2026-07-12T10:00:00.000Z') })
    const saved = await repository.save({ connections: [connection()], discoveries: [], adoptionReviews: [] }, 0)
    assert.equal(saved.revision, 1)
    assert.equal((await stat(paths.connectionStateFile)).mode & 0o077, 0)
    await assert.rejects(repository.save({ connections: [], discoveries: [], adoptionReviews: [] }, 0), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'CONNECTION_STATE_REVISION_CONFLICT')
      return true
    })
    assert.equal((await repository.read()).connections[0]?.id, 'testnet-observer')
  })

  it('keeps the previous state readable when replacement fails before rename', async () => {
    const paths = await setup()
    const repository = new FileSystemConnectionStateRepository(paths)
    await repository.save({ connections: [connection()], discoveries: [], adoptionReviews: [] }, 0)
    const failing = new FileSystemConnectionStateRepository(paths, {
      faultInjector: (stage) => { if (stage === 'before-rename') throw new Error('injected') }
    })
    await assert.rejects(failing.save({ connections: [connection('second')], discoveries: [], adoptionReviews: [] }, 1), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'CONNECTION_STATE_PERSISTENCE_FAILED')
      return true
    })
    assert.equal((await repository.read()).connections[0]?.id, 'testnet-observer')
  })

  it('backs up and migrates schema zero, then diagnoses storage and permissions', async () => {
    const paths = await setup()
    await mkdir(paths.rootDirectory, { recursive: true })
    await writeFile(paths.connectionStateFile, JSON.stringify({ schemaVersion: 0, revision: 4, connections: [connection()], discoveries: [] }))
    const repository = new FileSystemConnectionStateRepository(paths, { now: () => new Date('2026-07-12T10:00:00.000Z') })
    const migrated = await repository.read()
    assert.equal(migrated.revision, 5)
    assert.deepEqual(migrated.adoptionReviews, [])
    assert.equal((await readdir(paths.backupsDirectory)).length, 1)
    assert.equal((await repository.diagnose()).healthy, true)
    await chmod(paths.connectionStateFile, 0o644)
    assert.equal((await repository.diagnose()).checks.find((check) => check.id === 'connection-state-permissions')?.status, 'fail')
  })

  it('quarantines unsafe secret-bearing records without copying raw material and recovers a valid backup', async () => {
    const paths = await setup()
    const repository = new FileSystemConnectionStateRepository(paths, { now: () => new Date('2026-07-12T10:00:00.000Z') })
    await repository.save({ connections: [connection()], discoveries: [], adoptionReviews: [] }, 0)
    await repository.save({ connections: [connection(), connection('second')], discoveries: [], adoptionReviews: [] }, 1)
    await writeFile(paths.connectionStateFile, JSON.stringify({
      schemaVersion: 1,
      revision: 2,
      updatedAt: '2026-07-12T10:00:00.000Z',
      connections: [{ ...connection(), privateKey: 'raw-private-key-material' }],
      discoveries: [],
      adoptionReviews: []
    }))
    await assert.rejects(repository.read(), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'CONNECTION_STATE_QUARANTINED')
      assert.doesNotMatch((error as Error).message, /raw-private-key-material/)
      return true
    })
    const quarantined = await readdir(paths.quarantineDirectory)
    assert.equal(quarantined.length, 1)
    assert.doesNotMatch(await readFile(join(paths.quarantineDirectory, quarantined[0] as string), 'utf8'), /raw-private-key-material/)
    const recovered = await repository.recoverLatestBackup()
    assert.equal(recovered.connections.length, 1)
  })
})
