import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = resolve(repositoryRoot, 'dist/cli/main.js')

const inventoryHome = mkdtempSync(join(tmpdir(), 'knm-compiled-smoke-'))
const sshConfig = join(inventoryHome, 'ssh-config')
writeFileSync(sshConfig, 'Host compiled-test-alias\n  HostName private.example.invalid\n')
const fakeSsh = join(inventoryHome, 'ssh')
const headId = `0x${'1'.repeat(64)}`
const chainId = 'compiled_testnet_chain_1234567890'
const proposalId = 'A'.repeat(43)
const components = [
  'KNM_INSPECTION_COMPONENTS_V1',
  JSON.stringify({
    service: 'chain', status: 'running', restartCount: 0,
    image: 'koinos/koinos-chain:v2.6.0', imageId: `sha256:${'a'.repeat(64)}`,
    startedAt: new Date(Date.now() - 60_000).toISOString(), ports: {}
  }),
  JSON.stringify({
    service: 'jsonrpc', status: 'running', restartCount: 0,
    image: 'koinos/koinos-jsonrpc:v2.6.0', imageId: `sha256:${'b'.repeat(64)}`,
    startedAt: new Date(Date.now() - 55_000).toISOString(),
    ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }] }
  })
].join('\n')
const fakePayloads = {
  KNM_INSPECTION_COMPONENTS_V1: components,
  'chain.get_head_info': JSON.stringify({ jsonrpc: '2.0', result: { head_topology: { id: headId, height: '42' }, last_irreversible_block: '40', head_block_time: String(Date.now() - 30_000) } }),
  'chain.get_chain_id': JSON.stringify({ jsonrpc: '2.0', result: { chain_id: chainId } }),
  'chain.get_fork_heads': JSON.stringify({ jsonrpc: '2.0', result: { last_irreversible_block: { id: headId, height: '40' }, fork_heads: [{ id: headId, height: '42' }] } }),
  'block_store.get_highest_block': JSON.stringify({ jsonrpc: '2.0', result: { topology: { id: headId, height: '42' } } }),
  'p2p.get_gossip_status': JSON.stringify({ jsonrpc: '2.0', result: { enabled: true } }),
  KNM_INSPECTION_CONFIG_V1: ['KNM_INSPECTION_CONFIG_V1', `configuredProposal=${proposalId}`, 'producerAddressPresent=false', 'instancePresent=true'].join('\n'),
  KNM_INSPECTION_RESOURCES_V1: ['KNM_INSPECTION_RESOURCES_V1', JSON.stringify({ schemaVersion: 1, storage: { totalBytes: 1000, usedBytes: 400, freeBytes: 600 } })].join('\n')
}
writeFileSync(fakeSsh, `#!/usr/bin/env node
const command = process.argv.at(-1) ?? ''
const payloads = ${JSON.stringify(fakePayloads)}
for (const [marker, payload] of Object.entries(payloads)) {
  if (command.includes(marker)) { process.stdout.write(payload + '\\n'); process.exit(0) }
}
process.exit(64)
`)
chmodSync(fakeSsh, 0o700)

