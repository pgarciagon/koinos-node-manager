import { createHash } from 'node:crypto'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import { validateInventoryNodes } from './validate-node.js'
import {
  CONNECTION_KINDS,
  CONNECTION_TEST_OUTCOMES,
  RUNTIME_KINDS,
  SUPERVISOR_KINDS,
  type AdoptionReview,
  type ConnectionRecord,
  type DiscoveryRecord
} from '../domain/connection.js'
import {
  ENDPOINT_SCOPES,
  NETWORKS,
  NODE_ENVIRONMENTS,
  NODE_FLAVORS,
  NODE_FUNCTIONS
} from '../domain/node.js'

const STABLE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const HOST_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const DISCOVERY_ID = /^discovery_[0-9a-f]{16}$/
const ADOPTION_ID = /^adoption_[0-9a-f]{16}$/
const DIGEST = /^[0-9a-f]{64}$/
const SENSITIVE_KEY = /password|passphrase|private.?key|api.?key|token|secret|mnemonic|seed.?phrase/i
const SENSITIVE_VALUE = /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|passphrase|token|secret|private[-_ ]?key)\s*[:=]/i
const ENDPOINT_KINDS = ['p2p', 'jsonrpc', 'grpc', 'admin', 'backup'] as const
const FUNCTION_STATES = ['enabled', 'disabled', 'unknown'] as const

export function assertConnectionId(value: string): void {
  if (STABLE_ID.test(value)) return
  throw invalidInput('INVALID_CONNECTION_ID', 'Connection IDs must use 1-64 lowercase letters, numbers, or internal hyphens.')
}

export function assertSshHostAlias(value: string): void {
  if (HOST_ALIAS.test(value)) return
  throw invalidInput('INVALID_SSH_HOST_ALIAS', 'SSH host aliases must be exact configured aliases without users, hosts, paths, or whitespace.')
}

export function validateConnectionState(value: {
  connections: readonly unknown[]
  discoveries: readonly unknown[]
  adoptionReviews: readonly unknown[]
}): readonly string[] {
  const issues: string[] = []
  scanSensitiveKeys(value, 'state', issues)
  const connectionIds = new Set<string>()
  value.connections.forEach((connection, index) => {
    validateConnection(connection, `connections[${index}]`, issues)
    if (isObject(connection) && typeof connection.id === 'string') {
      if (connectionIds.has(connection.id)) issues.push('Connection IDs must be unique.')
      connectionIds.add(connection.id)
    }
  })
  const discoveryIds = new Set<string>()
  value.discoveries.forEach((discovery, index) => {
    validateDiscovery(discovery, `discoveries[${index}]`, issues)
    if (isObject(discovery) && typeof discovery.id === 'string') {
      if (discoveryIds.has(discovery.id)) issues.push('Discovery IDs must be unique.')
      discoveryIds.add(discovery.id)
    }
  })
  const adoptionIds = new Set<string>()
  value.adoptionReviews.forEach((review, index) => {
    validateAdoption(review, `adoptionReviews[${index}]`, issues)
    if (isObject(review) && typeof review.id === 'string') {
      if (adoptionIds.has(review.id)) issues.push('Adoption review IDs must be unique.')
      adoptionIds.add(review.id)
    }
  })
  for (const discovery of value.discoveries) {
    if (!isObject(discovery) || !isObject(discovery.source)) continue
    const connectionId = discovery.source.connectionId
    if (typeof connectionId === 'string' && !connectionIds.has(connectionId)) issues.push('A discovery references a missing connection.')
  }
  for (const review of value.adoptionReviews) {
    if (!isObject(review)) continue
    if (typeof review.discoveryId === 'string' && !discoveryIds.has(review.discoveryId)) issues.push('An adoption review references a missing discovery.')
  }
  return issues
}

export function assertValidConnectionState(value: {
  connections: readonly unknown[]
  discoveries: readonly unknown[]
  adoptionReviews: readonly unknown[]
}): asserts value is {
  connections: readonly ConnectionRecord[]
  discoveries: readonly DiscoveryRecord[]
  adoptionReviews: readonly AdoptionReview[]
} {
  const issues = validateConnectionState(value)
  if (issues.length === 0) return
  throw new ApplicationError({
    code: 'CONNECTION_STATE_INVALID',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: false,
    message: `Connection state validation failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}; unsafe data was not loaded.`,
    nextAction: 'Run "knm doctor" to inspect local connection-state recovery options.'
  })
}

