import { createHash } from 'node:crypto'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import type { HostDiscoveryFacts, PeerDiscoveryFact } from '../domain/connection.js'
import {
  ENDPOINT_SCOPES,
  NETWORKS,
  NODE_ENVIRONMENTS,
  NODE_FUNCTIONS,
  type NodeAuthority,
  type NodeFunctions
} from '../domain/node.js'

const SENSITIVE_KEY = /password|passphrase|private.?key|api.?key|token|secret|mnemonic|seed.?phrase/i
const ENDPOINT_KINDS = ['p2p', 'jsonrpc', 'grpc', 'admin', 'backup'] as const
const SUPERVISORS = ['foreground', 'launchd', 'systemd', 'docker', 'unknown'] as const
const RUNTIMES = ['native', 'container', 'legacy-services', 'unknown'] as const
const FUNCTION_STATES = ['enabled', 'disabled', 'unknown'] as const

export function parseTelenoHostManifest(payload: string): HostDiscoveryFacts {
  const value = parseObject(payload)
  rejectSensitiveKeys(value)
  exactKeys(value, ['schemaVersion', 'flavor', 'network', 'environment', 'supervisor', 'runtime', 'instance', 'artifact', 'functions', 'endpoints', 'identity', 'capabilities'])
  if (value.schemaVersion !== 1) throw malformedManifest()
  const flavor = object(value.flavor)
  exactKeys(flavor, ['id', 'version'])
  if (flavor.id !== 'teleno-monolith') throw new ApplicationError({
    code: 'DISCOVERY_FLAVOR_UNAVAILABLE',
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: false,
    message: 'The inspected runtime is not supported by the Teleno discovery adapter.',
    nextAction: 'Keep the connection as limited metadata until a matching flavor adapter is installed.'
  })
  const network = object(value.network)
  exactKeys(network, ['name', 'chainId'])
  const networkName = enumValue(network.name, NETWORKS)
  const environment = enumValue(value.environment, NODE_ENVIRONMENTS)
  const supervisor = object(value.supervisor)
  exactKeys(supervisor, ['kind', 'serviceName'])
  const supervisorKind = enumValue(supervisor.kind, SUPERVISORS)
  const runtime = object(value.runtime)
  exactKeys(runtime, ['kind', 'version'])
  const runtimeKind = enumValue(runtime.kind, RUNTIMES)
  const instance = object(value.instance)
  exactKeys(instance, ['baseDir', 'ports'])
  const ports = parsePorts(instance.ports)
  const artifact = object(value.artifact)
  exactKeys(artifact, ['version', 'digest'])
  const functions = parseFunctions(value.functions, true)
  const endpoints = parseEndpoints(value.endpoints)
  const identity = object(value.identity)
  exactKeys(identity, ['peerId', 'runtimeInstanceId', 'producerAddress'])
  const capabilities = parseCapabilities(value.capabilities)
  const digest = optionalString(artifact.digest)
  if (digest !== undefined && !/^[0-9a-f]{64}$/.test(digest)) throw malformedManifest()
  const chainId = optionalString(network.chainId)
  const serviceName = optionalString(supervisor.serviceName)
  const baseDir = optionalString(instance.baseDir)
  const runtimeVersion = optionalString(runtime.version)
  const flavorVersion = optionalString(flavor.version)
  const artifactVersion = optionalString(artifact.version)
  const complete = networkName !== 'unknown'
    && chainId !== undefined
    && supervisorKind !== 'unknown'
    && serviceName !== undefined
    && runtimeKind !== 'unknown'
    && baseDir !== undefined
    && Object.keys(ports).length > 0
    && digest !== undefined
    && optionalString(identity.runtimeInstanceId) !== undefined
    && NODE_FUNCTIONS.every((name) => functions[name] !== 'unknown')
    && capabilities.inspect
    && capabilities.configure
    && capabilities.startStop
    && capabilities.upgrade
    && capabilities.backup
    && capabilities.restore
    && capabilities.logs
  return {
    flavor: { id: 'teleno-monolith', ...(flavorVersion === undefined ? {} : { version: flavorVersion }) },
    network: { name: networkName, ...(chainId === undefined ? {} : { chainId }) },
    environment,
    supervisor: { kind: supervisorKind, ...(serviceName === undefined ? {} : { serviceRef: opaque('service', serviceName) }) },
    runtime: { kind: runtimeKind, ...(runtimeVersion === undefined ? {} : { version: runtimeVersion }) },
    instance: { ...(baseDir === undefined ? {} : { baseDirRef: opaque('base-dir', baseDir) }), ports },
    artifact: { ...(artifactVersion === undefined ? {} : { version: artifactVersion }), ...(digest === undefined ? {} : { digest }) },
    functions,
    endpoints,
    identity: {
      peerIdPresent: optionalString(identity.peerId) !== undefined,
      runtimeInstanceIdPresent: optionalString(identity.runtimeInstanceId) !== undefined,
      producerAddressPresent: optionalString(identity.producerAddress) !== undefined
    },
    capabilities,
    evidenceCompleteness: complete ? 'complete' : 'partial'
  }
}

