import { mkdir, readFile, writeFile } from 'node:fs/promises'

const outputDirectory = '.artifacts/ui-review'
await mkdir(outputDirectory, { recursive: true })

const sourceHtml = await readFile('dist/electron/index.html', 'utf8')
const harnessHtml = sourceHtml
  .replace('href="styles.css"', 'href="/dist/electron/styles.css"')
  .replace(
    '<script type="module" src="renderer.js"></script>',
    '<script src="/.artifacts/ui-review/fixture-bridge.js"></script>\n    <script type="module" src="/dist/electron/renderer.js"></script>'
  )

await writeFile(`${outputDirectory}/index.html`, harnessHtml)
await writeFile(`${outputDirectory}/fixture-bridge.js`, fixtureBridgeSource())

process.stdout.write(`${outputDirectory}/index.html\n`)

function fixtureBridgeSource() {
  const fixtures = {
    directory: directory(),
    complete: inspection(completeSnapshot(), summary('berlin-observer')),
    partial: inspection(partialSnapshot(), summary('mainnet-seed'))
  }
  return `(() => {
  'use strict'
  const fixtures = ${JSON.stringify(fixtures)}
  const scenario = new URLSearchParams(window.location.search).get('scenario') || 'populated'
  let inspectionCalls = 0
  let visibleDirectory = scenario === 'empty' || scenario === 'onboarding-handoff'
    ? { ...fixtures.directory, nodes: [], total: 0 }
    : scenario === 'partial'
      ? { ...fixtures.directory, nodes: fixtures.directory.nodes.filter((node) => node.nodeId === 'mainnet-seed'), total: 1 }
      : fixtures.directory
  const safeError = {
    code: 'NODE_INSPECTION_UNREACHABLE', severity: 'error', retryable: true,
    message: 'The node did not respond to the bounded read-only inspection.',
    nextAction: 'Check the connection and select Try again.'
  }
  const privateReviewError = {
    code: 'ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED', severity: 'error', retryable: false,
    message: 'The node address resolves to a private network.',
    nextAction: 'Confirm that this is the intended private destination, then retry.'
  }
  const agentUnavailableError = {
    code: 'AGENT_UNREACHABLE', severity: 'error', retryable: true,
    message: 'The approved read-only agent is unavailable.',
    nextAction: 'Check the agent, copy a fresh pairing payload, and retry.'
  }
  const onboardingReview = {
    schemaVersion: 1, contractVersion: '1.0.0', id: 'review-onboarding-node', digest: '${'b'.repeat(64)}',
    mode: 'quick', status: 'review-ready',
    node: { id: 'mainnet-seed', displayName: 'Mainnet Seed', existing: false },
    connectionKind: 'public-rpc',
    access: {
      mode: 'quick', status: 'connected', capabilities: fixtures.partial.inspection.snapshot.capabilities,
      authority: 'public-observe', lastVerifiedAt: '2026-07-14T08:31:00.000Z', freshness: 'fresh',
      warnings: ['Host components and local governance configuration are unavailable with Basic inspection.']
    },
    inspection: fixtures.partial.inspection.snapshot,
    createdAt: '2026-07-14T08:31:00.000Z', expiresAt: '2026-07-14T08:41:00.000Z',
    appliedAt: null, readOnly: true
  }
  window.knmNodes = Object.freeze({
    version: '1.0.0',
    list: async () => ({ ok: true, value: structuredClone(visibleDirectory) }),
    inspect: async (nodeId) => {
      inspectionCalls += 1
      if (scenario === 'initial-error') return { ok: false, error: safeError }
      if (scenario === 'refresh-error' && inspectionCalls > 1) return { ok: false, error: safeError }
      if (scenario === 'refresh-progress' && inspectionCalls > 1) await new Promise((resolve) => setTimeout(resolve, 2500))
      const value = nodeId === 'mainnet-seed' || scenario === 'partial' ? fixtures.partial : fixtures.complete
      const response = structuredClone(value)
      if (inspectionCalls > 1) {
        response.inspection.snapshot.capturedAt = new Date().toISOString()
        if (response.inspection.snapshot.chain.head.availability === 'available') response.inspection.snapshot.chain.head.value.height += 12
      }
      return { ok: true, value: response }
    }
  })
  const unavailable = async () => ({ ok: false, error: safeError })
  window.knmOnboarding = Object.freeze({
    version: '1.0.0',
    previewQuick: async (input) => {
      if (scenario === 'private-review' && !input.allowPrivate) return { ok: false, error: privateReviewError }
      return scenario === 'onboarding-handoff' || scenario === 'private-review'
        ? ({ ok: true, value: structuredClone(onboardingReview) })
        : unavailable()
    },
    previewFullFromClipboard: async (input) => {
      if (scenario === 'full-private-review' && !input.allowPrivate) return { ok: false, error: privateReviewError }
      return { ok: false, error: agentUnavailableError }
    },
    pairFullImported: unavailable, revokeFull: unavailable,
    apply: async (reviewId, digest) => {
      if (scenario !== 'onboarding-handoff' || reviewId !== onboardingReview.id || digest !== onboardingReview.digest) return unavailable()
      visibleDirectory = {
        ...fixtures.directory,
        nodes: [fixtures.partial.node],
        total: 1
      }
      const review = { ...onboardingReview, status: 'committed', appliedAt: '2026-07-14T08:32:00.000Z' }
      return { ok: true, value: { review } }
    },
    status: unavailable, cancel: unavailable, reconcile: unavailable
  })
})()`
}

