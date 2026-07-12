import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import type { InventoryRepository, InventorySnapshot } from './node-repository.js'
import { assertOpaqueReference, assertValidInventoryNodes, assertValidNodeId } from './validate-node.js'
import {
  NODE_FUNCTIONS,
  type AuthorityLevel,
  type LocationKind,
  type ManagementClass,
  type NetworkName,
  type NodeAuthority,
  type NodeEnvironment,
  type NodeFlavorId,
  type NodeFunction,
  type NodeFunctions,
  type NodeOrigin,
  type NodeRecord
} from '../domain/node.js'

export type AddNodeInput = {
  id: string
  displayName: string
  management: ManagementClass
  origin: NodeOrigin
  flavor: NodeFlavorId
  network: NetworkName
  location: LocationKind
  environment: NodeEnvironment
  authorityLevel: AuthorityLevel
  connectionRef?: string
  functions: readonly NodeFunction[]
}

export type UpdateNodeInput = {
  displayName?: string
  management?: ManagementClass
  origin?: NodeOrigin
  flavor?: NodeFlavorId
  network?: NetworkName
  location?: LocationKind
  environment?: NodeEnvironment
  authorityLevel?: AuthorityLevel
  connectionRef?: string | null
  functions?: readonly NodeFunction[]
}

export type InventoryMutationResult = {
  node: NodeRecord
  revision: number
}

export async function addInventoryNode(
  repository: InventoryRepository,
  input: AddNodeInput,
  now: () => Date = () => new Date()
): Promise<InventoryMutationResult> {
  assertValidNodeId(input.id)
  assertDisplayName(input.displayName)
  if (input.connectionRef !== undefined) assertOpaqueReference(input.connectionRef, '--connection-ref')
  const snapshot = await repository.read()
  if (snapshot.nodes.some((node) => node.id === input.id)) throw duplicateNodeError(input.id)
  const timestamp = now().toISOString()
  const declaredFunctions = functionSet(input.functions)
  const location = {
    kind: input.location,
    environment: input.environment,
    ...(input.connectionRef === undefined ? {} : { connectionRef: input.connectionRef })
  }
  const node: NodeRecord = {
    id: input.id,
    displayName: input.displayName.trim(),
    management: {
      class: input.management,
      origin: input.origin,
      authorityLevel: input.authorityLevel,
      authority: authorityForLevel(input.authorityLevel)
    },
    declared: {
      flavor: { id: input.flavor },
      network: { name: input.network },
      location,
      functions: declaredFunctions,
      endpoints: [],
      identity: {}
    },
    desired: input.management === 'managed' ? {
      flavor: { id: input.flavor },
      network: { name: input.network },
      location: structuredClone(location),
      functions: observerSafeFunctions(declaredFunctions)
    } : null,
    observed: null,
    verified: null,
    provenance: provenanceFor(input.origin, timestamp)
  }
  assertValidInventoryNodes([...snapshot.nodes, node], EXIT_CODES.invalidInput)
  const saved = await repository.save([...snapshot.nodes, node], snapshot.revision)
  return { node: structuredClone(node), revision: saved.revision }
}

export async function updateInventoryNode(
  repository: InventoryRepository,
  nodeId: string,
  input: UpdateNodeInput
): Promise<InventoryMutationResult> {
  assertValidNodeId(nodeId)
  if (input.displayName !== undefined) assertDisplayName(input.displayName)
  if (typeof input.connectionRef === 'string') assertOpaqueReference(input.connectionRef, '--connection-ref')
  if (Object.keys(input).length === 0) {
    throw new ApplicationError({
      code: 'INVENTORY_UPDATE_EMPTY',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'At least one metadata option is required for an inventory update.',
      nextAction: 'Run "knm nodes update --help" to inspect editable fields.'
    })
  }
  const snapshot = await repository.read()
  const index = snapshot.nodes.findIndex((node) => node.id === nodeId)
  if (index < 0) throw nodeNotFound(nodeId)
  const current = snapshot.nodes[index] as NodeRecord
  const managementClass = input.management ?? current.management.class
  const authorityLevel = input.authorityLevel ?? current.management.authorityLevel
  const declared = structuredClone(current.declared)
  if (input.flavor !== undefined) declared.flavor = { id: input.flavor }
  if (input.network !== undefined) declared.network = { name: input.network }
  if (input.location !== undefined) declared.location.kind = input.location
  if (input.environment !== undefined) declared.location.environment = input.environment
  if (input.connectionRef === null) delete declared.location.connectionRef
  if (typeof input.connectionRef === 'string') declared.location.connectionRef = input.connectionRef
  if (input.functions !== undefined) declared.functions = functionSet(input.functions)

  const node: NodeRecord = {
    ...structuredClone(current),
    ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
    management: {
      ...current.management,
      class: managementClass,
      origin: input.origin ?? current.management.origin,
      authorityLevel,
      authority: authorityForLevel(authorityLevel)
    },
    declared,
    desired: managementClass === 'managed' ? {
      flavor: structuredClone(declared.flavor),
      network: structuredClone(declared.network),
      location: structuredClone(declared.location),
      functions: observerSafeFunctions(declared.functions)
    } : null
  }
  const nodes = [...snapshot.nodes]
  nodes[index] = node
  assertValidInventoryNodes(nodes, EXIT_CODES.invalidInput)
  const saved = await repository.save(nodes, snapshot.revision)
  return { node: structuredClone(node), revision: saved.revision }
}

