import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import {
  INSPECTION_AVAILABILITY_REASONS,
  NODE_INSPECTION_CONTRACT_VERSION,
  NODE_INSPECTION_SCHEMA_VERSION,
  type NodeInspectionSnapshot,
  type PublicNodeInspectionSnapshot
} from '../domain/inspection.js'
import { NETWORKS, NODE_FLAVORS } from '../domain/node.js'

const FORBIDDEN_KEYS = new Set([
  'hostAlias',
  'hostName',
  'hostname',
  'username',
  'sshUser',
  'privateKey',
  'privateKeyPath',
  'password',
  'passphrase',
  'token',
  'secret',
  'peerId',
  'producerAddress',
  'endpointAddress',
  'rawOutput',
  'command',
  'configPath',
  'baseDir'
])

const PRIVATE_VALUE = /(?:ssh:\/\/|(?:^|\s)\/Users\/|(?:^|\s)\/home\/|[A-Za-z]:\\|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|password=|token=|secret=)/i

export function sanitizeInspectionSnapshot(snapshot: NodeInspectionSnapshot): PublicNodeInspectionSnapshot {
  assertSnapshotSchema(snapshot)
  assertSafeValue(snapshot, new Set<object>())
  return structuredClone(snapshot)
}

type ValueValidator = (value: unknown) => void

function assertSnapshotSchema(value: unknown): void {
  const snapshot = exactRecord(value, [
    'schemaVersion', 'contractVersion', 'node', 'capturedAt', 'freshness',
    'readOnly', 'capabilities', 'overview', 'components', 'chain', 'apis',
    'producer', 'governance', 'resources', 'warnings', 'evidence'
  ])
  if (
    snapshot.schemaVersion !== NODE_INSPECTION_SCHEMA_VERSION
    || snapshot.contractVersion !== NODE_INSPECTION_CONTRACT_VERSION
    || snapshot.readOnly !== true
  ) throw unsafeInspectionSnapshot()
  const node = exactRecord(snapshot.node, ['id', 'displayName', 'flavor'])
  safeText(node.id)
  safeText(node.displayName)
  oneOf(node.flavor, NODE_FLAVORS)
  isoDate(snapshot.capturedAt)
  oneOf(snapshot.freshness, ['fresh', 'stale'])

  const capabilities = exactRecord(snapshot.capabilities, [
    'overview', 'components', 'chain', 'governance', 'apis', 'producer', 'resources'
  ])
  for (const supported of Object.values(capabilities)) boolean(supported)

  validateOverview(snapshot.overview)
  inspectionValue(snapshot.components, (components) => array(components, validateComponent))
  validateChain(snapshot.chain)
  inspectionValue(snapshot.apis, (apis) => array(apis, validateApi))
  validateProducer(snapshot.producer)
  validateGovernance(snapshot.governance)
  validateResources(snapshot.resources)
  array(snapshot.warnings, validateWarning)
  array(snapshot.evidence, validateEvidence)
}

function validateOverview(value: unknown): void {
  const overview = exactRecord(value, [
    'runtime', 'instance', 'network', 'build', 'supervisor', 'layout', 'uptimeSeconds'
  ])
  inspectionValue(overview.runtime, (runtimeValue) => {
    const runtime = exactRecord(runtimeValue, ['flavor', 'version'], ['flavor'])
    oneOf(runtime.flavor, NODE_FLAVORS)
    optional(runtime.version, safeText)
  })
  inspectionValue(overview.instance, (instanceValue) => {
    const instance = exactRecord(instanceValue, ['present'])
    boolean(instance.present)
  })
  inspectionValue(overview.network, (networkValue) => {
    const network = exactRecord(networkValue, ['name', 'chainId'], ['name'])
    oneOf(network.name, NETWORKS)
    optional(network.chainId, safeText)
  })
  inspectionValue(overview.build, validateArtifact)
  inspectionValue(overview.supervisor, (supervisor) => oneOf(supervisor, ['docker', 'foreground', 'launchd', 'systemd', 'unknown']))
  inspectionValue(overview.layout, (layout) => oneOf(layout, ['legacy-services', 'monolith']))
  inspectionValue(overview.uptimeSeconds, nonNegativeNumber)
}

