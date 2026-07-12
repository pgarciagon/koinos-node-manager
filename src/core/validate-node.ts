import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import type { ApplicationExitCode } from './exit-codes.js'
import {
  AUTHORITY_LEVELS,
  LOCATION_KINDS,
  MANAGEMENT_CLASSES,
  NETWORKS,
  NODE_ENVIRONMENTS,
  NODE_FLAVORS,
  NODE_FUNCTIONS,
  NODE_HEALTH_STATES,
  NODE_ORIGINS,
  OBSERVATION_FRESHNESS_STATES,
  type NodeRecord
} from '../domain/node.js'

const NODE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SENSITIVE_KEY_PATTERN = /password|passphrase|private.?key|api.?key|token|secret|mnemonic|seed.?phrase/i
const SENSITIVE_VALUE_PATTERN = /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|passphrase|token|secret|private[-_ ]?key)\s*[:=]/i
const ENDPOINT_KINDS = ['p2p', 'jsonrpc', 'grpc', 'admin', 'backup'] as const
const ENDPOINT_SCOPES = ['local', 'private', 'public', 'unknown'] as const
const FUNCTION_STATES = ['enabled', 'disabled', 'unknown'] as const

export function isValidNodeId(value: string): boolean {
  return NODE_ID_PATTERN.test(value)
}

export function assertValidNodeId(value: string): void {
  if (!isValidNodeId(value)) {
    throw new ApplicationError({
      code: 'INVALID_NODE_ID',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'Node IDs must use 1-64 lowercase letters, numbers, or internal hyphens.',
      nextAction: 'Choose a stable ID such as "berlin-observer".'
    })
  }
}

export function assertOpaqueReference(value: string, optionName: string): void {
  if (!OPAQUE_REFERENCE_PATTERN.test(value)) {
    throw new ApplicationError({
      code: 'INVALID_OPAQUE_REFERENCE',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: `${optionName} must be an opaque reference without whitespace or path material.`,
      nextAction: 'Use a reference such as "ssh-config:berlin-observer"; do not provide credentials or a private key path.'
    })
  }
}

export function validateInventoryNodes(nodes: readonly unknown[]): readonly string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  nodes.forEach((node, index) => {
    const prefix = `nodes[${index}]`
    issues.push(...validateNodeRecord(node, prefix))
    if (isObject(node) && typeof node.id === 'string') {
      if (ids.has(node.id)) issues.push(`${prefix}.id duplicates another node ID.`)
      ids.add(node.id)
    }
  })
  return issues
}

export function assertValidInventoryNodes(
  nodes: readonly unknown[],
  exitCode: ApplicationExitCode = EXIT_CODES.configuration
): asserts nodes is readonly NodeRecord[] {
  const issues = validateInventoryNodes(nodes)
  if (issues.length === 0) return
  throw new ApplicationError({
    code: 'INVENTORY_RECORD_INVALID',
    exitCode,
    severity: 'error',
    retryable: false,
    message: `Inventory validation failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}; unsafe fields were not loaded.`,
    nextAction: 'Run "knm doctor" to inspect the inventory and recovery options.'
  })
}

export function validateNodeRecord(value: unknown, path = 'node'): readonly string[] {
  const issues: string[] = []
  scanSensitiveKeys(value, path, issues)
  if (!isObject(value)) return [`${path} must be an object.`]
  onlyKeys(value, ['id', 'displayName', 'management', 'declared', 'desired', 'observed', 'verified', 'provenance'], path, issues)
  stringField(value.id, `${path}.id`, issues, 1, 64)
  if (typeof value.id === 'string' && !isValidNodeId(value.id)) issues.push(`${path}.id has an invalid stable ID format.`)
  stringField(value.displayName, `${path}.displayName`, issues, 1, 120)
  validateManagement(value.management, `${path}.management`, issues)
  validateRuntimeFacts(value.declared, `${path}.declared`, issues)
  if (value.desired !== null) validateDesired(value.desired, `${path}.desired`, issues)
  if (value.observed !== null) validateObserved(value.observed, `${path}.observed`, issues)
  if (value.verified !== null) validateVerified(value.verified, `${path}.verified`, issues)
  validateProvenance(value.provenance, `${path}.provenance`, issues)
  return issues
}

function validateManagement(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['class', 'origin', 'authorityLevel', 'authority'], path, issues)
  enumField(value.class, MANAGEMENT_CLASSES, `${path}.class`, issues)
  enumField(value.origin, NODE_ORIGINS, `${path}.origin`, issues)
  enumField(value.authorityLevel, AUTHORITY_LEVELS, `${path}.authorityLevel`, issues)
  if (!isObject(value.authority)) return issues.push(`${path}.authority must be an object.`), undefined
  const keys = ['inspect', 'configure', 'startStop', 'upgrade', 'backup', 'restore', 'logs', 'producerControl', 'walletAccess']
  onlyKeys(value.authority, keys, `${path}.authority`, issues)
  for (const key of keys) if (typeof value.authority[key] !== 'boolean') issues.push(`${path}.authority.${key} must be a boolean.`)
}

