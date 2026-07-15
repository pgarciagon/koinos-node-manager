import type { ElectronNodeInspection, ElectronNodeReadBridge, ElectronOnboardingBridge } from './bridge.js'
import { reduceDetailView, reduceDirectoryView, type DetailViewState, type DirectoryViewState } from './desktop-view-model.js'
import { reduceOnboardingView, type OnboardingViewState } from './onboarding-view-model.js'
import {
  ROVING_TAB_KEYS,
  accessModeLabel,
  isBasicInspection,
  nextRovingTabIndex,
  relativeCaptureTime,
  sectionTabLabel,
  type RovingTabKey
} from './desktop-presentation.js'
import type { PublicApplicationError } from '../core/public-error.js'
import type {
  InspectionAvailabilityReason,
  InspectionComponent,
  InspectionSection,
  InspectionValue,
  PublicNodeInspectionSnapshot
} from '../domain/inspection.js'
import type { PublicNodeDirectory, PublicNodeSummary } from '../domain/node-directory.js'
import type { PublicOnboardingReview } from '../domain/onboarding.js'

declare global {
  interface Window {
    knmOnboarding: ElectronOnboardingBridge
    knmNodes: ElectronNodeReadBridge
  }
}

let onboardingState: OnboardingViewState = { status: 'idle', mode: 'quick' }
let directoryState: DirectoryViewState = { status: 'loading' }
let detailState: DetailViewState = { status: 'idle' }
let activeReview: PublicOnboardingReview | undefined
let activeSection: InspectionSection = 'overview'

const onboardingModes = ['quick', 'full'] as const
const detailSections = ['overview', 'components', 'chain', 'governance'] as const

const nodesView = element<HTMLElement>('nodes-view')
const onboardingView = element<HTMLElement>('onboarding-view')
const detailView = element<HTMLElement>('detail-view')
const directoryStatus = element<HTMLElement>('directory-status')
const nodeList = element<HTMLElement>('node-list')
const nodesEmpty = element<HTMLElement>('nodes-empty')
const addNodeButton = element<HTMLButtonElement>('add-node')
const detailStatus = element<HTMLElement>('detail-status')
const refreshButton = element<HTMLButtonElement>('refresh-node')
const detailWarnings = element<HTMLElement>('detail-warnings')
const detailBadges = element<HTMLElement>('detail-badges')
const detailTabs = element<HTMLElement>('detail-tabs')
const quickForm = element<HTMLFormElement>('quick-form')
const fullForm = element<HTMLFormElement>('full-form')
const status = element<HTMLElement>('status')
const reviewPanel = element<HTMLElement>('review-panel')
const applyButton = element<HTMLButtonElement>('apply-review')
const pairButton = element<HTMLButtonElement>('pair-review')
const revokeButton = element<HTMLButtonElement>('revoke-review')
const cancelButton = element<HTMLButtonElement>('cancel-review')
const installGuidance = element<HTMLElement>('agent-install-guidance')
const quickPrivateReview = element<HTMLElement>('quick-private-review')
const fullPrivateReview = element<HTMLElement>('full-private-review')

element<HTMLButtonElement>('home-button').addEventListener('click', () => { void showNodes(true) })
addNodeButton.addEventListener('click', showOnboarding)
element<HTMLButtonElement>('add-first-node').addEventListener('click', showOnboarding)
element<HTMLButtonElement>('back-from-onboarding').addEventListener('click', () => { void showNodes(true) })
element<HTMLButtonElement>('back-to-nodes').addEventListener('click', () => { void showNodes(true) })
refreshButton.addEventListener('click', () => { void refreshDetail() })

installRovingTablist(onboardingModes, (mode) => `mode-${mode}`, selectMode)
installRovingTablist(detailSections, (section) => `detail-tab-${section}`, selectDetailSection)

quickForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  setOnboardingLoading('Connecting with bounded read-only probes…')
  const endpoint = element<HTMLInputElement>('rpc-endpoint')
  const privateEndpoint = endpoint.value
  const result = await window.knmOnboarding.previewQuick({
    nodeId: element<HTMLInputElement>('node-id').value,
    ...optionalName('display-name'),
    endpoint: privateEndpoint,
    allowPrivate: element<HTMLInputElement>('allow-private').checked,
    allowLoopbackHttp: false
  })
  if (result.ok) endpoint.value = ''
  finishOnboardingResult(result)
})

fullForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  setOnboardingLoading('Importing the pairing payload in the protected application process…')
  const result = await window.knmOnboarding.previewFullFromClipboard({
    nodeId: element<HTMLInputElement>('full-node-id').value,
    ...optionalName('full-display-name'),
    allowPrivate: element<HTMLInputElement>('full-allow-private').checked,
    allowLoopbackHttp: false
  })
  finishOnboardingResult(result)
})

pairButton.addEventListener('click', async () => {
  if (activeReview === undefined) return
  setOnboardingLoading('Verifying the pinned agent identity and read-only capability…')
  finishOnboardingResult(await window.knmOnboarding.pairFullImported(activeReview.id))
})

applyButton.addEventListener('click', async () => {
  if (activeReview === undefined) return
  setOnboardingLoading(activeReview.node.existing ? 'Upgrading the existing node without changing its ID…' : 'Adding the reviewed node…')
  const result = await window.knmOnboarding.apply(activeReview.id, activeReview.digest)
  if (!result.ok) return showOnboardingError(result.error)
  activeReview = result.value.review
  onboardingState = reduceOnboardingView(onboardingState, { type: 'completed', review: result.value.review })
  const seeded = result.value.review.inspection?.freshness === 'fresh' ? result.value.review.inspection : undefined
  await showDetail(result.value.review.node.id, seeded)
})

cancelButton.addEventListener('click', async () => {
  if (activeReview === undefined) return
  const result = await window.knmOnboarding.cancel(activeReview.id)
  if (!result.ok) return showOnboardingError(result.error)
  activeReview = undefined
  onboardingState = reduceOnboardingView(onboardingState, { type: 'cancelled' })
  reviewPanel.hidden = true
  setStatus(status, 'Onboarding review cancelled. No node or runtime state was changed.', 'neutral')
})

revokeButton.addEventListener('click', async () => {
  if (activeReview === undefined || activeReview.mode !== 'full') return
  setOnboardingLoading('Revoking the scoped read-only agent credential…')
  const result = await window.knmOnboarding.revokeFull(activeReview.node.id)
  if (!result.ok) return showOnboardingError(result.error)
  reviewPanel.hidden = true
  activeReview = undefined
  setStatus(status, 'Full inspection access was revoked. The node runtime was not changed.', 'success')
})

void showNodes(false)

async function showNodes(focusHeading: boolean): Promise<void> {
  showView('nodes')
  detailState = reduceDetailView(detailState, { type: 'reset' })
  directoryState = reduceDirectoryView(directoryState, { type: 'load' })
  renderDirectory()
  const result = await window.knmNodes.list()
  directoryState = result.ok
    ? reduceDirectoryView(directoryState, { type: 'loaded', directory: result.value })
    : reduceDirectoryView(directoryState, { type: 'failed', error: result.error })
  renderDirectory()
  if (focusHeading) element<HTMLElement>('nodes-title').focus()
}

function renderDirectory(): void {
  nodeList.replaceChildren()
  nodesEmpty.hidden = true
  addNodeButton.hidden = false
  if (directoryState.status === 'loading') {
    setStatus(directoryStatus, 'Loading nodes…', 'progress')
    return
  }
  if (directoryState.status === 'error') {
    setStatus(directoryStatus, `${directoryState.error.message} ${directoryState.error.nextAction}`, 'error')
    return
  }
  if (directoryState.status === 'empty') {
    directoryStatus.hidden = true
    addNodeButton.hidden = true
    nodesEmpty.hidden = false
    return
  }
  directoryStatus.hidden = true
  for (const node of directoryState.directory.nodes) nodeList.append(nodeRow(node))
}

function nodeRow(node: PublicNodeSummary): HTMLButtonElement {
  const row = document.createElement('button')
  row.type = 'button'
  row.className = 'node-row'
  row.setAttribute('aria-label', `Open ${node.displayName}`)
  const primary = document.createElement('span')
  primary.className = 'node-primary'
  primary.append(textSpan('node-name', node.displayName), textSpan('node-id', node.nodeId))
  row.append(primary)
  row.append(meta('Network', titleCase(node.network)))
  row.append(meta('Runtime', flavorLabel(node.runtimeFlavor)))
  const access = document.createElement('span')
  access.className = 'node-meta'
  access.append(textSpan('meta-label', 'Access'))
  const pills = document.createElement('span')
  pills.className = 'access-pills'
  if (node.availableAccessModes.length === 0) pills.append(pill('Unavailable', 'pill-muted'))
  else for (const mode of node.availableAccessModes) pills.append(pill(accessModeLabel(mode), mode === node.preferredAccessMode ? 'pill-safe' : ''))
  access.append(pills)
  row.append(access)
  row.addEventListener('click', () => { void showDetail(node.nodeId) })
  return row
}

