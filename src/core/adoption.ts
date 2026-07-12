import { createHash } from 'node:crypto'
import { ApplicationError } from './application-error.js'
import type { ConnectionStateRepository } from './connection-state-repository.js'
import { EXIT_CODES } from './exit-codes.js'
import type { InventoryRepository } from './node-repository.js'
import { assertValidInventoryNodes, assertValidNodeId } from './validate-node.js'
import type { AdoptionReview, HostDiscoveryRecord } from '../domain/connection.js'
import { NODE_FUNCTIONS, type NodeAuthority, type NodeFunctions, type NodeRecord, type NodeRuntimeFacts } from '../domain/node.js'

export type AdoptionServices = {
  connectionRepository: ConnectionStateRepository
  inventoryRepository: InventoryRepository
  now?: () => Date
}

export async function planAdoption(
  services: AdoptionServices,
  input: { discoveryId?: string; connectionId?: string; nodeId: string; displayName: string }
): Promise<{ review: AdoptionReview; connectionStateRevision: number }> {
  assertValidNodeId(input.nodeId)
  assertDisplayName(input.displayName)
  if ((input.discoveryId === undefined) === (input.connectionId === undefined)) {
    throw invalidAdoptionInput('Provide exactly one of --discovery or --connection.')
  }
  const now = (services.now ?? (() => new Date()))()
  const state = await services.connectionRepository.read()
  const discovery = selectHostDiscovery(state.discoveries, input, now)
  const inventory = await services.inventoryRepository.read()
  if (inventory.nodes.some((node) => node.id === input.nodeId)) {
    throw new ApplicationError({
      code: 'NODE_ID_CONFLICT',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: `Node ID "${input.nodeId}" already exists in the inventory.`,
      nextAction: 'Choose another stable ID or inspect the existing record.'
    })
  }
  const node = nodeFromDiscovery(discovery, input.nodeId, input.displayName)
  assertValidInventoryNodes([...inventory.nodes, node])
  const connectionStateRevision = state.revision + 1
  const expiresAt = new Date(Math.min(Date.parse(discovery.expiresAt), now.getTime() + 10 * 60 * 1000)).toISOString()
  const content = {
    schemaVersion: 1 as const,
    discoveryId: discovery.id,
    connectionStateRevision,
    inventoryRevision: inventory.revision,
    createdAt: now.toISOString(),
    expiresAt,
    disposition: node.management.class === 'managed' ? 'managed-adopted' as const : 'connected-limited' as const,
    node
  }
  const digest = digestReview(content)
  const review: AdoptionReview = {
    id: `adoption_${digest.slice(0, 16)}`,
    digest,
    ...content,
    application: null
  }
  const saved = await services.connectionRepository.save({
    connections: state.connections,
    discoveries: state.discoveries,
    adoptionReviews: [...state.adoptionReviews, review]
  }, state.revision)
  return { review, connectionStateRevision: saved.revision }
}

