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
  RuntimeInspectionAdapter,
  RuntimeInspectionRequest
} from '../../core/runtime-inspection-adapter.js'
import {
  NODE_INSPECTION_CONTRACT_VERSION,
  NODE_INSPECTION_SCHEMA_VERSION,
  type InspectionChain,
  type InspectionComponent,
  type InspectionGovernance,
  type InspectionOverview,
  type InspectionProducer,
  type InspectionResources,
  type InspectionValue,
  type NodeInspectionSnapshot,
  type RuntimeInspectionCapabilities
} from '../../domain/inspection.js'

const TELENO_COMPONENTS = [
  'chain',
  'block_store',
  'mempool',
  'contract_meta_store',
  'transaction_store',
  'account_history',
  'p2p',
  'block_producer'
] as const

type TelenoStatus = {
  version: string
  headHeight?: number
  lastIrreversibleBlock?: number
  services: Readonly<Record<string, boolean>>
}

export class TelenoInspectionAdapter implements RuntimeInspectionAdapter {
  readonly flavor = 'teleno-monolith' as const
  readonly contractVersion = NODE_INSPECTION_CONTRACT_VERSION

  capabilities(): RuntimeInspectionCapabilities {
    return {
      overview: true,
      components: true,
      chain: true,
      governance: false,
      apis: true,
      producer: false,
      resources: false
    }
  }

  async inspect(request: RuntimeInspectionRequest): Promise<NodeInspectionSnapshot> {
    let response
    try {
      response = await request.probe.execute('node.teleno.status', request.timeoutMs)
    } catch {
      throw telenoTransportError('INSPECTION_UNREACHABLE', true)
    }
    if (response.outcome !== 'success') {
      const code = response.outcome === 'authentication-failed'
        ? 'INSPECTION_AUTHENTICATION_FAILED'
        : response.outcome === 'timeout'
          ? 'INSPECTION_TIMEOUT'
          : response.outcome === 'unsupported'
            ? 'INSPECTION_PROBE_UNSUPPORTED'
            : response.outcome === 'malformed'
              ? 'INSPECTION_RESPONSE_MALFORMED'
              : 'INSPECTION_UNREACHABLE'
      throw telenoTransportError(code, response.outcome === 'timeout' || response.outcome === 'unreachable')
    }
    if (response.payload === null) throw telenoTransportError('INSPECTION_RESPONSE_MALFORMED', false)
    let status: TelenoStatus
    try {
      status = parseTelenoStatus(response.payload)
    } catch {
      throw telenoTransportError('INSPECTION_RESPONSE_MALFORMED', false)
    }
    return buildTelenoSnapshot(request, status, this.capabilities())
  }
}

function buildTelenoSnapshot(
  request: RuntimeInspectionRequest,
  status: TelenoStatus,
  capabilities: RuntimeInspectionCapabilities
): NodeInspectionSnapshot {
  const runtimeEvidence = inspectionEvidence('runtime-status', request.capturedAt)
  const derivedEvidence = inspectionEvidence('derived', request.capturedAt, 'reported')
  const requested = new Set(request.sections)
  const components = telenoComponents(status, requested.has('components') || requested.has('overview'), runtimeEvidence, derivedEvidence)
  const chain = telenoChain(status, requested.has('chain') || requested.has('overview'), runtimeEvidence, derivedEvidence)
  const overview = telenoOverview(request, status, components, requested.has('overview'), runtimeEvidence, derivedEvidence)
  const apis = requested.has('overview')
    ? available([{ kind: 'jsonrpc' as const, scope: 'local' as const, exposed: true }], runtimeEvidence)
    : unavailable<readonly []>('not-requested', derivedEvidence)
  const producer = unavailableProducer(requested.has('overview') ? 'capability-not-exposed' : 'not-requested', derivedEvidence)
  const governance = unavailableGovernance(requested.has('governance') ? 'capability-not-exposed' : 'not-requested', derivedEvidence)
  const resources = unavailableResources(requested.has('overview') ? 'capability-not-exposed' : 'not-requested', derivedEvidence)
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
    freshness: 'fresh',
    readOnly: true,
    capabilities,
    overview,
    components,
    chain,
    apis,
    producer,
    governance,
    resources,
    warnings: [],
    evidence: collectInspectionEvidence(values)
  }
}

