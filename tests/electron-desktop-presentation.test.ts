import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accessModeLabel,
  isBasicInspection,
  nextRovingTabIndex,
  relativeCaptureTime,
  sectionTabLabel
} from '../src/electron/desktop-presentation.js'
import type { PublicNodeInspectionSnapshot } from '../src/domain/inspection.js'

describe('Electron desktop presentation', () => {
  it('provides conventional wraparound, Home, and End tab navigation', () => {
    assert.equal(nextRovingTabIndex(0, 'ArrowLeft', 4), 3)
    assert.equal(nextRovingTabIndex(3, 'ArrowRight', 4), 0)
    assert.equal(nextRovingTabIndex(2, 'Home', 4), 0)
    assert.equal(nextRovingTabIndex(1, 'End', 4), 3)
    assert.equal(nextRovingTabIndex(-1, 'ArrowRight', 2), 1)
    assert.equal(nextRovingTabIndex(0, 'Home', 0), -1)
  })

  it('uses outcome-led labels without changing persisted access values', () => {
    assert.equal(accessModeLabel('quick'), 'Basic')
    assert.equal(accessModeLabel('full'), 'Complete')
    assert.equal(accessModeLabel('expert'), 'Expert')
  })

  it('marks only unavailable Components and Governance sections as limited', () => {
    const partial = snapshot(false)
    assert.equal(sectionTabLabel('overview', partial), 'Overview')
    assert.equal(sectionTabLabel('components', partial), 'Components · Limited')
    assert.equal(sectionTabLabel('chain', partial), 'Chain')
    assert.equal(sectionTabLabel('governance', partial), 'Governance · Limited')
    const complete = snapshot(true)
    assert.equal(sectionTabLabel('components', complete), 'Components')
    assert.equal(sectionTabLabel('governance', complete), 'Governance')
  })

  it('detects Basic inspection without interpreting unavailable evidence as false', () => {
    assert.equal(isBasicInspection(snapshot(false)), true)
    assert.equal(isBasicInspection(snapshot(true)), false)
  })

  it('formats capture age without starting a timer', () => {
    const now = Date.parse('2026-07-15T10:00:00.000Z')
    assert.equal(relativeCaptureTime('2026-07-15T09:59:55.000Z', now), 'just now')
    assert.equal(relativeCaptureTime('2026-07-15T09:59:30.000Z', now), '30 sec ago')
    assert.equal(relativeCaptureTime('2026-07-15T09:42:00.000Z', now), '18 min ago')
    assert.equal(relativeCaptureTime('2026-07-15T07:00:00.000Z', now), '3 hr ago')
    assert.equal(relativeCaptureTime('invalid', now), 'at an unknown time')
  })
})

function snapshot(complete: boolean): PublicNodeInspectionSnapshot {
  const evidence = { source: 'derived' as const, observedAt: '2026-07-15T10:00:00.000Z', freshness: 'fresh' as const, authority: 'reported' as const }
  const unavailable = { availability: 'unavailable' as const, reason: 'capability-not-exposed' as const, evidence }
  const available = <T>(value: T) => ({ availability: 'available' as const, value, evidence })
  return {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    node: { id: 'node-a', displayName: 'Node A', flavor: 'unknown' },
    capturedAt: evidence.observedAt,
    freshness: 'fresh',
    readOnly: true,
    capabilities: { overview: true, components: complete, chain: true, governance: complete, apis: true, producer: complete, resources: complete },
    overview: {
      runtime: unavailable, instance: unavailable, network: unavailable, build: unavailable,
      supervisor: unavailable, layout: unavailable, uptimeSeconds: unavailable
    },
    components: complete ? available([]) : unavailable,
    chain: {
      head: unavailable, lastIrreversibleBlock: unavailable, headAgeSeconds: unavailable,
      progress: unavailable, blockStoreAgreement: unavailable, forks: unavailable,
      p2pGossip: unavailable, peerCount: unavailable
    },
    apis: unavailable,
    producer: {
      configured: complete ? available(false) : unavailable,
      effectiveEnabled: unavailable, addressPresent: unavailable,
      recentProduction: unavailable, productionPercentage: unavailable
    },
    governance: {
      configuredProposalIds: complete ? available([]) : unavailable,
      effectiveProposalIds: unavailable, observedProposalVotes: unavailable,
      networkProposals: unavailable
    },
    resources: {
      storage: complete ? available({ totalBytes: 1, usedBytes: 0, freeBytes: 1 }) : unavailable,
      cpuPercent: unavailable, memoryBytes: unavailable
    },
    warnings: [],
    evidence: []
  }
}
