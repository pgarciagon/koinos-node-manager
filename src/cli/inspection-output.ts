import type {
  InspectionSection,
  InspectionValue,
  PublicNodeInspectionSnapshot
} from '../domain/inspection.js'
import { successEnvelope } from './envelope.js'

export function formatInspectionJson(
  snapshot: PublicNodeInspectionSnapshot,
  section?: InspectionSection
): string {
  const publicSnapshot = section === undefined ? snapshot : selectInspectionSection(snapshot, section)
  return successEnvelope('nodes.inspect', {
    snapshot: publicSnapshot,
    runtimeChanged: false,
    persisted: false
  }, { query: { nodeId: snapshot.node.id, section: section ?? 'all' } })
}

export function formatInspectionHuman(
  snapshot: PublicNodeInspectionSnapshot,
  section?: InspectionSection
): string {
  const sections = section === undefined
    ? [overviewLines(snapshot), componentLines(snapshot), chainLines(snapshot), governanceLines(snapshot)]
    : [section === 'overview'
        ? overviewLines(snapshot)
        : section === 'components'
          ? componentLines(snapshot)
          : section === 'chain'
            ? chainLines(snapshot)
            : governanceLines(snapshot)]
  return [
    `${snapshot.node.displayName} (${snapshot.node.id})`,
    `Inspection contract ${snapshot.contractVersion}; captured ${snapshot.capturedAt}; evidence ${snapshot.freshness}`,
    ...sections.map((lines) => `\n${lines.join('\n')}`),
    ...(snapshot.warnings.length === 0
      ? []
      : [`\nWarnings\n${snapshot.warnings.map((warning) => `  ${warning.severity.toUpperCase()} ${warning.code}: ${warning.summary}`).join('\n')}`]),
    '\nRead-only inspection completed. No runtime or inventory state was changed.'
  ].join('\n')
}

function selectInspectionSection(snapshot: PublicNodeInspectionSnapshot, section: InspectionSection): Record<string, unknown> {
  const base = {
    schemaVersion: snapshot.schemaVersion,
    contractVersion: snapshot.contractVersion,
    node: snapshot.node,
    capturedAt: snapshot.capturedAt,
    freshness: snapshot.freshness,
    readOnly: snapshot.readOnly,
    capabilities: snapshot.capabilities,
    warnings: snapshot.warnings,
    evidence: snapshot.evidence
  }
  if (section === 'overview') {
    return { ...base, overview: snapshot.overview, apis: snapshot.apis, producer: snapshot.producer, resources: snapshot.resources }
  }
  return { ...base, [section]: snapshot[section] }
}

function overviewLines(snapshot: PublicNodeInspectionSnapshot): string[] {
  const overview = snapshot.overview
  const apiText = valueText(snapshot.apis, (apis) => apis.length === 0
    ? 'none'
    : apis.map((api) => `${api.kind}:${api.scope}:${api.exposed ? 'exposed' : 'not-host-exposed'}`).join(', '))
  return [
    'Overview',
    `  Runtime:               ${valueText(overview.runtime, (value) => `${value.flavor}${value.version === undefined ? '' : ` ${value.version}`}`)}`,
    `  Instance:              ${valueText(overview.instance, (value) => value.present ? 'present' : 'not reported')}`,
    `  Network:               ${valueText(overview.network, (value) => `${value.name}${value.chainId === undefined ? '' : ' (chain ID present)'}`)}`,
    `  Build:                 ${valueText(overview.build, artifactText)}`,
    `  Supervisor/layout:     ${valueText(overview.supervisor)} / ${valueText(overview.layout)}`,
    `  Uptime:                ${valueText(overview.uptimeSeconds, durationText)}`,
    `  APIs:                  ${apiText}`,
    `  Producer configured:   ${valueText(snapshot.producer.configured, booleanText)}`,
    `  Producer effective:    ${valueText(snapshot.producer.effectiveEnabled, booleanText)}`,
    `  Producer address:      ${valueText(snapshot.producer.addressPresent, (value) => value ? 'present (value redacted)' : 'not present')}`,
    `  Production percentage: ${valueText(snapshot.producer.productionPercentage, (value) => `${value}%`)}`,
    `  Recent production:     ${valueText(snapshot.producer.recentProduction, (value) => `${value.producedBlocks}/${value.observationWindowBlocks} blocks`)}`,
    `  Storage:               ${valueText(snapshot.resources.storage, (value) => `${bytes(value.usedBytes)} used / ${bytes(value.totalBytes)} total; ${bytes(value.freeBytes)} free`)}`,
    `  CPU:                   ${valueText(snapshot.resources.cpuPercent, (value) => `${value}%`)}`,
    `  Memory:                ${valueText(snapshot.resources.memoryBytes, bytes)}`
  ]
}