function validateComponent(value: unknown): void {
  const component = exactRecord(value, [
    'name', 'available', 'state', 'restartCount', 'artifact', 'uptimeSeconds'
  ])
  safeText(component.name)
  inspectionValue(component.available, boolean)
  inspectionValue(component.state, (state) => oneOf(state, ['running', 'stopped', 'restarting', 'paused', 'failed', 'unknown']))
  inspectionValue(component.restartCount, nonNegativeNumber)
  inspectionValue(component.artifact, validateArtifact)
  inspectionValue(component.uptimeSeconds, nonNegativeNumber)
}

function validateChain(value: unknown): void {
  const chain = exactRecord(value, [
    'head', 'lastIrreversibleBlock', 'headAgeSeconds', 'progress',
    'blockStoreAgreement', 'forks', 'p2pGossip', 'peerCount'
  ])
  inspectionValue(chain.head, (headValue) => {
    const head = exactRecord(headValue, ['height', 'blockId'], ['height'])
    nonNegativeNumber(head.height)
    optional(head.blockId, safeText)
  })
  inspectionValue(chain.lastIrreversibleBlock, nonNegativeNumber)
  inspectionValue(chain.headAgeSeconds, nonNegativeNumber)
  inspectionValue(chain.progress, (progress) => oneOf(progress, ['advancing', 'stalled']))
  inspectionValue(chain.blockStoreAgreement, (agreement) => oneOf(agreement, ['agrees', 'lagging', 'mismatch']))
  inspectionValue(chain.forks, (forkValue) => {
    const forks = exactRecord(forkValue, ['detected', 'count'])
    boolean(forks.detected)
    nonNegativeNumber(forks.count)
  })
  inspectionValue(chain.p2pGossip, boolean)
  inspectionValue(chain.peerCount, nonNegativeNumber)
}

function validateApi(value: unknown): void {
  const api = exactRecord(value, ['kind', 'scope', 'exposed'])
  oneOf(api.kind, ['jsonrpc', 'grpc', 'rest', 'admin'])
  oneOf(api.scope, ['local', 'private', 'public', 'unknown'])
  boolean(api.exposed)
}

function validateProducer(value: unknown): void {
  const producer = exactRecord(value, [
    'configured', 'effectiveEnabled', 'addressPresent', 'recentProduction',
    'productionPercentage'
  ])
  inspectionValue(producer.configured, boolean)
  inspectionValue(producer.effectiveEnabled, boolean)
  inspectionValue(producer.addressPresent, boolean)
  inspectionValue(producer.recentProduction, (activityValue) => {
    const activity = exactRecord(activityValue, ['producedBlocks', 'observationWindowBlocks'])
    nonNegativeNumber(activity.producedBlocks)
    nonNegativeNumber(activity.observationWindowBlocks)
  })
  inspectionValue(producer.productionPercentage, nonNegativeNumber)
}

function validateGovernance(value: unknown): void {
  const governance = exactRecord(value, [
    'configuredProposalIds', 'effectiveProposalIds', 'observedProposalVotes',
    'networkProposals'
  ])
  inspectionValue(governance.configuredProposalIds, (ids) => array(ids, safeText))
  inspectionValue(governance.effectiveProposalIds, (ids) => array(ids, safeText))
  inspectionValue(governance.observedProposalVotes, (votes) => array(votes, (voteValue) => {
    const vote = exactRecord(voteValue, ['proposalId', 'blockHeight'])
    safeText(vote.proposalId)
    nonNegativeNumber(vote.blockHeight)
  }))
  inspectionValue(governance.networkProposals, (proposals) => array(proposals, (proposalValue) => {
    const proposal = exactRecord(proposalValue, ['proposalId', 'status', 'tally', 'threshold'], ['proposalId', 'status'])
    safeText(proposal.proposalId)
    safeText(proposal.status)
    optional(proposal.tally, safeText)
    optional(proposal.threshold, safeText)
  }))
}

