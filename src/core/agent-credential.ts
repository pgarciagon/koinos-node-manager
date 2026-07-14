import { agentError } from './agent-protocol.js'

export type StoredAgentCredential = { credentialId: string; token: string }

export function encodeStoredAgentCredential(value: StoredAgentCredential): string {
  validate(value)
  return JSON.stringify(value)
}

export function decodeStoredAgentCredential(value: string): StoredAgentCredential {
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('malformed')
    const record = parsed as Record<string, unknown>
    if (Object.keys(record).some((key) => !['credentialId', 'token'].includes(key))) throw new Error('malformed')
    const result = { credentialId: record.credentialId, token: record.token }
    validate(result)
    return result
  } catch {
    throw agentError('AGENT_CREDENTIAL_UNAVAILABLE', true, 'The stored node-agent credential is unavailable or malformed.')
  }
}

function validate(value: { credentialId: unknown; token: unknown }): asserts value is StoredAgentCredential {
  if (typeof value.credentialId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.credentialId)
    && typeof value.token === 'string' && /^[A-Za-z0-9_-]{43,512}$/.test(value.token)) return
  throw agentError('AGENT_CREDENTIAL_UNAVAILABLE', true, 'The stored node-agent credential is unavailable or malformed.')
}
