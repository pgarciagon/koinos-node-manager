import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeInspectionSnapshot } from '../../src/core/sanitize-inspection.js'
import type {
  RuntimeInspectionAdapter,
  RuntimeInspectionRequest
} from '../../src/core/runtime-inspection-adapter.js'
import {
  NODE_INSPECTION_CONTRACT_VERSION,
  NODE_INSPECTION_SCHEMA_VERSION
} from '../../src/domain/inspection.js'

type RuntimeInspectionAdapterContractOptions = {
  name: string
  createAdapter: () => RuntimeInspectionAdapter
  createRequest: () => RuntimeInspectionRequest
}

export function runtimeInspectionAdapterContractSuite(
  options: RuntimeInspectionAdapterContractOptions
): void {
  describe(`${options.name} runtime inspection adapter contract`, () => {
    it('returns the shared versioned, read-only, sanitized contract', async () => {
      const adapter = options.createAdapter()
      const request = options.createRequest()
      const snapshot = await adapter.inspect(request)
      const publicSnapshot = sanitizeInspectionSnapshot(snapshot)

      assert.equal(adapter.contractVersion, NODE_INSPECTION_CONTRACT_VERSION)
      assert.equal(publicSnapshot.schemaVersion, NODE_INSPECTION_SCHEMA_VERSION)
      assert.equal(publicSnapshot.contractVersion, NODE_INSPECTION_CONTRACT_VERSION)
      assert.equal(publicSnapshot.readOnly, true)
      assert.equal(publicSnapshot.node.id, request.target.nodeId)
      assert.equal(publicSnapshot.node.flavor, adapter.flavor)
      assert.deepEqual(publicSnapshot.capabilities, adapter.capabilities())
      assert.ok(publicSnapshot.evidence.length > 0)
      assert.ok(publicSnapshot.evidence.every((evidence) => (
        evidence.observedAt === request.capturedAt
        && (evidence.freshness === 'fresh' || evidence.freshness === 'stale')
        && ['reported', 'observed', 'verified'].includes(evidence.authority)
      )))
      assert.notEqual(publicSnapshot, snapshot)
      assert.deepEqual(publicSnapshot, snapshot)
    })

    it('is deterministic for identical evidence and capture time', async () => {
      const first = await options.createAdapter().inspect(options.createRequest())
      const second = await options.createAdapter().inspect(options.createRequest())
      assert.deepEqual(second, first)
    })

    it('fails closed when an adapter adds an undeclared public field', async () => {
      const snapshot = await options.createAdapter().inspect(options.createRequest())
      const unsafe = { ...snapshot, diagnosticPayload: 'undeclared-runtime-data' }
      assert.throws(() => sanitizeInspectionSnapshot(unsafe as never), (error: unknown) => {
        assert.equal((error as { code: string }).code, 'INSPECTION_PUBLIC_DTO_UNSAFE')
        assert.doesNotMatch((error as Error).message, /undeclared-runtime-data/)
        return true
      })
    })
  })
}
