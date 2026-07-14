import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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
import type { ApplicationContext, InventorySource } from '../src/cli/application-context.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'
import { InMemorySecretStore } from '../src/core/secret-store.js'

const roots: string[] = []

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))).then(() => undefined))

describe('Full Connect CLI', () => {
  it('previews, pairs through private input, applies, inspects, and revokes without public secret leakage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'knm-cli-full-'))
    roots.push(root)
    const paths = resolveInventoryPaths({ env: { KNM_HOME: root } })
    const inventory = new FileSystemInventoryRepository(paths)
    const connections = new FileSystemConnectionStateRepository(paths)
    const journal = new FileSystemOnboardingJournalRepository(paths)
    const secrets = new InMemorySecretStore()
    const agent = new FakeNodeAgent({ endpoint: 'https://127.0.0.1:9443' })
    const pairing = agent.issuePairingPayload()
    const agentTransport = new AgentReadOnlyProbeTransport(agent, secrets)
    const unsupported = new FakeProbeTransport({ outcome: 'unsupported' })
    const context: ApplicationContext = {
      nodeRepository: inventory,
      inventoryRepository: inventory,
      connectionStateRepository: connections,
      aliasResolver: new FakeSshAliasResolver([]),
      probeTransport: unsupported,
      inspectionAdapters: [new LegacyMultiserviceInspectionAdapter()],
      publicRpcTransport: unsupported,
      publicRpcAdapter: new PublicKoinosRpcInspectionAdapter(),
      onboardingJournalRepository: journal,
      agentClient: agent,
      agentProbeTransport: agentTransport,
      secretStore: secrets,
      inventorySource: { kind: 'local' },
      paths
    }
    const dependencies = { registry: cliCommandRegistry, createApplicationContext: (_source: InventorySource) => context }
    const execute = (args: readonly string[], privateInputs: readonly string[] = []) => executeCommand({ args, privateInputs, inventorySource: { kind: 'local' } }, dependencies)

    const previewResult = await execute([
      'onboarding', 'full', 'preview', '--id', 'full-cli', '--name', 'Full CLI', '--agent-endpoint-stdin',
      '--pairing-session', pairing.sessionId, '--identity-digest', pairing.identityDigest, '--allow-private', '--output', 'json'
    ], [pairing.endpoint])
    assert.equal(previewResult.code, 0, previewResult.stderr)
    const previewText = previewResult.stdout ?? ''
    assert.doesNotMatch(previewText, /127\.0\.0\.1|9443/)
    const preview = JSON.parse(previewText) as { data: { review: { id: string; status: string } } }
    assert.equal(preview.data.review.status, 'pairing')

    const pairResult = await execute(['onboarding', 'full', 'pair', preview.data.review.id, '--pairing-secret-stdin', '--output', 'json'], [pairing.secret])
    assert.equal(pairResult.code, 0, pairResult.stderr)
    assert.doesNotMatch(pairResult.stdout ?? '', new RegExp(pairing.secret))
    const paired = JSON.parse(pairResult.stdout ?? '{}') as { data: { review: { id: string; digest: string; status: string } } }
    assert.equal(paired.data.review.status, 'review-ready')
    const applied = await execute(['onboarding', 'full', 'apply', paired.data.review.id, '--confirm', paired.data.review.digest, '--output', 'json'])
    assert.equal(applied.code, 0, applied.stderr)
    const inspection = await execute(['nodes', 'inspect', 'full-cli', '--output', 'json'])
    assert.equal(inspection.code, 0, inspection.stderr)
    assert.match(inspection.stdout ?? '', /legacy-microservices/)
    assert.doesNotMatch(inspection.stdout ?? '', /127\.0\.0\.1|9443|credentialRef|identityDigest/)
    const revoked = await execute(['onboarding', 'full', 'revoke', 'full-cli', '--confirm', 'full-cli', '--output', 'json'])
    assert.equal(revoked.code, 0, revoked.stderr)
    assert.match(revoked.stdout ?? '', /"revoked": true/)
  })

  it('does not accept pairing secrets or agent endpoints as ordinary command arguments', async () => {
    const fullPreview = cliCommandRegistry.resolve(['onboarding', 'full', 'preview'])?.definition
    const fullPair = cliCommandRegistry.resolve(['onboarding', 'full', 'pair'])?.definition
    assert.match(fullPreview?.usage ?? '', /agent-endpoint-stdin/)
    assert.match(fullPair?.usage ?? '', /pairing-secret-stdin/)
    assert.doesNotMatch(fullPreview?.usage ?? '', /--endpoint </)
    assert.doesNotMatch(fullPair?.usage ?? '', /--secret </)
  })
})