function run(args) {
  return execFileSync(process.execPath, [executable, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${inventoryHome}:${process.env.PATH ?? ''}`,
      KNM_HOME: inventoryHome,
      KNM_SSH_CONFIG: sshConfig
    }
  })
}

try {
  const version = JSON.parse(run(['version', '--output', 'json']))
  assert.equal(version.schemaVersion, 2)
  assert.equal(version.command, 'version')
  assert.equal(version.data.build.productName, 'Koinos Node Manager')
  assert.match(version.data.build.gitCommit, /^(?:[0-9a-f]{40}|unknown)$/)
  assert.match(version.data.build.buildTimestamp, /^\d{4}-\d{2}-\d{2}T/)

  const nodes = JSON.parse(run(['--simulation', 'empty', 'nodes', 'list', '--output', 'json']))
  assert.equal(nodes.command, 'nodes.list')
  assert.equal(nodes.data.total, 0)

  const detail = JSON.parse(run(['--simulation', 'default', 'nodes', 'show', 'node-home-observer', '--section', 'verified', '--output', 'json']))
  assert.equal(detail.schemaVersion, 2)
  assert.equal(detail.query.section, 'verified')
  assert.equal('verified' in detail.data.node, true)
  assert.equal('observed' in detail.data.node, false)

  assert.match(run(['nodes', '--help']), /nodes list/)
  assert.match(run(['interactive', '--help']), /Start a prompt-driven session over local or simulated inventory/)

  const added = JSON.parse(run([
    'nodes', 'add', '--id', 'compiled-observer', '--name', 'Compiled Observer',
    '--flavor', 'legacy-microservices', '--network', 'testnet', '--location', 'remote',
    '--authority', 'observe', '--connection-ref', 'connection:compiled-target', '--output', 'json'
  ]))
  assert.equal(added.command, 'nodes.add')
  assert.equal(added.data.revision, 1)
  const persisted = JSON.parse(run(['nodes', 'list', '--output', 'json']))
  assert.deepEqual(persisted.data.nodes.map((node) => node.id), ['compiled-observer'])
  const connection = JSON.parse(run([
    'connections', 'add', 'ssh', '--id', 'compiled-target', '--host-alias', 'compiled-test-alias', '--output', 'json'
  ]))
  assert.equal(connection.command, 'connections.add.ssh')
  assert.equal(connection.data.connection.hostAlias, '<SSH_ALIAS_PRESENT>')
  const connections = JSON.parse(run(['connections', 'list', '--output', 'json']))
  assert.deepEqual(connections.data.connections.map((item) => item.id), ['compiled-target'])
  const inspection = JSON.parse(run(['nodes', 'inspect', 'compiled-observer', '--output', 'json']))
  assert.equal(inspection.command, 'nodes.inspect')
  assert.equal(inspection.data.snapshot.schemaVersion, 1)
  assert.equal(inspection.data.snapshot.readOnly, true)
  assert.equal(inspection.data.runtimeChanged, false)
  assert.equal(inspection.data.persisted, false)
  assert.equal(inspection.data.snapshot.chain.head.value.height, 42)
  assert.deepEqual(inspection.data.snapshot.governance.configuredProposalIds.value, [proposalId])
  assert.doesNotMatch(JSON.stringify(inspection), /compiled-test-alias|private\.example|127\.0\.0\.1|HostIp|HostPort|koinos\/koinos-/)
  assert.match(run(['nodes', 'inspect', 'compiled-observer', '--section', 'components']), /Read-only inspection completed/)
  assert.match(run(['nodes', 'adoption', '--help']), /nodes adoption plan/)
  const doctor = JSON.parse(run(['doctor', '--output', 'json']))
  assert.equal(doctor.command, 'doctor')
  assert.equal(doctor.data.healthy, true)
  assert.equal(doctor.data.remoteHostsContacted, false)
  const removed = JSON.parse(run([
    'nodes', 'remove', 'compiled-observer', '--confirm', 'compiled-observer', '--output', 'json'
  ]))
  assert.equal(removed.data.inventoryOnly, true)
  assert.equal(removed.data.runtimeChanged, false)
  const removedConnection = JSON.parse(run([
    'connections', 'remove', 'compiled-target', '--confirm', 'compiled-target', '--output', 'json'
  ]))
  assert.equal(removedConnection.data.metadataOnly, true)

  const nonInteractiveTerminal = spawnSync(process.execPath, [executable, 'interactive'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  })
  assert.equal(nonInteractiveTerminal.status, 2)
  assert.match(nonInteractiveTerminal.stderr, /INTERACTIVE_TTY_REQUIRED/)
  process.stdout.write('Compiled CLI smoke validation passed.\n')
} finally {
  rmSync(inventoryHome, { recursive: true, force: true })
}