function directory() {
  return {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    readOnly: true,
    total: 2,
    nodes: [summary('berlin-observer'), summary('mainnet-seed')]
  }
}

function summary(nodeId) {
  return nodeId === 'mainnet-seed'
    ? {
        nodeId,
        displayName: 'Mainnet Seed',
        network: 'mainnet',
        runtimeFlavor: 'unknown',
        availableAccessModes: ['quick'],
        preferredAccessMode: 'quick'
      }
    : {
        nodeId,
        displayName: 'Berlin Observer',
        network: 'mainnet',
        runtimeFlavor: 'legacy-microservices',
        availableAccessModes: ['full', 'expert'],
        preferredAccessMode: 'full'
      }
}

function inspection(snapshot, node) {
  return {
    node,
    inspection: { apiVersion: '1.0.0', snapshot, runtimeChanged: false, persisted: false }
  }
}

function completeSnapshot() {
  const at = new Date(Date.now() - 30_000).toISOString()
  const available = (value, source = 'runtime-status', authority = 'verified') => ({
    availability: 'available', value, evidence: evidence(at, source, authority)
  })
  return {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    node: { id: 'berlin-observer', displayName: 'Berlin Observer', flavor: 'legacy-microservices' },
    capturedAt: at,
    freshness: 'fresh',
    readOnly: true,
    capabilities: { overview: true, components: true, chain: true, governance: true, apis: true, producer: true, resources: true },
    overview: {
      runtime: available({ flavor: 'legacy-microservices', version: '4.0.0' }),
      instance: available({ present: true }),
      network: available({ name: 'mainnet' }, 'jsonrpc'),
      build: available({ version: '4.0.0', digest: `sha256:${'a'.repeat(64)}` }, 'docker'),
      supervisor: available('docker', 'docker'),
      layout: available('legacy-services', 'docker'),
      uptimeSeconds: available(691200, 'docker')
    },
    components: available([
      component('chain', 691200, 0, available),
      component('block_store', 691190, 0, available),
      component('p2p', 691180, 1, available),
      component('jsonrpc', 691170, 0, available),
      component('block_producer', 691160, 0, available)
    ], 'docker'),
    chain: {
      head: available({ height: 123456789 }, 'jsonrpc', 'observed'),
      lastIrreversibleBlock: available(123456780, 'jsonrpc', 'observed'),
      headAgeSeconds: available(18, 'jsonrpc', 'observed'),
      progress: available('advancing', 'derived', 'observed'),
      blockStoreAgreement: available('agrees', 'derived', 'verified'),
      forks: available({ detected: false, count: 0 }, 'jsonrpc', 'observed'),
      p2pGossip: available(true, 'jsonrpc', 'observed'),
      peerCount: available(14, 'runtime-status', 'observed')
    },
    apis: available([
      { kind: 'jsonrpc', scope: 'private', exposed: true },
      { kind: 'grpc', scope: 'private', exposed: true },
      { kind: 'admin', scope: 'local', exposed: true }
    ], 'configuration'),
    producer: {
      configured: available(false, 'configuration'),
      effectiveEnabled: available(false, 'runtime-status'),
      addressPresent: available(false, 'configuration'),
      recentProduction: available({ producedBlocks: 0, observationWindowBlocks: 120 }, 'jsonrpc', 'observed'),
      productionPercentage: available(0, 'derived', 'observed')
    },
    governance: {
      configuredProposalIds: available(['proposal-runtime-4'], 'configuration'),
      effectiveProposalIds: available(['proposal-runtime-4'], 'runtime-status'),
      observedProposalVotes: available([{ proposalId: 'proposal-runtime-4', blockHeight: 123456760 }], 'jsonrpc', 'observed'),
      networkProposals: available([{ proposalId: 'proposal-runtime-4', status: 'active', tally: '68%', threshold: '60%' }], 'jsonrpc', 'observed')
    },
    resources: {
      storage: available({ totalBytes: 536870912000, usedBytes: 161061273600, freeBytes: 375809638400 }, 'runtime-status'),
      cpuPercent: available(18, 'runtime-status', 'observed'),
      memoryBytes: available(3221225472, 'runtime-status', 'observed')
    },
    warnings: [],
    evidence: [evidence(at, 'docker', 'verified'), evidence(at, 'jsonrpc', 'observed'), evidence(at, 'configuration', 'verified')]
  }
}