function validateConnection(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['id', 'kind', 'hostAlias', 'createdAt', 'updatedAt', 'lastTest'], path, issues)
  match(value.id, STABLE_ID, `${path}.id`, issues)
  enumField(value.kind, CONNECTION_KINDS, `${path}.kind`, issues)
  match(value.hostAlias, HOST_ALIAS, `${path}.hostAlias`, issues)
  timestamp(value.createdAt, `${path}.createdAt`, issues)
  timestamp(value.updatedAt, `${path}.updatedAt`, issues)
  if (value.lastTest !== null) {
    if (!isObject(value.lastTest)) return void issues.push(`${path}.lastTest must be an object or null.`)
    onlyKeys(value.lastTest, ['outcome', 'testedAt', 'durationMs'], `${path}.lastTest`, issues)
    enumField(value.lastTest.outcome, CONNECTION_TEST_OUTCOMES, `${path}.lastTest.outcome`, issues)
    timestamp(value.lastTest.testedAt, `${path}.lastTest.testedAt`, issues)
    integer(value.lastTest.durationMs, 0, 30000, `${path}.lastTest.durationMs`, issues)
  }
}

function validateDiscovery(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['id', 'kind', 'status', 'source', 'capturedAt', 'expiresAt', 'dismissedAt', 'findings'], path, issues)
  match(value.id, DISCOVERY_ID, `${path}.id`, issues)
  enumField(value.kind, ['host', 'peers'], `${path}.kind`, issues)
  enumField(value.status, ['active', 'dismissed'], `${path}.status`, issues)
  timestamp(value.capturedAt, `${path}.capturedAt`, issues)
  timestamp(value.expiresAt, `${path}.expiresAt`, issues)
  if (value.dismissedAt !== null) timestamp(value.dismissedAt, `${path}.dismissedAt`, issues)
  if (!isObject(value.source)) issues.push(`${path}.source must be an object.`)
  else if (value.kind === 'host') {
    onlyKeys(value.source, ['connectionId'], `${path}.source`, issues)
    match(value.source.connectionId, STABLE_ID, `${path}.source.connectionId`, issues)
  } else {
    onlyKeys(value.source, ['nodeId', 'connectionId'], `${path}.source`, issues)
    match(value.source.nodeId, STABLE_ID, `${path}.source.nodeId`, issues)
    match(value.source.connectionId, STABLE_ID, `${path}.source.connectionId`, issues)
  }
  if (value.kind === 'host') validateHostFindings(value.findings, `${path}.findings`, issues)
  if (value.kind === 'peers') validatePeerFindings(value.findings, `${path}.findings`, issues)
}

