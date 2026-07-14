import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { runCli } from '../src/cli/batch-cli.js'

const roots: string[] = []
let previousHome: string | undefined
let previousLoopback: string | undefined

beforeEach(async () => {
  previousHome = process.env.KNM_HOME
  previousLoopback = process.env.KNM_ALLOW_LOOPBACK_HTTP
  const root = await mkdtemp(join(tmpdir(), 'knm-cli-onboarding-'))
  roots.push(root)
  process.env.KNM_HOME = root
  process.env.KNM_ALLOW_LOOPBACK_HTTP = '1'
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.KNM_HOME
  else process.env.KNM_HOME = previousHome
  if (previousLoopback === undefined) delete process.env.KNM_ALLOW_LOOPBACK_HTTP
  else process.env.KNM_ALLOW_LOOPBACK_HTTP = previousLoopback
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Quick Connect CLI', () => {
  it('keeps endpoint input out of arguments and returns equivalent human and structured reviews', async () => {
    const server = await rpcServer()
    try {
      const endpoint = `http://127.0.0.1:${server.port}/rpc`
      const preview = await runCli([
        'onboarding', 'quick', 'preview', '--id', 'quick-cli', '--name', 'Quick CLI',
        '--rpc-endpoint-stdin', '--allow-loopback-http', '--output', 'json'
      ], [endpoint])
      assert.equal(preview.code, 0, preview.stderr)
      assert.doesNotMatch(preview.stdout ?? '', /127\.0\.0\.1|\/rpc/)
      const envelope = JSON.parse(preview.stdout as string) as { data: { review: { id: string; digest: string; mode: string } } }
      const review = envelope.data.review
      assert.equal(review.mode, 'quick')
      const status = await runCli(['onboarding', 'status', review.id, '--output', 'json'])
      assert.equal(status.code, 0)
      assert.doesNotMatch(status.stdout ?? '', /127\.0\.0\.1|\/rpc/)
      const apply = await runCli(['onboarding', 'quick', 'apply', review.id, '--confirm', review.digest, '--output', 'json'])
      assert.equal(apply.code, 0, apply.stderr)
      const inspect = await runCli(['nodes', 'inspect', 'quick-cli', '--access', 'quick', '--output', 'json'])
      assert.equal(inspect.code, 0, inspect.stderr)
      assert.match(inspect.stdout ?? '', /QUICK_INSPECTION_LIMITED/)
      assert.doesNotMatch(inspect.stdout ?? '', /127\.0\.0\.1|\/rpc/)
      assert.match(await readFile(join(process.env.KNM_HOME as string, 'connection-state.json'), 'utf8'), /127\.0\.0\.1/)
      assert.doesNotMatch(await readFile(join(process.env.KNM_HOME as string, 'inventory.json'), 'utf8'), /127\.0\.0\.1/)
    } finally {
      await server.close()
    }
  })

  it('returns stable typed errors without echoing private input', async () => {
    const endpoint = 'https://user:private-value@example.invalid/rpc'
    const result = await runCli(['onboarding', 'quick', 'preview', '--id', 'bad', '--rpc-endpoint-stdin', '--output', 'json'], [endpoint])
    assert.equal(result.code, 2)
    assert.match(result.stderr ?? '', /ONBOARDING_ENDPOINT_INVALID/)
    assert.doesNotMatch(result.stderr ?? '', /private-value|example\.invalid/)
  })
})

async function rpcServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { method: string; id: string }
      const result = body.method === 'chain.get_chain_id'
        ? { chain_id: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==' }
        : body.method === 'chain.get_head_info'
          ? { head_topology: { height: '1200', id: `0x${'1'.repeat(64)}` }, last_irreversible_block: '1198', head_block_time: String(Date.now() - 10_000) }
          : body.method === 'p2p.get_gossip_status'
            ? { enabled: true }
            : null
      response.writeHead(result === null ? 404 : 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server failed')
  return { port: address.port, close: () => new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))) }
}
