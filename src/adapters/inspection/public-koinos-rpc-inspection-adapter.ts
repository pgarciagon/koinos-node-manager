import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import { available, collectInspectionEvidence, inspectionEvidence, unavailable, unknown } from '../../core/inspection-values.js'
import type { RuntimeInspectionAdapter, RuntimeInspectionRequest } from '../../core/runtime-inspection-adapter.js'
import {
  NODE_INSPECTION_CONTRACT_VERSION,
  NODE_INSPECTION_SCHEMA_VERSION,
  type InspectionChain,
  type InspectionGovernance,
  type InspectionOverview,
  type InspectionProducer,
  type InspectionResources,
  type NodeInspectionSnapshot,
  type RuntimeInspectionCapabilities
} from '../../domain/inspection.js'
import type { NetworkName } from '../../domain/node.js'

const MAINNET_CHAIN_ID = 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3qckQpFQVS6Q8='
const TESTNET_CHAIN_ID = 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=='

type ChainFacts = {
  chainId?: string
  headHeight?: number
  headId?: string
  lastIrreversibleBlock?: number
  headAgeSeconds?: number
  p2pGossip?: boolean
}

export class PublicKoinosRpcInspectionAdapter implements RuntimeInspectionAdapter {
  readonly flavor = 'unknown' as const
  readonly contractVersion = NODE_INSPECTION_CONTRACT_VERSION

  capabilities(): RuntimeInspectionCapabilities {
    return { overview: true, components: false, chain: true, governance: false, apis: true, producer: false, resources: false }
  }

  async inspect(request: RuntimeInspectionRequest): Promise<NodeInspectionSnapshot> {
    const [chainId, head, p2p] = await Promise.all([
      safeProbe(request, 'node.multiservice.chain-id'),
      safeProbe(request, 'node.multiservice.chain-head'),
      safeProbe(request, 'node.multiservice.p2p-status')
    ])
    const facts: ChainFacts = {}
    if (chainId?.outcome === 'success' && chainId.payload !== null) Object.assign(facts, parseChainId(chainId.payload))
    if (head?.outcome === 'success' && head.payload !== null) Object.assign(facts, parseHead(head.payload, request.capturedAt))
    if (p2p?.outcome === 'success' && p2p.payload !== null) Object.assign(facts, parseP2p(p2p.payload))
    if (facts.chainId === undefined && facts.headHeight === undefined) throw transportError(head?.outcome ?? chainId?.outcome ?? 'unreachable')
    return snapshot(request, facts, this.capabilities())
  }
}

async function safeProbe(request: RuntimeInspectionRequest, kind: Parameters<RuntimeInspectionRequest['probe']['execute']>[0]) {
  try {
    return await request.probe.execute(kind, request.timeoutMs)
  } catch {
    return undefined
  }
}

function snapshot(request: RuntimeInspectionRequest, facts: ChainFacts, capabilities: RuntimeInspectionCapabilities): NodeInspectionSnapshot {
  const rpcEvidence = inspectionEvidence('jsonrpc', request.capturedAt)
  const derivedEvidence = inspectionEvidence('derived', request.capturedAt, 'reported')
  const requested = new Set(request.sections)
  const overviewRequested = requested.has('overview')
  const chainRequested = requested.has('chain') || overviewRequested
  const networkName = networkForChain(facts.chainId)
  const overview: InspectionOverview = overviewRequested ? {
    runtime: unknown('insufficient-evidence', rpcEvidence),
    instance: unavailable('capability-not-exposed', rpcEvidence),
    network: facts.chainId === undefined
      ? unknown('insufficient-evidence', rpcEvidence)
      : available({ name: networkName, chainId: facts.chainId }, rpcEvidence),
    build: unavailable('capability-not-exposed', rpcEvidence),
    supervisor: unavailable('capability-not-exposed', rpcEvidence),
    layout: unavailable('capability-not-exposed', rpcEvidence),
    uptimeSeconds: unavailable('capability-not-exposed', rpcEvidence)
  } : unavailableOverview(derivedEvidence)
  const chain: InspectionChain = chainRequested ? {
    head: facts.headHeight === undefined
      ? unknown('insufficient-evidence', rpcEvidence)
      : available({ height: facts.headHeight, ...(facts.headId === undefined ? {} : { blockId: facts.headId }) }, rpcEvidence),
    lastIrreversibleBlock: facts.lastIrreversibleBlock === undefined
      ? unknown('insufficient-evidence', rpcEvidence)
      : available(facts.lastIrreversibleBlock, rpcEvidence),
    headAgeSeconds: facts.headAgeSeconds === undefined
      ? unknown('insufficient-evidence', rpcEvidence)
      : available(facts.headAgeSeconds, derivedEvidence),
    progress: unknown('insufficient-evidence', derivedEvidence),
    blockStoreAgreement: unavailable('capability-not-exposed', rpcEvidence),
    forks: unavailable('capability-not-exposed', rpcEvidence),
    p2pGossip: facts.p2pGossip === undefined
      ? unavailable('probe-unsupported', rpcEvidence)
      : available(facts.p2pGossip, rpcEvidence),
    peerCount: unavailable('capability-not-exposed', rpcEvidence)
  } : unavailableChain(derivedEvidence)
  const components = unavailable<readonly []>(requested.has('components') ? 'capability-not-exposed' : 'not-requested', rpcEvidence)
  const apis = overviewRequested
    ? available([{ kind: 'jsonrpc' as const, scope: 'public' as const, exposed: true }], rpcEvidence)
    : unavailable<readonly []>('not-requested', derivedEvidence)
  const producer = unavailableProducer(overviewRequested ? 'capability-not-exposed' : 'not-requested', rpcEvidence)
  const governance = unavailableGovernance(requested.has('governance') ? 'capability-not-exposed' : 'not-requested', rpcEvidence)
  const resources = unavailableResources(overviewRequested ? 'capability-not-exposed' : 'not-requested', rpcEvidence)
  const values = [overview, components, chain, apis, producer, governance, resources]
  return {
    schemaVersion: NODE_INSPECTION_SCHEMA_VERSION,
    contractVersion: NODE_INSPECTION_CONTRACT_VERSION,
    node: { id: request.target.nodeId, displayName: request.target.displayName, flavor: 'unknown' },
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
    warnings: [{ code: 'QUICK_INSPECTION_LIMITED', severity: 'warning', summary: 'Host, component, producer, resource, and local governance facts require Full or Expert inspection.' }],
    evidence: collectInspectionEvidence(values)
  }
}

