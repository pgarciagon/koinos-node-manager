import type {
  AuthorityLevel,
  LocationKind,
  ManagementClass,
  NetworkName,
  NodeFlavorId,
  NodeFunction,
  NodeHealth,
  NodeOrigin,
  NodeRecord,
  ObservationFreshness
} from '../domain/node.js'
import type { NodeRepository } from './node-repository.js'
import { resolveNodeView } from './node-view.js'

export type ListNodesQuery = {
  management?: ManagementClass
  origin?: NodeOrigin
  flavor?: NodeFlavorId
  network?: NetworkName
  location?: LocationKind
  authority?: AuthorityLevel
  function?: NodeFunction
  health?: NodeHealth
  staleness?: ObservationFreshness
}

export type ListNodesResult = {
  nodes: readonly NodeRecord[]
  total: number
}

export async function listNodes(
  repository: NodeRepository,
  query: ListNodesQuery = {}
): Promise<ListNodesResult> {
  const nodes = (await repository.list())
    .filter((node) => matchesQuery(node, query))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  return { nodes, total: nodes.length }
}

function matchesQuery(node: NodeRecord, query: ListNodesQuery): boolean {
  const resolved = resolveNodeView(node)
  return (query.management === undefined || node.management.class === query.management)
    && (query.origin === undefined || node.management.origin === query.origin)
    && (query.flavor === undefined || resolved.flavor.id === query.flavor)
    && (query.network === undefined || resolved.network.name === query.network)
    && (query.location === undefined || resolved.location.kind === query.location)
    && (query.authority === undefined || node.management.authorityLevel === query.authority)
    && (query.function === undefined || resolved.functions[query.function] === 'enabled')
    && (query.health === undefined || resolved.health === query.health)
    && (query.staleness === undefined || resolved.freshness === query.staleness)
}
