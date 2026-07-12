import type { ListNodesQuery, ListNodesResult } from '../core/list-nodes.js'
import { resolveNodeView } from '../core/node-view.js'
import { sanitizeNodeForDisplay } from '../core/sanitize-node.js'
import {
  NODE_FUNCTIONS,
  type NodeDesiredState,
  type NodeFunction,
  type NodeFunctions,
  type NodeObservedState,
  type NodeRecord,
  type NodeRuntimeFacts,
  type NodeVerifiedState
} from '../domain/node.js'
import { CliInputError } from './cli-input-error.js'
import { successEnvelope } from './envelope.js'

export type OutputFormat = 'table' | 'json'
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['table', 'json']

export const NODE_DETAIL_SECTIONS = ['all', 'summary', 'declared', 'desired', 'observed', 'verified'] as const
export type NodeDetailSection = (typeof NODE_DETAIL_SECTIONS)[number]

export function parseOutputFormat(value: string | undefined): OutputFormat {
  const format = value ?? 'table'
  if ((OUTPUT_FORMATS as readonly string[]).includes(format)) return format as OutputFormat
  throw new CliInputError(`Invalid --output value. Expected one of: ${OUTPUT_FORMATS.join(', ')}.`)
}

function activeFunctions(functions: NodeFunctions): string {
  return NODE_FUNCTIONS
    .filter((nodeFunction) => functions[nodeFunction] === 'enabled')
    .join(', ')
}

function cell(value: string, width: number): string {
  if (value.length > width) return `${value.slice(0, width - 1)}…`
  return value.padEnd(width)
}

export function formatNodesTable(result: ListNodesResult, terminalWidth?: number): string {
  if (result.nodes.length === 0) return 'No nodes match the selected filters.'
  if (terminalWidth !== undefined && terminalWidth < 120) return formatNodesCompact(result)

  const header = [
    cell('NAME', 20),
    cell('MANAGEMENT', 11),
    cell('ORIGIN', 11),
    cell('FLAVOR', 21),
    cell('NETWORK', 9),
    cell('LOCATION', 9),
    cell('AUTHORITY', 10),
    cell('FUNCTIONS', 27),
    cell('HEALTH', 12),
    cell('FRESHNESS', 10)
  ].join(' ')

  const rows = result.nodes.map((node) => {
    const resolved = resolveNodeView(node)
    return [
      cell(node.displayName, 20),
      cell(node.management.class, 11),
      cell(node.management.origin, 11),
      cell(resolved.flavor.id, 21),
      cell(resolved.network.name, 9),
      cell(resolved.location.kind, 9),
      cell(node.management.authorityLevel, 10),
      cell(activeFunctions(resolved.functions), 27),
      cell(resolved.health, 12),
      cell(resolved.freshness, 10)
    ].join(' ')
  })

  return [header, '-'.repeat(header.length), ...rows, '', `${result.total} node${result.total === 1 ? '' : 's'}`].join('\n')
}

function formatNodesCompact(result: ListNodesResult): string {
  const rows = result.nodes.flatMap((node) => {
    const resolved = resolveNodeView(node)
    return [
      `${node.displayName} (${node.id})`,
      `  ${node.management.class}/${node.management.origin} | ${resolved.flavor.id} | ${resolved.network.name}/${resolved.location.kind}`,
      `  authority=${node.management.authorityLevel} | functions=${activeFunctions(resolved.functions) || 'none known'}`,
      `  health=${resolved.health} | freshness=${resolved.freshness}`,
      ''
    ]
  })
  return [...rows, `${result.total} node${result.total === 1 ? '' : 's'}`].join('\n').trimEnd()
}

export function formatNodesJson(result: ListNodesResult, query: ListNodesQuery): string {
  return successEnvelope('nodes.list', {
    total: result.total,
    nodes: result.nodes.map(sanitizeNodeForDisplay)
  }, { query })
}

