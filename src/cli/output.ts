import type { ListNodesQuery, ListNodesResult } from '../core/list-nodes.js'
import type { NodeFunction, NodeRecord } from '../domain/node.js'
import { successEnvelope } from './envelope.js'

export type OutputFormat = 'table' | 'json'

function activeFunctions(node: NodeRecord): string {
  return (Object.entries(node.functions) as [NodeFunction, NodeRecord['functions'][NodeFunction]][])
    .filter(([, state]) => state !== 'disabled' && state !== 'unknown')
    .map(([name]) => name)
    .join(', ')
}

function cell(value: string, width: number): string {
  if (value.length > width) return `${value.slice(0, width - 1)}…`
  return value.padEnd(width)
}

export function formatNodesTable(result: ListNodesResult): string {
  if (result.nodes.length === 0) return 'No nodes match the selected filters.'

  const header = [
    cell('NAME', 22),
    cell('MANAGEMENT', 12),
    cell('ORIGIN', 12),
    cell('FLAVOR', 22),
    cell('NETWORK', 9),
    cell('LOCATION', 10),
    cell('FUNCTIONS', 30),
    cell('HEALTH', 12)
  ].join(' ')

  const rows = result.nodes.map((node) => [
    cell(node.displayName, 22),
    cell(node.management.class, 12),
    cell(node.management.origin, 12),
    cell(node.flavor.id, 22),
    cell(node.network.name, 9),
    cell(node.location.kind, 10),
    cell(activeFunctions(node), 30),
    cell(node.health, 12)
  ].join(' '))

  return [header, '-'.repeat(header.length), ...rows, '', `${result.total} node${result.total === 1 ? '' : 's'}`].join('\n')
}

export function formatNodesJson(result: ListNodesResult, query: ListNodesQuery): string {
  return successEnvelope('nodes.list', { total: result.total, nodes: result.nodes }, { query })
}

function label(value: string): string {
  return value.replaceAll('-', ' ')
}

export function formatNodeDetail(node: NodeRecord): string {
  const authority = Object.entries(node.management.authority)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(', ') || 'none'
  const endpoints = node.endpoints.length === 0
    ? 'none'
    : node.endpoints.map((endpoint) => `${endpoint.kind} (${endpoint.scope}, ${endpoint.verification}): ${endpoint.address}`).join('\n  ')

  return [
    `${node.displayName} (${node.id})`,
    '',
    `Management:   ${node.management.class} / ${node.management.origin} / ${node.management.authorityLevel}`,
    `Authority:    ${authority}`,
    `Flavor:       ${node.flavor.id}${node.flavor.version === undefined ? '' : ` ${node.flavor.version}`} (${node.flavor.confidence})`,
    `Network:      ${node.network.name} (${node.network.verification})`,
    `Location:     ${node.location.kind} / ${node.location.environment}`,
    `Functions:    ${activeFunctions(node) || 'none known'}`,
    `Health:       ${node.health}`,
    `Last seen:    ${node.lastObservedAt ?? 'unknown'}`,
    `Provenance:   ${label(node.provenance.source)}`,
    '',
    'Endpoints:',
    `  ${endpoints}`
  ].join('\n')
}

export function formatNodeJson(node: NodeRecord): string {
  return successEnvelope('nodes.show', { node })
}