async function showDetail(nodeId: string, seededSnapshot?: PublicNodeInspectionSnapshot): Promise<void> {
  showView('detail')
  selectDetailSection('overview')
  detailState = reduceDetailView(detailState, { type: 'load', nodeId })
  renderDetailState()

  if (seededSnapshot !== undefined) {
    const summary = await publicSummary(nodeId)
    if (summary !== undefined) {
      detailState = reduceDetailView(detailState, { type: 'loaded', value: {
        node: summary,
        inspection: { apiVersion: '1.0.0', snapshot: seededSnapshot, runtimeChanged: false, persisted: false }
      } })
      renderDetailState()
      element<HTMLElement>('detail-title').focus()
      return
    }
  }

  const result = await window.knmNodes.inspect(nodeId)
  detailState = result.ok
    ? reduceDetailView(detailState, { type: 'loaded', value: result.value })
    : reduceDetailView(detailState, { type: 'failed', nodeId, error: result.error })
  renderDetailState()
  element<HTMLElement>('detail-title').focus()
}

async function publicSummary(nodeId: string): Promise<PublicNodeSummary | undefined> {
  const current = currentDirectory()
  const existing = current?.nodes.find((node) => node.nodeId === nodeId)
  if (existing !== undefined) return existing
  const result = await window.knmNodes.list()
  if (!result.ok) return undefined
  directoryState = reduceDirectoryView(directoryState, { type: 'loaded', directory: result.value })
  return result.value.nodes.find((node) => node.nodeId === nodeId)
}

async function refreshDetail(): Promise<void> {
  if (detailState.status === 'loading' || detailState.status === 'refreshing' || detailState.status === 'idle') return
  if (detailState.status === 'error' && detailState.previous === undefined) {
    await showDetail(detailState.nodeId)
    return
  }
  const current = detailState.status === 'ready' ? detailState.value : detailState.previous
  if (current === undefined) return
  detailState = reduceDetailView(detailState, { type: 'refresh' })
  renderDetailState()
  const result = await window.knmNodes.inspect(current.node.nodeId)
  detailState = result.ok
    ? reduceDetailView(detailState, { type: 'loaded', value: result.value })
    : reduceDetailView(detailState, { type: 'failed', nodeId: current.node.nodeId, error: result.error })
  renderDetailState()
}

function renderDetailState(): void {
  if (detailState.status === 'idle') return
  if (detailState.status === 'loading') {
    refreshButton.disabled = true
    refreshButton.textContent = 'Refresh'
    text('detail-title', 'Loading node…')
    text('detail-node-id', detailState.nodeId)
    detailBadges.hidden = true
    detailTabs.hidden = true
    setInspectionTiming('loading', 'Loading inspection', 'Waiting for evidence')
    setDetailStatus('Running bounded read-only inspection…', 'progress', false)
    clearDetailContent()
    return
  }
  if (detailState.status === 'error' && detailState.previous === undefined) {
    refreshButton.disabled = false
    refreshButton.textContent = 'Try again'
    text('detail-title', 'Inspection unavailable')
    text('detail-node-id', detailState.nodeId)
    detailBadges.hidden = true
    detailTabs.hidden = true
    clearDetailContent()
    setInspectionTiming('unavailable', 'Inspection unavailable', 'No inspection captured')
    setDetailStatus(`${detailState.error.message} ${detailState.error.nextAction}`, 'error', true)
    return
  }
  const value = detailState.status === 'ready' || detailState.status === 'refreshing'
    ? detailState.value
    : detailState.previous
  if (value === undefined) return
  const failedRefresh = detailState.status === 'error'
  renderDetail(value, failedRefresh)
  refreshButton.disabled = detailState.status === 'refreshing'
  if (detailState.status === 'refreshing') {
    refreshButton.textContent = 'Refreshing…'
    setInspectionTiming('loading', 'Refreshing… · Previous capture retained', `Captured ${formatDate(value.inspection.snapshot.capturedAt)}`)
    setDetailStatus('Refreshing read-only evidence. The previous snapshot remains visible.', 'progress', false)
  } else if (detailState.status === 'error') {
    refreshButton.textContent = 'Try again'
    setDetailStatus(`${detailState.error.message} Previous evidence is retained and marked stale. ${detailState.error.nextAction}`, 'error', true)
  } else if (value.inspection.snapshot.freshness === 'stale') {
    refreshButton.textContent = 'Refresh'
    setDetailStatus('This inspection completed with stale evidence. Review unavailable facts before relying on it.', 'warning', true)
  } else {
    refreshButton.textContent = 'Refresh'
    setDetailStatus('Fresh inspection received.', 'success', false)
  }
}