export function formatNodeDetail(node: NodeRecord, section: NodeDetailSection = 'all'): string {
  const sanitized = sanitizeNodeForDisplay(node)
  const sections = section === 'all'
    ? [summarySection(sanitized), declaredSection(sanitized), desiredSection(sanitized), observedSection(sanitized), verifiedSection(sanitized), provenanceSection(sanitized)]
    : [sectionContent(sanitized, section)]
  return [`${sanitized.displayName} (${sanitized.id})`, ...sections.map((content) => `\n${content}`)].join('\n')
}

export function formatNodeJson(node: NodeRecord, section: NodeDetailSection = 'all'): string {
  const sanitized = sanitizeNodeForDisplay(node)
  const data = section === 'all' ? { node: sanitized } : { node: selectedNodeData(sanitized, section) }
  return successEnvelope('nodes.show', data, { query: { nodeId: sanitized.id, section } })
}

function selectedNodeData(node: NodeRecord, section: Exclude<NodeDetailSection, 'all'>): Record<string, unknown> {
  if (section === 'summary') {
    return {
      id: node.id,
      displayName: node.displayName,
      management: node.management,
      summary: resolveNodeView(node),
      provenance: node.provenance
    }
  }
  return { id: node.id, displayName: node.displayName, [section]: node[section] }
}

function sectionContent(node: NodeRecord, section: Exclude<NodeDetailSection, 'all'>): string {
  if (section === 'summary') return summarySection(node)
  if (section === 'declared') return declaredSection(node)
  if (section === 'desired') return desiredSection(node)
  if (section === 'observed') return observedSection(node)
  return verifiedSection(node)
}

function summarySection(node: NodeRecord): string {
  const resolved = resolveNodeView(node)
  const authority = Object.entries(node.management.authority)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(', ') || 'none'
  return [
    'Summary',
    `  Management:  ${node.management.class} / ${node.management.origin}`,
    `  Authority:   ${node.management.authorityLevel} (${authority})`,
    `  Flavor:      ${flavorLabel(resolved.flavor)}`,
    `  Network:     ${networkLabel(resolved.network)}`,
    `  Location:    ${locationLabel(resolved.location)}`,
    `  Functions:   ${activeFunctions(resolved.functions) || 'none known'}`,
    `  Health:      ${resolved.health}`,
    `  Observation: ${resolved.freshness}${resolved.observedAt === undefined ? '' : ` at ${resolved.observedAt}`}`
  ].join('\n')
}

function declaredSection(node: NodeRecord): string {
  return ['Declared state', ...runtimeFactsLines(node.declared)].join('\n')
}

function desiredSection(node: NodeRecord): string {
  return node.desired === null
    ? 'Desired state\n  none; Node Manager does not control desired runtime state'
    : ['Desired state', ...desiredStateLines(node.desired)].join('\n')
}

function observedSection(node: NodeRecord): string {
  return node.observed === null
    ? 'Observed state\n  none; this record has never had a live observation'
    : ['Observed state', ...observedStateLines(node.observed)].join('\n')
}

function verifiedSection(node: NodeRecord): string {
  return node.verified === null
    ? 'Verified state\n  none'
    : ['Verified state', ...verifiedStateLines(node.verified)].join('\n')
}

function provenanceSection(node: NodeRecord): string {
  const timestamps = Object.entries(node.provenance)
    .filter(([key]) => key !== 'source')
    .map(([key, value]) => `${label(key)}=${value}`)
    .join(', ')
  return [
    'Provenance',
    `  Source:      ${label(node.provenance.source)}`,
    `  Timestamps:  ${timestamps || 'none'}`
  ].join('\n')
}

function runtimeFactsLines(facts: NodeRuntimeFacts): string[] {
  return [
    `  Flavor:      ${flavorLabel(facts.flavor)}`,
    `  Network:     ${networkLabel(facts.network)}`,
    `  Location:    ${locationLabel(facts.location)}`,
    `  Functions:   ${functionStates(facts.functions)}`,
    `  Endpoints:   ${endpointStates(facts.endpoints)}`,
    `  Identity:    ${identityState(facts.identity)}`,
    ...operationalFactLines(facts)
  ]
}