export async function applyAdoption(
  services: AdoptionServices,
  reviewId: string,
  confirmationDigest: string
): Promise<{ review: AdoptionReview; inventoryRevision: number; connectionStateRevision: number; reconciled: boolean }> {
  const now = (services.now ?? (() => new Date()))()
  let state = await services.connectionRepository.read()
  let review = state.adoptionReviews.find((candidate) => candidate.id === reviewId)
  if (review === undefined) throw adoptionNotFound()
  const reviewed = review
  assertReviewDigest(reviewed)
  if (confirmationDigest !== reviewed.digest) {
    throw new ApplicationError({
      code: 'ADOPTION_CONFIRMATION_MISMATCH',
      exitCode: EXIT_CODES.safetyBlocked,
      severity: 'unsafe',
      retryable: false,
      message: 'Adoption confirmation does not match the reviewed digest.',
      nextAction: 'Review the current adoption plan and confirm its exact digest.'
    })
  }
  const inventory = await services.inventoryRepository.read()
  const existing = inventory.nodes.find((node) => node.id === reviewed.node.id)
  if (existing !== undefined) {
    if (JSON.stringify(existing) !== JSON.stringify(reviewed.node)) {
      throw new ApplicationError({
        code: 'ADOPTION_NODE_CONFLICT',
        exitCode: EXIT_CODES.stalePlan,
        severity: 'error',
        retryable: false,
        message: 'The target node ID now contains different inventory metadata.',
        nextAction: 'Inspect the node and create a new adoption review.'
      })
    }
    if (reviewed.application !== null) {
      return { review: structuredClone(reviewed), inventoryRevision: inventory.revision, connectionStateRevision: state.revision, reconciled: true }
    }
    const marked = await markApplied(services.connectionRepository, state, reviewed, now)
    return { review: marked.review, inventoryRevision: inventory.revision, connectionStateRevision: marked.revision, reconciled: true }
  }
  if (Date.parse(reviewed.expiresAt) <= now.getTime()) throw staleAdoption('The adoption review or its discovery evidence expired.')
  if (state.revision !== reviewed.connectionStateRevision) throw staleAdoption('Connection or discovery state changed after review.')
  if (inventory.revision !== reviewed.inventoryRevision) throw staleAdoption('Inventory state changed after review.')
  const discovery = state.discoveries.find((candidate) => candidate.id === reviewed.discoveryId)
  if (discovery?.kind !== 'host' || discovery.status !== 'active' || Date.parse(discovery.expiresAt) <= now.getTime()) {
    throw staleAdoption('The bound discovery evidence is unavailable, dismissed, or stale.')
  }
  const savedInventory = await services.inventoryRepository.save([...inventory.nodes, reviewed.node], inventory.revision)
  state = await services.connectionRepository.read()
  review = state.adoptionReviews.find((candidate) => candidate.id === reviewId)
  if (review === undefined) throw adoptionNotFound()
  const marked = await markApplied(services.connectionRepository, state, review, now)
  return { review: marked.review, inventoryRevision: savedInventory.revision, connectionStateRevision: marked.revision, reconciled: false }
}

export async function listAdoptionReviews(repository: ConnectionStateRepository): Promise<readonly AdoptionReview[]> {
  return [...structuredClone((await repository.read()).adoptionReviews)].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function selectHostDiscovery(
  discoveries: readonly import('../domain/connection.js').DiscoveryRecord[],
  input: { discoveryId?: string; connectionId?: string },
  now: Date
): HostDiscoveryRecord {
  const candidates = discoveries.filter((discovery): discovery is HostDiscoveryRecord => discovery.kind === 'host')
  const selected = input.discoveryId !== undefined
    ? candidates.find((discovery) => discovery.id === input.discoveryId)
    : candidates.filter((discovery) => discovery.source.connectionId === input.connectionId).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]
  if (selected === undefined) throw new ApplicationError({
    code: 'HOST_DISCOVERY_REQUIRED',
    exitCode: EXIT_CODES.notFound,
    severity: 'error',
    retryable: false,
    message: 'No host discovery evidence matches the adoption request.',
    nextAction: 'Run a read-only host discovery before planning adoption.'
  })
  if (selected.status !== 'active' || Date.parse(selected.expiresAt) <= now.getTime()) throw staleAdoption('The selected host discovery is dismissed or stale.')
  return selected
}

