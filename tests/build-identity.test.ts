import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getBuildIdentity } from '../src/core/build-identity.js'

describe('build identity', () => {
  it('exposes the complete interface and core build identity', () => {
    const identity = getBuildIdentity()

    assert.equal(identity.productName, 'Koinos Node Manager')
    assert.match(identity.productVersion, /^\d+\.\d+\.\d+/)
    assert.equal(identity.interfaceName, 'cli')
    assert.match(identity.interfaceVersion, /^\d+$/)
    assert.match(identity.coreVersion, /^\d+\.\d+\.\d+/)
    assert.match(identity.gitCommit, /^(?:[0-9a-f]{40}|unknown)$/)
    assert.ok(['development', 'prerelease', 'stable'].includes(identity.releaseChannel))
    assert.equal(Number.isNaN(Date.parse(identity.buildTimestamp)), false)
    assert.ok(identity.sourceState === 'clean' || identity.sourceState === 'dirty')
  })

  it('returns a copy that callers cannot use to alter later results', () => {
    const first = getBuildIdentity()
    first.productVersion = 'changed'

    assert.notEqual(getBuildIdentity().productVersion, 'changed')
  })
})
