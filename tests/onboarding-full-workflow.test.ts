import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { AgentReadOnlyProbeTransport } from '../src/adapters/agent/agent-read-only-probe-transport.js'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { FileSystemOnboardingJournalRepository } from '../src/adapters/filesystem/file-system-onboarding-journal-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { LegacyMultiserviceInspectionAdapter } from '../src/adapters/inspection/legacy-multiservice-inspection-adapter.js'
import { PublicKoinosRpcInspectionAdapter } from '../src/adapters/inspection/public-koinos-rpc-inspection-adapter.js'
import { FakeNodeAgent } from '../src/adapters/simulation/fake-node-agent.js'
import { FakeProbeTransport, FakeSshAliasResolver } from '../src/adapters/simulation/fake-probe-transport.js'
import { inspectNode } from '../src/core/inspect-node.js'
import { applyOnboarding, pairFull, previewFull, previewQuick, revokeFull } from '../src/core/onboarding.js'
import { InMemorySecretStore } from '../src/core/secret-store.js'
import { INSPECTION_CHAIN_ID, INSPECTION_NOW, jsonRpc } from './helpers/inspection-fixtures.js'

const roots: string[] = []
const now = () => new Date(INSPECTION_NOW)

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))).then(() => undefined))

describe('Full Connect onboarding workflow', () => {
  it('upgrades Quick in place, survives repository restart, selects Full, and revokes it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'knm-onboarding-full-'))
    roots.push(root)
    const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
    const connectionRepository = new FileSystemConnectionStateRepository(paths, { now })
    const inventoryRepository = new FileSystemInventoryRepository(paths, { now })
    const journalRepository = new FileSystemOnboardingJournalRepository(paths)
    const quickTransport = new FakeProbeTransport({ outcome: 'success', payloads: {
      'node.multiservice.chain-id': jsonRpc({ chain_id: INSPECTION_CHAIN_ID }),
      'node.multiservice.chain-head': jsonRpc({ head_topology: { height: '1200', id: `0x${'1'.repeat(64)}` }, last_irreversible_block: '1198' }),
      'node.multiservice.p2p-status': jsonRpc({ enabled: true })
    } })
    const common = { connectionRepository, inventoryRepository, journalRepository, transport: quickTransport, adapter: new PublicKoinosRpcInspectionAdapter(), resolver: async () => [{ address: '203.0.113.20', family: 4 as const }], now }
    const quick = await previewQuick(common, { nodeId: 'stable-observer', displayName: 'Stable Observer', endpoint: 'https://rpc.example.invalid' })
    await applyOnboarding(common, quick.id, quick.digest)

    const secretStore = new InMemorySecretStore()
    const agent = new FakeNodeAgent({ now, endpoint: 'https://agent.example.invalid' })
    const agentTransport = new AgentReadOnlyProbeTransport(agent, secretStore)
    const fullServices = { ...common, agentClient: agent, agentTransport, secretStore, inspectionAdapters: [new LegacyMultiserviceInspectionAdapter()] }
    const pairing = agent.issuePairingPayload()
    const pairingReview = await previewFull(fullServices, {
      nodeId: 'stable-observer', endpoint: pairing.endpoint, pairingSessionRef: pairing.sessionId,
      expectedIdentityDigest: pairing.identityDigest
    })
    assert.equal(pairingReview.node.existing, true)
    assert.equal(pairingReview.status, 'pairing')
    assert.doesNotMatch(JSON.stringify(pairingReview), /agent\.example|credential|secret/i)
    const fullReview = await pairFull(fullServices, pairingReview.id, pairing.secret)
    assert.equal(fullReview.status, 'review-ready')
    assert.equal(fullReview.access.authority, 'paired-inspect')
    assert.equal(fullReview.inspection?.components.availability, 'available')
    await applyOnboarding(fullServices, fullReview.id, fullReview.digest)

    const state = await new FileSystemConnectionStateRepository(paths).read()
    const inventory = await new FileSystemInventoryRepository(paths).read()
    assert.equal(inventory.nodes.length, 1)
    assert.equal(inventory.nodes[0]?.id, 'stable-observer')
    assert.deepEqual(state.accessProfiles[0]?.bindings.map((binding) => binding.mode).sort(), ['full', 'quick'])
    assert.equal(state.connections.filter((connection) => connection.kind === 'agent').length, 1)
    assert.doesNotMatch(await readFile(paths.connectionStateFile, 'utf8'), new RegExp(pairing.secret))

    const snapshot = await inspectNode({
      nodeRepository: inventoryRepository,
      connectionRepository,
      aliasResolver: new FakeSshAliasResolver([]),
      probeTransport: quickTransport,
      publicRpcTransport: quickTransport,
      publicRpcAdapter: new PublicKoinosRpcInspectionAdapter(),
      agentProbeTransport: agentTransport,
      adapters: [new LegacyMultiserviceInspectionAdapter()],
      now
    }, 'stable-observer', ['overview', 'components', 'chain', 'governance'], 10_000)
    assert.equal(snapshot.node.flavor, 'legacy-microservices')
    assert.equal(snapshot.components.availability, 'available')

    const revoked = await revokeFull(fullServices, 'stable-observer')
    assert.equal(revoked.revoked, true)
    assert.equal((await connectionRepository.read()).accessProfiles[0]?.bindings.find((binding) => binding.mode === 'full')?.enabled, false)
    const fallback = await inspectNode({
      nodeRepository: inventoryRepository, connectionRepository, aliasResolver: new FakeSshAliasResolver([]),
      probeTransport: quickTransport, publicRpcTransport: quickTransport, publicRpcAdapter: new PublicKoinosRpcInspectionAdapter(),
      agentProbeTransport: agentTransport, adapters: [new LegacyMultiserviceInspectionAdapter()], now
    }, 'stable-observer', ['overview'], 10_000)
    assert.equal(fallback.node.flavor, 'unknown')

    const replacement = agent.issuePairingPayload()
    const replacementPairing = await previewFull(fullServices, {
      nodeId: 'stable-observer', endpoint: replacement.endpoint, pairingSessionRef: replacement.sessionId,
      expectedIdentityDigest: replacement.identityDigest
    })
    const replacementReview = await pairFull(fullServices, replacementPairing.id, replacement.secret)
    await applyOnboarding(fullServices, replacementReview.id, replacementReview.digest)
    const repaired = await connectionRepository.read()
    assert.equal(repaired.accessProfiles[0]?.bindings.find((binding) => binding.mode === 'full')?.enabled, true)
    assert.equal((await inventoryRepository.read()).nodes.length, 1)
  })
})