function desiredStateLines(state: NodeDesiredState): string[] {
  return [
    `  Flavor:      ${state.flavor === undefined ? 'not controlled' : flavorLabel(state.flavor)}`,
    `  Network:     ${state.network === undefined ? 'not controlled' : networkLabel(state.network)}`,
    `  Location:    ${state.location === undefined ? 'not controlled' : locationLabel(state.location)}`,
    `  Functions:   ${state.functions === undefined ? 'not controlled' : partialFunctionStates(state.functions)}`,
    ...operationalFactLines(state)
  ]
}

function observedStateLines(state: NodeObservedState): string[] {
  return [
    ...runtimeFactsLines(state),
    `  Health:      ${state.health}`,
    `  Observed:    ${state.observedAt} (${state.freshness})`
  ]
}

function verifiedStateLines(state: NodeVerifiedState): string[] {
  return [
    `  Flavor:      ${state.flavor === undefined ? 'not verified' : flavorLabel(state.flavor)}`,
    `  Network:     ${state.network === undefined ? 'not verified' : networkLabel(state.network)}`,
    `  Location:    ${state.location === undefined ? 'not verified' : locationLabel(state.location)}`,
    `  Functions:   ${state.functions === undefined ? 'not verified' : partialFunctionStates(state.functions)}`,
    `  Endpoints:   ${state.endpoints === undefined ? 'not verified' : endpointStates(state.endpoints)}`,
    `  Identity:    ${state.identity === undefined ? 'not verified' : identityState(state.identity)}`,
    ...operationalFactLines(state),
    `  Verified:    ${state.verifiedAt}`
  ]
}

function operationalFactLines(state: Pick<NodeRuntimeFacts, 'supervisor' | 'runtime' | 'instance' | 'artifact'>): string[] {
  const result: string[] = []
  if (state.supervisor !== undefined) result.push(`  Supervisor:  ${state.supervisor.kind}${state.supervisor.serviceRef === undefined ? '' : ' (service reference configured)'}`)
  if (state.runtime !== undefined) result.push(`  Runtime:     ${state.runtime.kind}${state.runtime.version === undefined ? '' : ` ${state.runtime.version}`}`)
  if (state.instance !== undefined) result.push(`  Instance:    ${state.instance.baseDirRef === undefined ? 'no data-directory reference' : 'data-directory reference configured'}; ports=${Object.entries(state.instance.ports).map(([name, port]) => `${name}:${port}`).join(', ') || 'none'}`)
  if (state.artifact !== undefined) result.push(`  Artifact:    ${state.artifact.version ?? 'version unknown'}${state.artifact.digest === undefined ? '' : ' (digest present)'}`)
  return result
}

function flavorLabel(flavor: NodeRuntimeFacts['flavor']): string {
  return `${flavor.id}${flavor.version === undefined ? '' : ` ${flavor.version}`}`
}

function networkLabel(network: NodeRuntimeFacts['network']): string {
  return `${network.name}${network.chainId === undefined ? '' : ' (chain ID present)'}`
}

function locationLabel(location: NodeRuntimeFacts['location']): string {
  return `${location.kind} / ${location.environment}${location.connectionRef === undefined ? '' : ' (connection reference configured)'}`
}

function functionStates(functions: NodeFunctions): string {
  return NODE_FUNCTIONS.map((nodeFunction) => `${nodeFunction}=${functions[nodeFunction]}`).join(', ')
}

function partialFunctionStates(functions: Partial<NodeFunctions>): string {
  const states = (Object.entries(functions) as [NodeFunction, NodeFunctions[NodeFunction]][])
    .map(([nodeFunction, state]) => `${nodeFunction}=${state}`)
  return states.length === 0 ? 'none' : states.join(', ')
}

function endpointStates(endpoints: NodeRuntimeFacts['endpoints']): string {
  return endpoints.length === 0
    ? 'none'
    : endpoints.map((endpoint) => `${endpoint.kind} (${endpoint.scope}): ${endpoint.address}`).join('; ')
}

function identityState(identity: NodeRuntimeFacts['identity']): string {
  const present = Object.keys(identity).map(label)
  return present.length === 0 ? 'none' : `${present.join(', ')} present`
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}
