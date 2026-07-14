import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { approveEndpoint } from '../src/core/endpoint-policy.js'
import { sanitizeConnection } from '../src/core/connections.js'
import { reduceOnboardingState } from '../src/core/onboarding-state-machine.js'
import { selectAccessBinding } from '../src/core/node-access.js'
import { InMemorySecretStore } from '../src/core/secret-store.js'
import { validateConnectionState } from '../src/core/validate-connection-state.js'
import type { ConnectionRecord } from '../src/domain/connection.js'
import type { NodeAccessProfile } from '../src/domain/onboarding.js'

const NOW = '2026-07-14T10:00:00.000Z'

describe('onboarding contracts', () => {
  it('enforces deterministic state transitions and terminal states', () => {
    let state = { status: 'idle' as const }
    state = reduceOnboardingState(state, { type: 'start-validation' }) as typeof state
    assert.equal(state.status, 'validating')
    const probing = reduceOnboardingState(state, { type: 'start-probe' })
    const review = reduceOnboardingState(probing, { type: 'review-ready' })
    const committing = reduceOnboardingState(review, { type: 'start-commit' })
    const committed = reduceOnboardingState(committing, { type: 'committed' })
    assert.equal(committed.status, 'committed')
    assert.throws(() => reduceOnboardingState(committed, { type: 'start-validation' }), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'ONBOARDING_TRANSITION_INVALID')
      return true
    })
  })

  it('blocks metadata, link-local, credentials, and unreviewed private endpoints', async () => {
    const publicResolver = async () => [{ address: '203.0.113.20', family: 4 as const }]
    assert.equal((await approveEndpoint({ endpoint: 'https://node.example.invalid', allowPrivate: false, allowLoopbackHttp: false }, publicResolver)).policy, 'https-public')
    await assert.rejects(approveEndpoint({ endpoint: 'https://user:pass@node.example.invalid', allowPrivate: false, allowLoopbackHttp: false }, publicResolver), errorCode('ONBOARDING_ENDPOINT_INVALID'))
    await assert.rejects(approveEndpoint({ endpoint: 'https://metadata.invalid', allowPrivate: false, allowLoopbackHttp: false }, async () => [{ address: '169.254.169.254', family: 4 }] as const), errorCode('ONBOARDING_ENDPOINT_BLOCKED'))
    await assert.rejects(approveEndpoint({ endpoint: 'https://private.invalid', allowPrivate: false, allowLoopbackHttp: false }, async () => [{ address: '10.0.0.2', family: 4 }] as const), errorCode('ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED'))
    assert.equal((await approveEndpoint({ endpoint: 'https://private.invalid', allowPrivate: true, allowLoopbackHttp: false }, async () => [{ address: '10.0.0.2', family: 4 }] as const)).policy, 'https-private-reviewed')
    assert.equal((await approveEndpoint({ endpoint: 'http://127.0.0.1:8080', allowPrivate: false, allowLoopbackHttp: true })).policy, 'http-loopback-development')
  })

  it('selects Full, Expert, then Quick and validates profile references', () => {
    const connections: ConnectionRecord[] = [
      connection('quick', 'public-rpc'), connection('expert', 'ssh'), connection('full', 'agent')
    ]
    const profile: NodeAccessProfile = {
      nodeId: 'observer-one',
      preferredInspectionMode: 'automatic',
      bindings: [
        { connectionRef: 'connection:quick', mode: 'quick', capabilityClass: 'public-observe', verifiedAt: NOW, enabled: true },
        { connectionRef: 'connection:expert', mode: 'expert', capabilityClass: 'ssh-observe', verifiedAt: NOW, enabled: true },
        { connectionRef: 'connection:full', mode: 'full', capabilityClass: 'paired-inspect', verifiedAt: NOW, enabled: true }
      ]
    }
    assert.equal(selectAccessBinding(profile, connections).binding.mode, 'full')
    assert.equal(selectAccessBinding(profile, connections, 'quick').connection.kind, 'public-rpc')
    assert.deepEqual(validateConnectionState({ connections, discoveries: [], adoptionReviews: [], accessProfiles: [profile], onboardingReviews: [] }), [])
  })

  it('keeps credentials behind opaque secret-store references', async () => {
    const store = new InMemorySecretStore()
    await store.put('agent-credential:observer-one', 'a'.repeat(48))
    assert.equal(await store.get('agent-credential:observer-one'), 'a'.repeat(48))
    await store.delete('agent-credential:observer-one')
    assert.equal(await store.get('agent-credential:observer-one'), null)
    await assert.rejects(store.put('invalid', 'raw'))
  })

  it('removes private coordinates and secret references from every public connection DTO', () => {
    const agent = connection('full', 'agent')
    const rpc = connection('quick', 'public-rpc')
    const publicAgent = JSON.stringify(sanitizeConnection(agent))
    const publicRpc = JSON.stringify(sanitizeConnection(rpc))
    assert.doesNotMatch(publicAgent, /agent\.example|agent-credential|a{64}/)
    assert.doesNotMatch(publicRpc, /node\.example/)
    assert.match(publicAgent, /paired-inspect/)
    assert.match(publicRpc, /public-observe/)
  })
})

function connection(id: string, kind: ConnectionRecord['kind']): ConnectionRecord {
  const common = { id, createdAt: NOW, updatedAt: NOW, lastTest: null }
  if (kind === 'ssh') return { ...common, kind, hostAlias: 'observer-alias' }
  if (kind === 'public-rpc') return { ...common, kind, endpoint: 'https://node.example.invalid/', endpointPolicy: 'https-public' }
  return {
    ...common,
    kind,
    endpoint: 'https://agent.example.invalid/',
    endpointPolicy: 'https-public',
    pinnedAgentIdentityDigest: 'a'.repeat(64),
    credentialRef: 'agent-credential:observer-one',
    protocolVersion: '1.0.0',
    runtimeFlavor: 'legacy-microservices',
    scopes: ['inspect']
  }
}

function errorCode(code: string) {
  return (error: unknown) => {
    assert.equal((error as { code: string }).code, code)
    assert.doesNotMatch((error as Error).message, /metadata|10\.0\.0\.2|user:pass/)
    return true
  }
}
