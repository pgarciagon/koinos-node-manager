import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { SimulatedNodeRepository } from '../src/adapters/simulation/simulated-node-repository.js'
import { simulatedNodes } from '../src/adapters/simulation/fixtures.js'
import { createNodeDirectoryApi } from '../src/core/node-directory-api.js'
import { emptyConnectionState, type ConnectionStateRepository, type ConnectionStateSnapshot } from '../src/core/connection-state-repository.js'
import type { NodeRepository } from '../src/core/node-repository.js'
import type { ConnectionRecord } from '../src/domain/connection.js'
import type { NodeAccessProfile } from '../src/domain/onboarding.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('NodeDirectoryApi', () => {
  it('returns a stable, sorted, UI-neutral public directory', async () => {
    const node = structuredClone(simulatedNodes.find((candidate) => candidate.id === 'node-berlin-producer'))
    assert.ok(node)
    node.declared.location.connectionRef = 'connection:expert-berlin'
    if (node.desired?.location !== undefined) node.desired.location.connectionRef = 'connection:expert-berlin'
    if (node.observed !== null) node.observed.location.connectionRef = 'connection:expert-berlin'
    if (node.verified?.location !== undefined) node.verified.location.connectionRef = 'connection:expert-berlin'
    const connections: readonly ConnectionRecord[] = [sshConnection('expert-berlin')]
    const directory = await createNodeDirectoryApi({
      nodeRepository: repository([node]),
      connectionRepository: connectionRepository({ connections })
    }).list()

    assert.deepEqual(directory, {
      schemaVersion: 1,
      contractVersion: '1.0.0',
      nodes: [{
        nodeId: 'node-berlin-producer',
        displayName: 'Berlin Producer',
        network: 'mainnet',
        runtimeFlavor: 'legacy-microservices',
        availableAccessModes: ['expert'],
        preferredAccessMode: 'expert'
      }],
      total: 1,
      readOnly: true
    })
    assert.doesNotMatch(JSON.stringify(directory), /expert-berlin|connection:|hostAlias|endpoint|producerAddress|peerId/)
  })

  it('reports only enabled access modes backed by matching connection records', async () => {
    const node = structuredClone(simulatedNodes.find((candidate) => candidate.id === 'node-berlin-producer'))
    assert.ok(node)
    const connections: readonly ConnectionRecord[] = [
      sshConnection('expert'),
      rpcConnection('quick'),
      agentConnection('full')
    ]
    const profile: NodeAccessProfile = {
      nodeId: node.id,
      preferredInspectionMode: 'automatic',
      bindings: [
        binding('quick', 'connection:quick', true),
        binding('full', 'connection:full', true),
        binding('expert', 'connection:expert', false),
        binding('expert', 'connection:missing', true)
      ]
    }
    const directory = await createNodeDirectoryApi({
      nodeRepository: repository([node]),
      connectionRepository: connectionRepository({ connections, accessProfiles: [profile] })
    }).list()

    assert.deepEqual(directory.nodes[0]?.availableAccessModes, ['quick', 'full'])
    assert.equal(directory.nodes[0]?.preferredAccessMode, 'full')
  })

  it('preserves malicious display text as inert data without exposing internal records', async () => {
    const node = structuredClone(simulatedNodes[0])
    assert.ok(node)
    node.displayName = '<img src=x onerror=alert(1)>'
    const directory = await createNodeDirectoryApi({
      nodeRepository: repository([node]),
      connectionRepository: connectionRepository()
    }).list()

    assert.equal(directory.nodes[0]?.displayName, '<img src=x onerror=alert(1)>')
    assert.deepEqual(Object.keys(directory.nodes[0] ?? {}).sort(), [
      'availableAccessModes', 'displayName', 'network', 'nodeId', 'preferredAccessMode', 'runtimeFlavor'
    ])
  })

  it('rejects unsafe inventory records before public mapping', async () => {
    const unsafe = { ...structuredClone(simulatedNodes[0]), token: 'secret-material' }
    const api = createNodeDirectoryApi({
      nodeRepository: repository([unsafe as never]),
      connectionRepository: connectionRepository()
    })
    await assert.rejects(() => api.list(), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVENTORY_RECORD_INVALID')
      return true
    })
  })

  it('supports an honest empty directory', async () => {
    const directory = await createNodeDirectoryApi({
      nodeRepository: SimulatedNodeRepository.forScenario('empty'),
      connectionRepository: connectionRepository()
    }).list()
    assert.equal(directory.total, 0)
    assert.deepEqual(directory.nodes, [])
  })

  it('survives repository restart without persisting inspection or presentation state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'knm-desktop-directory-'))
    roots.push(root)
    const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
    const inventory = new FileSystemInventoryRepository(paths)
    const connections = new FileSystemConnectionStateRepository(paths)
    const node = structuredClone(simulatedNodes.find((candidate) => candidate.id === 'node-berlin-producer'))
    assert.ok(node)
    node.declared.location.connectionRef = 'connection:expert-restart'
    if (node.desired?.location !== undefined) node.desired.location.connectionRef = 'connection:expert-restart'
    if (node.observed !== null) node.observed.location.connectionRef = 'connection:expert-restart'
    if (node.verified?.location !== undefined) node.verified.location.connectionRef = 'connection:expert-restart'
    await inventory.save([node], 0)
    await connections.save({
      connections: [sshConnection('expert-restart')],
      discoveries: [],
      adoptionReviews: [],
      accessProfiles: [],
      onboardingReviews: []
    }, 0)
    const before = await Promise.all([
      readFile(paths.inventoryFile, 'utf8'),
      readFile(paths.connectionStateFile, 'utf8')
    ])

    const directory = await createNodeDirectoryApi({
      nodeRepository: new FileSystemInventoryRepository(paths),
      connectionRepository: new FileSystemConnectionStateRepository(paths)
    }).list()

    assert.equal(directory.nodes[0]?.nodeId, node.id)
    assert.equal(directory.nodes[0]?.preferredAccessMode, 'expert')
    assert.deepEqual(await Promise.all([
      readFile(paths.inventoryFile, 'utf8'),
      readFile(paths.connectionStateFile, 'utf8')
    ]), before)
  })
})