function validateRuntimeFacts(value: unknown, path: string, issues: string[], strictKeys = true): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  if (strictKeys) onlyKeys(value, ['flavor', 'network', 'location', 'functions', 'endpoints', 'identity', 'supervisor', 'runtime', 'instance', 'artifact'], path, issues)
  validateFlavor(value.flavor, `${path}.flavor`, issues)
  validateNetwork(value.network, `${path}.network`, issues)
  validateLocation(value.location, `${path}.location`, issues)
  validateFunctions(value.functions, `${path}.functions`, issues, true)
  validateEndpoints(value.endpoints, `${path}.endpoints`, issues)
  validateIdentity(value.identity, `${path}.identity`, issues)
  validateOptionalOperationalFacts(value, path, issues)
}

function validateDesired(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object or null.`), undefined
  onlyKeys(value, ['flavor', 'network', 'location', 'functions', 'supervisor', 'runtime', 'instance', 'artifact'], path, issues)
  if (value.flavor !== undefined) validateFlavor(value.flavor, `${path}.flavor`, issues)
  if (value.network !== undefined) validateNetwork(value.network, `${path}.network`, issues)
  if (value.location !== undefined) validateLocation(value.location, `${path}.location`, issues)
  if (value.functions !== undefined) validateFunctions(value.functions, `${path}.functions`, issues, false)
  validateOptionalOperationalFacts(value, path, issues)
}

function validateObserved(value: unknown, path: string, issues: string[]): void {
  validateRuntimeFacts(value, path, issues, false)
  if (!isObject(value)) return
  onlyKeys(value, ['flavor', 'network', 'location', 'functions', 'endpoints', 'identity', 'supervisor', 'runtime', 'instance', 'artifact', 'health', 'observedAt', 'freshness'], path, issues)
  enumField(value.health, NODE_HEALTH_STATES, `${path}.health`, issues)
  timestampField(value.observedAt, `${path}.observedAt`, issues)
  enumField(value.freshness, OBSERVATION_FRESHNESS_STATES.filter((item) => item !== 'never'), `${path}.freshness`, issues)
}

function validateVerified(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object or null.`), undefined
  onlyKeys(value, ['flavor', 'network', 'location', 'functions', 'endpoints', 'identity', 'supervisor', 'runtime', 'instance', 'artifact', 'verifiedAt'], path, issues)
  if (value.flavor !== undefined) validateFlavor(value.flavor, `${path}.flavor`, issues)
  if (value.network !== undefined) validateNetwork(value.network, `${path}.network`, issues)
  if (value.location !== undefined) validateLocation(value.location, `${path}.location`, issues)
  if (value.functions !== undefined) validateFunctions(value.functions, `${path}.functions`, issues, false)
  if (value.endpoints !== undefined) validateEndpoints(value.endpoints, `${path}.endpoints`, issues)
  if (value.identity !== undefined) validateIdentity(value.identity, `${path}.identity`, issues)
  validateOptionalOperationalFacts(value, path, issues)
  timestampField(value.verifiedAt, `${path}.verifiedAt`, issues)
}

function validateOptionalOperationalFacts(value: Record<string, unknown>, path: string, issues: string[]): void {
  if (value.supervisor !== undefined) {
    if (!isObject(value.supervisor)) issues.push(`${path}.supervisor must be an object.`)
    else {
      onlyKeys(value.supervisor, ['kind', 'serviceRef'], `${path}.supervisor`, issues)
      enumField(value.supervisor.kind, ['foreground', 'launchd', 'systemd', 'docker', 'unknown'], `${path}.supervisor.kind`, issues)
      if (value.supervisor.serviceRef !== undefined && (typeof value.supervisor.serviceRef !== 'string' || !OPAQUE_REFERENCE_PATTERN.test(value.supervisor.serviceRef))) issues.push(`${path}.supervisor.serviceRef must be opaque.`)
    }
  }
  if (value.runtime !== undefined) {
    if (!isObject(value.runtime)) issues.push(`${path}.runtime must be an object.`)
    else {
      onlyKeys(value.runtime, ['kind', 'version'], `${path}.runtime`, issues)
      enumField(value.runtime.kind, ['native', 'container', 'legacy-services', 'unknown'], `${path}.runtime.kind`, issues)
      if (value.runtime.version !== undefined) stringField(value.runtime.version, `${path}.runtime.version`, issues, 1, 80)
    }
  }
  if (value.instance !== undefined) {
    if (!isObject(value.instance)) issues.push(`${path}.instance must be an object.`)
    else {
      onlyKeys(value.instance, ['baseDirRef', 'ports'], `${path}.instance`, issues)
      if (value.instance.baseDirRef !== undefined && (typeof value.instance.baseDirRef !== 'string' || !OPAQUE_REFERENCE_PATTERN.test(value.instance.baseDirRef))) issues.push(`${path}.instance.baseDirRef must be opaque.`)
      if (!isObject(value.instance.ports)) issues.push(`${path}.instance.ports must be an object.`)
      else for (const [key, port] of Object.entries(value.instance.ports)) {
        if (!['p2p', 'jsonrpc', 'grpc', 'admin', 'backup'].includes(key)) issues.push(`${path}.instance.ports contains an unknown port kind.`)
        if (!Number.isSafeInteger(port) || Number(port) < 1 || Number(port) > 65535) issues.push(`${path}.instance.ports contains an invalid port.`)
      }
    }
  }
  if (value.artifact !== undefined) {
    if (!isObject(value.artifact)) issues.push(`${path}.artifact must be an object.`)
    else {
      onlyKeys(value.artifact, ['version', 'digest'], `${path}.artifact`, issues)
      if (value.artifact.version !== undefined) stringField(value.artifact.version, `${path}.artifact.version`, issues, 1, 80)
      if (value.artifact.digest !== undefined && (typeof value.artifact.digest !== 'string' || !/^[0-9a-f]{64}$/.test(value.artifact.digest))) issues.push(`${path}.artifact.digest must be a SHA-256 digest.`)
    }
  }
}

