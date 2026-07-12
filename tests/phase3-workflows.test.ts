import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { FakeProbeTransport, FakeSshAliasResolver } from '../src/adapters/simulation/fake-probe-transport.js'
import { applyAdoption, planAdoption } from '../src/core/adoption.js'
import { addSshConnection, removeConnection, testConnection } from '../src/core/connections.js'
import { discoverHost, discoverPeers, dismissDiscovery } from '../src/core/discoveries.js'
import type { ConnectionTestOutcome } from '../src/domain/connection.js'

const roots: string[] = []
const now = () => new Date('2026-07-12T10:00:00.000Z')

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function repositories() {
  const root = await mkdtemp(join(tmpdir(), 'knm-phase3-workflow-'))
  roots.push(root)
  const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
  return {
    connections: new FileSystemConnectionStateRepository(paths, { now }),
    inventory: new FileSystemInventoryRepository(paths, { now })
  }
}

function manifest(full: boolean): string {
  return JSON.stringify({
    schemaVersion: 1,
    flavor: { id: 'teleno-monolith', version: '1.2.3' },
    network: { name: 'testnet', chainId: 'test-chain-id' },
    environment: 'linux',
    supervisor: { kind: 'systemd', serviceName: 'private-service' },
    runtime: { kind: 'native', version: '1.2.3' },
    instance: { baseDir: '/private/data', ports: { p2p: 8888, jsonrpc: 8080 } },
    artifact: { version: '1.2.3', digest: 'b'.repeat(64) },
    functions: { observer: 'enabled', producer: 'disabled', seed: 'enabled', api: 'enabled', 'backup-source': 'disabled' },
    endpoints: [{ kind: 'jsonrpc', scope: 'local', address: '127.0.0.1:8080' }],
    identity: { peerId: 'peer-private', runtimeInstanceId: 'instance-private', producerAddress: null },
    capabilities: {
      inspect: true, configure: full, startStop: full, upgrade: full,
      backup: full, restore: full, logs: true
    }
  })
}

function peerManifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    peers: [{ network: { name: 'testnet', chainId: 'test-chain-id' }, functions: { observer: 'enabled' }, endpointScopes: ['public'], peerId: 'peer-private' }]
  })
}

