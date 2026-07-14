import { createHash } from 'node:crypto'
import { decodeStoredAgentCredential, encodeStoredAgentCredential } from './agent-credential.js'
import type { AgentClient } from './agent-client.js'
import { createPairingRequest, validateDiscovery, verifyPairingResponse } from './agent-protocol.js'
import { ApplicationError } from './application-error.js'
import { approveEndpoint, type AddressResolver } from './endpoint-policy.js'
import { EXIT_CODES } from './exit-codes.js'
import type { ConnectionStateRepository, ConnectionStateSnapshot } from './connection-state-repository.js'
import type { InventoryRepository, InventorySnapshot } from './node-repository.js'
import type { OnboardingCommitResult, OnboardingJournalRepository } from './onboarding-journal.js'
import { sanitizeInspectionSnapshot } from './sanitize-inspection.js'
import { sanitizeOnboardingReview } from './sanitize-onboarding.js'
import { assertValidInventoryNodes, assertValidNodeId } from './validate-node.js'
import { assertConnectionId } from './validate-connection-state.js'
import type { ReadOnlyProbeTransport } from './probe-transport.js'
import type { RuntimeInspectionAdapter } from './runtime-inspection-adapter.js'
import type { SecretStore } from './secret-store.js'
import type { AgentConnectionRecord, ConnectionRecord, PublicRpcConnectionRecord } from '../domain/connection.js'
import {
  NODE_ONBOARDING_CONTRACT_VERSION,
  NODE_ONBOARDING_SCHEMA_VERSION,
  type NodeAccessProfile,
  type NodeAccessSummary,
  type OnboardingReviewRecord,
  type PublicOnboardingReview
} from '../domain/onboarding.js'
import { NODE_FUNCTIONS, type NetworkName, type NodeFunctions, type NodeRecord } from '../domain/node.js'

export type QuickOnboardingServices = {
  connectionRepository: ConnectionStateRepository
  inventoryRepository: InventoryRepository
  journalRepository: OnboardingJournalRepository
  transport: ReadOnlyProbeTransport
  adapter: RuntimeInspectionAdapter
  resolver?: AddressResolver
  now?: () => Date
}

export type PreviewQuickInput = {
  nodeId: string
  displayName?: string
  endpoint: string
  allowPrivate?: boolean
  allowLoopbackHttp?: boolean
}

export type FullOnboardingServices = QuickOnboardingServices & {
  agentClient: AgentClient
  agentTransport: ReadOnlyProbeTransport
  secretStore: SecretStore
  inspectionAdapters: readonly RuntimeInspectionAdapter[]
}

export type PreviewFullInput = {
  nodeId: string
  displayName?: string
  endpoint: string
  pairingSessionRef: string
  expectedIdentityDigest: string
  allowPrivate?: boolean
  allowLoopbackHttp?: boolean
}

export type RevokeFullResult = {
  nodeId: string
  connectionId: string
  revoked: true
  connectionRevision: number
  runtimeChanged: false
}

