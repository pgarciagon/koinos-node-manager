import type {
  NodeEndpoint,
  NodeIdentityEvidence,
  NodeRecord,
  NodeRuntimeFacts,
  NodeVerifiedState
} from '../domain/node.js'

export function sanitizeNodeForDisplay(node: NodeRecord): NodeRecord {
  const copy = structuredClone(node)
  copy.declared = sanitizeRuntimeFacts(copy.declared)
  if (copy.desired?.location?.connectionRef !== undefined) {
    copy.desired.location.connectionRef = '<CONNECTION_REF_PRESENT>'
  }
  sanitizeOperationalReferences(copy.desired)
  if (copy.observed !== null) {
    copy.observed = { ...sanitizeRuntimeFacts(copy.observed), health: copy.observed.health, observedAt: copy.observed.observedAt, freshness: copy.observed.freshness }
  }
  if (copy.verified !== null) copy.verified = sanitizeVerifiedState(copy.verified)
  return copy
}

function sanitizeRuntimeFacts(facts: NodeRuntimeFacts): NodeRuntimeFacts {
  const result: NodeRuntimeFacts = {
    ...facts,
    location: sanitizeLocation(facts.location),
    endpoints: facts.endpoints.map(sanitizeEndpoint),
    identity: sanitizeIdentity(facts.identity)
  }
  sanitizeOperationalReferences(result)
  return result
}

function sanitizeVerifiedState(state: NodeVerifiedState): NodeVerifiedState {
  const result = structuredClone(state)
  if (result.location !== undefined) result.location = sanitizeLocation(result.location)
  if (result.endpoints !== undefined) result.endpoints = result.endpoints.map(sanitizeEndpoint)
  if (result.identity !== undefined) result.identity = sanitizeIdentity(result.identity)
  sanitizeOperationalReferences(result)
  return result
}

function sanitizeOperationalReferences(value: Pick<NodeRuntimeFacts, 'supervisor' | 'instance'> | null): void {
  if (value?.supervisor?.serviceRef !== undefined) value.supervisor.serviceRef = '<SERVICE_REF_PRESENT>'
  if (value?.instance?.baseDirRef !== undefined) value.instance.baseDirRef = '<BASE_DIR_REF_PRESENT>'
}

function sanitizeLocation(location: NodeRuntimeFacts['location']): NodeRuntimeFacts['location'] {
  if (location.connectionRef === undefined) return { ...location }
  return { ...location, connectionRef: '<CONNECTION_REF_PRESENT>' }
}

function sanitizeEndpoint(endpoint: NodeEndpoint): NodeEndpoint {
  if (endpoint.scope === 'private') return { ...endpoint, address: '<PRIVATE_ENDPOINT>' }
  if (endpoint.scope === 'unknown' && !endpoint.address.includes('<REDACTED>')) {
    return { ...endpoint, address: '<REDACTED_ENDPOINT>' }
  }
  return { ...endpoint }
}

function sanitizeIdentity(identity: NodeIdentityEvidence): NodeIdentityEvidence {
  const sanitized: NodeIdentityEvidence = {}
  if (identity.peerId !== undefined) sanitized.peerId = '<PEER_ID_PRESENT>'
  if (identity.runtimeInstanceId !== undefined) sanitized.runtimeInstanceId = '<RUNTIME_INSTANCE_ID_PRESENT>'
  if (identity.producerAddress !== undefined) sanitized.producerAddress = '<PRODUCER_ADDRESS_PRESENT>'
  return sanitized
}