function validateResources(value: unknown): void {
  const resources = exactRecord(value, ['storage', 'cpuPercent', 'memoryBytes'])
  inspectionValue(resources.storage, (storageValue) => {
    const storage = exactRecord(storageValue, ['totalBytes', 'usedBytes', 'freeBytes'])
    nonNegativeNumber(storage.totalBytes)
    nonNegativeNumber(storage.usedBytes)
    nonNegativeNumber(storage.freeBytes)
  })
  inspectionValue(resources.cpuPercent, nonNegativeNumber)
  inspectionValue(resources.memoryBytes, nonNegativeNumber)
}

function validateWarning(value: unknown): void {
  const warning = exactRecord(value, ['code', 'severity', 'summary'])
  safeText(warning.code)
  oneOf(warning.severity, ['warning', 'unsafe'])
  safeText(warning.summary)
}

function validateArtifact(value: unknown): void {
  const artifact = exactRecord(value, ['version', 'digest'], [])
  optional(artifact.version, safeText)
  optional(artifact.digest, safeText)
}

function inspectionValue(value: unknown, validateAvailable: ValueValidator): void {
  const record = object(value)
  const availability = oneOf(record.availability, ['available', 'unavailable', 'unknown'])
  if (availability === 'available') {
    const availableValue = exactRecord(record, ['availability', 'value', 'evidence'])
    validateAvailable(availableValue.value)
    validateEvidence(availableValue.evidence)
    return
  }
  const missingValue = exactRecord(record, ['availability', 'reason', 'evidence'])
  oneOf(missingValue.reason, INSPECTION_AVAILABILITY_REASONS)
  validateEvidence(missingValue.evidence)
}

function validateEvidence(value: unknown): void {
  const evidence = exactRecord(value, ['source', 'observedAt', 'freshness', 'authority'])
  oneOf(evidence.source, ['docker', 'configuration', 'jsonrpc', 'runtime-status', 'derived'])
  isoDate(evidence.observedAt)
  oneOf(evidence.freshness, ['fresh', 'stale'])
  oneOf(evidence.authority, ['reported', 'observed', 'verified'])
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
): Record<string, unknown> {
  const record = object(value)
  const allowed = new Set(allowedKeys)
  if (Object.keys(record).some((key) => !allowed.has(key))) throw unsafeInspectionSnapshot()
  if (requiredKeys.some((key) => !(key in record))) throw unsafeInspectionSnapshot()
  return record
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw unsafeInspectionSnapshot()
  return value as Record<string, unknown>
}

function array(value: unknown, validateItem: ValueValidator): void {
  if (!Array.isArray(value) || value.length > 10_000) throw unsafeInspectionSnapshot()
  for (const item of value) validateItem(item)
}

function safeText(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000) throw unsafeInspectionSnapshot()
}

function boolean(value: unknown): void {
  if (typeof value !== 'boolean') throw unsafeInspectionSnapshot()
}

function nonNegativeNumber(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw unsafeInspectionSnapshot()
}

function isoDate(value: unknown): void {
  safeText(value)
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw unsafeInspectionSnapshot()
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw unsafeInspectionSnapshot()
  return value as T
}

function optional(value: unknown, validate: ValueValidator): void {
  if (value !== undefined) validate(value)
}

function assertSafeValue(value: unknown, seen: Set<object>): void {
  if (typeof value === 'string') {
    if (value.length > 2_000 || PRIVATE_VALUE.test(value)) throw unsafeInspectionSnapshot()
    return
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertSafeValue(item, seen)
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw unsafeInspectionSnapshot()
    assertSafeValue(nested, seen)
  }
}

function unsafeInspectionSnapshot(): ApplicationError {
  return new ApplicationError({
    code: 'INSPECTION_PUBLIC_DTO_UNSAFE',
    exitCode: EXIT_CODES.safetyBlocked,
    severity: 'unsafe',
    retryable: false,
    message: 'Runtime inspection evidence could not cross the sanitized public boundary.',
    nextAction: 'Review the runtime adapter and redaction contract before retrying inspection.'
  })
}
