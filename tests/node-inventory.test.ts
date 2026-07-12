import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addInventoryNode,
  removeInventoryNode,
  updateInventoryNode
} from '../src/core/node-inventory.js'
import {
  INVENTORY_SCHEMA_VERSION,
  type InventoryDiagnosticReport,
  type InventoryRepository,
  type InventorySnapshot
} from '../src/core/node-repository.js'
import type { NodeRecord } from '../src/domain/node.js'

class MemoryInventoryRepository implements InventoryRepository {
  snapshot: InventorySnapshot = { schemaVersion: INVENTORY_SCHEMA_VERSION, revision: 0, updatedAt: null, nodes: [] }

  async list(): Promise<readonly NodeRecord[]> { return structuredClone(this.snapshot.nodes) }
  async read(): Promise<InventorySnapshot> { return structuredClone(this.snapshot) }
  async save(nodes: readonly NodeRecord[], expectedRevision: number): Promise<InventorySnapshot> {
    assert.equal(expectedRevision, this.snapshot.revision)
    this.snapshot = {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      revision: expectedRevision + 1,
      updatedAt: '2026-07-12T10:00:00.000Z',
      nodes: structuredClone(nodes)
    }
    return structuredClone(this.snapshot)
  }
  async diagnose(): Promise<InventoryDiagnosticReport> { return { healthy: true, checks: [] } }
  async recoverLatestBackup(): Promise<InventorySnapshot> { throw new Error('not used') }
}

const input = {
  id: 'testnet-observer',
  displayName: 'Testnet Observer',
  management: 'managed' as const,
  origin: 'provisioned' as const,
  flavor: 'teleno-monolith' as const,
  network: 'testnet' as const,
  location: 'local' as const,
  environment: 'mac' as const,
  authorityLevel: 'full' as const,
  functions: ['producer'] as const
}

describe('inventory mutation use cases', () => {
  it('adds observer-safe desired state and never grants producer or wallet authority', async () => {
    const repository = new MemoryInventoryRepository()
    const result = await addInventoryNode(repository, input, () => new Date('2026-07-12T10:00:00.000Z'))
    assert.equal(result.revision, 1)
    assert.equal(result.node.declared.functions.producer, 'enabled')
    assert.equal(result.node.desired?.functions?.producer, 'disabled')
    assert.equal(result.node.desired?.functions?.observer, 'enabled')
    assert.equal(result.node.management.authority.producerControl, false)
    assert.equal(result.node.management.authority.walletAccess, false)
    assert.equal(result.node.observed, null)
    assert.equal(result.node.verified, null)
  })

  it('updates metadata without changing the stable ID and removes only after exact confirmation', async () => {
    const repository = new MemoryInventoryRepository()
    await addInventoryNode(repository, input)
    const updated = await updateInventoryNode(repository, input.id, {
      displayName: 'Renamed Observer',
      connectionRef: 'ssh-config:testnet-observer'
    })
    assert.equal(updated.node.id, input.id)
    assert.equal(updated.node.displayName, 'Renamed Observer')
    assert.equal(updated.node.declared.location.connectionRef, 'ssh-config:testnet-observer')
    await assert.rejects(removeInventoryNode(repository, input.id, 'another-node'), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVENTORY_REMOVE_CONFIRMATION_MISMATCH')
      return true
    })
    const removed = await removeInventoryNode(repository, input.id, input.id)
    assert.equal(removed.node.id, input.id)
    assert.deepEqual(await repository.list(), [])
  })

  it('rejects duplicate IDs and empty updates', async () => {
    const repository = new MemoryInventoryRepository()
    await addInventoryNode(repository, input)
    await assert.rejects(addInventoryNode(repository, input), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'NODE_ID_CONFLICT')
      return true
    })
    await assert.rejects(updateInventoryNode(repository, input.id, {}), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVENTORY_UPDATE_EMPTY')
      return true
    })
  })
})