export async function previewQuick(
  services: QuickOnboardingServices,
  input: PreviewQuickInput
): Promise<PublicOnboardingReview> {
  assertValidNodeId(input.nodeId)
  const displayName = normalizeDisplayName(input.displayName ?? input.nodeId)
  const now = (services.now ?? (() => new Date()))()
  const approved = await approveEndpoint({
    endpoint: input.endpoint,
    allowPrivate: input.allowPrivate ?? false,
    allowLoopbackHttp: input.allowLoopbackHttp ?? false
  }, services.resolver)
  const connectionId = boundedConnectionId(`${input.nodeId}-quick`)
  const state = await services.connectionRepository.read()
  const inventory = await services.inventoryRepository.read()
  if (inventory.nodes.some((node) => node.id === input.nodeId)) throw nodeConflict(input.nodeId)
  if (state.connections.some((connection) => connection.id === connectionId)) throw connectionConflict()
  const timestamp = now.toISOString()
  const connection: PublicRpcConnectionRecord = {
    id: connectionId,
    kind: 'public-rpc',
    endpoint: approved.url.toString(),
    endpointPolicy: approved.policy,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastTest: null
  }
  const privateSnapshot = await services.adapter.inspect({
    target: { nodeId: input.nodeId, displayName, flavor: 'unknown', expectedNetwork: 'unknown' },
    sections: ['overview', 'components', 'chain', 'governance'],
    timeoutMs: 10_000,
    capturedAt: timestamp,
    probe: { execute: (kind, timeoutMs) => services.transport.execute({ connection, kind, timeoutMs }) }
  })
  const inspection = sanitizeInspectionSnapshot(privateSnapshot)
  const node = quickNode(input.nodeId, displayName, connection.id, inspection, timestamp, approved.policy === 'https-public')
  assertValidInventoryNodes([...inventory.nodes, node])
  const accessSummary: NodeAccessSummary = {
    mode: 'quick',
    status: 'connected',
    capabilities: structuredClone(inspection.capabilities),
    authority: 'public-observe',
    lastVerifiedAt: timestamp,
    freshness: inspection.freshness,
    warnings: inspection.warnings.map((warning) => warning.code)
  }
  const review = createReview({
    mode: 'quick',
    status: 'review-ready',
    connectionStateRevision: state.revision + 1,
    inventoryRevision: inventory.revision,
    createdAt: timestamp,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    candidateConnection: connection,
    candidateNode: node,
    inspection,
    accessSummary
  })
  const saved = await services.connectionRepository.save({
    connections: state.connections,
    discoveries: state.discoveries,
    adoptionReviews: state.adoptionReviews,
    accessProfiles: state.accessProfiles,
    onboardingReviews: [...state.onboardingReviews, review]
  }, state.revision)
  if (saved.revision !== review.connectionStateRevision) throw staleReview('Connection state did not preserve the reviewed revision.')
  return sanitizeOnboardingReview(review, false)
}

export async function previewFull(
  services: FullOnboardingServices,
  input: PreviewFullInput
): Promise<PublicOnboardingReview> {
  assertValidNodeId(input.nodeId)
  assertPairingSessionRef(input.pairingSessionRef)
  if (!/^[0-9a-f]{64}$/.test(input.expectedIdentityDigest)) throw fullInputError('The expected agent identity fingerprint is invalid.')
  const displayName = normalizeDisplayName(input.displayName ?? input.nodeId)
  const now = (services.now ?? (() => new Date()))()
  const approved = await approveEndpoint({
    endpoint: input.endpoint,
    allowPrivate: input.allowPrivate ?? false,
    allowLoopbackHttp: input.allowLoopbackHttp ?? false
  }, services.resolver)
  const endpointPolicy = approved.policy
  const discovery = await services.agentClient.discover({ endpoint: approved.url.toString(), endpointPolicy }, 10_000)
  validateDiscovery(discovery)
  if (discovery.identityDigest !== input.expectedIdentityDigest) {
    throw new ApplicationError({
      code: 'AGENT_IDENTITY_CHANGED', exitCode: EXIT_CODES.safetyBlocked, severity: 'unsafe', retryable: false,
      message: 'The discovered agent identity does not match the pairing payload.',
      nextAction: 'Stop and compare the agent fingerprint through the trusted host console.'
    })
  }
  const adapter = services.inspectionAdapters.find((candidate) => candidate.flavor === discovery.runtimeFlavor)
  if (adapter === undefined) {
    throw new ApplicationError({
      code: 'AGENT_RUNTIME_UNSUPPORTED', exitCode: EXIT_CODES.transportUnavailable, severity: 'error', retryable: false,
      message: 'The paired agent runtime flavor is not supported.',
      nextAction: 'Install a compatible Node Manager inspection adapter without changing the node.'
    })
  }
  const state = await services.connectionRepository.read()
  const inventory = await services.inventoryRepository.read()
  const existingNode = inventory.nodes.find((node) => node.id === input.nodeId)
  const connectionId = boundedConnectionId(`${input.nodeId}-full`)
  const previousConnection = state.connections.find((connection) => connection.id === connectionId)
  const previousFullBinding = state.accessProfiles.find((profile) => profile.nodeId === input.nodeId)?.bindings
    .find((binding) => binding.connectionRef === `connection:${connectionId}` && binding.mode === 'full')
  if (previousConnection !== undefined && (previousConnection.kind !== 'agent' || previousFullBinding?.enabled !== false)) throw connectionConflict()
  const timestamp = now.toISOString()
  const connection: AgentConnectionRecord = {
    id: connectionId,
    kind: 'agent',
    endpoint: approved.url.toString(),
    endpointPolicy,
    pinnedAgentIdentityDigest: discovery.identityDigest,
    credentialRef: credentialReference(input.nodeId),
    protocolVersion: discovery.protocolVersion,
    runtimeFlavor: discovery.runtimeFlavor,
    scopes: ['inspect'],
    createdAt: previousConnection?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastTest: null
  }
  const candidateNode = existingNode === undefined
    ? agentNode(input.nodeId, displayName, connection, null, timestamp)
    : structuredClone(existingNode)
  const review = createReview({
    mode: 'full',
    status: 'pairing',
    connectionStateRevision: state.revision + 1,
    inventoryRevision: inventory.revision,
    createdAt: timestamp,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    candidateConnection: connection,
    candidateNode,
    inspection: null,
    accessSummary: {
      mode: 'full', status: 'degraded', capabilities: adapter.capabilities(), authority: 'paired-inspect',
      lastVerifiedAt: timestamp, freshness: 'fresh', warnings: ['AGENT_PAIRING_REQUIRED']
    },
    pairingSessionRef: input.pairingSessionRef
  })
  await services.connectionRepository.save({
    connections: state.connections,
    discoveries: state.discoveries,
    adoptionReviews: state.adoptionReviews,
    accessProfiles: state.accessProfiles,
    onboardingReviews: [...state.onboardingReviews, review]
  }, state.revision)
  return sanitizeOnboardingReview(review, existingNode !== undefined)
}