function nodeFromDiscovery(discovery: HostDiscoveryRecord, id: string, displayName: string): NodeRecord {
  const facts = discovery.findings
  const full = facts.evidenceCompleteness === 'complete'
    && facts.capabilities.inspect
    && facts.capabilities.configure
    && facts.capabilities.startStop
    && facts.capabilities.upgrade
    && facts.capabilities.backup
    && facts.capabilities.restore
    && facts.capabilities.logs
  const authority: NodeAuthority = full
    ? { ...facts.capabilities, producerControl: false, walletAccess: false }
    : {
        inspect: facts.capabilities.inspect,
        configure: false,
        startStop: false,
        upgrade: false,
        backup: false,
        restore: false,
        logs: facts.capabilities.logs,
        producerControl: false,
        walletAccess: false
      }
  const runtimeFacts: NodeRuntimeFacts = {
    flavor: structuredClone(facts.flavor),
    network: structuredClone(facts.network),
    location: { kind: 'remote', environment: facts.environment, connectionRef: `connection:${discovery.source.connectionId}` },
    functions: structuredClone(facts.functions),
    endpoints: facts.endpoints.map((endpoint) => ({ ...endpoint, address: '<DISCOVERED_ENDPOINT>' })),
    identity: {
      ...(facts.identity.peerIdPresent ? { peerId: '<PEER_ID_PRESENT>' } : {}),
      ...(facts.identity.runtimeInstanceIdPresent ? { runtimeInstanceId: '<RUNTIME_INSTANCE_ID_PRESENT>' } : {}),
      ...(facts.identity.producerAddressPresent ? { producerAddress: '<PRODUCER_ADDRESS_PRESENT>' } : {})
    },
    supervisor: structuredClone(facts.supervisor),
    runtime: structuredClone(facts.runtime),
    instance: structuredClone(facts.instance),
    artifact: structuredClone(facts.artifact)
  }
  return {
    id,
    displayName: displayName.trim(),
    management: {
      class: full ? 'managed' : 'connected',
      origin: 'adopted',
      authorityLevel: full ? 'full' : 'limited',
      authority
    },
    declared: structuredClone(runtimeFacts),
    desired: full ? {
      flavor: structuredClone(facts.flavor),
      network: structuredClone(facts.network),
      location: structuredClone(runtimeFacts.location),
      functions: observerSafeFunctions(facts.functions),
      supervisor: structuredClone(facts.supervisor),
      runtime: structuredClone(facts.runtime),
      instance: structuredClone(facts.instance),
      artifact: structuredClone(facts.artifact)
    } : null,
    observed: {
      ...structuredClone(runtimeFacts),
      health: 'unknown',
      observedAt: discovery.capturedAt,
      freshness: 'fresh'
    },
    verified: {
      flavor: structuredClone(facts.flavor),
      network: structuredClone(facts.network),
      location: structuredClone(runtimeFacts.location),
      functions: structuredClone(facts.functions),
      supervisor: structuredClone(facts.supervisor),
      runtime: structuredClone(facts.runtime),
      instance: structuredClone(facts.instance),
      artifact: structuredClone(facts.artifact),
      verifiedAt: discovery.capturedAt
    },
    provenance: { adoptedAt: discovery.capturedAt, source: `adoption:${discovery.id}` }
  }
}

function observerSafeFunctions(functions: NodeFunctions): Partial<NodeFunctions> {
  return Object.fromEntries(NODE_FUNCTIONS.map((name) => [name, name === 'observer' ? 'enabled' : name === 'producer' ? 'disabled' : functions[name]]))
}

async function markApplied(
  repository: ConnectionStateRepository,
  state: Awaited<ReturnType<ConnectionStateRepository['read']>>,
  review: AdoptionReview,
  now: Date
): Promise<{ review: AdoptionReview; revision: number }> {
  const index = state.adoptionReviews.findIndex((candidate) => candidate.id === review.id)
  if (index < 0) throw adoptionNotFound()
  const applied: AdoptionReview = { ...structuredClone(review), application: { appliedAt: now.toISOString(), nodeId: review.node.id } }
  const reviews = [...state.adoptionReviews]
  reviews[index] = applied
  const saved = await repository.save({ connections: state.connections, discoveries: state.discoveries, adoptionReviews: reviews }, state.revision)
  return { review: applied, revision: saved.revision }
}

function digestReview(content: Omit<AdoptionReview, 'id' | 'digest' | 'application'>): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

function assertReviewDigest(review: AdoptionReview): void {
  const { id: _id, digest, application: _application, ...content } = review
  if (digestReview(content) === digest && review.id === `adoption_${digest.slice(0, 16)}`) return
  throw new ApplicationError({
    code: 'ADOPTION_REVIEW_INVALID',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: false,
    message: 'The persisted adoption review digest is invalid.',
    nextAction: 'Run "knm doctor" and create a new review from fresh discovery evidence.'
  })
}

function assertDisplayName(value: string): void {
  if (value.trim().length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value)) return
  throw invalidAdoptionInput('Node display names must contain 1-120 printable characters.')
}

function invalidAdoptionInput(message: string): ApplicationError {
  return new ApplicationError({ code: 'INVALID_ADOPTION_INPUT', exitCode: EXIT_CODES.invalidInput, severity: 'error', retryable: false, message, nextAction: 'Run "knm nodes adoption plan --help".' })
}

function staleAdoption(message: string): ApplicationError {
  return new ApplicationError({ code: 'ADOPTION_REVIEW_STALE', exitCode: EXIT_CODES.stalePlan, severity: 'error', retryable: false, message, nextAction: 'Run fresh inspection and create a new adoption review.' })
}

function adoptionNotFound(): ApplicationError {
  return new ApplicationError({ code: 'ADOPTION_REVIEW_NOT_FOUND', exitCode: EXIT_CODES.notFound, severity: 'error', retryable: false, message: 'The requested adoption review was not found.', nextAction: 'Create a new review from fresh host discovery evidence.' })
}