export async function removeInventoryNode(
  repository: InventoryRepository,
  nodeId: string,
  confirmation: string
): Promise<InventoryMutationResult> {
  assertValidNodeId(nodeId)
  if (confirmation !== nodeId) {
    throw new ApplicationError({
      code: 'INVENTORY_REMOVE_CONFIRMATION_MISMATCH',
      exitCode: EXIT_CODES.safetyBlocked,
      severity: 'unsafe',
      retryable: false,
      message: 'Inventory removal confirmation does not match the target node ID.',
      nextAction: `Review the inventory record, then repeat with "--confirm ${nodeId}".`
    })
  }
  const snapshot = await repository.read()
  const node = snapshot.nodes.find((candidate) => candidate.id === nodeId)
  if (node === undefined) throw nodeNotFound(nodeId)
  const saved = await repository.save(snapshot.nodes.filter((candidate) => candidate.id !== nodeId), snapshot.revision)
  return { node: structuredClone(node), revision: saved.revision }
}

export function emptyInventorySnapshot(): InventorySnapshot {
  return { schemaVersion: 1, revision: 0, updatedAt: null, nodes: [] }
}

function functionSet(enabled: readonly NodeFunction[]): NodeFunctions {
  const selected = new Set(enabled)
  return Object.fromEntries(NODE_FUNCTIONS.map((name) => [name, selected.has(name) ? 'enabled' : 'unknown'])) as NodeFunctions
}

function observerSafeFunctions(declared: NodeFunctions): Partial<NodeFunctions> {
  return {
    ...declared,
    observer: 'enabled',
    producer: 'disabled'
  }
}

export function authorityForLevel(level: AuthorityLevel): NodeAuthority {
  const inspect = level !== 'none'
  const elevated = level === 'limited' || level === 'full'
  const full = level === 'full'
  return {
    inspect,
    configure: full,
    startStop: full,
    upgrade: full,
    backup: full,
    restore: full,
    logs: elevated,
    producerControl: false,
    walletAccess: false
  }
}

function provenanceFor(origin: NodeOrigin, timestamp: string): NodeRecord['provenance'] {
  if (origin === 'provisioned') return { provisionedAt: timestamp, source: 'operator-cli' }
  if (origin === 'adopted') return { adoptedAt: timestamp, source: 'operator-cli' }
  if (origin === 'discovered') return { discoveredAt: timestamp, source: 'operator-cli' }
  return { importedAt: timestamp, source: 'operator-cli' }
}

function assertDisplayName(value: string): void {
  const length = value.trim().length
  if (length === 0 || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)
    || /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|passphrase|token|secret|private[-_ ]?key)\s*[:=]/i.test(value)) {
    throw new ApplicationError({
      code: 'INVALID_NODE_DISPLAY_NAME',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'Node display names must contain 1-120 printable characters.',
      nextAction: 'Choose a concise operator-facing display name.'
    })
  }
}

function duplicateNodeError(nodeId: string): ApplicationError {
  return new ApplicationError({
    code: 'NODE_ID_CONFLICT',
    exitCode: EXIT_CODES.invalidInput,
    severity: 'error',
    retryable: false,
    message: `Node ID "${nodeId}" already exists in the inventory.`,
    nextAction: 'Choose another stable node ID or update the existing record.'
  })
}

function nodeNotFound(nodeId: string): ApplicationError {
  return new ApplicationError({
    code: 'NODE_NOT_FOUND',
    exitCode: EXIT_CODES.notFound,
    severity: 'error',
    retryable: false,
    message: `Node "${nodeId}" was not found.`,
    nextAction: 'Run "knm nodes list" to inspect available nodes.'
  })
}