function componentLines(snapshot: PublicNodeInspectionSnapshot): string[] {
  if (snapshot.components.availability !== 'available') {
    return ['Components', `  ${valueText(snapshot.components)}`]
  }
  if (snapshot.components.value.length === 0) return ['Components', '  none reported']
  return [
    'Components',
    ...snapshot.components.value.map((component) => [
      `  ${component.name}`,
      `    available=${valueText(component.available, booleanText)}`,
      `state=${valueText(component.state)}`,
      `restarts=${valueText(component.restartCount)}`,
      `artifact=${valueText(component.artifact, artifactText)}`,
      `uptime=${valueText(component.uptimeSeconds, durationText)}`
    ].join(' | '))
  ]
}

function chainLines(snapshot: PublicNodeInspectionSnapshot): string[] {
  const chain = snapshot.chain
  return [
    'Chain',
    `  Head:                  ${valueText(chain.head, (value) => `${value.height}${value.blockId === undefined ? '' : ' (block ID present)'}`)}`,
    `  Last irreversible:     ${valueText(chain.lastIrreversibleBlock)}`,
    `  Head age:              ${valueText(chain.headAgeSeconds, durationText)}`,
    `  Progress:              ${valueText(chain.progress)}`,
    `  Block-store agreement: ${valueText(chain.blockStoreAgreement)}`,
    `  Forks:                 ${valueText(chain.forks, (value) => `${value.detected ? 'detected' : 'not detected'} (${value.count} heads)`)}`,
    `  P2P gossip:            ${valueText(chain.p2pGossip, booleanText)}`,
    `  Peer count:            ${valueText(chain.peerCount)}`
  ]
}

function governanceLines(snapshot: PublicNodeInspectionSnapshot): string[] {
  const governance = snapshot.governance
  return [
    'Governance',
    `  Configured proposals: ${valueText(governance.configuredProposalIds, proposalList)}`,
    `  Effective proposals:  ${valueText(governance.effectiveProposalIds, proposalList)}`,
    `  Observed block votes: ${valueText(governance.observedProposalVotes, (votes) => votes.length === 0 ? 'none' : `${votes.length} vote observations`)}`,
    `  Network proposals:    ${valueText(governance.networkProposals, (proposals) => proposals.length === 0 ? 'none' : `${proposals.length} proposals`)}`
  ]
}

function valueText<T>(value: InspectionValue<T>, formatter: (input: T) => string = String): string {
  return value.availability === 'available'
    ? formatter(value.value)
    : `${value.availability} (${value.reason})`
}

function artifactText(value: { version?: string; digest?: string }): string {
  const parts = [value.version === undefined ? undefined : `version ${value.version}`, value.digest === undefined ? undefined : 'digest present']
    .filter((part): part is string => part !== undefined)
  return parts.length === 0 ? 'identity unavailable' : parts.join(', ')
}

function booleanText(value: boolean): string {
  return value ? 'yes' : 'no'
}

function durationText(value: number): string {
  if (value < 60) return `${value}s`
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`
  return `${Math.floor(value / 3600)}h ${Math.floor(value % 3600 / 60)}m`
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  return `${(value / 1024 ** 3).toFixed(1)} GiB`
}

function proposalList(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.join(', ')
}
