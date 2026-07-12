import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { SshReadOnlyProbeTransport } from '../src/adapters/ssh/ssh-read-only-probe-transport.js'
import type { ConnectionRecord } from '../src/domain/connection.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function connection(): ConnectionRecord {
  return {
    id: 'target', kind: 'ssh', hostAlias: 'configured-alias',
    createdAt: '2026-07-12T10:00:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z', lastTest: null
  }
}

async function executable(body: string): Promise<{ path: string; argsFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'knm-fake-ssh-'))
  roots.push(root)
  const path = join(root, 'fake-ssh.mjs')
  const argsFile = join(root, 'args.json')
  await writeFile(path, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))\n${body}\n`)
  await chmod(path, 0o700)
  return { path, argsFile }
}

describe('SSH read-only probe transport', () => {
  it('passes only bounded fixed SSH arguments and returns handshake success', async () => {
    const fake = await executable("process.stdout.write('KNM_HANDSHAKE_V1\\n')")
    const transport = new SshReadOnlyProbeTransport({ sshExecutable: fake.path, sshConfigFile: '/private/ssh-config' })
    const result = await transport.execute({ connection: connection(), kind: 'connection.handshake', timeoutMs: 5_000 })
    assert.equal(result.outcome, 'success')
    assert.equal(result.payload, 'KNM_HANDSHAKE_V1')
    const args = JSON.parse(await readFile(fake.argsFile, 'utf8')) as string[]
    assert.deepEqual(args.slice(0, 2), ['-F', '/private/ssh-config'])
    assert.ok(args.includes('BatchMode=yes'))
    assert.ok(args.includes('ConnectTimeout=5'))
    assert.equal(args[args.indexOf('--') + 1], 'configured-alias')
    assert.equal(args[args.indexOf('--') + 2], 'sh')
    assert.equal(args[args.indexOf('--') + 3], '-lc')
    assert.doesNotMatch(JSON.stringify(args), /HostName|private-user|private-key/)
  })

  it('classifies authentication failure, unsupported probe, unreachable host, malformed response, and timeout', async () => {
    const cases = [
      { body: "process.stderr.write('Permission denied (publickey)\\n'); process.exit(255)", expected: 'authentication-failed', timeoutMs: 5_000 },
      { body: 'process.exit(64)', expected: 'unsupported', timeoutMs: 5_000 },
      { body: "process.stderr.write('No route to host\\n'); process.exit(255)", expected: 'unreachable', timeoutMs: 5_000 },
      { body: "process.stdout.write('unexpected\\n')", expected: 'malformed', timeoutMs: 5_000 },
      { body: 'setTimeout(() => {}, 5_000)', expected: 'timeout', timeoutMs: 1_000 }
    ] as const
    for (const testCase of cases) {
      const fake = await executable(testCase.body)
      const transport = new SshReadOnlyProbeTransport({ sshExecutable: fake.path })
      const result = await transport.execute({ connection: connection(), kind: 'connection.handshake', timeoutMs: testCase.timeoutMs })
      assert.equal(result.outcome, testCase.expected)
      assert.equal(result.payload, null)
      assert.ok(result.durationMs >= 0 && result.durationMs <= 30_000)
    }
  })
})