function parseChainId(payload: string): ChainFacts {
  const result = jsonRpcResult(payload)
  const value = result.chain_id
  return typeof value === 'string' && value.length >= 16 && value.length <= 160 ? { chainId: value } : {}
}

function parseHead(payload: string, capturedAt: string): ChainFacts {
  const result = jsonRpcResult(payload)
  const topology = object(result.head_topology)
  const height = positiveInteger(topology?.height)
  const headId = typeof topology?.id === 'string' && topology.id.length <= 160 ? topology.id : undefined
  const lib = positiveInteger(result.last_irreversible_block)
  const rawTime = numeric(result.head_block_time)
  const headAgeSeconds = rawTime === undefined ? undefined : Math.max(0, Math.floor((Date.parse(capturedAt) - normalizeEpoch(rawTime)) / 1000))
  return {
    ...(height === undefined ? {} : { headHeight: height }),
    ...(headId === undefined ? {} : { headId }),
    ...(lib === undefined ? {} : { lastIrreversibleBlock: lib }),
    ...(headAgeSeconds === undefined ? {} : { headAgeSeconds })
  }
}

function parseP2p(payload: string): ChainFacts {
  const enabled = jsonRpcResult(payload).enabled
  return typeof enabled === 'boolean' ? { p2pGossip: enabled } : {}
}

function jsonRpcResult(payload: string): Record<string, unknown> {
  const envelope = object(JSON.parse(payload))
  const result = object(envelope?.result)
  if (envelope?.jsonrpc !== '2.0' || result === undefined) throw new Error('malformed')
  return result
}

function networkForChain(chainId: string | undefined): NetworkName {
  if (chainId === MAINNET_CHAIN_ID) return 'mainnet'
  if (chainId === TESTNET_CHAIN_ID) return 'testnet'
  return chainId === undefined ? 'unknown' : 'custom'
}

function unavailableOverview(evidence: ReturnType<typeof inspectionEvidence>): InspectionOverview {
  return {
    runtime: unavailable('not-requested', evidence), instance: unavailable('not-requested', evidence),
    network: unavailable('not-requested', evidence), build: unavailable('not-requested', evidence),
    supervisor: unavailable('not-requested', evidence), layout: unavailable('not-requested', evidence),
    uptimeSeconds: unavailable('not-requested', evidence)
  }
}

function unavailableChain(evidence: ReturnType<typeof inspectionEvidence>): InspectionChain {
  return {
    head: unavailable('not-requested', evidence), lastIrreversibleBlock: unavailable('not-requested', evidence),
    headAgeSeconds: unavailable('not-requested', evidence), progress: unavailable('not-requested', evidence),
    blockStoreAgreement: unavailable('not-requested', evidence), forks: unavailable('not-requested', evidence),
    p2pGossip: unavailable('not-requested', evidence), peerCount: unavailable('not-requested', evidence)
  }
}

function unavailableProducer(reason: 'not-requested' | 'capability-not-exposed', evidence: ReturnType<typeof inspectionEvidence>): InspectionProducer {
  return { configured: unavailable(reason, evidence), effectiveEnabled: unavailable(reason, evidence), addressPresent: unavailable(reason, evidence), recentProduction: unavailable(reason, evidence), productionPercentage: unavailable(reason, evidence) }
}

function unavailableGovernance(reason: 'not-requested' | 'capability-not-exposed', evidence: ReturnType<typeof inspectionEvidence>): InspectionGovernance {
  return { configuredProposalIds: unavailable(reason, evidence), effectiveProposalIds: unavailable(reason, evidence), observedProposalVotes: unavailable(reason, evidence), networkProposals: unavailable(reason, evidence) }
}

function unavailableResources(reason: 'not-requested' | 'capability-not-exposed', evidence: ReturnType<typeof inspectionEvidence>): InspectionResources {
  return { storage: unavailable(reason, evidence), cpuPercent: unavailable(reason, evidence), memoryBytes: unavailable(reason, evidence) }
}

function transportError(outcome: string): ApplicationError {
  const code = outcome === 'timeout' ? 'ONBOARDING_TIMEOUT' : outcome === 'malformed' ? 'ONBOARDING_RESPONSE_MALFORMED' : 'ONBOARDING_UNREACHABLE'
  return new ApplicationError({ code, exitCode: EXIT_CODES.transportUnavailable, severity: 'error', retryable: outcome !== 'malformed', message: 'The bounded Quick Connect probes did not return usable chain evidence.', nextAction: 'Check the private endpoint and verify that it exposes compatible Koinos JSON-RPC methods.' })
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function numeric(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = numeric(value)
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizeEpoch(value: number): number {
  if (value > 1e17) return Math.floor(value / 1e6)
  if (value > 1e14) return Math.floor(value / 1e3)
  if (value < 1e11) return value * 1000
  return value
}
