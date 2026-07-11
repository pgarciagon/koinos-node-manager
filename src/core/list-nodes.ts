import type {
  ManagementClass,
  NetworkName,
  NodeFunction,
  NodeHealth,
  NodeRecord
} from '../domain/node.js'
import type { NodeRepository } from './node-repository.js'

export type ListNodesQuery = {
  management?: ManagementClass
  network?: NetworkName
  function?: NodeFunction
  health?: NodeHealth
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
    .filter((node) => query.management === undefined || node.management.class === query.management)
    .filter((node) => query.network === undefined || node.network.name === query.network)
    .filter((node) => query.function === undefined || node.functions[query.function] !== 'disabled' && node.functions[query.function] !== 'unknown')
    .filter((node) => query.health === undefined || node.health === query.health)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  return { nodes, total: nodes.length }
}
