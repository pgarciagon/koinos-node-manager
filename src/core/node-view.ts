import {
  NODE_FUNCTIONS,
  type NodeFunctions,
  type NodeRecord,
  type NodeRuntimeFacts,
  type ObservationFreshness,
  type NodeHealth
} from '../domain/node.js'

export type ResolvedNodeView = NodeRuntimeFacts & {
  health: NodeHealth
  freshness: ObservationFreshness
  observedAt?: string
}

export function resolveNodeView(node: NodeRecord): ResolvedNodeView {
  const declared = node.declared
  const observed = node.observed
  const verified = node.verified

  const result: ResolvedNodeView = {
    flavor: verified?.flavor ?? observed?.flavor ?? declared.flavor,
    network: verified?.network ?? observed?.network ?? declared.network,
    location: verified?.location ?? observed?.location ?? declared.location,
    functions: mergeFunctions(declared.functions, observed?.functions, verified?.functions),
    endpoints: structuredClone(verified?.endpoints ?? observed?.endpoints ?? declared.endpoints),
    identity: {
      ...declared.identity,
      ...observed?.identity,
      ...verified?.identity
    },
    health: observed?.health ?? 'unknown',
    freshness: observed?.freshness ?? 'never'
  }
  if (observed !== null) result.observedAt = observed.observedAt
  return result
}

function mergeFunctions(
  declared: NodeFunctions,
  observed: NodeFunctions | undefined,
  verified: Partial<NodeFunctions> | undefined
): NodeFunctions {
  return Object.fromEntries(NODE_FUNCTIONS.map((nodeFunction) => [
    nodeFunction,
    verified?.[nodeFunction] ?? observed?.[nodeFunction] ?? declared[nodeFunction]
  ])) as NodeFunctions
}