function repository(nodes: readonly (typeof simulatedNodes)[number][]): NodeRepository {
  return { list: async () => structuredClone(nodes) }
}

function connectionRepository(
  changes: Partial<Pick<ConnectionStateSnapshot, 'connections' | 'accessProfiles'>> = {}
): ConnectionStateRepository {
  const snapshot = { ...emptyConnectionState(), ...changes }
  return {
    read: async () => structuredClone(snapshot),
    save: async () => { throw new Error('not used') },
    diagnose: async () => ({ healthy: true, checks: [] }),
    recoverLatestBackup: async () => { throw new Error('not used') }
  }
}

function binding(mode: 'quick' | 'full' | 'expert', connectionRef: string, enabled: boolean) {
  return { mode, connectionRef, enabled, capabilityClass: mode === 'quick' ? 'public-observe' as const : mode === 'full' ? 'paired-inspect' as const : 'ssh-observe' as const, verifiedAt: '2026-07-14T08:00:00.000Z' }
}

function baseConnection(id: string) {
  return { id, createdAt: '2026-07-14T08:00:00.000Z', updatedAt: '2026-07-14T08:00:00.000Z', lastTest: null }
}

function sshConnection(id: string): ConnectionRecord {
  return { ...baseConnection(id), kind: 'ssh', hostAlias: `private-${id}` }
}

function rpcConnection(id: string): ConnectionRecord {
  return { ...baseConnection(id), kind: 'public-rpc', endpoint: 'https://node.example.invalid', endpointPolicy: 'https-public' }
}

function agentConnection(id: string): ConnectionRecord {
  return {
    ...baseConnection(id),
    kind: 'agent',
    endpoint: 'https://agent.example.invalid',
    endpointPolicy: 'https-public',
    pinnedAgentIdentityDigest: 'a'.repeat(64),
    credentialRef: 'secret-store:agent',
    protocolVersion: '1.0.0',
    runtimeFlavor: 'legacy-microservices',
    scopes: ['inspect']
  }
}
