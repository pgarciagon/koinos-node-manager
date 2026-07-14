import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reduceDetailView, reduceDirectoryView, type DetailViewState, type DirectoryViewState } from '../src/electron/desktop-view-model.js'
import type { ElectronNodeInspection } from '../src/electron/bridge.js'
import type { PublicApplicationError } from '../src/core/public-error.js'

const error: PublicApplicationError = {
  code: 'NODE_UNREACHABLE',
  severity: 'error',
  retryable: true,
  message: 'The node did not respond.',
  nextAction: 'Check the read-only connection and retry.'
}

describe('Electron desktop view model', () => {
  it('distinguishes loading, empty, ready, and error directory states', () => {
    const loading = reduceDirectoryView({ status: 'loading' }, { type: 'load' })
    assert.deepEqual(loading, { status: 'loading' })
    const emptyDirectory = { schemaVersion: 1 as const, contractVersion: '1.0.0' as const, nodes: [], total: 0, readOnly: true as const }
    assert.equal(reduceDirectoryView(loading, { type: 'loaded', directory: emptyDirectory }).status, 'empty')
    const readyDirectory = { ...emptyDirectory, nodes: [summary()], total: 1 }
    assert.equal(reduceDirectoryView(loading, { type: 'loaded', directory: readyDirectory }).status, 'ready')
    assert.deepEqual(reduceDirectoryView(loading, { type: 'failed', error }), { status: 'error', error })
  })

  it('retains the previous snapshot through refresh and failure', () => {
    const value = inspection()
    const ready: DetailViewState = { status: 'ready', value }
    const refreshing = reduceDetailView(ready, { type: 'refresh' })
    assert.deepEqual(refreshing, { status: 'refreshing', value })
    const failed = reduceDetailView(refreshing, { type: 'failed', nodeId: value.node.nodeId, error })
    assert.deepEqual(failed, { status: 'error', nodeId: value.node.nodeId, error, previous: value })
    assert.equal(reduceDetailView(failed, { type: 'refresh' }).status, 'refreshing')
  })

  it('deduplicates refresh while loading or already refreshing', () => {
    const loading: DetailViewState = { status: 'loading', nodeId: 'node-a' }
    assert.equal(reduceDetailView(loading, { type: 'refresh' }), loading)
    const refreshing: DetailViewState = { status: 'refreshing', value: inspection() }
    assert.equal(reduceDetailView(refreshing, { type: 'refresh' }), refreshing)
  })

  it('supports a safe first-load failure without inventing a snapshot', () => {
    const state: DetailViewState = { status: 'loading', nodeId: 'node-a' }
    assert.deepEqual(reduceDetailView(state, { type: 'failed', nodeId: 'node-a', error }), {
      status: 'error', nodeId: 'node-a', error
    })
    const reset = reduceDetailView(state, { type: 'reset' })
    assert.deepEqual(reset, { status: 'idle' })
  })
})

function summary() {
  return {
    nodeId: 'node-a', displayName: 'Node A', network: 'testnet' as const,
    runtimeFlavor: 'legacy-microservices' as const,
    availableAccessModes: ['quick'] as const, preferredAccessMode: 'quick' as const
  }
}

function inspection(): ElectronNodeInspection {
  return {
    node: summary(),
    inspection: {
      apiVersion: '1.0.0', runtimeChanged: false, persisted: false,
      snapshot: {
        schemaVersion: 1, contractVersion: '1.0.0',
        node: { id: 'node-a', displayName: 'Node A', flavor: 'legacy-microservices' },
        capturedAt: '2026-07-14T08:00:00.000Z', freshness: 'fresh', readOnly: true,
        capabilities: { overview: true, components: false, chain: true, governance: false, apis: true, producer: false, resources: false },
        overview: unavailableOverview(), components: unavailable('capability-not-exposed'),
        chain: unavailableChain(), apis: unavailable('capability-not-exposed'),
        producer: unavailableProducer(), governance: unavailableGovernance(),
        resources: unavailableResources(), warnings: [], evidence: []
      }
    }
  }
}

function evidence() { return { source: 'derived' as const, observedAt: '2026-07-14T08:00:00.000Z', freshness: 'fresh' as const, authority: 'reported' as const } }
function unavailable(reason: 'capability-not-exposed') { return { availability: 'unavailable' as const, reason, evidence: evidence() } }
function unavailableOverview() {
  return { runtime: unavailable('capability-not-exposed'), instance: unavailable('capability-not-exposed'), network: unavailable('capability-not-exposed'), build: unavailable('capability-not-exposed'), supervisor: unavailable('capability-not-exposed'), layout: unavailable('capability-not-exposed'), uptimeSeconds: unavailable('capability-not-exposed') }
}
function unavailableChain() {
  return { head: unavailable('capability-not-exposed'), lastIrreversibleBlock: unavailable('capability-not-exposed'), headAgeSeconds: unavailable('capability-not-exposed'), progress: unavailable('capability-not-exposed'), blockStoreAgreement: unavailable('capability-not-exposed'), forks: unavailable('capability-not-exposed'), p2pGossip: unavailable('capability-not-exposed'), peerCount: unavailable('capability-not-exposed') }
}
function unavailableProducer() {
  return { configured: unavailable('capability-not-exposed'), effectiveEnabled: unavailable('capability-not-exposed'), addressPresent: unavailable('capability-not-exposed'), recentProduction: unavailable('capability-not-exposed'), productionPercentage: unavailable('capability-not-exposed') }
}
function unavailableGovernance() {
  return { configuredProposalIds: unavailable('capability-not-exposed'), effectiveProposalIds: unavailable('capability-not-exposed'), observedProposalVotes: unavailable('capability-not-exposed'), networkProposals: unavailable('capability-not-exposed') }
}
function unavailableResources() {
  return { storage: unavailable('capability-not-exposed'), cpuPercent: unavailable('capability-not-exposed'), memoryBytes: unavailable('capability-not-exposed') }
}