export async function pairFull(
  services: FullOnboardingServices,
  reviewId: string,
  pairingSecret: string
): Promise<PublicOnboardingReview> {
  const now = (services.now ?? (() => new Date()))()
  const state = await services.connectionRepository.read()
  const inventory = await services.inventoryRepository.read()
  const review = requireReview(state, reviewId)
  if (review.mode !== 'full' || review.status !== 'pairing' || review.pairingSessionRef === undefined || review.candidateConnection.kind !== 'agent') {
    throw staleReview('The Full Connect review is not waiting for pairing.')
  }
  if (Date.parse(review.expiresAt) <= now.getTime() || state.revision !== review.connectionStateRevision || inventory.revision !== review.inventoryRevision) {
    throw staleReview('The Full Connect review expired or local state changed before pairing.')
  }
  const agentConnection = review.candidateConnection
  const generated = createPairingRequest(review.pairingSessionRef, pairingSecret)
  const response = await services.agentClient.pair(agentConnection, generated.request, 10_000)
  verifyPairingResponse(response, review.pairingSessionRef, agentConnection.pinnedAgentIdentityDigest, generated.transcript, now)
  await services.secretStore.put(
    agentConnection.credentialRef,
    encodeStoredAgentCredential({ credentialId: response.credentialId, token: response.credential })
  )
  try {
    const adapter = services.inspectionAdapters.find((candidate) => candidate.flavor === agentConnection.runtimeFlavor)
    if (adapter === undefined) throw fullInputError('The paired runtime inspection adapter is unavailable.')
    const inspected = await adapter.inspect({
      target: {
        nodeId: review.candidateNode.id,
        displayName: review.candidateNode.displayName,
        flavor: adapter.flavor,
        expectedNetwork: review.candidateNode.declared.network.name,
        ...(review.candidateNode.declared.network.chainId === undefined ? {} : { expectedChainId: review.candidateNode.declared.network.chainId })
      },
      sections: ['overview', 'components', 'chain', 'governance'],
      timeoutMs: 10_000,
      capturedAt: now.toISOString(),
      probe: { execute: (kind, timeoutMs) => services.agentTransport.execute({ connection: agentConnection, kind, timeoutMs }) }
    })
    const inspection = sanitizeInspectionSnapshot(inspected)
    const candidateNode = inventory.nodes.some((node) => node.id === review.candidateNode.id)
      ? structuredClone(review.candidateNode)
      : agentNode(review.candidateNode.id, review.candidateNode.displayName, agentConnection, inspection, now.toISOString())
    const paired = createReview({
      mode: 'full',
      status: 'review-ready',
      connectionStateRevision: state.revision + 1,
      inventoryRevision: inventory.revision,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      candidateConnection: {
        ...structuredClone(agentConnection),
        updatedAt: now.toISOString(),
        lastTest: { outcome: 'success', testedAt: now.toISOString(), durationMs: 0 }
      },
      candidateNode,
      inspection,
      accessSummary: {
        mode: 'full', status: 'connected', capabilities: structuredClone(inspection.capabilities), authority: 'paired-inspect',
        lastVerifiedAt: now.toISOString(), freshness: inspection.freshness, warnings: inspection.warnings.map((warning) => warning.code)
      },
      pairingSessionRef: review.pairingSessionRef
    })
    await services.connectionRepository.save({
      connections: state.connections,
      discoveries: state.discoveries,
      adoptionReviews: state.adoptionReviews,
      accessProfiles: state.accessProfiles,
      onboardingReviews: state.onboardingReviews.map((candidate) => candidate.id === review.id ? paired : candidate)
    }, state.revision)
    return sanitizeOnboardingReview(paired, inventory.nodes.some((node) => node.id === paired.candidateNode.id))
  } catch (error: unknown) {
    await services.agentClient.revoke(
      agentConnection,
      response.credential,
      { schemaVersion: 1, protocolVersion: response.protocolVersion, credentialId: response.credentialId },
      5_000
    ).catch(() => undefined)
    await services.secretStore.delete(agentConnection.credentialRef).catch(() => undefined)
    throw error
  }
}