function partialSnapshot() {
  const at = new Date(Date.now() - 30_000).toISOString()
  const available = (value, source = 'jsonrpc', authority = 'observed') => ({
    availability: 'available', value, evidence: evidence(at, source, authority)
  })
  const unavailable = (reason = 'capability-not-exposed') => ({
    availability: 'unavailable', reason, evidence: evidence(at, 'derived', 'reported')
  })
  return {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    node: { id: 'mainnet-seed', displayName: 'Mainnet Seed', flavor: 'unknown' },
    capturedAt: at,
    freshness: 'fresh',
    readOnly: true,
    capabilities: { overview: true, components: false, chain: true, governance: false, apis: true, producer: false, resources: false },
    overview: {
      runtime: available({ flavor: 'unknown' }, 'derived', 'reported'),
      instance: unavailable(),
      network: available({ name: 'mainnet' }),
      build: unavailable(), supervisor: unavailable(), layout: unavailable(), uptimeSeconds: unavailable()
    },
    components: unavailable(),
    chain: {
      head: available({ height: 123456789 }),
      lastIrreversibleBlock: available(123456780),
      headAgeSeconds: available(22),
      progress: available('advancing', 'derived'),
      blockStoreAgreement: unavailable(),
      forks: unavailable('insufficient-evidence'),
      p2pGossip: available(true),
      peerCount: available(26)
    },
    apis: available([{ kind: 'jsonrpc', scope: 'public', exposed: true }]),
    producer: {
      configured: unavailable(), effectiveEnabled: unavailable(), addressPresent: unavailable(),
      recentProduction: unavailable(), productionPercentage: unavailable()
    },
    governance: {
      configuredProposalIds: unavailable(), effectiveProposalIds: unavailable(),
      observedProposalVotes: unavailable('insufficient-evidence'), networkProposals: unavailable('probe-unsupported')
    },
    resources: { storage: unavailable(), cpuPercent: unavailable(), memoryBytes: unavailable() },
    warnings: [{ code: 'QUICK_CONNECT_LIMITED', severity: 'warning', summary: 'Basic inspection cannot inspect host components, local producer configuration, or locally configured governance proposals.' }],
    evidence: [evidence(at, 'jsonrpc', 'observed')]
  }
}

function component(name, uptimeSeconds, restartCount, available) {
  return {
    name,
    available: available(true, 'docker'),
    state: available('running', 'docker'),
    restartCount: available(restartCount, 'docker'),
    artifact: available({ version: '4.0.0' }, 'docker'),
    uptimeSeconds: available(uptimeSeconds, 'docker')
  }
}

function evidence(observedAt, source, authority) {
  return { source, observedAt, freshness: 'fresh', authority }
}
