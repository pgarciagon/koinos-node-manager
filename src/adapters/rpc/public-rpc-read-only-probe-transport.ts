import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { approveEndpoint, type AddressResolver, type ApprovedEndpoint } from '../../core/endpoint-policy.js'
import type { ProbeRequest, ProbeResponse, RuntimeInspectionProbeKind } from '../../core/probe-transport.js'
import type { ReadOnlyProbeTransport } from '../../core/probe-transport.js'

const METHODS: Readonly<Partial<Record<RuntimeInspectionProbeKind, string>>> = {
  'node.multiservice.chain-id': 'chain.get_chain_id',
  'node.multiservice.chain-head': 'chain.get_head_info',
  'node.multiservice.p2p-status': 'p2p.get_gossip_status',
  'node.teleno.status': 'node.get_status'
}

export type PublicRpcTransportOptions = {
  resolver?: AddressResolver
  allowLoopbackHttp?: boolean
  maxResponseBytes?: number
  maxJsonDepth?: number
  maxConcurrency?: number
}

export class PublicRpcReadOnlyProbeTransport implements ReadOnlyProbeTransport {
  readonly #resolver: AddressResolver | undefined
  readonly #allowLoopbackHttp: boolean
  readonly #maxResponseBytes: number
  readonly #maxJsonDepth: number
  readonly #maxConcurrency: number
  #active = 0

  constructor(options: PublicRpcTransportOptions = {}) {
    this.#resolver = options.resolver
    this.#allowLoopbackHttp = options.allowLoopbackHttp ?? false
    this.#maxResponseBytes = options.maxResponseBytes ?? 256 * 1024
    this.#maxJsonDepth = options.maxJsonDepth ?? 32
    this.#maxConcurrency = Math.max(1, Math.min(8, options.maxConcurrency ?? 4))
  }

  async execute(request: ProbeRequest): Promise<ProbeResponse> {
    const started = Date.now()
    if (this.#active >= this.#maxConcurrency) return response('timeout', started)
    this.#active += 1
    try {
    if (request.connection.kind !== 'public-rpc') return response('unsupported', started)
    const method = METHODS[request.kind as RuntimeInspectionProbeKind]
    if (method === undefined) return response('unsupported', started)
    let approved: ApprovedEndpoint
    try {
      approved = await approveEndpoint({
        endpoint: request.connection.endpoint,
        allowPrivate: request.connection.endpointPolicy === 'https-private-reviewed',
        allowLoopbackHttp: this.#allowLoopbackHttp && request.connection.endpointPolicy === 'http-loopback-development'
      }, this.#resolver)
    } catch {
      return response('unreachable', started)
    }
    const timeoutMs = Math.max(1000, Math.min(30000, Math.trunc(request.timeoutMs)))
    try {
      const payload = await fixedJsonRpcRequest(approved, method, timeoutMs, this.#maxResponseBytes)
      const parsed = JSON.parse(payload) as unknown
      if (jsonDepth(parsed) > this.#maxJsonDepth || !validJsonRpcEnvelope(parsed)) return response('malformed', started)
      return response('success', started, payload)
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'timeout') return response('timeout', started)
      if (error instanceof Error && error.message === 'malformed') return response('malformed', started)
      return response('unreachable', started)
    }
    } finally {
      this.#active -= 1
    }
  }
}

function fixedJsonRpcRequest(approved: ApprovedEndpoint, method: string, timeoutMs: number, maxBytes: number): Promise<string> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'knm-onboarding', method, params: {} })
  const selected = approved.addresses[0]
  if (selected === undefined) return Promise.reject(new Error('unreachable'))
  const transport = approved.url.protocol === 'https:' ? https : http
  const lookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, selected.address, selected.family)
  }
  return new Promise((resolve, reject) => {
    const totalTimer = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs)
    const request = transport.request(approved.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
      lookup,
      ...(approved.url.protocol === 'https:' ? { servername: approved.url.hostname } : {})
    }, (incoming) => {
      if (incoming.statusCode !== 200 || incoming.headers.location !== undefined) {
        incoming.resume()
        reject(new Error('unreachable'))
        return
      }
      const chunks: Buffer[] = []
      let total = 0
      incoming.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > maxBytes) {
          request.destroy(new Error('malformed'))
          return
        }
        chunks.push(chunk)
      })
      incoming.on('end', () => {
        clearTimeout(totalTimer)
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('timeout')))
    request.on('error', (error) => {
      clearTimeout(totalTimer)
      reject(error)
    })
    request.end(body)
  })
}

function validJsonRpcEnvelope(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (value as { jsonrpc?: unknown }).jsonrpc === '2.0'
    && !('error' in value)
    && 'result' in value
}

function jsonDepth(value: unknown, depth = 0): number {
  if (typeof value !== 'object' || value === null) return depth
  if (depth > 64) return depth
  const nested = Array.isArray(value) ? value : Object.values(value)
  return nested.reduce((max, item) => Math.max(max, jsonDepth(item, depth + 1)), depth)
}

function response(outcome: ProbeResponse['outcome'], started: number, payload: string | null = null): ProbeResponse {
  return { outcome, durationMs: Math.max(0, Date.now() - started), payload }
}