export async function revokeFull(
  services: Pick<FullOnboardingServices, 'connectionRepository' | 'agentClient' | 'secretStore'>,
  nodeId: string
): Promise<RevokeFullResult> {
  const state = await services.connectionRepository.read()
  const profile = state.accessProfiles.find((candidate) => candidate.nodeId === nodeId)
  const binding = profile?.bindings.find((candidate) => candidate.mode === 'full' && candidate.enabled)
  const connectionId = binding?.connectionRef.startsWith('connection:') ? binding.connectionRef.slice('connection:'.length) : undefined
  const connection = state.connections.find((candidate) => candidate.id === connectionId)
  if (profile === undefined || binding === undefined || connection?.kind !== 'agent') throw fullInputError('No active Full Connect credential exists for this node.')
  const stored = await services.secretStore.get(connection.credentialRef)
  if (stored === null) {
    throw new ApplicationError({
      code: 'AGENT_CREDENTIAL_UNAVAILABLE', exitCode: EXIT_CODES.configuration, severity: 'error', retryable: true,
      message: 'The paired agent credential is unavailable.',
      nextAction: 'Repair the operating-system credential store or pair the agent again.'
    })
  }
  const credential = decodeStoredAgentCredential(stored)
  await services.agentClient.revoke(connection, credential.token, {
    schemaVersion: 1,
    protocolVersion: connection.protocolVersion as '1.0.0',
    credentialId: credential.credentialId
  }, 10_000)
  await services.secretStore.delete(connection.credentialRef)
  const updatedProfile: NodeAccessProfile = {
    ...structuredClone(profile),
    bindings: profile.bindings.map((candidate) => candidate.connectionRef === binding.connectionRef ? { ...candidate, enabled: false } : candidate)
  }
  const saved = await services.connectionRepository.save({
    connections: state.connections,
    discoveries: state.discoveries,
    adoptionReviews: state.adoptionReviews,
    accessProfiles: state.accessProfiles.map((candidate) => candidate.nodeId === nodeId ? updatedProfile : candidate),
    onboardingReviews: state.onboardingReviews
  }, state.revision)
  return { nodeId, connectionId: connection.id, revoked: true, connectionRevision: saved.revision, runtimeChanged: false }
}

