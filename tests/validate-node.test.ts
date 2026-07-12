import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { simulatedNodes } from '../src/adapters/simulation/fixtures.js'
import { assertOpaqueReference, validateInventoryNodes } from '../src/core/validate-node.js'

describe('persisted node validation', () => {
  it('accepts the complete compositional node model and rejects duplicate IDs', () => {
    assert.deepEqual(validateInventoryNodes([simulatedNodes[0]]), [])
    const duplicate = structuredClone(simulatedNodes[0])
    assert.ok(validateInventoryNodes([simulatedNodes[0], duplicate]).some((issue) => issue.includes('duplicates')))
  })

  it('rejects unknown and sensitive fields without including their values in issues', () => {
    const node = { ...structuredClone(simulatedNodes[0]), password: 'raw-secret-material' }
    const issues = validateInventoryNodes([node])
    assert.ok(issues.some((issue) => issue.includes('forbidden sensitive field')))
    assert.doesNotMatch(issues.join('\n'), /raw-secret-material/)
    const disguised = structuredClone(simulatedNodes[0])
    assert.ok(disguised)
    disguised.displayName = 'password=raw-secret-material'
    const disguisedIssues = validateInventoryNodes([disguised])
    assert.ok(disguisedIssues.some((issue) => issue.includes('forbidden sensitive material')))
    assert.doesNotMatch(disguisedIssues.join('\n'), /raw-secret-material/)
  })

  it('accepts opaque references and rejects credentials or filesystem paths', () => {
    assert.doesNotThrow(() => assertOpaqueReference('ssh-config:berlin-observer', '--connection-ref'))
    assert.throws(() => assertOpaqueReference('/Users/operator/.ssh/id_ed25519', '--connection-ref'), /opaque reference/)
    assert.throws(() => assertOpaqueReference('operator:password value', '--connection-ref'), /opaque reference/)
  })
})