describe('Phase 3 connection, discovery, and adoption workflows', () => {
  it('supports every deterministic fake connection outcome and persists sanitized evidence', async () => {
    const outcomes: readonly ConnectionTestOutcome[] = ['success', 'authentication-failed', 'timeout', 'unreachable', 'malformed', 'unsupported']
    for (const outcome of outcomes) {
      const { connections } = await repositories()
      const resolver = new FakeSshAliasResolver(['configured-alias'])
      await addSshConnection({ repository: connections, aliasResolver: resolver, probeTransport: new FakeProbeTransport({ outcome: 'success' }), now }, { id: 'target', hostAlias: 'configured-alias' })
      const transport = new FakeProbeTransport({ outcome, payloads: { 'connection.handshake': 'KNM_HANDSHAKE_V1' } })
      if (outcome === 'success') {
        const result = await testConnection({ repository: connections, aliasResolver: resolver, probeTransport: transport, now }, 'target', 5_000)
        assert.equal(result.evidence.outcome, 'success')
      } else {
        await assert.rejects(testConnection({ repository: connections, aliasResolver: resolver, probeTransport: transport, now }, 'target', 5_000))
        assert.equal((await connections.read()).connections[0]?.lastTest?.outcome, outcome)
      }
      assert.deepEqual(transport.requests.map((request) => request.kind), ['connection.handshake'])
      assert.doesNotMatch(JSON.stringify(await connections.read()), /HostName|private-key|password/)
    }
  })

  it('adopts complete evidence as managed while remaining inventory-only and observer-safe', async () => {
    const { connections, inventory } = await repositories()
    const resolver = new FakeSshAliasResolver(['configured-alias'])
    const transport = new FakeProbeTransport({ outcome: 'success', payloads: { 'host.inventory': manifest(true), 'peers.snapshot': peerManifest() } })
    await addSshConnection({ repository: connections, aliasResolver: resolver, probeTransport: transport, now }, { id: 'target', hostAlias: 'configured-alias' })
    const discovered = await discoverHost({ repository: connections, nodeRepository: inventory, aliasResolver: resolver, probeTransport: transport, now }, 'target', 5_000)
    assert.equal((await inventory.list()).length, 0)
    const planned = await planAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, {
      discoveryId: discovered.discovery.id, nodeId: 'adopted-observer', displayName: 'Adopted Observer'
    })
    assert.equal(planned.review.disposition, 'managed-adopted')
    assert.equal((await inventory.list()).length, 0)
    await assert.rejects(applyAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, planned.review.id, '0'.repeat(64)), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ADOPTION_CONFIRMATION_MISMATCH')
      return true
    })
    const applied = await applyAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, planned.review.id, planned.review.digest)
    const node = (await inventory.list())[0]
    assert.equal(applied.review.application?.nodeId, 'adopted-observer')
    assert.equal(node?.management.class, 'managed')
    assert.equal(node?.management.origin, 'adopted')
    assert.equal(node?.desired?.functions?.producer, 'disabled')
    assert.equal(node?.management.authority.producerControl, false)
    assert.equal(node?.management.authority.walletAccess, false)
    assert.deepEqual(transport.requests.map((request) => request.kind), ['host.inventory'])
    const repeated = await applyAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, planned.review.id, planned.review.digest)
    assert.equal(repeated.reconciled, true)
    assert.equal((await inventory.list()).length, 1)

    const beforePeers = (await inventory.list()).length
    const peers = await discoverPeers({ repository: connections, nodeRepository: inventory, aliasResolver: resolver, probeTransport: transport, now }, 'adopted-observer', 5_000, false)
    assert.equal(peers.revision, null)
    assert.equal(peers.discovery.findings.total, 1)
    assert.equal((await inventory.list()).length, beforePeers)
    assert.equal((await connections.read()).discoveries.length, 1)
  })

  it('adopts incomplete authority as connected limited and blocks referenced connection removal', async () => {
    const { connections, inventory } = await repositories()
    const resolver = new FakeSshAliasResolver(['configured-alias'])
    const transport = new FakeProbeTransport({ outcome: 'success', payloads: { 'host.inventory': manifest(false) } })
    await addSshConnection({ repository: connections, aliasResolver: resolver, probeTransport: transport, now }, { id: 'target', hostAlias: 'configured-alias' })
    const discovered = await discoverHost({ repository: connections, nodeRepository: inventory, aliasResolver: resolver, probeTransport: transport, now }, 'target', 5_000)
    const planned = await planAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, {
      connectionId: 'target', nodeId: 'limited-observer', displayName: 'Limited Observer'
    })
    assert.equal(planned.review.discoveryId, discovered.discovery.id)
    assert.equal(planned.review.disposition, 'connected-limited')
    await applyAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, planned.review.id, planned.review.digest)
    const node = (await inventory.list())[0]
    assert.equal(node?.management.class, 'connected')
    assert.equal(node?.management.authority.inspect, true)
    assert.equal(node?.management.authority.configure, false)
    assert.equal(node?.desired, null)
    await assert.rejects(removeConnection(connections, inventory, 'target', 'target'), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'CONNECTION_STILL_REFERENCED')
      return true
    })
    const dismissed = await dismissDiscovery(connections, discovered.discovery.id)
    assert.equal(dismissed.discovery.status, 'dismissed')
    assert.equal((await inventory.list()).length, 1)
  })

  it('rejects stale discovery and stale adoption revisions deterministically', async () => {
    const { connections, inventory } = await repositories()
    const resolver = new FakeSshAliasResolver(['configured-alias'])
    const transport = new FakeProbeTransport({ outcome: 'success', payloads: { 'host.inventory': manifest(true) } })
    await addSshConnection({ repository: connections, aliasResolver: resolver, probeTransport: transport, now }, { id: 'target', hostAlias: 'configured-alias' })
    const discovered = await discoverHost({ repository: connections, nodeRepository: inventory, aliasResolver: resolver, probeTransport: transport, now }, 'target', 5_000)
    await assert.rejects(planAdoption({ connectionRepository: connections, inventoryRepository: inventory, now: () => new Date('2026-07-12T11:00:00.000Z') }, {
      discoveryId: discovered.discovery.id, nodeId: 'stale-node', displayName: 'Stale Node'
    }), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ADOPTION_REVIEW_STALE')
      return true
    })
    const planned = await planAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, {
      discoveryId: discovered.discovery.id, nodeId: 'reviewed-node', displayName: 'Reviewed Node'
    })
    const snapshot = await connections.read()
    const tampered = { ...planned.review, node: { ...planned.review.node, displayName: 'Tampered Node' } }
    await assert.rejects(connections.save({ connections: snapshot.connections, discoveries: snapshot.discoveries, adoptionReviews: [tampered] }, snapshot.revision), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'CONNECTION_STATE_INVALID')
      return true
    })
    await connections.save({ connections: snapshot.connections, discoveries: snapshot.discoveries, adoptionReviews: snapshot.adoptionReviews }, snapshot.revision)
    await assert.rejects(applyAdoption({ connectionRepository: connections, inventoryRepository: inventory, now }, planned.review.id, planned.review.digest), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ADOPTION_REVIEW_STALE')
      return true
    })
  })
})