export async function applyOnboarding(
  services: Pick<QuickOnboardingServices, 'connectionRepository' | 'inventoryRepository' | 'journalRepository' | 'now'>,
  reviewId: string,
  confirmationDigest: string
): Promise<OnboardingCommitResult> {
  const now = (services.now ?? (() => new Date()))()
  const state = await services.connectionRepository.read()
  const inventory = await services.inventoryRepository.read()
  const review = requireReview(state, reviewId)
  assertReview(review, confirmationDigest, now)
  if (review.status === 'committed') {
    return { review: structuredClone(review), connectionRevision: state.revision, inventoryRevision: inventory.revision, reconciled: true }
  }
  if (state.revision !== review.connectionStateRevision || inventory.revision !== review.inventoryRevision) {
    throw staleReview('Inventory or connection state changed after the onboarding review.')
  }
  const accessProfile = profileFor(state, review)
  await services.journalRepository.prepare({
    schemaVersion: 1,
    reviewId: review.id,
    digest: review.digest,
    expectedConnectionRevision: state.revision,
    expectedInventoryRevision: inventory.revision,
    connection: structuredClone(review.candidateConnection),
    accessProfile,
    node: structuredClone(review.candidateNode),
    preparedAt: now.toISOString()
  })
  return reconcileOnboarding(services)
}

export async function reconcileOnboarding(
  services: Pick<QuickOnboardingServices, 'connectionRepository' | 'inventoryRepository' | 'journalRepository' | 'now'>
): Promise<OnboardingCommitResult> {
  const journal = await services.journalRepository.read()
  if (journal === null) {
    throw new ApplicationError({
      code: 'ONBOARDING_RECONCILIATION_NOT_REQUIRED',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'No onboarding commit journal requires reconciliation.',
      nextAction: 'Use onboarding status or create a new review.'
    })
  }
  let state = await services.connectionRepository.read()
  let review = requireReview(state, journal.reviewId)
  if (review.digest !== journal.digest) throw commitConflict()
  const connections = upsertReviewedConnection(state, journal.connection)
  const profiles = upsertProfileExact(state.accessProfiles, journal.accessProfile)
  const marked = { ...structuredClone(review), status: 'committed' as const, appliedAt: review.appliedAt ?? (services.now ?? (() => new Date()))().toISOString() }
  const reviews = state.onboardingReviews.map((candidate) => candidate.id === review.id ? marked : candidate)
  if (JSON.stringify(connections) !== JSON.stringify(state.connections)
    || JSON.stringify(profiles) !== JSON.stringify(state.accessProfiles)
    || review.status !== 'committed') {
    state = await services.connectionRepository.save({
      connections,
      discoveries: state.discoveries,
      adoptionReviews: state.adoptionReviews,
      accessProfiles: profiles,
      onboardingReviews: reviews
    }, state.revision)
  }
  let inventory = await services.inventoryRepository.read()
  const nodes = upsertExact(inventory.nodes, journal.node, 'node')
  if (JSON.stringify(nodes) !== JSON.stringify(inventory.nodes)) {
    inventory = await services.inventoryRepository.save(nodes, inventory.revision)
  }
  await services.journalRepository.clear(review.id)
  review = requireReview(state, review.id)
  return { review: structuredClone(review), connectionRevision: state.revision, inventoryRevision: inventory.revision, reconciled: state.revision !== journal.expectedConnectionRevision + 1 || inventory.revision !== journal.expectedInventoryRevision + 1 }
}

export async function cancelOnboarding(
  repository: ConnectionStateRepository,
  reviewId: string,
  now: () => Date = () => new Date()
): Promise<PublicOnboardingReview> {
  const state = await repository.read()
  const review = requireReview(state, reviewId)
  if (review.status === 'committed') throw staleReview('A committed onboarding review cannot be cancelled.')
  const cancelled: OnboardingReviewRecord = { ...structuredClone(review), status: 'cancelled', appliedAt: now().toISOString() }
  const saved = await repository.save({
    connections: state.connections,
    discoveries: state.discoveries,
    adoptionReviews: state.adoptionReviews,
    accessProfiles: state.accessProfiles,
    onboardingReviews: state.onboardingReviews.map((candidate) => candidate.id === reviewId ? cancelled : candidate)
  }, state.revision)
  return sanitizeOnboardingReview(cancelled, false)
}

