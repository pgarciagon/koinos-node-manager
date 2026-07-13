import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  available,
  inspectionEvidence,
  selectBestInspectionValue,
  unavailable,
  unknown
} from '../src/core/inspection-values.js'
import { sanitizeInspectionSnapshot } from '../src/core/sanitize-inspection.js'
import type { NodeInspectionSnapshot } from '../src/domain/inspection.js'

describe('inspection values and public DTO boundary', () => {
  it('prefers available, fresh, and stronger evidence deterministically', () => {
    const reported = available('declared', inspectionEvidence('derived', '2026-07-13T10:00:00.000Z', 'reported'))
    const observed = available('observed', inspectionEvidence('jsonrpc', '2026-07-13T10:00:00.000Z', 'observed'))
    const staleVerified = available('stale-verified', inspectionEvidence('runtime-status', '2026-07-13T09:00:00.000Z', 'verified', 'stale'))
    const missing = unavailable<string>('capability-not-exposed', inspectionEvidence('configuration', '2026-07-13T10:00:00.000Z'))
    const result = selectBestInspectionValue([missing, reported, staleVerified, observed])
    assert.equal(result.availability, 'available')
    assert.equal(result.value, 'observed')
    assert.equal(selectBestInspectionValue([unknown('insufficient-evidence', reported.evidence), missing]).availability, 'unknown')
  })

  it('blocks adapter output containing private connection or raw-command fields', () => {
    const unsafe = {
      schemaVersion: 1,
      contractVersion: '1.0.0',
      readOnly: true,
      hostAlias: 'private-target'
    } as unknown as NodeInspectionSnapshot
    assert.throws(() => sanitizeInspectionSnapshot(unsafe), (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INSPECTION_PUBLIC_DTO_UNSAFE')
      assert.doesNotMatch((error as Error).message, /private-target/)
      return true
    })
  })
})