function validateHostFindings(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['flavor', 'network', 'environment', 'supervisor', 'runtime', 'instance', 'artifact', 'functions', 'endpoints', 'identity', 'capabilities', 'evidenceCompleteness'], path, issues)
  validateFlavor(value.flavor, `${path}.flavor`, issues)
  validateNetwork(value.network, `${path}.network`, issues)
  enumField(value.environment, NODE_ENVIRONMENTS, `${path}.environment`, issues)
  if (!isObject(value.supervisor)) issues.push(`${path}.supervisor must be an object.`)
  else {
    onlyKeys(value.supervisor, ['kind', 'serviceRef'], `${path}.supervisor`, issues)
    enumField(value.supervisor.kind, SUPERVISOR_KINDS, `${path}.supervisor.kind`, issues)
    if (value.supervisor.serviceRef !== undefined) match(value.supervisor.serviceRef, OPAQUE_REFERENCE, `${path}.supervisor.serviceRef`, issues)
  }
  if (!isObject(value.runtime)) issues.push(`${path}.runtime must be an object.`)
  else {
    onlyKeys(value.runtime, ['kind', 'version'], `${path}.runtime`, issues)
    enumField(value.runtime.kind, RUNTIME_KINDS, `${path}.runtime.kind`, issues)
    if (value.runtime.version !== undefined) string(value.runtime.version, 1, 80, `${path}.runtime.version`, issues)
  }
  if (!isObject(value.instance)) issues.push(`${path}.instance must be an object.`)
  else {
    onlyKeys(value.instance, ['baseDirRef', 'ports'], `${path}.instance`, issues)
    if (value.instance.baseDirRef !== undefined) match(value.instance.baseDirRef, OPAQUE_REFERENCE, `${path}.instance.baseDirRef`, issues)
    if (!isObject(value.instance.ports)) issues.push(`${path}.instance.ports must be an object.`)
    else for (const [key, port] of Object.entries(value.instance.ports)) {
      if (!['p2p', 'jsonrpc', 'grpc', 'admin', 'backup'].includes(key)) issues.push(`${path}.instance.ports contains an unknown port kind.`)
      integer(port, 1, 65535, `${path}.instance.ports.${key}`, issues)
    }
  }
  if (!isObject(value.artifact)) issues.push(`${path}.artifact must be an object.`)
  else {
    onlyKeys(value.artifact, ['version', 'digest'], `${path}.artifact`, issues)
    if (value.artifact.version !== undefined) string(value.artifact.version, 1, 80, `${path}.artifact.version`, issues)
    if (value.artifact.digest !== undefined) match(value.artifact.digest, DIGEST, `${path}.artifact.digest`, issues)
  }
  validateFunctions(value.functions, `${path}.functions`, issues, true)
  if (!Array.isArray(value.endpoints)) issues.push(`${path}.endpoints must be an array.`)
  else value.endpoints.forEach((endpoint, index) => {
    if (!isObject(endpoint)) return void issues.push(`${path}.endpoints[${index}] must be an object.`)
    onlyKeys(endpoint, ['kind', 'scope'], `${path}.endpoints[${index}]`, issues)
    enumField(endpoint.kind, ENDPOINT_KINDS, `${path}.endpoints[${index}].kind`, issues)
    enumField(endpoint.scope, ENDPOINT_SCOPES, `${path}.endpoints[${index}].scope`, issues)
  })
  if (!isObject(value.identity)) issues.push(`${path}.identity must be an object.`)
  else {
    onlyKeys(value.identity, ['peerIdPresent', 'runtimeInstanceIdPresent', 'producerAddressPresent'], `${path}.identity`, issues)
    for (const key of ['peerIdPresent', 'runtimeInstanceIdPresent', 'producerAddressPresent']) boolean(value.identity[key], `${path}.identity.${key}`, issues)
  }
  validateAuthority(value.capabilities, `${path}.capabilities`, issues)
  enumField(value.evidenceCompleteness, ['complete', 'partial'], `${path}.evidenceCompleteness`, issues)
}

function validatePeerFindings(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['total', 'peers'], path, issues)
  if (!Array.isArray(value.peers)) return void issues.push(`${path}.peers must be an array.`)
  integer(value.total, 0, 10000, `${path}.total`, issues)
  if (value.total !== value.peers.length) issues.push(`${path}.total must match the peer count.`)
  value.peers.forEach((peer, index) => {
    if (!isObject(peer)) return void issues.push(`${path}.peers[${index}] must be an object.`)
    onlyKeys(peer, ['network', 'functions', 'endpointScopes', 'peerIdPresent'], `${path}.peers[${index}]`, issues)
    validateNetwork(peer.network, `${path}.peers[${index}].network`, issues)
    validateFunctions(peer.functions, `${path}.peers[${index}].functions`, issues, false)
    if (!Array.isArray(peer.endpointScopes)) issues.push(`${path}.peers[${index}].endpointScopes must be an array.`)
    else for (const scope of peer.endpointScopes) enumField(scope, ENDPOINT_SCOPES, `${path}.peers[${index}].endpointScopes`, issues)
    boolean(peer.peerIdPresent, `${path}.peers[${index}].peerIdPresent`, issues)
  })
}