export async function getOnboardingStatus(
  connectionRepository: ConnectionStateRepository,
  inventoryRepository: InventoryRepository,
  reviewId: string
): Promise<PublicOnboardingReview> {
  const state = await connectionRepository.read()
  const review = requireReview(state, reviewId)
  const inventory = await inventoryRepository.read()
  return sanitizeOnboardingReview(review, inventory.nodes.some((node) => node.id === review.candidateNode.id))
}

export function createReview(content: Omit<OnboardingReviewRecord, 'id' | 'schemaVersion' | 'contractVersion' | 'digest' | 'appliedAt'>): OnboardingReviewRecord {
  const immutable = {
    schemaVersion: NODE_ONBOARDING_SCHEMA_VERSION,
    contractVersion: NODE_ONBOARDING_CONTRACT_VERSION,
    mode: content.mode,
    connectionStateRevision: content.connectionStateRevision,
    inventoryRevision: content.inventoryRevision,
    createdAt: content.createdAt,
    expiresAt: content.expiresAt,
    candidateConnection: structuredClone(content.candidateConnection),
    candidateNode: structuredClone(content.candidateNode),
    inspection: content.inspection === null ? null : structuredClone(content.inspection),
    accessSummary: structuredClone(content.accessSummary),
    ...(content.pairingSessionRef === undefined ? {} : { pairingSessionRef: content.pairingSessionRef })
  }
  const digest = createHash('sha256').update(JSON.stringify(immutable)).digest('hex')
  return { id: `onboarding_${digest.slice(0, 16)}`, digest, ...immutable, status: content.status, appliedAt: null }
}

function quickNode(
  id: string,
  displayName: string,
  connectionId: string,
  inspection: ReturnType<typeof sanitizeInspectionSnapshot>,
  timestamp: string,
  publicEndpoint: boolean
): NodeRecord {
  const network = inspectedNetwork(inspection)
  const functions = unknownFunctions()
  const runtimeFacts = {
    flavor: { id: 'unknown' as const },
    network,
    location: { kind: 'external' as const, environment: 'unknown' as const, connectionRef: `connection:${connectionId}` },
    functions,
    endpoints: [{ kind: 'jsonrpc' as const, scope: publicEndpoint ? 'public' as const : 'private' as const, address: '<PRIVATE_ENDPOINT>' }],
    identity: {}
  }
  return {
    id,
    displayName,
    management: {
      class: 'connected',
      origin: 'imported',
      authorityLevel: 'observe',
      authority: readOnlyAuthority()
    },
    declared: structuredClone(runtimeFacts),
    desired: null,
    observed: { ...structuredClone(runtimeFacts), health: 'unknown', observedAt: timestamp, freshness: 'fresh' },
    verified: { network: structuredClone(network), location: structuredClone(runtimeFacts.location), verifiedAt: timestamp },
    provenance: { importedAt: timestamp, source: 'onboarding:quick' }
  }
}

function agentNode(
  id: string,
  displayName: string,
  connection: AgentConnectionRecord,
  inspection: ReturnType<typeof sanitizeInspectionSnapshot> | null,
  timestamp: string
): NodeRecord {
  const network = inspection === null ? { name: 'unknown' as const } : inspectedNetwork(inspection)
  const runtimeFacts = {
    flavor: { id: connection.runtimeFlavor },
    network,
    location: { kind: 'external' as const, environment: 'unknown' as const, connectionRef: `connection:${connection.id}` },
    functions: unknownFunctions(),
    endpoints: [],
    identity: {}
  }
  return {
    id,
    displayName,
    management: { class: 'connected', origin: 'imported', authorityLevel: 'observe', authority: readOnlyAuthority() },
    declared: structuredClone(runtimeFacts),
    desired: null,
    observed: { ...structuredClone(runtimeFacts), health: 'unknown', observedAt: timestamp, freshness: inspection?.freshness ?? 'fresh' },
    verified: { network: structuredClone(network), location: structuredClone(runtimeFacts.location), verifiedAt: timestamp },
    provenance: { importedAt: timestamp, source: 'onboarding:full' }
  }
}