function renderDetail(value: ElectronNodeInspection, forceStale: boolean): void {
  const snapshot = value.inspection.snapshot
  detailBadges.hidden = false
  detailTabs.hidden = false
  text('detail-title', value.node.displayName)
  text('detail-node-id', value.node.nodeId)
  text('detail-network', titleCase(value.node.network))
  text('detail-runtime', flavorLabel(value.node.runtimeFlavor))
  text('detail-access', value.node.preferredAccessMode === null ? 'Access unavailable' : `${accessModeLabel(value.node.preferredAccessMode)} access`)
  const freshness = forceStale ? 'stale' : snapshot.freshness
  setInspectionTiming(
    freshness,
    `${titleCase(freshness)} · ${forceStale ? 'Last successful capture' : 'Updated'} ${relativeCaptureTime(snapshot.capturedAt, Date.now())}`,
    `Captured ${formatDate(snapshot.capturedAt)}`
  )
  renderWarnings(snapshot)
  renderOverview(snapshot)
  renderComponents(snapshot)
  renderChain(snapshot)
  renderGovernance(snapshot)
  updateSectionTabs(snapshot)
}

function renderWarnings(snapshot: PublicNodeInspectionSnapshot): void {
  detailWarnings.replaceChildren()
  const warnings = snapshot.warnings.filter((warning) => !(isBasicInspection(snapshot) && warning.code === 'QUICK_CONNECT_LIMITED'))
  detailWarnings.hidden = warnings.length === 0
  for (const warning of warnings) {
    const item = document.createElement('div')
    item.className = 'warning-item'
    item.textContent = warning.summary
    detailWarnings.append(item)
  }
}

function renderOverview(snapshot: PublicNodeInspectionSnapshot): void {
  const container = element('overview-content')
  container.replaceChildren()
  const summary = document.createElement('div')
  summary.className = 'summary-grid'
  summary.append(
    summaryCard('Chain', snapshot.chain.progress, (value) => titleCase(value)),
    summaryCard('Head height', snapshot.chain.head, (value) => formatNumber(value.height)),
    summaryCard('Head age', snapshot.chain.headAgeSeconds, formatDuration),
    summaryCard('Peers', snapshot.chain.peerCount, formatNumber)
  )
  container.append(summary)
  const runtime = sectionCard('Runtime', [
    fact('Runtime', inspectionText(snapshot.overview.runtime, (value) => `${flavorLabel(value.flavor)}${value.version === undefined ? '' : ` ${value.version}`}`)),
    fact('Build', inspectionText(snapshot.overview.build, artifactLabel)),
    fact('Supervisor', inspectionText(snapshot.overview.supervisor, titleCase)),
    fact('Layout', inspectionText(snapshot.overview.layout, (value) => value === 'legacy-services' ? 'Legacy services' : 'Monolith')),
    fact('Uptime', inspectionText(snapshot.overview.uptimeSeconds, formatDuration)),
    fact('Instance detected', inspectionText(snapshot.overview.instance, (value) => yesNo(value.present)))
  ])
  const producer = sectionCard('Producer', [
    fact('Producer configured', inspectionText(snapshot.producer.configured, yesNo)),
    fact('Producer effective', inspectionText(snapshot.producer.effectiveEnabled, yesNo)),
    fact('Producer identity', inspectionText(snapshot.producer.addressPresent, (value) => value ? 'Present (hidden)' : 'Not present')),
    fact('Recent production', inspectionText(snapshot.producer.recentProduction, (value) => `${formatNumber(value.producedBlocks)} of ${formatNumber(value.observationWindowBlocks)} blocks`)),
    fact('Production rate', inspectionText(snapshot.producer.productionPercentage, (value) => `${formatNumber(value)}%`))
  ])
  const resources = sectionCard('Resources', [
    fact('Storage', inspectionText(snapshot.resources.storage, (value) => `${formatBytes(value.freeBytes)} free of ${formatBytes(value.totalBytes)}`)),
    fact('CPU', inspectionText(snapshot.resources.cpuPercent, (value) => `${formatNumber(value)}%`)),
    fact('Memory', inspectionText(snapshot.resources.memoryBytes, formatBytes))
  ])
  const publicAccess = sectionCard('API exposure', [
    fact('Available APIs', inspectionText(snapshot.apis, apiLabel))
  ])
  publicAccess.classList.add('public-access-card')
  if (!isBasicInspection(snapshot)) {
    container.append(runtime, sectionCard('Producer and APIs', [
      fact('Producer configured', inspectionText(snapshot.producer.configured, yesNo)),
      fact('Producer effective', inspectionText(snapshot.producer.effectiveEnabled, yesNo)),
      fact('Producer identity', inspectionText(snapshot.producer.addressPresent, (value) => value ? 'Present (hidden)' : 'Not present')),
      fact('Recent production', inspectionText(snapshot.producer.recentProduction, (value) => `${formatNumber(value.producedBlocks)} of ${formatNumber(value.observationWindowBlocks)} blocks`)),
      fact('Production rate', inspectionText(snapshot.producer.productionPercentage, (value) => `${formatNumber(value)}%`)),
      fact('API exposure', inspectionText(snapshot.apis, apiLabel))
    ]), resources)
    return
  }
  const limitation = document.createElement('section')
  limitation.className = 'basic-limitations'
  const limitationTitle = document.createElement('strong')
  limitationTitle.textContent = 'Basic inspection limits'
  const limitationMessage = snapshot.warnings.find((warning) => warning.code === 'QUICK_CONNECT_LIMITED')?.summary
    ?? 'Runtime components, host resources, producer configuration, and local governance require Complete inspection.'
  limitation.append(
    limitationTitle,
    textSpan('', limitationMessage)
  )
  const details = document.createElement('details')
  details.className = 'overview-details'
  const detailsSummary = document.createElement('summary')
  detailsSummary.textContent = 'View unavailable Overview details'
  const detailsContent = document.createElement('div')
  detailsContent.className = 'overview-details-content'
  detailsContent.append(runtime, producer, resources)
  details.append(detailsSummary, detailsContent)
  container.append(limitation, publicAccess, details)
}

