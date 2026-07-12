import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FakeProbeTransport } from '../src/adapters/simulation/fake-probe-transport.js'
import { SshConfigAliasResolver } from '../src/adapters/ssh/ssh-config-alias-resolver.js'
import { ALLOWLISTED_REMOTE_PROBES } from '../src/adapters/ssh/ssh-read-only-probe-transport.js'
import { PROBE_KINDS } from '../src/core/probe-transport.js'
import { parsePeerManifest, parseTelenoHostManifest } from '../src/core/teleno-discovery-adapter.js'
import { validateConnectionState } from '../src/core/validate-connection-state.js'
import type { ConnectionRecord } from '../src/domain/connection.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function connection(): ConnectionRecord {
  return {
    id: 'testnet-observer', kind: 'ssh', hostAlias: 'testnet-alias',
    createdAt: '2026-07-12T10:00:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z', lastTest: null
  }
}

function hostManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    flavor: { id: 'teleno-monolith', version: '1.2.3' },
    network: { name: 'testnet', chainId: 'test-chain-id' },
    environment: 'linux',
    supervisor: { kind: 'systemd', serviceName: 'private-service-name' },
    runtime: { kind: 'native', version: '1.2.3' },
    instance: { baseDir: '/private/runtime/path', ports: { p2p: 8888, jsonrpc: 8080 } },
    artifact: { version: '1.2.3', digest: 'a'.repeat(64) },
    functions: { observer: 'enabled', producer: 'disabled', seed: 'enabled', api: 'enabled', 'backup-source': 'disabled' },
    endpoints: [{ kind: 'p2p', scope: 'public', address: 'private.example.invalid:8888' }],
    identity: { peerId: 'private-peer-id', runtimeInstanceId: 'private-runtime-id', producerAddress: null },
    capabilities: { inspect: true, configure: true, startStop: true, upgrade: true, backup: true, restore: true, logs: true },
    ...overrides
  })
}

describe('Phase 3 contracts and sanitization', () => {
  it('keeps the remote probe surface fixed, typed, and non-user-extensible', async () => {
    assert.deepEqual(Object.keys(ALLOWLISTED_REMOTE_PROBES).sort(), [...PROBE_KINDS].sort())
    assert.equal(Object.isFrozen(ALLOWLISTED_REMOTE_PROBES), true)
    assert.ok(Object.values(ALLOWLISTED_REMOTE_PROBES).every((command) => !command.includes('sudo') && !command.includes('eval')))
    const fake = new FakeProbeTransport({ outcome: 'timeout', durationMs: 30_000 })
    const response = await fake.execute({ connection: connection(), kind: 'host.inventory', timeoutMs: 30_000 })
    assert.equal(response.outcome, 'timeout')
    assert.deepEqual(fake.requests.map((request) => request.kind), ['host.inventory'])
  })

  it('resolves only exact SSH Host aliases, including bounded include files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'knm-ssh-config-'))
    roots.push(root)
    const includes = join(root, 'conf.d')
    await mkdir(includes)
    await writeFile(join(root, 'config'), 'Host exact-alias\n  HostName private.example.invalid\nHost *.wildcard\nInclude conf.d/*.conf\n')
    await writeFile(join(includes, 'test.conf'), 'Host included-alias !excluded-alias\n  User private-user\n')
    const resolver = new SshConfigAliasResolver({ configFile: join(root, 'config'), homeDirectory: root })
    assert.equal(await resolver.hasExactAlias('exact-alias'), true)
    assert.equal(await resolver.hasExactAlias('included-alias'), true)
    assert.equal(await resolver.hasExactAlias('anything.wildcard'), false)
    assert.equal(await resolver.hasExactAlias('excluded-alias'), false)
  })

  it('converts a complete Teleno manifest into sanitized evidence and evidence-based authority', () => {
    const facts = parseTelenoHostManifest(hostManifest())
    assert.equal(facts.evidenceCompleteness, 'complete')
    assert.match(facts.supervisor.serviceRef ?? '', /^service:[0-9a-f]{24}$/)
    assert.match(facts.instance.baseDirRef ?? '', /^base-dir:[0-9a-f]{24}$/)
    assert.deepEqual(facts.endpoints, [{ kind: 'p2p', scope: 'public' }])
    assert.deepEqual(facts.identity, { peerIdPresent: true, runtimeInstanceIdPresent: true, producerAddressPresent: false })
    assert.equal(facts.capabilities.producerControl, false)
    assert.equal(facts.capabilities.walletAccess, false)
    assert.doesNotMatch(JSON.stringify(facts), /private-service-name|private\/runtime\/path|private\.example|private-peer-id/)
  })

  it('returns partial authority, rejects unsupported runtimes, malformed secrets, and unsafe schemas', () => {
    const partial = parseTelenoHostManifest(hostManifest({
      capabilities: { inspect: true, configure: false, startStop: false, upgrade: false, backup: false, restore: false, logs: true }
    }))
    assert.equal(partial.evidenceCompleteness, 'partial')
    assert.throws(() => parseTelenoHostManifest(hostManifest({ flavor: { id: 'legacy-microservices', version: '1' } })), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'DISCOVERY_FLAVOR_UNAVAILABLE')
      return true
    })
    assert.throws(() => parseTelenoHostManifest(hostManifest({ apiToken: 'raw-secret-value' })), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'DISCOVERY_MANIFEST_MALFORMED')
      assert.doesNotMatch((error as Error).message, /raw-secret-value/)
      return true
    })
    const issues = validateConnectionState({ connections: [{ ...connection(), password: 'raw-secret-value' }], discoveries: [], adoptionReviews: [] })
    assert.ok(issues.length > 0)
    assert.doesNotMatch(issues.join(' '), /raw-secret-value/)
  })

  it('sanitizes peer evidence without retaining peer IDs or addresses', () => {
    const peers = parsePeerManifest(JSON.stringify({
      schemaVersion: 1,
      peers: [{ network: { name: 'testnet', chainId: 'chain' }, functions: { observer: 'enabled' }, endpointScopes: ['public'], peerId: 'private-peer-id' }]
    }))
    assert.deepEqual(peers, [{
      network: { name: 'testnet', chainId: 'chain' },
      functions: { observer: 'enabled', producer: 'unknown', seed: 'unknown', api: 'unknown', 'backup-source': 'unknown' },
      endpointScopes: ['public'],
      peerIdPresent: true
    }])
    assert.doesNotMatch(JSON.stringify(peers), /private-peer-id/)
  })
})
