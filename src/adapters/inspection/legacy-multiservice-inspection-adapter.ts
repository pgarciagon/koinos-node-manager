import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import {
  available,
  collectInspectionEvidence,
  inspectionEvidence,
  unavailable,
  unknown
} from '../../core/inspection-values.js'
import type {
  ProbeKind,
  ProbeResponse,
  RuntimeInspectionProbeKind
} from '../../core/probe-transport.js'
import type {
  RuntimeInspectionAdapter,
  RuntimeInspectionRequest
} from '../../core/runtime-inspection-adapter.js'
import {
  NODE_INSPECTION_CONTRACT_VERSION,
  NODE_INSPECTION_SCHEMA_VERSION,
  type InspectionApi,
  type InspectionChain,
  type InspectionComponent,
  type InspectionComponentState,
  type InspectionGovernance,
  type InspectionOverview,
  type InspectionProducer,
  type InspectionResources,
  type InspectionSection,
  type InspectionValue,
  type InspectionWarning,
  type NodeInspectionSnapshot,
  type RuntimeInspectionCapabilities
} from '../../domain/inspection.js'

const LEGACY_COMPONENT_NAME_BY_SERVICE: Readonly<Record<string, string>> = Object.freeze({
  amqp: 'amqp',
  chain: 'chain',
  mempool: 'mempool',
  block_store: 'block_store',
  p2p: 'p2p',
  block_producer: 'block_producer',
  block_producer_2: 'block_producer-secondary',
  jsonrpc: 'jsonrpc',
  grpc: 'grpc',
  transaction_store: 'transaction_store',
  contract_meta_store: 'contract_meta_store',
  account_history: 'account_history',
  rest: 'rest'
})

const LEGACY_COMPONENT_NAMES = [...new Set(Object.values(LEGACY_COMPONENT_NAME_BY_SERVICE))]

const HEAD_STALE_AFTER_SECONDS = 300

const API_COMPONENTS: Readonly<Record<string, InspectionApi['kind']>> = Object.freeze({
  jsonrpc: 'jsonrpc',
  grpc: 'grpc',
  rest: 'rest',
  amqp: 'admin'
})

const PROBES_BY_SECTION: Readonly<Record<InspectionSection, readonly RuntimeInspectionProbeKind[]>> = Object.freeze({
  overview: [
    'node.multiservice.components',
    'node.multiservice.chain-head',
    'node.multiservice.chain-id',
    'node.multiservice.config',
    'node.multiservice.resources'
  ],
  components: ['node.multiservice.components'],
  chain: [
    'node.multiservice.chain-head',
    'node.multiservice.chain-id',
    'node.multiservice.chain-forks',
    'node.multiservice.block-store-head',
    'node.multiservice.p2p-status'
  ],
  governance: ['node.multiservice.config']
})

type DockerComponent = {
  name: string
  state: InspectionComponentState
  restartCount: number
  version?: string
  digest?: string
  startedAt?: string
  ports: readonly { hostIp: string }[]
}

type ChainHead = {
  height: number
  blockId?: string
  lastIrreversibleBlock: number
  headBlockTime?: number
}

type BlockStoreHead = { height: number; blockId?: string }

type SafeConfiguration = {
  producerAddressPresent: boolean
  instancePresent: boolean
  productionPercentage?: number
  configuredProposalIds: readonly string[]
}

type StorageResources = { totalBytes: number; usedBytes: number; freeBytes: number }

type ParsedProbeData = {
  components?: readonly DockerComponent[]
  chainHead?: ChainHead
  chainId?: string
  forkCount?: number
  blockStoreHead?: BlockStoreHead
  p2pGossip?: boolean
  configuration?: SafeConfiguration
  storage?: StorageResources
  malformed: ProbeKind[]
}

export class LegacyMultiserviceInspectionAdapter implements RuntimeInspectionAdapter {
  readonly flavor = 'legacy-microservices' as const
  readonly contractVersion = NODE_INSPECTION_CONTRACT_VERSION

  capabilities(): RuntimeInspectionCapabilities {
    return {
      overview: true,
      components: true,
      chain: true,
      governance: true,
      apis: true,
      producer: true,
      resources: true
    }
  }