function profileFor(state: ConnectionStateSnapshot, review: OnboardingReviewRecord): NodeAccessProfile {
  const existing = state.accessProfiles.find((profile) => profile.nodeId === review.candidateNode.id)
  const mode = review.mode
  const binding = {
    connectionRef: `connection:${review.candidateConnection.id}`,
    mode,
    capabilityClass: mode === 'quick' ? 'public-observe' as const : 'paired-inspect' as const,
    verifiedAt: review.accessSummary.lastVerifiedAt,
    enabled: true
  }
  return {
    nodeId: review.candidateNode.id,
    bindings: [...(existing?.bindings.filter((candidate) => candidate.connectionRef !== binding.connectionRef) ?? []), binding],
    preferredInspectionMode: existing?.preferredInspectionMode ?? 'automatic'
  }
}

function requireReview(state: ConnectionStateSnapshot, id: string): OnboardingReviewRecord {
  const review = state.onboardingReviews.find((candidate) => candidate.id === id)
  if (review !== undefined) return structuredClone(review)
  throw new ApplicationError({ code: 'ONBOARDING_REVIEW_NOT_FOUND', exitCode: EXIT_CODES.notFound, severity: 'error', retryable: false, message: 'The onboarding review was not found.', nextAction: 'Create a new Quick or Full onboarding review.' })
}

function assertReview(review: OnboardingReviewRecord, digest: string, now: Date): void {
  const recalculated = createReview({
    mode: review.mode,
    status: review.status === 'pairing' ? 'pairing' : 'review-ready',
    connectionStateRevision: review.connectionStateRevision,
    inventoryRevision: review.inventoryRevision,
    createdAt: review.createdAt,
    expiresAt: review.expiresAt,
    candidateConnection: review.candidateConnection,
    candidateNode: review.candidateNode,
    inspection: review.inspection,
    accessSummary: review.accessSummary,
    ...(review.pairingSessionRef === undefined ? {} : { pairingSessionRef: review.pairingSessionRef })
  })
  if (review.digest !== recalculated.digest || review.id !== recalculated.id) throw invalidReview()
  if (digest !== review.digest) throw new ApplicationError({ code: 'ONBOARDING_CONFIRMATION_MISMATCH', exitCode: EXIT_CODES.safetyBlocked, severity: 'unsafe', retryable: false, message: 'Onboarding confirmation does not match the reviewed digest.', nextAction: 'Review the current onboarding facts and confirm their exact digest.' })
  if (review.status !== 'review-ready') throw staleReview('The onboarding review is not ready to commit.')
  if (Date.parse(review.expiresAt) <= now.getTime()) throw staleReview('The onboarding review expired.')
}

function inspectedNetwork(snapshot: ReturnType<typeof sanitizeInspectionSnapshot>): { name: NetworkName; chainId?: string } {
  const network = snapshot.overview.network
  return network.availability === 'available' ? structuredClone(network.value) : { name: 'unknown' }
}

function unknownFunctions(): NodeFunctions {
  return Object.fromEntries(NODE_FUNCTIONS.map((name) => [name, 'unknown'])) as NodeFunctions
}

function readOnlyAuthority() {
  return { inspect: true, configure: false, startStop: false, upgrade: false, backup: false, restore: false, logs: false, producerControl: false, walletAccess: false }
}

function upsertExact<T extends { id: string }>(items: readonly T[], candidate: T, kind: string): readonly T[] {
  const existing = items.find((item) => item.id === candidate.id)
  if (existing === undefined) return [...structuredClone(items), structuredClone(candidate)]
  if (JSON.stringify(existing) === JSON.stringify(candidate)) return structuredClone(items)
  throw new ApplicationError({ code: 'ONBOARDING_REVISION_CONFLICT', exitCode: EXIT_CODES.stalePlan, severity: 'error', retryable: false, message: `The reviewed ${kind} identity now contains different metadata.`, nextAction: 'Preserve the pending journal and create a new review after resolving the conflict.' })
}