function validateAdoption(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['id', 'schemaVersion', 'digest', 'discoveryId', 'connectionStateRevision', 'inventoryRevision', 'createdAt', 'expiresAt', 'disposition', 'node', 'application'], path, issues)
  match(value.id, ADOPTION_ID, `${path}.id`, issues)
  if (value.schemaVersion !== 1) issues.push(`${path}.schemaVersion is unsupported.`)
  match(value.digest, DIGEST, `${path}.digest`, issues)
  match(value.discoveryId, DISCOVERY_ID, `${path}.discoveryId`, issues)
  integer(value.connectionStateRevision, 0, Number.MAX_SAFE_INTEGER, `${path}.connectionStateRevision`, issues)
  integer(value.inventoryRevision, 0, Number.MAX_SAFE_INTEGER, `${path}.inventoryRevision`, issues)
  timestamp(value.createdAt, `${path}.createdAt`, issues)
  timestamp(value.expiresAt, `${path}.expiresAt`, issues)
  enumField(value.disposition, ['managed-adopted', 'connected-limited'], `${path}.disposition`, issues)
  issues.push(...validateInventoryNodes([value.node]).map(() => `${path}.node is invalid.`))
  const { id: _id, digest: _digest, application: _application, ...content } = value
  if (typeof value.digest === 'string' && typeof value.id === 'string') {
    const calculated = createHash('sha256').update(JSON.stringify(content)).digest('hex')
    if (value.digest !== calculated || value.id !== `adoption_${calculated.slice(0, 16)}`) issues.push(`${path} digest does not match its immutable content.`)
  }
  if (value.application !== null) {
    if (!isObject(value.application)) issues.push(`${path}.application must be an object or null.`)
    else {
      onlyKeys(value.application, ['appliedAt', 'nodeId'], `${path}.application`, issues)
      timestamp(value.application.appliedAt, `${path}.application.appliedAt`, issues)
      match(value.application.nodeId, STABLE_ID, `${path}.application.nodeId`, issues)
      if (isObject(value.node) && value.application.nodeId !== value.node.id) issues.push(`${path}.application.nodeId must match the adopted node.`)
    }
  }
}

function validateFlavor(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['id', 'version'], path, issues)
  enumField(value.id, NODE_FLAVORS, `${path}.id`, issues)
  if (value.version !== undefined) string(value.version, 1, 80, `${path}.version`, issues)
}

function validateNetwork(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, ['name', 'chainId'], path, issues)
  enumField(value.name, NETWORKS, `${path}.name`, issues)
  if (value.chainId !== undefined) string(value.chainId, 1, 160, `${path}.chainId`, issues)
}

function validateFunctions(value: unknown, path: string, issues: string[], complete: boolean): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  onlyKeys(value, NODE_FUNCTIONS, path, issues)
  for (const name of NODE_FUNCTIONS) if (complete || value[name] !== undefined) enumField(value[name], FUNCTION_STATES, `${path}.${name}`, issues)
}

function validateAuthority(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return void issues.push(`${path} must be an object.`)
  const keys = ['inspect', 'configure', 'startStop', 'upgrade', 'backup', 'restore', 'logs', 'producerControl', 'walletAccess']
  onlyKeys(value, keys, path, issues)
  for (const key of keys) boolean(value[key], `${path}.${key}`, issues)
  if (value.producerControl !== false || value.walletAccess !== false) issues.push(`${path} cannot grant producer or wallet authority in Phase 3.`)
}

function scanSensitiveKeys(value: unknown, path: string, issues: string[], seen = new Set<object>()): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) issues.push(`${path} contains a forbidden sensitive field.`)
    scanSensitiveKeys(nested, `${path}.${key}`, issues, seen)
  }
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: string[]): void {
  const set = new Set(allowed)
  for (const key of Object.keys(value)) if (!set.has(key)) issues.push(`${path} contains an unknown field.`)
}

function enumField(value: unknown, allowed: readonly string[], path: string, issues: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) issues.push(`${path} has an unsupported value.`)
}

function match(value: unknown, pattern: RegExp, path: string, issues: string[]): void {
  if (typeof value !== 'string' || !pattern.test(value)) issues.push(`${path} has an invalid format.`)
}

function string(value: unknown, min: number, max: number, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) issues.push(`${path} must be a valid string.`)
  else if (SENSITIVE_VALUE.test(value)) issues.push(`${path} contains forbidden sensitive material.`)
}

function timestamp(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) issues.push(`${path} must be an ISO timestamp.`)
}

function integer(value: unknown, min: number, max: number, path: string, issues: string[]): void {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) issues.push(`${path} must be an integer in range.`)
}

function boolean(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'boolean') issues.push(`${path} must be a boolean.`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidInput(code: string, message: string): ApplicationError {
  return new ApplicationError({
    code,
    exitCode: EXIT_CODES.invalidInput,
    severity: 'error',
    retryable: false,
    message,
    nextAction: 'Run the relevant command with --help and provide only an opaque local identifier.'
  })
}