function renderComponents(snapshot: PublicNodeInspectionSnapshot): void {
  const container = element('components-content')
  container.replaceChildren()
  if (snapshot.components.availability !== 'available') {
    container.append(unavailableState('Components unavailable', reasonLabel(snapshot.components.reason)))
    return
  }
  if (snapshot.components.value.length === 0) {
    container.append(unavailableState('No components reported', 'The runtime returned a valid empty component list.'))
    return
  }
  const grid = document.createElement('div')
  grid.className = 'component-grid'
  for (const component of snapshot.components.value) grid.append(componentCard(component))
  container.append(grid)
}

function componentCard(component: InspectionComponent): HTMLElement {
  const card = document.createElement('article')
  card.className = 'component-card'
  const heading = document.createElement('div')
  heading.className = 'component-heading'
  const name = document.createElement('h2')
  name.textContent = component.name
  const state = inspectionText(component.state, titleCase)
  heading.append(name, pill(state.text, state.availability === 'available' && state.text === 'Running' ? 'pill-safe' : state.availability === 'available' ? 'pill-warning' : 'pill-muted'))
  const facts = document.createElement('div')
  facts.className = 'component-facts'
  facts.append(
    miniFact('Available', inspectionText(component.available, yesNo).text),
    miniFact('Restarts', inspectionText(component.restartCount, formatNumber).text),
    miniFact('Uptime', inspectionText(component.uptimeSeconds, formatDuration).text),
    miniFact('Artifact', inspectionText(component.artifact, artifactLabel).text)
  )
  card.append(heading, facts)
  return card
}

function renderChain(snapshot: PublicNodeInspectionSnapshot): void {
  const container = element('chain-content')
  container.replaceChildren(sectionCard('Chain evidence', [
    fact('Head', inspectionText(snapshot.chain.head, (value) => `Block ${formatNumber(value.height)}`)),
    fact('Last irreversible block', inspectionText(snapshot.chain.lastIrreversibleBlock, formatNumber)),
    fact('Head age', inspectionText(snapshot.chain.headAgeSeconds, formatDuration)),
    fact('Progress', inspectionText(snapshot.chain.progress, titleCase)),
    fact('Block store', inspectionText(snapshot.chain.blockStoreAgreement, titleCase)),
    fact('Fork evidence', inspectionText(snapshot.chain.forks, (value) => value.detected ? `${formatNumber(value.count)} detected` : 'None detected')),
    fact('P2P gossip', inspectionText(snapshot.chain.p2pGossip, (value) => value ? 'Available' : 'Unavailable')),
    fact('Peer count', inspectionText(snapshot.chain.peerCount, formatNumber))
  ]))
}

