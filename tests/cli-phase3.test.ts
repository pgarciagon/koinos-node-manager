import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { promisify } from 'node:util'
import { FileSystemConnectionStateRepository } from '../src/adapters/filesystem/file-system-connection-state-repository.js'
import { FileSystemInventoryRepository } from '../src/adapters/filesystem/file-system-inventory-repository.js'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'
import { FakeProbeTransport, FakeSshAliasResolver } from '../src/adapters/simulation/fake-probe-transport.js'
import { getBuildIdentity } from '../src/core/build-identity.js'
import type { ApplicationContext, InventorySource } from '../src/cli/application-context.js'
import { cliCommandRegistry } from '../src/cli/command-catalog.js'
import { executeCommand } from '../src/cli/execution/command-executor.js'
import { runInteractiveSession } from '../src/cli/interactive/interactive-session.js'
import { FakeInteractiveTerminal, lines } from './helpers/fake-interactive-terminal.js'

const execFileAsync = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function root() {
  const value = await mkdtemp(join(tmpdir(), 'knm-cli-phase3-'))
  roots.push(value)
  return value
}

async function cli(home: string, sshConfig: string, args: readonly string[]) {
  return execFileAsync('npm', ['run', '--silent', 'cli', '--', ...args], {
    env: { ...process.env, KNM_HOME: home, KNM_SSH_CONFIG: sshConfig }
  })
}

function hostManifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    flavor: { id: 'teleno-monolith', version: '1.2.3' },
    network: { name: 'testnet', chainId: 'test-chain-id' },
    environment: 'linux',
    supervisor: { kind: 'systemd', serviceName: 'private-service' },
    runtime: { kind: 'native', version: '1.2.3' },
    instance: { baseDir: '/private/data', ports: { p2p: 8888 } },
    artifact: { version: '1.2.3', digest: 'c'.repeat(64) },
    functions: { observer: 'enabled', producer: 'disabled', seed: 'enabled', api: 'enabled', 'backup-source': 'disabled' },
    endpoints: [{ kind: 'p2p', scope: 'public', address: 'private.example.invalid:8888' }],
    identity: { peerId: 'private-peer', runtimeInstanceId: 'private-instance', producerAddress: null },
    capabilities: { inspect: true, configure: true, startStop: true, upgrade: true, backup: true, restore: true, logs: true }
  })
}

