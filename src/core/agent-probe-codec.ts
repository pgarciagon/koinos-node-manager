import { agentError } from './agent-protocol.js'
import type { AgentProbeFacts } from '../domain/agent-protocol.js'

export function encodeAgentFacts(facts: AgentProbeFacts): string {
  switch (facts.kind) {
    case 'node.multiservice.components':
      if (facts.components.length === 0 || facts.components.length > 100) throw malformed()
      return ['KNM_INSPECTION_COMPONENTS_V1', ...facts.components.map((component) => {
        onlyKeys(component, ['service', 'status', 'restartCount', 'artifactVersion', 'artifactDigest', 'startedAt', 'exposure'])
        safeText(component.service, 80)
        if (!['running', 'stopped', 'restarting', 'paused', 'failed', 'unknown'].includes(component.status)) throw malformed()
        safeInteger(component.restartCount, 0, 1_000_000)
        if (component.artifactVersion !== undefined) safeText(component.artifactVersion, 128)
        if (component.artifactDigest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(component.artifactDigest)) throw malformed()
        if (component.startedAt !== undefined && !validTimestamp(component.startedAt)) throw malformed()
        if (component.exposure.length > 16 || component.exposure.some((scope) => !['loopback', 'private', 'public', 'unknown'].includes(scope))) throw malformed()
        return JSON.stringify({
          service: component.service,
          status: component.status,
          restartCount: component.restartCount,
          image: component.artifactVersion === undefined ? 'agent/unknown' : `agent/runtime:${component.artifactVersion}`,
          imageId: component.artifactDigest ?? `sha256:${'0'.repeat(64)}`,
          ...(component.startedAt === undefined ? {} : { startedAt: component.startedAt }),
          ports: Object.fromEntries(component.exposure.map((scope, index) => [`agent-${index}/tcp`, [{ HostIp: exposureAddress(scope), HostPort: '1' }]]))
        })
      })].join('\n')
    case 'node.multiservice.chain-head':
      onlyKeys(facts.head, ['height', 'blockId', 'lastIrreversibleBlock', 'headBlockTime'])
      validateHead(facts.head, true)
      return jsonRpc({
        head_topology: { height: String(facts.head.height), ...(facts.head.blockId === undefined ? {} : { id: facts.head.blockId }) },
        last_irreversible_block: String(facts.head.lastIrreversibleBlock),
        ...(facts.head.headBlockTime === undefined ? {} : { head_block_time: String(facts.head.headBlockTime) })
      })
    case 'node.multiservice.chain-id':
      safePublicId(facts.chainId)
      return jsonRpc({ chain_id: facts.chainId })
    case 'node.multiservice.chain-forks':
      safeInteger(facts.forkCount, 0, 100)
      return jsonRpc({ fork_heads: Array.from({ length: facts.forkCount }, (_, index) => ({ id: `0x${index.toString(16).padStart(64, '0')}`, height: '0' })) })
    case 'node.multiservice.block-store-head':
      onlyKeys(facts.head, ['height', 'blockId'])
      validateHead(facts.head, false)
      return jsonRpc({ topology: { height: String(facts.head.height), ...(facts.head.blockId === undefined ? {} : { id: facts.head.blockId }) } })
    case 'node.multiservice.p2p-status':
      if (typeof facts.enabled !== 'boolean') throw malformed()
      return jsonRpc({ enabled: facts.enabled })
    case 'node.multiservice.config': {
      const configuration = facts.configuration
      onlyKeys(configuration, ['producerAddressPresent', 'instancePresent', 'productionPercentage', 'configuredProposalIds'])
      if (typeof configuration.producerAddressPresent !== 'boolean' || typeof configuration.instancePresent !== 'boolean') throw malformed()
      if (configuration.productionPercentage !== undefined) safeInteger(configuration.productionPercentage, 1, 100)
      if (configuration.configuredProposalIds.length > 100) throw malformed()
      configuration.configuredProposalIds.forEach(safePublicId)
      return [
        'KNM_INSPECTION_CONFIG_V1',
        ...configuration.configuredProposalIds.map((proposal) => `configuredProposal=${proposal}`),
        `producerAddressPresent=${String(configuration.producerAddressPresent)}`,
        `instancePresent=${String(configuration.instancePresent)}`,
        ...(configuration.productionPercentage === undefined ? [] : [`productionPercentage=${configuration.productionPercentage}`])
      ].join('\n')
    }
    case 'node.multiservice.resources': {
      const storage = facts.storage
      onlyKeys(storage, ['totalBytes', 'usedBytes', 'freeBytes'])
      safeInteger(storage.totalBytes, 0, Number.MAX_SAFE_INTEGER)
      safeInteger(storage.usedBytes, 0, Number.MAX_SAFE_INTEGER)
      safeInteger(storage.freeBytes, 0, Number.MAX_SAFE_INTEGER)
      if (storage.usedBytes + storage.freeBytes > storage.totalBytes + 4096) throw malformed()
      return ['KNM_INSPECTION_RESOURCES_V1', JSON.stringify({ schemaVersion: 1, storage })].join('\n')
    }
    case 'node.teleno.status': {
      const status = facts.status
      onlyKeys(status, ['version', 'headHeight', 'lastIrreversibleBlock', 'services'])
      safeVersion(status.version)
      if (status.headHeight !== undefined) safeInteger(status.headHeight, 0, Number.MAX_SAFE_INTEGER)
      if (status.lastIrreversibleBlock !== undefined) safeInteger(status.lastIrreversibleBlock, 0, Number.MAX_SAFE_INTEGER)
      const services = Object.entries(status.services)
      if (services.length === 0 || services.length > 64 || services.some(([name, enabled]) => !/^[a-z][a-z0-9_]{0,63}$/.test(name) || typeof enabled !== 'boolean')) throw malformed()
      return jsonRpc({ node: '<AGENT_RUNTIME>', version: status.version, mode: 'monolith', head_height: status.headHeight ?? null, last_irreversible_block: status.lastIrreversibleBlock ?? null, services: status.services })
    }
  }
}

function validateHead(value: { height: number; blockId?: string; lastIrreversibleBlock?: number; headBlockTime?: number }, requireLib: boolean): void {
  safeInteger(value.height, 0, Number.MAX_SAFE_INTEGER)
  if (requireLib) safeInteger(value.lastIrreversibleBlock, 0, Number.MAX_SAFE_INTEGER)
  if (value.headBlockTime !== undefined) safeInteger(value.headBlockTime, 0, Number.MAX_SAFE_INTEGER)
  if (value.blockId !== undefined && !/^(?:0x)?[A-Za-z0-9_-]{16,160}$/.test(value.blockId)) throw malformed()
}

function safeText(value: string, max: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw malformed()
}

function safeVersion(value: string): void {
  if (!/^[A-Za-z0-9._+-]{1,128}$/.test(value)) throw malformed()
}

function safePublicId(value: string): void {
  if (!/^(?:0x)?[A-Za-z0-9_=+-]{16,160}$/.test(value)) throw malformed()
}

function safeInteger(value: number | undefined, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw malformed()
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function exposureAddress(scope: 'loopback' | 'private' | 'public' | 'unknown'): string {
  if (scope === 'loopback') return '127.0.0.1'
  if (scope === 'private') return '10.0.0.1'
  if (scope === 'public') return '0.0.0.0'
  return ''
}

function jsonRpc(result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: 'knm-agent', result })
}

function malformed() {
  return agentError('AGENT_PROTOCOL_MALFORMED', false, 'The agent returned malformed typed facts.')
}

function onlyKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw malformed()
}