function telenoComponents(
  status: TelenoStatus,
  requested: boolean,
  runtimeEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionValue<readonly InspectionComponent[]> {
  if (!requested) return unavailable('not-requested', derivedEvidence)
  return available(TELENO_COMPONENTS.map((name) => {
    const enabled = status.services[name]
    if (enabled === undefined) {
      return {
        name,
        available: unavailable<boolean>('capability-not-exposed', runtimeEvidence),
        state: unavailable<'running' | 'stopped'>('capability-not-exposed', runtimeEvidence),
        restartCount: unavailable<number>('capability-not-exposed', runtimeEvidence),
        artifact: unavailable<{ version?: string; digest?: string }>('capability-not-exposed', runtimeEvidence),
        uptimeSeconds: unavailable<number>('capability-not-exposed', runtimeEvidence)
      }
    }
    return {
      name,
      available: available(true, runtimeEvidence),
      state: available(enabled ? 'running' as const : 'stopped' as const, runtimeEvidence),
      restartCount: unavailable<number>('capability-not-exposed', runtimeEvidence),
      artifact: name === 'chain'
        ? available({ version: status.version }, runtimeEvidence)
        : unavailable<{ version?: string; digest?: string }>('capability-not-exposed', runtimeEvidence),
      uptimeSeconds: unavailable<number>('capability-not-exposed', runtimeEvidence)
    }
  }), runtimeEvidence)
}

function telenoChain(
  status: TelenoStatus,
  requested: boolean,
  runtimeEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionChain {
  if (!requested) {
    return {
      head: unavailable('not-requested', derivedEvidence),
      lastIrreversibleBlock: unavailable('not-requested', derivedEvidence),
      headAgeSeconds: unavailable('not-requested', derivedEvidence),
      progress: unavailable('not-requested', derivedEvidence),
      blockStoreAgreement: unavailable('not-requested', derivedEvidence),
      forks: unavailable('not-requested', derivedEvidence),
      p2pGossip: unavailable('not-requested', derivedEvidence),
      peerCount: unavailable('not-requested', derivedEvidence)
    }
  }
  return {
    head: status.headHeight === undefined
      ? unknown('insufficient-evidence', runtimeEvidence)
      : available({ height: status.headHeight }, runtimeEvidence),
    lastIrreversibleBlock: status.lastIrreversibleBlock === undefined
      ? unknown('insufficient-evidence', runtimeEvidence)
      : available(status.lastIrreversibleBlock, runtimeEvidence),
    headAgeSeconds: unavailable('capability-not-exposed', runtimeEvidence),
    progress: unknown('insufficient-evidence', derivedEvidence),
    blockStoreAgreement: status.services.block_store === true && status.services.chain === true
      ? unknown('insufficient-evidence', derivedEvidence)
      : unavailable('capability-not-exposed', runtimeEvidence),
    forks: unavailable('capability-not-exposed', runtimeEvidence),
    p2pGossip: unavailable('capability-not-exposed', runtimeEvidence),
    peerCount: unavailable('capability-not-exposed', runtimeEvidence)
  }
}

function telenoOverview(
  request: RuntimeInspectionRequest,
  status: TelenoStatus,
  components: InspectionValue<readonly InspectionComponent[]>,
  requested: boolean,
  runtimeEvidence: ReturnType<typeof inspectionEvidence>,
  derivedEvidence: ReturnType<typeof inspectionEvidence>
): InspectionOverview {
  if (!requested) {
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
  return {
    runtime: available({ flavor: 'teleno-monolith', version: status.version }, runtimeEvidence),
    instance: available({ present: true }, runtimeEvidence),
    network: request.target.expectedChainId === undefined
      ? unknown('capability-not-exposed', runtimeEvidence)
      : unknown('insufficient-evidence', runtimeEvidence),
    build: available({ version: status.version }, runtimeEvidence),
    supervisor: unknown('capability-not-exposed', runtimeEvidence),
    layout: available('monolith', runtimeEvidence),
    uptimeSeconds: unavailable('capability-not-exposed', runtimeEvidence)
  }
}

function unavailableProducer(
  reason: 'not-requested' | 'capability-not-exposed',
  evidence: ReturnType<typeof inspectionEvidence>
): InspectionProducer {
  return {
    configured: unavailable(reason, evidence),
    effectiveEnabled: unavailable(reason, evidence),
    addressPresent: unavailable(reason, evidence),
    recentProduction: unavailable(reason, evidence),
    productionPercentage: unavailable(reason, evidence)
  }
}

function unavailableGovernance(
  reason: 'not-requested' | 'capability-not-exposed',
  evidence: ReturnType<typeof inspectionEvidence>
): InspectionGovernance {
  return {
    configuredProposalIds: unavailable(reason, evidence),
    effectiveProposalIds: unavailable(reason, evidence),
    observedProposalVotes: unavailable(reason, evidence),
    networkProposals: unavailable(reason, evidence)
  }
}

function unavailableResources(
  reason: 'not-requested' | 'capability-not-exposed',
  evidence: ReturnType<typeof inspectionEvidence>
): InspectionResources {
  return {
    storage: unavailable(reason, evidence),
    cpuPercent: unavailable(reason, evidence),
    memoryBytes: unavailable(reason, evidence)
  }
}

function parseTelenoStatus(payload: string): TelenoStatus {
  if (payload.length > 256 * 1024) throw new Error('malformed')
  const envelope = object(JSON.parse(payload))
  if (envelope.jsonrpc !== '2.0' || envelope.error !== undefined) throw new Error('malformed')
  const result = object(envelope.result)
  const mode = safeString(result.mode, 32)
  if (mode !== 'monolith') throw new Error('runtime mismatch')
  safeString(result.node, 200)
  const version = safeVersion(result.version)
  const services = object(result.services)
  const parsedServices: Record<string, boolean> = {}
  for (const name of TELENO_COMPONENTS) {
    const value = services[name]
    if (value === undefined) continue
    if (typeof value !== 'boolean') throw new Error('malformed')
    parsedServices[name] = value
  }
  if (Object.keys(parsedServices).length === 0) throw new Error('malformed')
  return {
    version,
    ...(result.head_height === null || result.head_height === undefined ? {} : { headHeight: safeInteger(result.head_height) }),
    ...(result.last_irreversible_block === null || result.last_irreversible_block === undefined
      ? {}
      : { lastIrreversibleBlock: safeInteger(result.last_irreversible_block) }),
    services: parsedServices
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

function safeVersion(value: unknown): string {
  const version = safeString(value, 128)
  if (!/^[A-Za-z0-9._+-]+$/.test(version)) throw new Error('malformed')
  return version
}

function safeInteger(value: unknown): number {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) value = Number(value)
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('malformed')
  return Number(value)
}

function telenoTransportError(code: string, retryable: boolean): ApplicationError {
  return new ApplicationError({
    code,
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable,
    message: 'The bounded read-only Teleno status inspection did not succeed.',
    nextAction: 'Check the private SSH alias and the versioned local Teleno node.get_status interface.'
  })
}