describe('Phase 3 CLI and interactive parity', () => {
  it('persists opaque connection references across CLI process restarts without displaying aliases', async () => {
    const home = await root()
    const sshConfig = join(home, 'ssh-config')
    await writeFile(sshConfig, 'Host private-test-alias\n  HostName private.example.invalid\n  User private-user\n')
    const added = JSON.parse((await cli(home, sshConfig, ['connections', 'add', 'ssh', '--id', 'test-target', '--host-alias', 'private-test-alias', '--output', 'json'])).stdout) as {
      schemaVersion: number; command: string; data: { revision: number; connection: { id: string; hostAlias: string } }
    }
    assert.equal(added.schemaVersion, 2)
    assert.equal(added.command, 'connections.add.ssh')
    assert.equal(added.data.connection.hostAlias, '<SSH_ALIAS_PRESENT>')
    assert.doesNotMatch(JSON.stringify(added), /private-test-alias|private-user|private\.example/)

    const restarted = await cli(home, sshConfig, ['connections', 'show', 'test-target', '--output', 'json'])
    assert.match(restarted.stdout, /<SSH_ALIAS_PRESENT>/)
    assert.doesNotMatch(restarted.stdout, /private-test-alias/)
    const doctor = JSON.parse((await cli(home, sshConfig, ['doctor', '--output', 'json'])).stdout) as {
      data: { healthy: boolean; remoteHostsContacted: boolean; checks: Array<{ id: string }> }
    }
    assert.equal(doctor.data.healthy, true)
    assert.equal(doctor.data.remoteHostsContacted, false)
    assert.ok(doctor.data.checks.some((check) => check.id === 'connection-state-file'))
    assert.ok(doctor.data.checks.some((check) => check.id === 'discovery-source-integrity'))
    assert.ok(doctor.data.checks.some((check) => check.id === 'remote-connection-probes'))
    const removed = JSON.parse((await cli(home, sshConfig, ['connections', 'remove', 'test-target', '--confirm', 'test-target', '--output', 'json'])).stdout) as { data: { metadataOnly: boolean } }
    assert.equal(removed.data.metadataOnly, true)
    await writeFile(join(home, 'connection-state.json'), '{ corrupt connection state')
    await assert.rejects(cli(home, sshConfig, ['doctor', '--output', 'json']), (error: unknown) => {
      const result = error as { code: number; stdout: string }
      assert.equal(result.code, 4)
      const report = JSON.parse(result.stdout) as { data: { healthy: boolean; checks: Array<{ id: string; status: string }> } }
      assert.equal(report.data.healthy, false)
      assert.equal(report.data.checks.find((check) => check.id === 'connection-state-file')?.status, 'fail')
      return true
    })
    assert.equal(await readFile(join(home, 'connection-state.json'), 'utf8'), '{ corrupt connection state')
  })

  it('uses the same registry handlers and dynamic completion in batch and interactive modes', async () => {
    const home = await root()
    const paths = resolveInventoryPaths({ env: { KNM_HOME: home } })
    const inventory = new FileSystemInventoryRepository(paths)
    const state = new FileSystemConnectionStateRepository(paths)
    const resolver = new FakeSshAliasResolver(['configured-alias'])
    const transport = new FakeProbeTransport({ outcome: 'success', payloads: { 'host.inventory': hostManifest() } })
    const context: ApplicationContext = {
      nodeRepository: inventory,
      inventoryRepository: inventory,
      connectionStateRepository: state,
      aliasResolver: resolver,
      probeTransport: transport,
      inventorySource: { kind: 'local' },
      paths
    }
    const contextFor = (_source: InventorySource) => context
    const dependencies = { registry: cliCommandRegistry, createApplicationContext: contextFor }
    const execute = (args: readonly string[]) => executeCommand({ args, inventorySource: { kind: 'local' } }, dependencies)

    assert.equal((await execute(['connections', 'add', 'ssh', '--id', 'test-target', '--host-alias', 'configured-alias'])).code, 0)
    const inspection = await execute(['nodes', 'adoption', 'inspect', '--connection', 'test-target', '--output', 'json'])
    assert.equal(inspection.code, 0)
    const discoveryId = (JSON.parse(inspection.stdout ?? '{}') as { data: { discovery: { id: string } } }).data.discovery.id
    const planned = await execute(['nodes', 'adoption', 'plan', '--discovery', discoveryId, '--id', 'interactive-node', '--name', 'Interactive Node', '--output', 'json'])
    const review = (JSON.parse(planned.stdout ?? '{}') as { data: { review: { id: string; digest: string } } }).data.review
    const applied = await execute(['nodes', 'adoption', 'apply', review.id, '--confirm', review.digest, '--output', 'json'])
    assert.equal(applied.code, 0)
    assert.equal((JSON.parse(applied.stdout ?? '{}') as { data: { inventoryOnly: boolean; runtimeChanged: boolean } }).data.inventoryOnly, true)
    const requestsBeforeDoctor = transport.requests.length
    const localDoctor = await execute(['doctor', '--output', 'json'])
    assert.equal((JSON.parse(localDoctor.stdout ?? '{}') as { data: { remoteHostsContacted: boolean } }).data.remoteHostsContacted, false)
    assert.equal(transport.requests.length, requestsBeforeDoctor)
    const remoteDoctor = await execute(['doctor', '--check-connections', '--output', 'json'])
    assert.equal((JSON.parse(remoteDoctor.stdout ?? '{}') as { data: { remoteHostsContacted: boolean } }).data.remoteHostsContacted, true)
    assert.equal(transport.requests.at(-1)?.kind, 'connection.handshake')

    const terminal = new FakeInteractiveTerminal(lines(
      'connections list --output json',
      'discoveries list --output json',
      'nodes adoption list --output json',
      '/exit'
    ))
    const result = await runInteractiveSession({
      terminal,
      executeCommand: (args, options = {}) => executeCommand({ args, inventorySource: options.inventorySource ?? { kind: 'local' } }, dependencies),
      registry: cliCommandRegistry,
      identity: getBuildIdentity(),
      initialSource: { kind: 'local' },
      scenarios: new Map(),
      nodeIdsForSource: async () => (await inventory.list()).map((node) => node.id),
      phase3IdsForSource: async () => {
        const snapshot = await state.read()
        return {
          connectionIds: snapshot.connections.map((connection) => connection.id),
          discoveryIds: snapshot.discoveries.map((discovery) => discovery.id),
          adoptionIds: snapshot.adoptionReviews.map((candidate) => candidate.id)
        }
      }
    })
    assert.equal(result, 0)
    assert.ok(terminal.complete('connections show test')[0].includes('test-target'))
    assert.ok(terminal.complete('discoveries show discovery_')[0].includes(discoveryId))
    assert.ok(terminal.complete('nodes adoption apply adoption_')[0].includes(review.id))
    assert.match(terminal.output.join('\n'), /"command": "connections.list"/)
    assert.match(terminal.output.join('\n'), /"command": "discoveries.list"/)
    assert.match(terminal.output.join('\n'), /"command": "nodes.adoption.list"/)
    assert.deepEqual(terminal.errors, [])
  })
})
