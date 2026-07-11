import type { ListNodesQuery, ListNodesResult } from '../core/list-nodes.js'
import type { NodeFunction, NodeRecord } from '../domain/node.js'

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
  return JSON.stringify({
    schemaVersion: 1,
    ok: true,
    command: 'nodes.list',
    query,
    data: {
      total: result.total,
      nodes: result.nodes
    },
    warnings: [],
    errors: []
  }, null, 2)
}