  async inspect(request: RuntimeInspectionRequest): Promise<NodeInspectionSnapshot> {
    const kinds = requestedProbeKinds(request.sections)
    const responses = new Map<ProbeKind, ProbeResponse>()
    await Promise.all(kinds.map(async (kind) => {
      try {
        responses.set(kind, await request.probe.execute(kind, request.timeoutMs))
      } catch {
        responses.set(kind, { outcome: 'unreachable', durationMs: 0, payload: null })
      }
    }))

    const parsed = parseProbeData(responses)
    requireUsableTransport(responses, parsed)
    return buildSnapshot(request, responses, parsed, this.capabilities())
  }
}

function requestedProbeKinds(sections: readonly InspectionSection[]): readonly RuntimeInspectionProbeKind[] {
  return [...new Set(sections.flatMap((section) => PROBES_BY_SECTION[section]))]
}

function parseProbeData(responses: ReadonlyMap<ProbeKind, ProbeResponse>): ParsedProbeData {
  const parsed: ParsedProbeData = { malformed: [] }
  parseSuccessful(responses, 'node.multiservice.components', parseComponents, (value) => { parsed.components = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.chain-head', parseChainHead, (value) => { parsed.chainHead = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.chain-id', parseChainId, (value) => { parsed.chainId = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.chain-forks', parseForkCount, (value) => { parsed.forkCount = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.block-store-head', parseBlockStoreHead, (value) => { parsed.blockStoreHead = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.p2p-status', parseP2pStatus, (value) => { parsed.p2pGossip = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.config', parseConfiguration, (value) => { parsed.configuration = value }, parsed)
  parseSuccessful(responses, 'node.multiservice.resources', parseResources, (value) => { parsed.storage = value }, parsed)
  return parsed
}

function parseSuccessful<T>(
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  kind: ProbeKind,
  parser: (payload: string) => T,
  apply: (value: T) => void,
  parsed: ParsedProbeData
): void {
  const response = responses.get(kind)
  if (response?.outcome !== 'success' || response.payload === null) return
  try {
    apply(parser(response.payload))
  } catch {
    parsed.malformed.push(kind)
  }
}

function requireUsableTransport(
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  parsed: ParsedProbeData
): void {
  const parsedCount = Object.keys(parsed).filter((key) => key !== 'malformed').length
  if (parsedCount > 0) return
  const outcomes = [...responses.values()].map((response) => response.outcome)
  if (outcomes.includes('authentication-failed')) throw inspectionTransportError('INSPECTION_AUTHENTICATION_FAILED', false)
  if (outcomes.includes('timeout')) throw inspectionTransportError('INSPECTION_TIMEOUT', true)
  if (outcomes.includes('unreachable')) throw inspectionTransportError('INSPECTION_UNREACHABLE', true)
  if (parsed.malformed.length > 0 || outcomes.includes('malformed')) {
    throw inspectionTransportError('INSPECTION_RESPONSE_MALFORMED', false)
  }
  if (outcomes.includes('success')) throw inspectionTransportError('INSPECTION_RESPONSE_MALFORMED', false)
}

function inspectionTransportError(code: string, retryable: boolean): ApplicationError {
  return new ApplicationError({
    code,
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable,
    message: 'The bounded read-only node inspection could not collect usable evidence.',
    nextAction: 'Check the private SSH alias, runtime availability, local node interfaces, and read-only probe prerequisites.'
  })
}

function buildSnapshot(
  request: RuntimeInspectionRequest,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  parsed: ParsedProbeData,
  capabilities: RuntimeInspectionCapabilities
): NodeInspectionSnapshot {
  const dockerEvidence = inspectionEvidence('docker', request.capturedAt)
  const configEvidence = inspectionEvidence('configuration', request.capturedAt)
  const rpcEvidence = inspectionEvidence('jsonrpc', request.capturedAt)
  const derivedEvidence = inspectionEvidence('derived', request.capturedAt, 'reported')
  const headIsStale = parsed.chainHead?.headBlockTime !== undefined
    && Date.parse(request.capturedAt) - parsed.chainHead.headBlockTime > HEAD_STALE_AFTER_SECONDS * 1000
  const headEvidence = inspectionEvidence('jsonrpc', request.capturedAt, 'observed', headIsStale ? 'stale' : 'fresh')
  const headDerivedEvidence = inspectionEvidence('derived', request.capturedAt, 'reported', headIsStale ? 'stale' : 'fresh')
  const requested = new Set(request.sections)
  const components = componentValue(parsed, responses, requested, dockerEvidence, derivedEvidence)
  const chain = chainValues(request, parsed, responses, requested, headEvidence, rpcEvidence, headDerivedEvidence, derivedEvidence)
  const configuration = configurationValue(parsed, responses, requested, configEvidence, derivedEvidence)
  const apis = apiValue(parsed, responses, requested, dockerEvidence, derivedEvidence)
  const producer = producerValues(parsed, components, configuration, requested, configEvidence, derivedEvidence)
  const governance = governanceValues(configuration, requested, configEvidence, derivedEvidence)
  const resources = resourceValues(parsed, responses, requested, configEvidence, derivedEvidence)
  const overview = overviewValues(request, parsed, components, chain, configuration, requested, dockerEvidence, rpcEvidence, derivedEvidence)
  const warnings = inspectionWarnings(request, parsed, components, chain, apis)
  const values = [overview, components, chain, apis, producer, governance, resources]

  return {
    schemaVersion: NODE_INSPECTION_SCHEMA_VERSION,
    contractVersion: NODE_INSPECTION_CONTRACT_VERSION,
    node: {
      id: request.target.nodeId,
      displayName: request.target.displayName,
      flavor: request.target.flavor
    },
    capturedAt: request.capturedAt,
    freshness: headIsStale ? 'stale' : 'fresh',
    readOnly: true,
    capabilities,
    overview,
    components,
    chain,
    apis,
    producer,
    governance,
    resources,
    warnings,
    evidence: collectInspectionEvidence(values)
  }
}

function componentValue(
  parsed: ParsedProbeData,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  requested: ReadonlySet<InspectionSection>,
  dockerEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionValue<readonly InspectionComponent[]> {
  if (!requested.has('overview') && !requested.has('components')) return unavailable('not-requested', derivedEvidence)
  if (parsed.components === undefined) return unavailable(reasonFor(responses, 'node.multiservice.components', parsed), dockerEvidence)
  return available(LEGACY_COMPONENT_NAMES.map((name) => {
    const component = parsed.components?.find((candidate) => candidate.name === name)
    if (component === undefined) {
      return {
        name,
        available: available(false, dockerEvidence),
        state: unavailable<InspectionComponentState>('not-configured', dockerEvidence),
        restartCount: unavailable<number>('not-configured', dockerEvidence),
        artifact: unavailable<{ version?: string; digest?: string }>('not-configured', dockerEvidence),
        uptimeSeconds: unavailable<number>('not-configured', dockerEvidence)
      }
    }
    return {
      name,
      available: available(true, dockerEvidence),
      state: available(component.state, dockerEvidence),
      restartCount: available(component.restartCount, dockerEvidence),
      artifact: component.version === undefined && component.digest === undefined
        ? unknown('insufficient-evidence', dockerEvidence)
        : available({
            ...(component.version === undefined ? {} : { version: component.version }),
            ...(component.digest === undefined ? {} : { digest: component.digest })
          }, dockerEvidence),
      uptimeSeconds: component.startedAt === undefined || component.state !== 'running'
        ? unknown('insufficient-evidence', dockerEvidence)
        : available(uptimeSeconds(component.startedAt, dockerEvidence.observedAt), dockerEvidence)
    }
  }), dockerEvidence)
}

function chainValues(
  request: RuntimeInspectionRequest,
  parsed: ParsedProbeData,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  requested: ReadonlySet<InspectionSection>,
  headEvidence: ReturnType<typeof inspectionEvidence>,
  rpcEvidence: ReturnType<typeof inspectionEvidence>,
  headDerivedEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionChain {
  if (!requested.has('overview') && !requested.has('chain')) {
    return unavailableChain('not-requested', derivedEvidence)
  }
  const head = parsed.chainHead === undefined
    ? unavailable<{ height: number; blockId?: string }>(reasonFor(responses, 'node.multiservice.chain-head', parsed), headEvidence)
    : available({ height: parsed.chainHead.height, ...(parsed.chainHead.blockId === undefined ? {} : { blockId: parsed.chainHead.blockId }) }, headEvidence)
  const lastIrreversibleBlock = parsed.chainHead === undefined
    ? unavailable<number>(reasonFor(responses, 'node.multiservice.chain-head', parsed), headEvidence)
    : available(parsed.chainHead.lastIrreversibleBlock, headEvidence)
  const headAgeSeconds = parsed.chainHead?.headBlockTime === undefined
    ? unavailable<number>('capability-not-exposed', headEvidence)
    : available(Math.max(0, Math.floor((Date.parse(request.capturedAt) - parsed.chainHead.headBlockTime) / 1000)), headEvidence)
  const progress = headAgeSeconds.availability !== 'available'
    ? unknown<'advancing' | 'stalled'>('insufficient-evidence', headDerivedEvidence)
    : headAgeSeconds.value > HEAD_STALE_AFTER_SECONDS
      ? available<'advancing' | 'stalled'>('stalled', headDerivedEvidence)
      : available<'advancing' | 'stalled'>('advancing', headDerivedEvidence)
  const blockStoreAgreement = compareBlockStore(parsed.chainHead, parsed.blockStoreHead, rpcEvidence, headDerivedEvidence, responses, parsed)
  const forks = parsed.forkCount === undefined
    ? unavailable<{ detected: boolean; count: number }>(reasonFor(responses, 'node.multiservice.chain-forks', parsed), rpcEvidence)
    : available({ detected: parsed.forkCount > 1, count: parsed.forkCount }, rpcEvidence)
  const p2pGossip = parsed.p2pGossip === undefined
    ? unavailable<boolean>(reasonFor(responses, 'node.multiservice.p2p-status', parsed), rpcEvidence)
    : available(parsed.p2pGossip, rpcEvidence)
  return {
    head,
    lastIrreversibleBlock,
    headAgeSeconds,
    progress,
    blockStoreAgreement,
    forks,
    p2pGossip,
    peerCount: unavailable('capability-not-exposed', rpcEvidence)
  }
}

function unavailableChain(
  reason: 'not-requested',
  evidence: ReturnType<typeof inspectionEvidence>
): InspectionChain {
  return {
    head: unavailable(reason, evidence),
    lastIrreversibleBlock: unavailable(reason, evidence),
    headAgeSeconds: unavailable(reason, evidence),
    progress: unavailable(reason, evidence),
    blockStoreAgreement: unavailable(reason, evidence),
    forks: unavailable(reason, evidence),
    p2pGossip: unavailable(reason, evidence),
    peerCount: unavailable(reason, evidence)
  }
}

function compareBlockStore(
  chainHead: ChainHead | undefined,
  blockStoreHead: BlockStoreHead | undefined,
  rpcEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  parsed: ParsedProbeData
): InspectionChain['blockStoreAgreement'] {
  if (blockStoreHead === undefined) return unavailable(reasonFor(responses, 'node.multiservice.block-store-head', parsed), rpcEvidence)
  if (chainHead === undefined) return unknown('insufficient-evidence', derivedEvidence)
  if (blockStoreHead.height < chainHead.height) return available('lagging', derivedEvidence)
  if (blockStoreHead.height > chainHead.height) return unknown('insufficient-evidence', derivedEvidence)
  if (chainHead.blockId !== undefined && blockStoreHead.blockId !== undefined && chainHead.blockId !== blockStoreHead.blockId) {
    return available('mismatch', derivedEvidence)
  }
  return available('agrees', derivedEvidence)
}

function configurationValue(
  parsed: ParsedProbeData,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  requested: ReadonlySet<InspectionSection>,
  configEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionValue<SafeConfiguration> {
  if (!requested.has('overview') && !requested.has('governance')) return unavailable('not-requested', derivedEvidence)
  return parsed.configuration === undefined
    ? unavailable(reasonFor(responses, 'node.multiservice.config', parsed), configEvidence)
    : available(parsed.configuration, configEvidence)
}

function apiValue(
  parsed: ParsedProbeData,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  requested: ReadonlySet<InspectionSection>,
  dockerEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionValue<readonly InspectionApi[]> {
  if (!requested.has('overview')) return unavailable('not-requested', derivedEvidence)
  if (parsed.components === undefined) return unavailable(reasonFor(responses, 'node.multiservice.components', parsed), dockerEvidence)
  const apiEntries: InspectionApi[] = parsed.components.flatMap<InspectionApi>((component) => {
    const kind = API_COMPONENTS[component.name]
    if (kind === undefined) return []
    if (component.ports.length === 0) return [{ kind, scope: 'unknown' as const, exposed: false }]
    return component.ports.map((port) => ({ kind, scope: endpointScope(port.hostIp), exposed: true }))
  })
  const unique = [...new Map(apiEntries.map((api) => [
    `${api.kind}\0${api.scope}\0${api.exposed ? '1' : '0'}`,
    api
  ])).values()].sort((left, right) => (
    left.kind.localeCompare(right.kind) || left.scope.localeCompare(right.scope)
  ))
  return available(unique, dockerEvidence)
}

function producerValues(
  parsed: ParsedProbeData,
  components: InspectionValue<readonly InspectionComponent[]>,
  configuration: InspectionValue<SafeConfiguration>,
  requested: ReadonlySet<InspectionSection>,
  configEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionProducer {
  if (!requested.has('overview')) {
    return {
      configured: unavailable('not-requested', derivedEvidence),
      effectiveEnabled: unavailable('not-requested', derivedEvidence),
      addressPresent: unavailable('not-requested', derivedEvidence),
      recentProduction: unavailable('not-requested', derivedEvidence),
      productionPercentage: unavailable('not-requested', derivedEvidence)
    }
  }
  const blockProducers = components.availability === 'available'
    ? components.value.filter((component) => component.name === 'block_producer' || component.name === 'block_producer-secondary')
    : []
  const configured = configuration.availability === 'available'
    ? available(configuration.value.producerAddressPresent, configEvidence)
    : unavailable<boolean>(configuration.reason, configEvidence)
  const effectiveEnabled = configured.availability !== 'available'
    ? unavailable<boolean>(configured.reason, derivedEvidence)
    : !configured.value
      ? available(false, derivedEvidence)
      : components.availability === 'available'
        ? available(blockProducers.some((component) => component.state.availability === 'available' && component.state.value === 'running'), derivedEvidence)
        : unavailable<boolean>(components.reason, derivedEvidence)
  const productionPercentage = parsed.configuration?.productionPercentage === undefined
    ? unavailable<number>('not-configured', configEvidence)
    : available(parsed.configuration.productionPercentage, configEvidence)
  return {
    configured,
    effectiveEnabled,
    addressPresent: configuration.availability === 'available'
      ? available(configuration.value.producerAddressPresent, configEvidence)
      : unavailable<boolean>(configuration.reason, configEvidence),
    recentProduction: unavailable('capability-not-exposed', derivedEvidence),
    productionPercentage
  }
}

function governanceValues(
  configuration: InspectionValue<SafeConfiguration>,
  requested: ReadonlySet<InspectionSection>,
  configEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionGovernance {
  if (!requested.has('governance')) {
    return {
      configuredProposalIds: unavailable('not-requested', derivedEvidence),
      effectiveProposalIds: unavailable('not-requested', derivedEvidence),
      observedProposalVotes: unavailable('not-requested', derivedEvidence),
      networkProposals: unavailable('not-requested', derivedEvidence)
    }
  }
  return {
    configuredProposalIds: configuration.availability === 'available'
      ? available(configuration.value.configuredProposalIds, configEvidence)
      : unavailable(configuration.reason, configEvidence),
    effectiveProposalIds: unavailable('capability-not-exposed', derivedEvidence),
    observedProposalVotes: unavailable('capability-not-exposed', derivedEvidence),
    networkProposals: unavailable('capability-not-exposed', derivedEvidence)
  }
}

function resourceValues(
  parsed: ParsedProbeData,
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  requested: ReadonlySet<InspectionSection>,
  resourceEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionResources {
  if (!requested.has('overview')) {
    return {
      storage: unavailable('not-requested', derivedEvidence),
      cpuPercent: unavailable('not-requested', derivedEvidence),
      memoryBytes: unavailable('not-requested', derivedEvidence)
    }
  }
  return {
    storage: parsed.storage === undefined
      ? unavailable(reasonFor(responses, 'node.multiservice.resources', parsed), resourceEvidence)
      : available(parsed.storage, resourceEvidence),
    cpuPercent: unavailable('capability-not-exposed', resourceEvidence),
    memoryBytes: unavailable('capability-not-exposed', resourceEvidence)
  }
}

function overviewValues(
  request: RuntimeInspectionRequest,
  parsed: ParsedProbeData,
  components: InspectionValue<readonly InspectionComponent[]>,
  chain: InspectionChain,
  configuration: InspectionValue<SafeConfiguration>,
  requested: ReadonlySet<InspectionSection>,
  dockerEvidence: ReturnType<typeof inspectionEvidence>,
  rpcEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionOverview {
  if (!requested.has('overview')) {
    return {
      runtime: unavailable('not-requested', derivedEvidence),
      instance: unavailable('not-requested', derivedEvidence),
      network: unavailable('not-requested', derivedEvidence),
      build: unavailable('not-requested', derivedEvidence),
      supervisor: unavailable('not-requested', derivedEvidence),
      layout: unavailable('not-requested', derivedEvidence),
      uptimeSeconds: unavailable('not-requested', derivedEvidence)
    }
  }
  const chainComponent = parsed.components?.find((component) => component.name === 'chain')
  return {
    runtime: components.availability === 'available'
      ? available({ flavor: 'legacy-microservices', ...(chainComponent?.version === undefined ? {} : { version: chainComponent.version }) }, dockerEvidence)
      : unknown('insufficient-evidence', derivedEvidence),
    instance: configuration.availability === 'available'
      ? available({ present: configuration.value.instancePresent }, configuration.evidence)
      : unavailable(configuration.reason, configuration.evidence),
    network: parsed.chainId === undefined
      ? unavailable('insufficient-evidence', rpcEvidence)
      : available({ name: request.target.expectedNetwork, chainId: parsed.chainId }, rpcEvidence),
    build: chainComponent === undefined || chainComponent.version === undefined && chainComponent.digest === undefined
      ? unknown('insufficient-evidence', dockerEvidence)
      : available({
          ...(chainComponent.version === undefined ? {} : { version: chainComponent.version }),
          ...(chainComponent.digest === undefined ? {} : { digest: chainComponent.digest })
        }, dockerEvidence),
    supervisor: components.availability === 'available'
      ? available('docker', dockerEvidence)
      : unknown('insufficient-evidence', derivedEvidence),
    layout: components.availability === 'available'
      ? available('legacy-services', dockerEvidence)
      : unknown('insufficient-evidence', derivedEvidence),
    uptimeSeconds: chainComponent?.startedAt === undefined || chainComponent.state !== 'running'
      ? unknown('insufficient-evidence', dockerEvidence)
      : available(uptimeSeconds(chainComponent.startedAt, request.capturedAt), dockerEvidence)
  }
}

function inspectionWarnings(
  request: RuntimeInspectionRequest,
  parsed: ParsedProbeData,
  components: InspectionValue<readonly InspectionComponent[]>,
  chain: InspectionChain,
  apis: InspectionValue<readonly InspectionApi[]>
): readonly InspectionWarning[] {
  const warnings: InspectionWarning[] = []
  if (request.target.expectedChainId !== undefined && parsed.chainId !== undefined && request.target.expectedChainId !== parsed.chainId) {
    warnings.push({ code: 'INSPECTION_CHAIN_ID_MISMATCH', severity: 'unsafe', summary: 'Observed chain identity does not match inventory evidence.' })
  }
  if (chain.blockStoreAgreement.availability === 'available' && chain.blockStoreAgreement.value === 'mismatch') {
    warnings.push({ code: 'INSPECTION_BLOCK_STORE_MISMATCH', severity: 'unsafe', summary: 'Chain and block-store head evidence disagree.' })
  }
  if (chain.progress.availability === 'available' && chain.progress.value === 'stalled') {
    warnings.push({ code: 'INSPECTION_HEAD_STALE', severity: 'warning', summary: 'The observed chain head is older than the bounded freshness threshold.' })
  }
  if (components.availability === 'available' && components.value.some((component) => (
    component.state.availability === 'available' && component.state.value === 'failed'
  ))) {
    warnings.push({ code: 'INSPECTION_COMPONENT_FAILED', severity: 'warning', summary: 'At least one runtime component is in a failed state.' })
  }
  if (apis.availability === 'available' && apis.value.some((api) => api.scope === 'public' && api.kind !== 'rest')) {
    warnings.push({ code: 'INSPECTION_PUBLIC_ADMIN_EXPOSURE', severity: 'unsafe', summary: 'A privileged or direct node API appears publicly exposed.' })
  }
  if (parsed.malformed.length > 0) {
    warnings.push({ code: 'INSPECTION_PARTIAL_MALFORMED_EVIDENCE', severity: 'warning', summary: 'One or more read-only probe responses were rejected as malformed.' })
  }
  return warnings
}

function reasonFor(
  responses: ReadonlyMap<ProbeKind, ProbeResponse>,
  kind: ProbeKind,
  parsed: ParsedProbeData
): 'probe-unsupported' | 'transport-unavailable' | 'malformed-response' | 'insufficient-evidence' {
  if (parsed.malformed.includes(kind)) return 'malformed-response'
  const outcome = responses.get(kind)?.outcome
  if (outcome === 'unsupported') return 'probe-unsupported'
  if (outcome !== undefined && outcome !== 'success') return 'transport-unavailable'
  return 'insufficient-evidence'
}

function parseComponents(payload: string): readonly DockerComponent[] {
  const lines = payload.split(/\r?\n/)
  if (lines.shift() !== 'KNM_INSPECTION_COMPONENTS_V1' || lines.length > 100) throw new Error('malformed')
  const components: DockerComponent[] = []
  for (const line of lines.filter((candidate) => candidate.trim() !== '')) {
    const value = jsonObject(line)
    const service = safeString(value.service, 80)
    const normalizedName = LEGACY_COMPONENT_NAME_BY_SERVICE[service]
    if (normalizedName === undefined) continue
    const status = safeString(value.status, 32)
    const restartCount = safeInteger(value.restartCount, 0, 1_000_000)
    const image = safeString(value.image, 500)
    const imageId = safeString(value.imageId, 200)
    const startedAt = optionalIsoDate(value.startedAt)
    const artifact = artifactIdentity(image, imageId)
    components.push({
      name: normalizedName,
      state: componentState(status),
      restartCount,
      ...artifact,
      ...(startedAt === undefined ? {} : { startedAt }),
      ports: parsePortBindings(value.ports)
    })
  }
  if (components.length === 0) throw new Error('malformed')
  return [...new Map(components.map((component) => [component.name, component])).values()]
    .sort((left, right) => left.name.localeCompare(right.name))
}

function parseChainHead(payload: string): ChainHead {
  const result = jsonRpcResult(payload)
  const topology = object(result.head_topology)
  const blockId = optionalPublicId(topology.id)
  const headBlockTime = optionalTimestamp(result.head_block_time)
  return {
    height: safeIntegerString(topology.height),
    ...(blockId === undefined ? {} : { blockId }),
    lastIrreversibleBlock: safeIntegerString(result.last_irreversible_block),
    ...(headBlockTime === undefined ? {} : { headBlockTime })
  }
}

function parseChainId(payload: string): string {
  return publicId(jsonRpcResult(payload).chain_id)
}

function parseForkCount(payload: string): number {
  const forks = jsonRpcResult(payload).fork_heads
  if (!Array.isArray(forks) || forks.length > 100) throw new Error('malformed')
  return forks.length
}

function parseBlockStoreHead(payload: string): BlockStoreHead {
  const topology = object(jsonRpcResult(payload).topology)
  const blockId = optionalPublicId(topology.id)
  return {
    height: safeIntegerString(topology.height),
    ...(blockId === undefined ? {} : { blockId })
  }
}

function parseP2pStatus(payload: string): boolean {
  const enabled = jsonRpcResult(payload).enabled
  if (typeof enabled !== 'boolean') throw new Error('malformed')
  return enabled
}

function parseConfiguration(payload: string): SafeConfiguration {
  const lines = payload.split(/\r?\n/)
  if (lines.shift() !== 'KNM_INSPECTION_CONFIG_V1' || lines.length > 200) throw new Error('malformed')
  let producerAddressPresent: boolean | undefined
  let instancePresent: boolean | undefined
  let productionPercentage: number | undefined
  const configuredProposalIds: string[] = []
  for (const line of lines.filter((candidate) => candidate !== '')) {
    const separator = line.indexOf('=')
    if (separator < 1) throw new Error('malformed')
    const key = line.slice(0, separator)
    const raw = line.slice(separator + 1)
    if (key === 'producerAddressPresent') producerAddressPresent = booleanString(raw)
    else if (key === 'instancePresent') instancePresent = booleanString(raw)
    else if (key === 'productionPercentage') productionPercentage = safeIntegerString(raw, 1, 100)
    else if (key === 'configuredProposal') configuredProposalIds.push(publicId(raw))
    else throw new Error('malformed')
  }
  if (producerAddressPresent === undefined || instancePresent === undefined) throw new Error('malformed')
  return {
    producerAddressPresent,
    instancePresent,
    ...(productionPercentage === undefined ? {} : { productionPercentage }),
    configuredProposalIds: [...new Set(configuredProposalIds)]
  }
}

function parseResources(payload: string): StorageResources {
  const lines = payload.split(/\r?\n/)
  if (lines.shift() !== 'KNM_INSPECTION_RESOURCES_V1' || lines.length !== 1) throw new Error('malformed')
  const value = jsonObject(lines[0] ?? '')
  if (value.schemaVersion !== 1) throw new Error('malformed')
  const storage = object(value.storage)
  const result = {
    totalBytes: safeInteger(storage.totalBytes, 0, Number.MAX_SAFE_INTEGER),
    usedBytes: safeInteger(storage.usedBytes, 0, Number.MAX_SAFE_INTEGER),
    freeBytes: safeInteger(storage.freeBytes, 0, Number.MAX_SAFE_INTEGER)
  }
  if (result.usedBytes + result.freeBytes > result.totalBytes + 4096) throw new Error('malformed')
  return result
}

function jsonRpcResult(payload: string): Record<string, unknown> {
  const value = jsonObject(payload)
  if (value.jsonrpc !== '2.0' || value.error !== undefined) throw new Error('malformed')
  return object(value.result)
}

function jsonObject(payload: string): Record<string, unknown> {
  if (payload.length > 256 * 1024) throw new Error('malformed')
  try {
    return object(JSON.parse(payload))
  } catch {
    throw new Error('malformed')
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('malformed')
  return value as Record<string, unknown>
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('malformed')
  }
  return value
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error('malformed')
  return Number(value)
}

function safeIntegerString(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value === 'number') return safeInteger(value, minimum, maximum)
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('malformed')
  return safeInteger(Number(value), minimum, maximum)
}

function booleanString(value: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('malformed')
}

function publicId(value: unknown): string {
  const result = safeString(value, 128)
  if (!/^(?:(?:0x)?[A-Za-z0-9_-]{16,128}|[A-Za-z0-9+/_-]{16,126}={0,2})$/.test(result)) {
    throw new Error('malformed')
  }
  return result
}

function optionalPublicId(value: unknown): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : publicId(value)
}

function optionalIsoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const date = safeString(value, 64)
  if (!Number.isFinite(Date.parse(date))) throw new Error('malformed')
  return new Date(date).toISOString()
}

function optionalTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string' && /^\d+$/.test(value) || typeof value === 'number') {
    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('malformed')
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return Date.parse(value)
  throw new Error('malformed')
}

function componentState(value: string): InspectionComponentState {
  if (value === 'running') return 'running'
  if (value === 'restarting') return 'restarting'
  if (value === 'paused') return 'paused'
  if (value === 'exited' || value === 'created' || value === 'removing') return 'stopped'
  if (value === 'dead') return 'failed'
  return 'unknown'
}

function artifactIdentity(image: string, imageId: string): { version?: string; digest?: string } {
  const digestMatch = /(?:^|@|:)sha256:([0-9a-f]{64})$/i.exec(imageId) ?? /@sha256:([0-9a-f]{64})$/i.exec(image)
  const tagIndex = image.lastIndexOf(':')
  const slashIndex = image.lastIndexOf('/')
  const tag = tagIndex > slashIndex ? image.slice(tagIndex + 1) : undefined
  return {
    ...(tag === undefined || !/^[A-Za-z0-9._-]{1,128}$/.test(tag) ? {} : { version: tag }),
    ...(digestMatch?.[1] === undefined ? {} : { digest: digestMatch[1].toLowerCase() })
  }
}

function parsePortBindings(value: unknown): readonly { hostIp: string }[] {
  if (value === null || value === undefined) return []
  const ports = object(value)
  if (Object.keys(ports).length > 32) throw new Error('malformed')
  return Object.values(ports).flatMap((bindings) => {
    if (bindings === null) return []
    if (!Array.isArray(bindings) || bindings.length > 16) throw new Error('malformed')
    return bindings.map((binding) => {
      const item = object(binding)
      return { hostIp: safeString(item.HostIp, 64) }
    })
  })
}

function endpointScope(hostIp: string): InspectionApi['scope'] {
  if (hostIp === '127.0.0.1' || hostIp === '::1' || hostIp === 'localhost') return 'local'
  if (hostIp === '0.0.0.0' || hostIp === '::') return 'public'
  if (/^10\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(hostIp) || /^f[cd][0-9a-f]{2}:/i.test(hostIp)) return 'private'
  return 'public'
}

function uptimeSeconds(startedAt: string, capturedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(capturedAt) - Date.parse(startedAt)) / 1000))
}
