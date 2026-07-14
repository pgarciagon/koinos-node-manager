import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AgentReadOnlyProbeTransport } from '../src/adapters/agent/agent-read-only-probe-transport.js'
import { FakeNodeAgent } from '../src/adapters/simulation/fake-node-agent.js'
import { decodeStoredAgentCredential, encodeStoredAgentCredential } from '../src/core/agent-credential.js'
import { createPairingRequest, validateAgentProbeResponse, validateDiscovery, verifyPairingResponse } from '../src/core/agent-protocol.js'
import { InMemorySecretStore } from '../src/core/secret-store.js'
import type { AgentConnectionRecord } from '../src/domain/connection.js'

const NOW = new Date('2026-07-14T10:00:00.000Z')
const now = () => new Date(NOW)

describe('Koinos node agent protocol', () => {
  it('pairs with identity possession proof and executes only closed typed probes', async () => {
    const agent = new FakeNodeAgent({ now, endpoint: 'https://agent.example.invalid' })
    const pairing = agent.issuePairingPayload()
    const target = { endpoint: pairing.endpoint, endpointPolicy: 'https-public' as const }
    const discovery = await agent.discover(target, 1000)
    validateDiscovery(discovery)
    const generated = createPairingRequest(pairing.sessionId, pairing.secret)
    const response = await agent.pair(target, generated.request, 1000)
    verifyPairingResponse(response, pairing.sessionId, pairing.identityDigest, generated.transcript, NOW)
    const store = new InMemorySecretStore()
    const reference = 'agent-credential:agent-test'
    await store.put(reference, encodeStoredAgentCredential({ credentialId: response.credentialId, token: response.credential }))
    assert.equal(decodeStoredAgentCredential(await store.get(reference) as string).credentialId, response.credentialId)
    const connection = connectionRecord(pairing.endpoint, pairing.identityDigest, reference)
    const transport = new AgentReadOnlyProbeTransport(agent, store)
    const chain = await transport.execute({ connection, kind: 'node.multiservice.chain-id', timeoutMs: 1000 })
    assert.equal(chain.outcome, 'success')
    assert.match(chain.payload ?? '', /chain_id/)
    const arbitrary = await transport.execute({ connection, kind: 'host.inventory', timeoutMs: 1000 })
    assert.equal(arbitrary.outcome, 'unsupported')
  })

  it('rejects wrong, replayed, expired, downgraded, and identity-changed pairing', async () => {
    const agent = new FakeNodeAgent({ now })
    const pairing = agent.issuePairingPayload()
    const target = { endpoint: pairing.endpoint, endpointPolicy: 'https-private-reviewed' as const }
    const wrong = createPairingRequest(pairing.sessionId, 'x'.repeat(43))
    await assert.rejects(agent.pair(target, wrong.request, 1000), code('AGENT_PAIRING_REJECTED'))
    const valid = createPairingRequest(pairing.sessionId, pairing.secret)
    const response = await agent.pair(target, valid.request, 1000)
    await assert.rejects(agent.pair(target, valid.request, 1000), code('AGENT_PAIRING_REPLAYED'))
    assert.throws(() => verifyPairingResponse(response, pairing.sessionId, 'f'.repeat(64), valid.transcript, NOW), code('AGENT_IDENTITY_CHANGED'))

    const expired = new FakeNodeAgent({ now })
    const expiredPayload = expired.issuePairingPayload(1)
    const expiredRequest = createPairingRequest(expiredPayload.sessionId, expiredPayload.secret)
    const original = NOW.getTime()
    NOW.setTime(original + 2)
    await assert.rejects(expired.pair({ endpoint: expiredPayload.endpoint, endpointPolicy: 'https-private-reviewed' }, expiredRequest.request, 1000), code('AGENT_PAIRING_EXPIRED'))
    NOW.setTime(original)

    const downgraded = new FakeNodeAgent({ now, protocolVersion: '0.9.0' })
    await assert.rejects(async () => validateDiscovery(await awaitDiscovery(downgraded)), code('AGENT_PROTOCOL_INCOMPATIBLE'))
  })

  it('revokes the scoped credential and rejects subsequent inspection', async () => {
    const agent = new FakeNodeAgent({ now })
    const pairing = agent.issuePairingPayload()
    const target = { endpoint: pairing.endpoint, endpointPolicy: 'https-private-reviewed' as const }
    const generated = createPairingRequest(pairing.sessionId, pairing.secret)
    const paired = await agent.pair(target, generated.request, 1000)
    await agent.revoke(target, paired.credential, { schemaVersion: 1, protocolVersion: '1.0.0', credentialId: paired.credentialId }, 1000)
    const result = await agent.probe(target, paired.credential, { schemaVersion: 1, protocolVersion: '1.0.0', requestId: 'request_12345678', kind: 'node.multiservice.chain-id', timeoutMs: 1000 }, 1000)
    assert.equal(result.outcome, 'authentication-failed')
  })

  it('rejects unexpected and oversized agent response fields', () => {
    const base = {
      schemaVersion: 1 as const,
      protocolVersion: '1.0.0' as const,
      requestId: 'request_12345678',
      outcome: 'success' as const,
      durationMs: 1,
      facts: { kind: 'node.multiservice.chain-id' as const, chainId: 'A'.repeat(43) }
    }
    assert.throws(() => validateAgentProbeResponse({ ...base, command: 'id' } as never, base.requestId, base.facts.kind), code('AGENT_PROTOCOL_MALFORMED'))
    assert.throws(() => validateAgentProbeResponse({ ...base, facts: { ...base.facts, arbitraryRpcMethod: 'wallet.send' } } as never, base.requestId, base.facts.kind), code('AGENT_PROTOCOL_MALFORMED'))
    assert.throws(() => validateAgentProbeResponse({ ...base, facts: { ...base.facts, chainId: 'A'.repeat(300_000) } }, base.requestId, base.facts.kind), code('AGENT_RESPONSE_OVERSIZED'))
  })
})

async function awaitDiscovery(agent: FakeNodeAgent) {
  return agent.discover({ endpoint: 'https://agent.example.invalid', endpointPolicy: 'https-public' }, 1000)
}

function connectionRecord(endpoint: string, digest: string, credentialRef: string): AgentConnectionRecord {
  return {
    id: 'agent-test', kind: 'agent', endpoint, endpointPolicy: 'https-public', pinnedAgentIdentityDigest: digest,
    credentialRef, protocolVersion: '1.0.0', runtimeFlavor: 'legacy-microservices', scopes: ['inspect'],
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lastTest: null
  }
}

function code(expected: string) {
  return (error: unknown) => {
    assert.equal((error as { code?: string }).code, expected)
    return true
  }
}