function validateFlavor(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['id', 'version'], path, issues)
  enumField(value.id, NODE_FLAVORS, `${path}.id`, issues)
  if (value.version !== undefined) stringField(value.version, `${path}.version`, issues, 1, 80)
}

function validateNetwork(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['name', 'chainId'], path, issues)
  enumField(value.name, NETWORKS, `${path}.name`, issues)
  if (value.chainId !== undefined) stringField(value.chainId, `${path}.chainId`, issues, 1, 160)
}

function validateLocation(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['kind', 'environment', 'connectionRef'], path, issues)
  enumField(value.kind, LOCATION_KINDS, `${path}.kind`, issues)
  enumField(value.environment, NODE_ENVIRONMENTS, `${path}.environment`, issues)
  if (value.connectionRef !== undefined && (typeof value.connectionRef !== 'string' || !OPAQUE_REFERENCE_PATTERN.test(value.connectionRef))) {
    issues.push(`${path}.connectionRef must be an opaque reference.`)
  }
}

function validateFunctions(value: unknown, path: string, issues: string[], complete: boolean): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, NODE_FUNCTIONS, path, issues)
  for (const name of NODE_FUNCTIONS) {
    if (complete || value[name] !== undefined) enumField(value[name], FUNCTION_STATES, `${path}.${name}`, issues)
  }
}

function validateEndpoints(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) return issues.push(`${path} must be an array.`), undefined
  value.forEach((endpoint, index) => {
    const itemPath = `${path}[${index}]`
    if (!isObject(endpoint)) return issues.push(`${itemPath} must be an object.`), undefined
    onlyKeys(endpoint, ['kind', 'scope', 'address'], itemPath, issues)
    enumField(endpoint.kind, ENDPOINT_KINDS, `${itemPath}.kind`, issues)
    enumField(endpoint.scope, ENDPOINT_SCOPES, `${itemPath}.scope`, issues)
    stringField(endpoint.address, `${itemPath}.address`, issues, 1, 500)
  })
}

function validateIdentity(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['peerId', 'runtimeInstanceId', 'producerAddress'], path, issues)
  for (const key of ['peerId', 'runtimeInstanceId', 'producerAddress']) {
    if (value[key] !== undefined) stringField(value[key], `${path}.${key}`, issues, 1, 256)
  }
}

function validateProvenance(value: unknown, path: string, issues: string[]): void {
  if (!isObject(value)) return issues.push(`${path} must be an object.`), undefined
  onlyKeys(value, ['discoveredAt', 'importedAt', 'provisionedAt', 'adoptedAt', 'source'], path, issues)
  stringField(value.source, `${path}.source`, issues, 1, 80)
  for (const key of ['discoveredAt', 'importedAt', 'provisionedAt', 'adoptedAt']) {
    if (value[key] !== undefined) timestampField(value[key], `${path}.${key}`, issues)
  }
}

function scanSensitiveKeys(value: unknown, path: string, issues: string[], seen = new Set<object>()): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) issues.push(`${path} contains a forbidden sensitive field.`)
    scanSensitiveKeys(nested, `${path}.${key}`, issues, seen)
  }
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: string[]): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) issues.push(`${path} contains an unknown field.`)
}

function stringField(value: unknown, path: string, issues: string[], min: number, max: number): void {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    issues.push(`${path} must be a valid string between ${min} and ${max} characters.`)
  } else if (SENSITIVE_VALUE_PATTERN.test(value)) {
    issues.push(`${path} contains forbidden sensitive material.`)
  }
}

function timestampField(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) issues.push(`${path} must be an ISO timestamp.`)
}

function enumField(value: unknown, allowed: readonly string[], path: string, issues: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) issues.push(`${path} has an unsupported value.`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
