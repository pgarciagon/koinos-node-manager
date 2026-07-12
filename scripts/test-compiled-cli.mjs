import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = resolve(repositoryRoot, 'dist/cli/main.js')

const inventoryHome = mkdtempSync(join(tmpdir(), 'knm-compiled-smoke-'))
const sshConfig = join(inventoryHome, 'ssh-config')
writeFileSync(sshConfig, 'Host compiled-test-alias\n  HostName private.example.invalid\n')

function run(args) {
  return execFileSync(process.execPath, [executable, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, KNM_HOME: inventoryHome, KNM_SSH_CONFIG: sshConfig }
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
    '--network', 'testnet', '--output', 'json'
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