function renderGovernance(snapshot: PublicNodeInspectionSnapshot): void {
  const container = element('governance-content')
  container.replaceChildren()
  const grid = document.createElement('div')
  grid.className = 'governance-grid'
  grid.append(
    governanceCard('Configured', 'Proposal IDs present in producer configuration.', snapshot.governance.configuredProposalIds, (value) => value),
    governanceCard('Effective', 'Proposal IDs loaded by the running process.', snapshot.governance.effectiveProposalIds, (value) => value),
    governanceCard('Observed votes', 'Proposal votes observed in recent block headers.', snapshot.governance.observedProposalVotes, (value) => `${value.proposalId} · block ${formatNumber(value.blockHeight)}`),
    governanceCard('Network status', 'Network-wide proposal state and tally when queryable.', snapshot.governance.networkProposals, (value) => `${value.proposalId} · ${value.status}${value.tally === undefined ? '' : ` · ${value.tally}`}${value.threshold === undefined ? '' : ` / ${value.threshold}`}`)
  )
  container.append(grid)
}

function governanceCard<T>(title: string, description: string, value: InspectionValue<readonly T[]>, format: (item: T) => string): HTMLElement {
  const card = document.createElement('article')
  card.className = 'governance-card'
  const heading = document.createElement('h2')
  heading.textContent = title
  const copy = document.createElement('p')
  copy.textContent = description
  card.append(heading, copy)
  const list = document.createElement('ul')
  list.className = 'value-list'
  if (value.availability !== 'available') list.append(listItem(reasonLabel(value.reason)))
  else if (value.value.length === 0) list.append(listItem('None reported'))
  else for (const item of value.value) list.append(listItem(format(item)))
  card.append(list)
  return card
}

function sectionCard(title: string, facts: readonly HTMLElement[]): HTMLElement {
  const card = document.createElement('section')
  card.className = 'section-card'
  const heading = document.createElement('h2')
  heading.textContent = title
  const grid = document.createElement('div')
  grid.className = 'fact-grid'
  grid.append(...facts)
  card.append(heading, grid)
  return card
}

function summaryCard<T>(label: string, value: InspectionValue<T>, format: (value: T) => string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'summary-card'
  const rendered = inspectionText(value, format)
  card.append(textSpan('meta-label', label), textSpan('summary-value', rendered.text))
  if (rendered.availability !== 'available') card.append(textSpan('summary-note', titleCase(rendered.availability)))
  return card
}

function fact(label: string, value: { text: string; availability: InspectionValue<unknown>['availability'] }): HTMLElement {
  const item = document.createElement('div')
  item.className = 'fact'
  const rendered = textSpan('fact-value', value.text)
  rendered.dataset.availability = value.availability
  item.append(textSpan('fact-label', label), rendered)
  return item
}

function inspectionText<T>(value: InspectionValue<T>, format: (value: T) => string): { text: string; availability: InspectionValue<T>['availability'] } {
  return value.availability === 'available'
    ? { text: format(value.value), availability: value.availability }
    : { text: reasonLabel(value.reason), availability: value.availability }
}

function unavailableState(title: string, message: string): HTMLElement {
  const state = document.createElement('section')
  state.className = 'unavailable-state'
  const heading = document.createElement('h2')
  heading.textContent = title
  const copy = document.createElement('p')
  copy.textContent = message
  state.append(heading, copy)
  return state
}

function selectDetailSection(section: InspectionSection): void {
  activeSection = section
  for (const candidate of detailSections) {
    const tab = element<HTMLButtonElement>(`detail-tab-${candidate}`)
    tab.setAttribute('aria-selected', String(candidate === section))
    tab.tabIndex = candidate === section ? 0 : -1
    element(`detail-panel-${candidate}`).hidden = candidate !== section
  }
}

function showOnboarding(): void {
  showView('onboarding')
  reviewPanel.hidden = true
  installGuidance.hidden = true
  selectMode('quick')
  element<HTMLElement>('onboarding-title').focus()
}

function showView(view: 'nodes' | 'onboarding' | 'detail'): void {
  nodesView.hidden = view !== 'nodes'
  onboardingView.hidden = view !== 'onboarding'
  detailView.hidden = view !== 'detail'
}

function selectMode(mode: 'quick' | 'full'): void {
  onboardingState = reduceOnboardingView(onboardingState, { type: 'select-mode', mode })
  quickForm.hidden = mode !== 'quick'
  fullForm.hidden = mode !== 'full'
  for (const candidate of onboardingModes) {
    const tab = element<HTMLButtonElement>(`mode-${candidate}`)
    tab.setAttribute('aria-selected', String(mode === candidate))
    tab.tabIndex = mode === candidate ? 0 : -1
  }
  resetPrivateReview()
  reviewPanel.hidden = true
  installGuidance.hidden = true
  setStatus(status, mode === 'quick'
    ? 'Enter a node address to start a read-only inspection.'
    : 'Copy a fresh pairing payload from an approved read-only agent, then import it here.', 'neutral')
}

