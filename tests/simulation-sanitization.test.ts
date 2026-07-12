import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulationScenarios } from '../src/adapters/simulation/scenarios.js'

describe('simulation data sanitization', () => {
  it('keeps committed scenarios free of private network and secret material', () => {
    const serialized = JSON.stringify(simulationScenarios)

    assert.doesNotMatch(serialized, /-----BEGIN (?:OPENSSH|RSA|EC) PRIVATE KEY-----/)
    assert.doesNotMatch(serialized, /\b(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/)
    assert.doesNotMatch(serialized, /(?:password|privateKey|accessToken|secretKey)"\s*:/i)
  })

  it('uses placeholders, example domains, or loopback for every endpoint address', () => {
    for (const scenario of simulationScenarios) {
      for (const node of scenario.nodes) {
        const stateEndpoints = [
          node.declared.endpoints,
          node.observed?.endpoints ?? [],
          node.verified?.endpoints ?? []
        ]
        for (const endpoint of stateEndpoints.flat()) {
          assert.match(endpoint.address, /(?:\.example|127\.0\.0\.1|<REDACTED>)/)
        }
      }
    }
  })
})
