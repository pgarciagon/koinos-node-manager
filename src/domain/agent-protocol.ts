import type { ConnectionTestOutcome } from './connection.js'
import type { NodeFlavorId } from './node.js'
import type { RuntimeInspectionProbeKind } from '../core/probe-transport.js'

export const KOINOS_NODE_AGENT_PROTOCOL_VERSION = '1.0.0' as const
export const KOINOS_NODE_AGENT_SCHEMA_VERSION = 1 as const
export const AGENT_MAX_PAIRING_LIFETIME_MS = 10 * 60 * 1000
export const AGENT_CLOSED_PROBES = Object.freeze([
  'node.multiservice.components',
  'node.multiservice.chain-head',
  'node.multiservice.chain-id',
  'node.multiservice.chain-forks',
  'node.multiservice.block-store-head',
  'node.multiservice.p2p-status',
  'node.multiservice.config',
  'node.multiservice.resources',
  'node.teleno.status'
] as const satisfies readonly RuntimeInspectionProbeKind[])

export type AgentClosedProbeKind = (typeof AGENT_CLOSED_PROBES)[number]

export type AgentBuildIdentity = {
  version: string
  artifactDigest: string
  signature: string
}

export type AgentDiscoveryDocument = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  identityPublicKey: string
  identityDigest: string
  runtimeFlavor: NodeFlavorId
  scopes: readonly ['inspect']
  probes: readonly AgentClosedProbeKind[]
  build: AgentBuildIdentity
  readOnly: true
}

export type AgentPairingRequest = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  sessionId: string
  clientPublicKey: string
  clientNonce: string
  secretProof: string
}

export type AgentPairingResponse = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  sessionId: string
  identityPublicKey: string
  identityDigest: string
  transcriptSignature: string
  credential: string
  credentialId: string
  scopes: readonly ['inspect']
  expiresAt: string
}

export type AgentProbeFacts =
  | { kind: 'node.multiservice.components'; components: readonly AgentComponentFact[] }
  | { kind: 'node.multiservice.chain-head'; head: { height: number; blockId?: string; lastIrreversibleBlock: number; headBlockTime?: number } }
  | { kind: 'node.multiservice.chain-id'; chainId: string }
  | { kind: 'node.multiservice.chain-forks'; forkCount: number }
  | { kind: 'node.multiservice.block-store-head'; head: { height: number; blockId?: string } }
  | { kind: 'node.multiservice.p2p-status'; enabled: boolean }
  | { kind: 'node.multiservice.config'; configuration: AgentConfigurationFact }
  | { kind: 'node.multiservice.resources'; storage: AgentStorageFact }
  | { kind: 'node.teleno.status'; status: AgentTelenoStatusFact }

export type AgentComponentFact = {
  service: string
  status: 'running' | 'stopped' | 'restarting' | 'paused' | 'failed' | 'unknown'
  restartCount: number
  artifactVersion?: string
  artifactDigest?: string
  startedAt?: string
  exposure: readonly ('loopback' | 'private' | 'public' | 'unknown')[]
}

export type AgentConfigurationFact = {
  producerAddressPresent: boolean
  instancePresent: boolean
  productionPercentage?: number
  configuredProposalIds: readonly string[]
}

export type AgentStorageFact = {
  totalBytes: number
  usedBytes: number
  freeBytes: number
}

export type AgentTelenoStatusFact = {
  version: string
  headHeight?: number
  lastIrreversibleBlock?: number
  services: Readonly<Record<string, boolean>>
}

export type AgentProbeRequest = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  requestId: string
  kind: AgentClosedProbeKind
  timeoutMs: number
}

export type AgentProbeResponse = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  requestId: string
  outcome: ConnectionTestOutcome
  durationMs: number
  facts: AgentProbeFacts | null
}

export type AgentRevocationRequest = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  protocolVersion: typeof KOINOS_NODE_AGENT_PROTOCOL_VERSION
  credentialId: string
}

export type AgentRevocationResponse = {
  schemaVersion: typeof KOINOS_NODE_AGENT_SCHEMA_VERSION
  revoked: true
}

export type AgentPairingPayload = {
  endpoint: string
  sessionId: string
  secret: string
  identityDigest: string
  expiresAt: string
}
