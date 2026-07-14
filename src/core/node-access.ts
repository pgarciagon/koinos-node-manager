import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import type { ConnectionRecord } from '../domain/connection.js'
import type { AccessMode, NodeAccessBinding, NodeAccessProfile } from '../domain/onboarding.js'

const AUTOMATIC_PRIORITY: Readonly<Record<AccessMode, number>> = {
  full: 0,
  expert: 1,
  quick: 2
}

export function selectAccessBinding(
  profile: NodeAccessProfile,
  connections: readonly ConnectionRecord[],
  override?: AccessMode
): { binding: NodeAccessBinding; connection: ConnectionRecord } {
  const requested = override ?? profile.preferredInspectionMode
  const candidates = profile.bindings.filter((binding) => binding.enabled)
  const ordered = requested === 'automatic'
    ? [...candidates].sort((left, right) => AUTOMATIC_PRIORITY[left.mode] - AUTOMATIC_PRIORITY[right.mode]
      || right.verifiedAt.localeCompare(left.verifiedAt)
      || left.connectionRef.localeCompare(right.connectionRef))
    : candidates.filter((binding) => binding.mode === requested)
  for (const binding of ordered) {
    const id = connectionId(binding.connectionRef)
    const connection = connections.find((candidate) => candidate.id === id)
    if (connection !== undefined && modeMatchesConnection(binding.mode, connection.kind)) {
      return { binding: structuredClone(binding), connection: structuredClone(connection) }
    }
  }
  throw new ApplicationError({
    code: 'NODE_ACCESS_UNAVAILABLE',
    exitCode: EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable: true,
    message: 'No enabled verified inspection path is available for this node.',
    nextAction: 'Review the node access summary or reconnect through Quick, Full, or Expert Connect.'
  })
}

export function upsertAccessBinding(nodeId: string, profile: NodeAccessProfile | undefined, binding: NodeAccessBinding): NodeAccessProfile {
  const bindings = profile?.bindings.filter((candidate) => candidate.connectionRef !== binding.connectionRef) ?? []
  return {
    nodeId: profile?.nodeId ?? nodeId,
    bindings: [...bindings, structuredClone(binding)],
    preferredInspectionMode: profile?.preferredInspectionMode ?? 'automatic'
  }
}

function connectionId(reference: string): string {
  if (reference.startsWith('connection:') && reference.length > 'connection:'.length) return reference.slice('connection:'.length)
  throw new ApplicationError({
    code: 'NODE_ACCESS_REFERENCE_INVALID',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: false,
    message: 'A node access binding contains an invalid opaque connection reference.',
    nextAction: 'Run "knm doctor" and repair the local access metadata.'
  })
}

function modeMatchesConnection(mode: AccessMode, kind: ConnectionRecord['kind']): boolean {
  return (mode === 'quick' && kind === 'public-rpc')
    || (mode === 'full' && kind === 'agent')
    || (mode === 'expert' && kind === 'ssh')
}
