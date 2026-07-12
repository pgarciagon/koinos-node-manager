import { parseArgs } from 'node:util'
import { discoverHost, discoverPeers, dismissDiscovery, getDiscovery, listDiscoveries } from '../../core/discoveries.js'
import type { DiscoveryRecord, HostDiscoveryRecord } from '../../domain/connection.js'
import type { ApplicationContext } from '../application-context.js'
import { CliInputError } from '../cli-input-error.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'
import { requireState, timeout } from './connections.js'

export async function runDiscoverHost(args: readonly string[], context: ApplicationContext, commandName = 'discover.host'): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { connection: { type: 'string' }, 'timeout-ms': { type: 'string', default: '10000' }, output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  if (parsed.values.connection === undefined) throw new CliInputError('The --connection option is required.')
  const result = await discoverHost({
    repository: requireState(context),
    nodeRepository: context.nodeRepository,
    aliasResolver: context.aliasResolver,
    probeTransport: context.probeTransport
  }, parsed.values.connection, timeout(parsed.values['timeout-ms']))
  const output = parseOutputFormat(parsed.values.output)
  return output === 'json'
    ? successEnvelope(commandName, { revision: result.revision, discovery: sanitizeDiscovery(result.discovery), runtimeChanged: false })
    : formatHostDiscovery(result.discovery, result.revision)
}

export async function runDiscoverPeers(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { from: { type: 'string' }, save: { type: 'boolean', default: false }, 'timeout-ms': { type: 'string', default: '10000' }, output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  if (parsed.values.from === undefined) throw new CliInputError('The --from option is required.')
  const result = await discoverPeers({
    repository: requireState(context),
    nodeRepository: context.nodeRepository,
    aliasResolver: context.aliasResolver,
    probeTransport: context.probeTransport
  }, parsed.values.from, timeout(parsed.values['timeout-ms']), parsed.values.save)
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('discover.peers', { revision: result.revision, saved: result.revision !== null, discovery: sanitizeDiscovery(result.discovery), inventoryChanged: false })
  return [`Peer discovery ${result.discovery.id}`, `  Peers: ${result.discovery.findings.total}`, `  Saved: ${result.revision === null ? 'no' : `yes; revision ${result.revision}`}`, 'No discovered peer was added to inventory or marked managed.'].join('\n')
}

export async function runDiscoveriesList(args: readonly string[], context: ApplicationContext): Promise<string> {
  const output = simpleOutput(args)
  const discoveries = await listDiscoveries(requireState(context))
  if (output === 'json') return successEnvelope('discoveries.list', { total: discoveries.length, discoveries: discoveries.map(sanitizeDiscovery) })
  if (discoveries.length === 0) return 'No discovery evidence is stored.'
  return [...discoveries.map((discovery) => `${discovery.id}  ${discovery.kind.padEnd(5)}  ${discovery.status.padEnd(9)}  ${discovery.capturedAt}`), '', `${discoveries.length} discover${discoveries.length === 1 ? 'y' : 'ies'}`].join('\n')
}

export async function runDiscoveriesShow(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm discoveries show <discovery-id> [--output table|json]')
  const discovery = await getDiscovery(requireState(context), parsed.positionals[0] as string)
  return parseOutputFormat(parsed.values.output) === 'json'
    ? successEnvelope('discoveries.show', { discovery: sanitizeDiscovery(discovery) })
    : discovery.kind === 'host' ? formatHostDiscovery(discovery, null) : [`Peer discovery ${discovery.id}`, `  Status: ${discovery.status}`, `  Captured: ${discovery.capturedAt}`, `  Expires: ${discovery.expiresAt}`, `  Peers: ${discovery.findings.total}`].join('\n')
}

export async function runDiscoveriesDismiss(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm discoveries dismiss <discovery-id> [--output table|json]')
  const result = await dismissDiscovery(requireState(context), parsed.positionals[0] as string)
  return parseOutputFormat(parsed.values.output) === 'json'
    ? successEnvelope('discoveries.dismiss', { revision: result.revision, discovery: sanitizeDiscovery(result.discovery), inventoryChanged: false })
    : [`Dismissed discovery ${result.discovery.id}.`, `Connection-state revision: ${result.revision}`, 'No inventory record or remote runtime was changed.'].join('\n')
}

export function sanitizeDiscovery<T extends DiscoveryRecord>(discovery: T): T {
  const copy = structuredClone(discovery)
  if (copy.kind === 'host') {
    if (copy.findings.supervisor.serviceRef !== undefined) copy.findings.supervisor.serviceRef = '<SERVICE_REF_PRESENT>'
    if (copy.findings.instance.baseDirRef !== undefined) copy.findings.instance.baseDirRef = '<BASE_DIR_REF_PRESENT>'
  }
  return copy
}

function formatHostDiscovery(discovery: HostDiscoveryRecord, revision: number | null): string {
  const facts = discovery.findings
  return [
    `Host discovery ${discovery.id}`,
    `  Connection:    ${discovery.source.connectionId}`,
    `  Status:        ${discovery.status}`,
    `  Flavor:        ${facts.flavor.id}${facts.flavor.version === undefined ? '' : ` ${facts.flavor.version}`}`,
    `  Network:       ${facts.network.name}${facts.network.chainId === undefined ? '' : ' (chain ID present)'}`,
    `  Environment:   ${facts.environment}`,
    `  Supervisor:    ${facts.supervisor.kind}${facts.supervisor.serviceRef === undefined ? '' : ' (reference present)'}`,
    `  Runtime:       ${facts.runtime.kind}${facts.runtime.version === undefined ? '' : ` ${facts.runtime.version}`}`,
    `  Data dir:      ${facts.instance.baseDirRef === undefined ? 'unknown' : 'reference present'}`,
    `  Ports:         ${Object.entries(facts.instance.ports).map(([name, port]) => `${name}:${port}`).join(', ') || 'none'}`,
    `  Artifact:      ${facts.artifact.version ?? 'unknown'}${facts.artifact.digest === undefined ? '' : ' (digest present)'}`,
    `  Evidence:      ${facts.evidenceCompleteness}`,
    `  Expires:       ${discovery.expiresAt}`,
    ...(revision === null ? [] : [`  State revision: ${revision}`]),
    '  Runtime changed: no'
  ].join('\n')
}

function simpleOutput(args: readonly string[]) {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: false, strict: true })
  return parseOutputFormat(parsed.values.output)
}
