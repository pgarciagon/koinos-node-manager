import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { FileSystemOnboardingJournalRepository } from '../src/adapters/filesystem/file-system-onboarding-journal-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { PublicKoinosRpcInspectionAdapter } from '../src/adapters/inspection/public-koinos-rpc-inspection-adapter.js'
import { FakeProbeTransport } from '../src/adapters/simulation/fake-probe-transport.js'
import { applyOnboarding, getOnboardingStatus, previewQuick, reconcileOnboarding } from '../src/core/onboarding.js'
import { INSPECTION_NOW, jsonRpc } from './helpers/inspection-fixtures.js'

const roots: string[] = []
const now = () => new Date(INSPECTION_NOW)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function services(options: { failInventory?: boolean; failJournalClear?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'knm-onboarding-quick-'))
  roots.push(root)
  const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
  const connectionRepository = new FileSystemConnectionStateRepository(paths, { now })
  const inventoryRepository = new FileSystemInventoryRepository(paths, {
    now,
    ...(options.failInventory ? { faultInjector: (stage) => { if (stage === 'before-rename') throw new Error('injected') } } : {})
  })
  const journalRepository = new FileSystemOnboardingJournalRepository(paths, {
    ...(options.failJournalClear ? { faultInjector: (stage) => { if (stage === 'before-clear') throw new Error('injected') } } : {})
  })
  const transport = new FakeProbeTransport({
    outcome: 'success',
    payloads: {
      'node.multiservice.chain-id': jsonRpc({ chain_id: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==' }),
      'node.multiservice.chain-head': jsonRpc({ head_topology: { height: '1200', id: `0x${'1'.repeat(64)}` }, last_irreversible_block: '1198', head_block_time: String(Date.parse(INSPECTION_NOW) - 30_000) }),
      'node.multiservice.p2p-status': jsonRpc({ enabled: true })
    }
  })
  return {
    root, paths, connectionRepository, inventoryRepository, journalRepository, transport,
    adapter: new PublicKoinosRpcInspectionAdapter(), resolver: async () => [{ address: '203.0.113.20', family: 4 as const }], now
  }
}

describe('Quick Connect onboarding workflow', () => {
  it('previews, digest-confirms, persists, and survives restart without exposing the endpoint', async () => {
    const setup = await services()
    const review = await previewQuick(setup, { nodeId: 'quick-observer', displayName: 'Quick Observer', endpoint: 'https://private-node.example.invalid/rpc' })
    assert.equal(review.mode, 'quick')
    assert.equal(review.status, 'review-ready')
    assert.equal(review.access.authority, 'public-observe')
    assert.equal(review.inspection?.components.availability, 'unavailable')
    assert.doesNotMatch(JSON.stringify(review), /private-node/)
    const result = await applyOnboarding(setup, review.id, review.digest)
    assert.equal(result.review.status, 'committed')
    assert.equal((await setup.inventoryRepository.read()).nodes[0]?.id, 'quick-observer')
    assert.equal((await setup.connectionRepository.read()).accessProfiles[0]?.bindings[0]?.mode, 'quick')
    const restartedConnection = new FileSystemConnectionStateRepository(setup.paths)
    const restartedInventory = new FileSystemInventoryRepository(setup.paths)
    const status = await getOnboardingStatus(restartedConnection, restartedInventory, review.id)
    assert.equal(status.status, 'committed')
    assert.doesNotMatch(JSON.stringify(status), /private-node/)
    assert.match(await readFile(setup.paths.connectionStateFile, 'utf8'), /private-node/)
    assert.doesNotMatch(await readFile(setup.paths.inventoryFile, 'utf8'), /private-node/)
  })

  it('rejects a wrong digest and preserves both repositories', async () => {
    const setup = await services()
    const review = await previewQuick(setup, { nodeId: 'quick-observer', endpoint: 'https://node.example.invalid' })
    await assert.rejects(applyOnboarding(setup, review.id, '0'.repeat(64)), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ONBOARDING_CONFIRMATION_MISMATCH')
      return true
    })
    assert.equal((await setup.inventoryRepository.read()).nodes.length, 0)
    assert.equal((await setup.connectionRepository.read()).connections.length, 0)
  })

  it('retains a private journal and deterministically completes an interrupted commit', async () => {
    const initial = await services({ failInventory: true })
    const review = await previewQuick(initial, { nodeId: 'quick-observer', endpoint: 'https://node.example.invalid' })
    await assert.rejects(applyOnboarding(initial, review.id, review.digest))
    assert.notEqual(await initial.journalRepository.read(), null)
    assert.equal((await initial.connectionRepository.read()).connections.length, 1)
    assert.equal((await initial.inventoryRepository.read()).nodes.length, 0)
    const recovered = {
      connectionRepository: new FileSystemConnectionStateRepository(initial.paths),
      inventoryRepository: new FileSystemInventoryRepository(initial.paths),
      journalRepository: new FileSystemOnboardingJournalRepository(initial.paths),
      now
    }
    const result = await reconcileOnboarding(recovered)
    assert.equal(result.review.status, 'committed')
    assert.equal((await recovered.inventoryRepository.read()).nodes[0]?.id, 'quick-observer')
    assert.equal(await recovered.journalRepository.read(), null)
  })

  it('recovers interruption before connection-state replacement', async () => {
    const initial = await services()
    const review = await previewQuick(initial, { nodeId: 'quick-observer', endpoint: 'https://node.example.invalid' })
    const failingConnections = new FileSystemConnectionStateRepository(initial.paths, {
      faultInjector: (stage) => { if (stage === 'before-rename') throw new Error('injected') }
    })
    await assert.rejects(applyOnboarding({
      connectionRepository: failingConnections,
      inventoryRepository: initial.inventoryRepository,
      journalRepository: initial.journalRepository,
      now
    }, review.id, review.digest))
    assert.notEqual(await initial.journalRepository.read(), null)
    assert.equal((await initial.connectionRepository.read()).connections.length, 0)
    assert.equal((await initial.inventoryRepository.read()).nodes.length, 0)
    await reconcileOnboarding({
      connectionRepository: initial.connectionRepository,
      inventoryRepository: initial.inventoryRepository,
      journalRepository: initial.journalRepository,
      now
    })
    assert.equal((await initial.connectionRepository.read()).connections.length, 1)
    assert.equal((await initial.inventoryRepository.read()).nodes.length, 1)
  })

  it('recovers interruption after both repository writes but before journal clear', async () => {
    const initial = await services()
    const review = await previewQuick(initial, { nodeId: 'quick-observer', endpoint: 'https://node.example.invalid' })
    const failingJournal = new FileSystemOnboardingJournalRepository(initial.paths, {
      faultInjector: (stage) => { if (stage === 'before-clear') throw new Error('injected') }
    })
    await assert.rejects(applyOnboarding({
      connectionRepository: initial.connectionRepository,
      inventoryRepository: initial.inventoryRepository,
      journalRepository: failingJournal,
      now
    }, review.id, review.digest))
    assert.equal((await initial.connectionRepository.read()).connections.length, 1)
    assert.equal((await initial.inventoryRepository.read()).nodes.length, 1)
    assert.notEqual(await initial.journalRepository.read(), null)
    const result = await reconcileOnboarding({
      connectionRepository: initial.connectionRepository,
      inventoryRepository: initial.inventoryRepository,
      journalRepository: initial.journalRepository,
      now
    })
    assert.equal(result.review.status, 'committed')
    assert.equal(await initial.journalRepository.read(), null)
  })
})