export function parsePeerManifest(payload: string): readonly PeerDiscoveryFact[] {
  const value = parseObject(payload)
  rejectSensitiveKeys(value)
  exactKeys(value, ['schemaVersion', 'peers'])
  if (value.schemaVersion !== 1 || !Array.isArray(value.peers) || value.peers.length > 1000) throw malformedManifest()
  return value.peers.map((raw) => {
    const peer = object(raw)
    exactKeys(peer, ['network', 'functions', 'endpointScopes', 'peerId'])
    const network = object(peer.network)
    exactKeys(network, ['name', 'chainId'])
    const chainId = optionalString(network.chainId)
    if (!Array.isArray(peer.endpointScopes)) throw malformedManifest()
    return {
      network: { name: enumValue(network.name, NETWORKS), ...(chainId === undefined ? {} : { chainId }) },
      functions: parseFunctions(peer.functions, false),
      endpointScopes: [...new Set(peer.endpointScopes.map((scope) => enumValue(scope, ENDPOINT_SCOPES)))],
      peerIdPresent: optionalString(peer.peerId) !== undefined
    }
  })
}

function parsePorts(value: unknown): Readonly<Record<string, number>> {
  const ports = object(value)
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(ports)) {
    if (!ENDPOINT_KINDS.includes(key as (typeof ENDPOINT_KINDS)[number]) || !Number.isSafeInteger(raw) || Number(raw) < 1 || Number(raw) > 65535) throw malformedManifest()
    result[key] = Number(raw)
  }
  return result
}

function parseFunctions(value: unknown, complete: boolean): NodeFunctions {
  const functions = object(value)
  exactKeys(functions, NODE_FUNCTIONS)
  const result = {} as NodeFunctions
  for (const name of NODE_FUNCTIONS) {
    const raw = functions[name]
    result[name] = raw === undefined && !complete ? 'unknown' : enumValue(raw, FUNCTION_STATES)
  }
  return result
}

function parseEndpoints(value: unknown): HostDiscoveryFacts['endpoints'] {
  if (!Array.isArray(value) || value.length > 50) throw malformedManifest()
  return value.map((raw) => {
    const endpoint = object(raw)
    exactKeys(endpoint, ['kind', 'scope', 'address'])
    optionalString(endpoint.address)
    return {
      kind: enumValue(endpoint.kind, ENDPOINT_KINDS),
      scope: enumValue(endpoint.scope, ENDPOINT_SCOPES)
    }
  })
}

function parseCapabilities(value: unknown): NodeAuthority {
  const capabilities = object(value)
  const keys = ['inspect', 'configure', 'startStop', 'upgrade', 'backup', 'restore', 'logs'] as const
  exactKeys(capabilities, keys)
  const result = Object.fromEntries(keys.map((key) => [key, capabilities[key] === true])) as Pick<NodeAuthority, (typeof keys)[number]>
  return { ...result, producerControl: false, walletAccess: false }
}

function rejectSensitiveKeys(value: unknown, seen = new Set<object>()): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw malformedManifest()
    rejectSensitiveKeys(nested, seen)
  }
}

function parseObject(payload: string): Record<string, unknown> {
  try {
    return object(JSON.parse(payload))
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error
    throw malformedManifest()
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw malformedManifest()
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const set = new Set(allowed)
  if (Object.keys(value).some((key) => !set.has(key))) throw malformedManifest()
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw malformedManifest()
  return value as T
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) throw malformedManifest()
  return value
}

function opaque(prefix: string, raw: string): string {
  return `${prefix}:${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`
}

function malformedManifest(): ApplicationError {
  return new ApplicationError({
    code: 'DISCOVERY_MANIFEST_MALFORMED',
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: false,
    message: 'The read-only discovery manifest is malformed, unsafe, or uses an unsupported schema.',
    nextAction: 'Regenerate the versioned inspection manifest without private connection or secret material.'
  })
}