function finishOnboardingResult(result: Awaited<ReturnType<ElectronOnboardingBridge['previewQuick']>>): void {
  quickForm.removeAttribute('aria-busy')
  fullForm.removeAttribute('aria-busy')
  if (!result.ok) return showOnboardingError(result.error)
  resetPrivateReview()
  activeReview = result.value
  onboardingState = reduceOnboardingView(onboardingState, { type: 'review', review: result.value })
  renderReview(result.value)
}

function renderReview(review: PublicOnboardingReview): void {
  reviewPanel.hidden = false
  installGuidance.hidden = true
  text('review-node', `${review.node.displayName} (${review.node.id})`)
  text('review-mode', review.mode === 'quick' ? 'Basic inspection' : 'Complete inspection')
  text('review-network', onboardingNetworkLabel(review))
  text('review-capabilities', availableCapabilities(review).join(', ') || 'No capabilities reported')
  text('review-limitations', review.access.warnings.length === 0 ? 'No reported limitations' : review.access.warnings.join(', '))
  text('review-digest', review.digest)
  pairButton.hidden = review.status !== 'pairing'
  applyButton.hidden = review.status !== 'review-ready'
  revokeButton.hidden = review.status !== 'committed' || review.mode !== 'full'
  applyButton.textContent = review.node.existing ? 'Upgrade existing node' : 'Add node'
  cancelButton.hidden = review.status === 'committed'
  setStatus(status, review.status === 'pairing'
    ? 'Agent identity is pinned for this review. Continue to consume the imported single-use secret.'
    : review.status === 'committed'
      ? 'Connected.'
      : 'Review the detected identity, authority, and limitations before adding this node.', review.status === 'committed' ? 'success' : 'neutral')
}

function setOnboardingLoading(message: string): void {
  onboardingState = reduceOnboardingView(onboardingState, { type: 'loading', message })
  const form = onboardingState.mode === 'quick' ? quickForm : fullForm
  form.setAttribute('aria-busy', 'true')
  setStatus(status, message, 'progress')
  reviewPanel.hidden = true
}

function showOnboardingError(error: PublicApplicationError): void {
  quickForm.removeAttribute('aria-busy')
  fullForm.removeAttribute('aria-busy')
  onboardingState = reduceOnboardingView(onboardingState, { type: 'failed', error })
  setStatus(status, `${error.message} ${error.nextAction}`, 'error')
  if (error.code === 'ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED') {
    const full = onboardingState.mode === 'full'
    const review = full ? fullPrivateReview : quickPrivateReview
    const checkbox = element<HTMLInputElement>(full ? 'full-allow-private' : 'allow-private')
    review.hidden = false
    checkbox.focus()
  }
  installGuidance.hidden = !(onboardingState.status === 'error' && onboardingState.mode === 'full' && onboardingState.category === 'agent-unavailable')
}

function resetPrivateReview(): void {
  quickPrivateReview.hidden = true
  fullPrivateReview.hidden = true
  element<HTMLInputElement>('allow-private').checked = false
  element<HTMLInputElement>('full-allow-private').checked = false
}

function installRovingTablist<T extends string>(
  values: readonly T[],
  id: (value: T) => string,
  select: (value: T) => void
): void {
  const buttons = values.map((value) => element<HTMLButtonElement>(id(value)))
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => select(values[index] as T))
  }
  buttons[0]?.parentElement?.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || !ROVING_TAB_KEYS.includes(event.key as RovingTabKey)) return
    const current = buttons.findIndex((button) => button === document.activeElement)
    const next = nextRovingTabIndex(current, event.key as RovingTabKey, buttons.length)
    const value = values[next]
    const button = buttons[next]
    if (value === undefined || button === undefined) return
    event.preventDefault()
    select(value)
    button.focus()
  })
}

function onboardingNetworkLabel(review: PublicOnboardingReview): string {
  const network = review.inspection?.overview.network
  return network?.availability === 'available' ? titleCase(network.value.name) : 'Unknown network'
}

function availableCapabilities(review: PublicOnboardingReview): string[] {
  return Object.entries(review.access.capabilities).filter(([, value]) => value).map(([key]) => titleCase(key))
}