function upsertReviewedConnection(state: ConnectionStateSnapshot, candidate: ConnectionRecord): readonly ConnectionRecord[] {
  const existing = state.connections.find((connection) => connection.id === candidate.id)
  if (existing === undefined) return [...structuredClone(state.connections), structuredClone(candidate)]
  if (JSON.stringify(existing) === JSON.stringify(candidate)) return structuredClone(state.connections)
  const disabledFullBinding = state.accessProfiles.some((profile) => profile.bindings.some((binding) =>
    binding.connectionRef === `connection:${candidate.id}` && binding.mode === 'full' && !binding.enabled))
  if (existing.kind === 'agent' && candidate.kind === 'agent' && disabledFullBinding) {
    return state.connections.map((connection) => connection.id === candidate.id ? structuredClone(candidate) : structuredClone(connection))
  }
  throw new ApplicationError({
    code: 'ONBOARDING_REVISION_CONFLICT', exitCode: EXIT_CODES.stalePlan, severity: 'error', retryable: false,
    message: 'The reviewed connection identity now contains different metadata.',
    nextAction: 'Preserve the pending journal and create a new review after resolving the conflict.'
  })
}

function upsertProfileExact(items: readonly NodeAccessProfile[], candidate: NodeAccessProfile): readonly NodeAccessProfile[] {
  const existing = items.find((item) => item.nodeId === candidate.nodeId)
  if (existing === undefined) return [...structuredClone(items), structuredClone(candidate)]
  const merged: NodeAccessProfile = {
    ...structuredClone(existing),
    bindings: [
      ...existing.bindings.filter((binding) => !candidate.bindings.some((next) => next.connectionRef === binding.connectionRef)),
      ...structuredClone(candidate.bindings)
    ]
  }
  return items.map((item) => item.nodeId === candidate.nodeId ? merged : structuredClone(item))
}

function normalizeDisplayName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length > 0 && trimmed.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value)) return trimmed
  throw new ApplicationError({ code: 'INVALID_NODE_DISPLAY_NAME', exitCode: EXIT_CODES.invalidInput, severity: 'error', retryable: false, message: 'Node display names must contain 1-120 printable characters.', nextAction: 'Choose a concise operator-facing display name.' })
}

function boundedConnectionId(value: string): string {
  const id = value.length <= 64 ? value : `${value.slice(0, 47)}-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
  assertConnectionId(id)
  return id
}

function nodeConflict(id: string): ApplicationError {
  return new ApplicationError({ code: 'NODE_ID_CONFLICT', exitCode: EXIT_CODES.invalidInput, severity: 'error', retryable: false, message: `Node ID "${id}" already exists.`, nextAction: 'Use Full Connect to upgrade an existing Quick node or choose another stable ID.' })
}

function connectionConflict(): ApplicationError {
  return new ApplicationError({ code: 'CONNECTION_ID_CONFLICT', exitCode: EXIT_CODES.invalidInput, severity: 'error', retryable: false, message: 'The deterministic onboarding connection ID already exists.', nextAction: 'Inspect the existing node and connection before creating another review.' })
}

function credentialReference(nodeId: string): string {
  return `agent-credential:${nodeId}`
}

function assertPairingSessionRef(value: string): void {
  if (/^[A-Za-z0-9_-]{8,128}$/.test(value)) return
  throw fullInputError('The pairing session reference is invalid.')
}

function fullInputError(message: string): ApplicationError {
  return new ApplicationError({
    code: 'FULL_ONBOARDING_INPUT_INVALID', exitCode: EXIT_CODES.invalidInput, severity: 'error', retryable: false,
    message,
    nextAction: 'Create a fresh pairing payload from the read-only node agent.'
  })
}

function staleReview(message: string): ApplicationError {
  return new ApplicationError({ code: 'ONBOARDING_REVIEW_STALE', exitCode: EXIT_CODES.stalePlan, severity: 'error', retryable: false, message, nextAction: 'Run a fresh onboarding preview and review the current facts.' })
}

function invalidReview(): ApplicationError {
  return new ApplicationError({ code: 'ONBOARDING_REVIEW_INVALID', exitCode: EXIT_CODES.configuration, severity: 'error', retryable: false, message: 'The persisted onboarding review digest is invalid.', nextAction: 'Run "knm doctor" and create a new review.' })
}

function commitConflict(): ApplicationError {
  return new ApplicationError({ code: 'ONBOARDING_COMMIT_INTERRUPTED', exitCode: EXIT_CODES.configuration, severity: 'error', retryable: false, message: 'The onboarding journal does not match its persisted review.', nextAction: 'Preserve the private journal and inspect local state before retrying.' })
}
