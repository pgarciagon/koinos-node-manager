import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import type { AgentClient, AgentEndpoint } from '../../core/agent-client.js'
import { agentError } from '../../core/agent-protocol.js'
import { approveEndpoint, type AddressResolver, type ApprovedEndpoint } from '../../core/endpoint-policy.js'
import type {
  AgentDiscoveryDocument,
  AgentPairingRequest,
  AgentPairingResponse,
  AgentProbeRequest,
  AgentProbeResponse,
  AgentRevocationRequest,
  AgentRevocationResponse
} from '../../domain/agent-protocol.js'

const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_JSON_DEPTH = 32

export type HttpsAgentClientOptions = {
  resolver?: AddressResolver
  allowLoopbackHttp?: boolean
}

export class HttpsAgentClient implements AgentClient {
  readonly #resolver: AddressResolver | undefined
  readonly #allowLoopbackHttp: boolean
  #active = 0

  constructor(options: HttpsAgentClientOptions = {}) {
    this.#resolver = options.resolver
    this.#allowLoopbackHttp = options.allowLoopbackHttp ?? false
  }

  async discover(target: AgentEndpoint, timeoutMs: number): Promise<AgentDiscoveryDocument> {
    return this.#request(target, '/.well-known/koinos-node-agent', 'GET', undefined, undefined, timeoutMs)
  }

  async pair(target: AgentEndpoint, request: AgentPairingRequest, timeoutMs: number): Promise<AgentPairingResponse> {
    return this.#request(target, '/v1/pair', 'POST', request, undefined, timeoutMs)
  }

  async probe(target: AgentEndpoint, credential: string, request: AgentProbeRequest, timeoutMs: number): Promise<AgentProbeResponse> {
    return this.#request(target, '/v1/probes', 'POST', request, credential, timeoutMs)
  }

  async revoke(target: AgentEndpoint, credential: string, request: AgentRevocationRequest, timeoutMs: number): Promise<AgentRevocationResponse> {
    return this.#request(target, '/v1/credentials/revoke', 'POST', request, credential, timeoutMs)
  }

  async #request<T>(
    target: AgentEndpoint,
    path: '/.well-known/koinos-node-agent' | '/v1/pair' | '/v1/probes' | '/v1/credentials/revoke',
    method: 'GET' | 'POST',
    body: object | undefined,
    credential: string | undefined,
    timeoutMs: number
  ): Promise<T> {
    if (this.#active >= 8) throw agentError('AGENT_CONCURRENCY_LIMIT', true, 'The bounded node-agent concurrency limit was reached.')
    this.#active += 1
    try {
    const approved = await approveEndpoint({
      endpoint: target.endpoint,
      allowPrivate: target.endpointPolicy === 'https-private-reviewed',
      allowLoopbackHttp: this.#allowLoopbackHttp && target.endpointPolicy === 'http-loopback-development'
    }, this.#resolver)
    const url = new URL(path, approved.url.origin)
    let raw: string
    try {
      raw = await fixedAgentRequest(approved, url, method, body, credential, boundedTimeout(timeoutMs))
    } catch (error: unknown) {
      const code = error instanceof Error && error.message === 'timeout' ? 'AGENT_TIMEOUT' : 'AGENT_UNREACHABLE'
      throw agentError(code, code === 'AGENT_TIMEOUT', code === 'AGENT_TIMEOUT' ? 'The node agent request timed out.' : 'The node agent could not be reached securely.')
    }
    try {
      const value = JSON.parse(raw) as unknown
      if (!isObject(value) || jsonDepth(value) > MAX_JSON_DEPTH) throw new Error('malformed')
      return value as T
    } catch {
      throw agentError('AGENT_PROTOCOL_MALFORMED', false, 'The node agent returned a malformed response.')
    }
    } finally {
      this.#active -= 1
    }
  }
}

function fixedAgentRequest(
  approved: ApprovedEndpoint,
  url: URL,
  method: 'GET' | 'POST',
  value: object | undefined,
  credential: string | undefined,
  timeoutMs: number
): Promise<string> {
  const body = value === undefined ? '' : JSON.stringify(value)
  if (body.length > 64 * 1024) return Promise.reject(new Error('malformed'))
  const selected = approved.addresses[0]
  if (selected === undefined) return Promise.reject(new Error('unreachable'))
  const transport = url.protocol === 'https:' ? https : http
  const lookup: LookupFunction = (_hostname, _options, callback) => callback(null, selected.address, selected.family)
  return new Promise((resolve, reject) => {
    const totalTimer = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs)
    const request = transport.request(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === '' ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }),
        ...(credential === undefined ? {} : { authorization: `Bearer ${credential}` })
      },
      lookup,
      ...(url.protocol === 'https:' ? { servername: approved.url.hostname } : {})
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
        if (total > MAX_RESPONSE_BYTES) request.destroy(new Error('malformed'))
        else chunks.push(chunk)
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

function boundedTimeout(value: number): number {
  return Math.max(1_000, Math.min(30_000, Math.trunc(value)))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonDepth(value: unknown, depth = 0): number {
  if (typeof value !== 'object' || value === null) return depth
  if (depth > 64) return depth
  const nested = Array.isArray(value) ? value : Object.values(value)
  return nested.reduce((maximum, item) => Math.max(maximum, jsonDepth(item, depth + 1)), depth)
}