function currentDirectory(): PublicNodeDirectory | undefined {
  return directoryState.status === 'ready' || directoryState.status === 'empty' ? directoryState.directory : undefined
}

function clearDetailContent(): void {
  detailWarnings.replaceChildren()
  detailWarnings.hidden = true
  for (const id of ['overview-content', 'components-content', 'chain-content', 'governance-content']) element(id).replaceChildren()
  for (const id of ['detail-network', 'detail-runtime', 'detail-access']) text(id, '—')
  updateSectionTabs()
}

function updateSectionTabs(snapshot?: PublicNodeInspectionSnapshot): void {
  for (const section of detailSections) text(`detail-tab-${section}`, sectionTabLabel(section, snapshot))
}

function setInspectionTiming(
  freshness: 'fresh' | 'stale' | 'loading' | 'unavailable',
  summary: string,
  captured: string
): void {
  text('detail-freshness-summary', summary)
  element('detail-freshness-summary').dataset.freshness = freshness
  text('detail-captured', captured)
}

function setDetailStatus(
  message: string,
  kind: 'neutral' | 'progress' | 'success' | 'warning' | 'error',
  visible: boolean
): void {
  setStatus(detailStatus, message, kind)
  detailStatus.classList.toggle('status-live-only', !visible)
}

function setStatus(target: HTMLElement, message: string, kind: 'neutral' | 'progress' | 'success' | 'warning' | 'error'): void {
  target.hidden = false
  target.textContent = message
  target.dataset.kind = kind
}

function optionalName(id: string): { displayName?: string } {
  const value = element<HTMLInputElement>(id).value.trim()
  return value === '' ? {} : { displayName: value }
}

function meta(label: string, value: string): HTMLElement {
  const item = document.createElement('span')
  item.className = 'node-meta'
  item.append(textSpan('meta-label', label), textSpan('meta-value', value))
  return item
}

function miniFact(label: string, value: string): HTMLElement {
  const item = document.createElement('span')
  item.className = 'mini-fact'
  item.append(textSpan('meta-label', label), textSpan('meta-value', value))
  return item
}

function pill(value: string, extraClass: string): HTMLElement {
  const item = textSpan(`pill ${extraClass}`.trim(), value)
  return item
}

function listItem(value: string): HTMLLIElement {
  const item = document.createElement('li')
  item.textContent = value
  return item
}

function textSpan(className: string, value: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = className
  span.textContent = value
  return span
}

function text(id: string, value: string): void { element<HTMLElement>(id).textContent = value }

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (value === null) throw new Error('The desktop view is incomplete.')
  return value as T
}

function reasonLabel(reason: InspectionAvailabilityReason): string {
  const labels: Record<InspectionAvailabilityReason, string> = {
    'not-requested': 'Not requested for this inspection',
    'capability-not-exposed': 'Unavailable through this connection',
    'probe-unsupported': 'Not supported by this runtime',
    'transport-unavailable': 'The read-only connection is unavailable',
    'malformed-response': 'The runtime returned unusable evidence',
    'not-configured': 'Not configured on this node',
    'insufficient-evidence': 'Not enough evidence to determine this fact',
    'stale-evidence': 'Only stale evidence is available',
    'runtime-mismatch': 'Evidence does not match the expected runtime'
  }
  return labels[reason]
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time'
}

function formatNumber(value: number): string { return new Intl.NumberFormat().format(value) }

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)} hr`
  return `${Math.round(seconds / 86_400)} days`
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${formatNumber(value)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let scaled = value
  let unit = -1
  while (scaled >= 1_024 && unit < units.length - 1) { scaled /= 1_024; unit += 1 }
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[unit] ?? 'B'}`
}

function artifactLabel(value: { version?: string; digest?: string }): string {
  if (value.version !== undefined) return value.version
  if (value.digest !== undefined) return `Verified digest ${value.digest.slice(0, 12)}…`
  return 'Identity present'
}

function apiLabel(value: readonly { kind: string; scope: string; exposed: boolean }[]): string {
  if (value.length === 0) return 'None reported'
  return value.map((api) => `${api.kind.toUpperCase()} · ${titleCase(api.scope)}${api.exposed ? '' : ' · not exposed'}`).join(', ')
}

function yesNo(value: boolean): string { return value ? 'Yes' : 'No' }

function titleCase(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function flavorLabel(value: PublicNodeSummary['runtimeFlavor']): string {
  if (value === 'legacy-microservices') return 'Legacy multiservice'
  if (value === 'teleno-monolith') return 'Teleno'
  return 'Unknown runtime'
}
