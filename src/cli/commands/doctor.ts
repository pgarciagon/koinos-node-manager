import { parseArgs } from 'node:util'
import { ApplicationError } from '../../core/application-error.js'
import { testConnection } from '../../core/connections.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import type { InventoryDiagnosticCheck } from '../../core/node-repository.js'
import type { ApplicationContext } from '../application-context.js'
import type { CommandHandlerResult } from '../command-registry.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runDoctor(args: readonly string[], context: ApplicationContext): Promise<CommandHandlerResult> {
  const parsed = parseArgs({
    args,
    options: {
      'recover-inventory': { type: 'boolean', default: false },
      'recover-connection-state': { type: 'boolean', default: false },
      'check-connections': { type: 'boolean', default: false },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  const output = parseOutputFormat(parsed.values.output)
  const repository = context.inventoryRepository
  const connectionRepository = context.connectionStateRepository
  if (repository === null || connectionRepository === null) {
    throw new ApplicationError({
      code: 'DOCTOR_REQUIRES_LOCAL_INVENTORY',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'Inventory doctor checks require the local inventory adapter.',
      nextAction: 'Run "knm doctor" without --simulation.'
    })
  }
  const recovered = parsed.values['recover-inventory'] ? await repository.recoverLatestBackup() : undefined
  const recoveredConnectionState = parsed.values['recover-connection-state']
    ? await connectionRepository.recoverLatestBackup()
    : undefined
  const inventory = await repository.diagnose()
  const connectionState = await connectionRepository.diagnose()
  const onboardingJournal = context.onboardingJournalRepository == null
    ? { status: 'fail' as const, summary: 'The onboarding journal adapter is unavailable.' }
    : await context.onboardingJournalRepository.diagnose()
  const runtimeCheck: InventoryDiagnosticCheck = process.versions.node.split('.')[0] !== undefined
    && Number(process.versions.node.split('.')[0]) >= 22
    ? { id: 'node-runtime', status: 'pass', summary: `Node.js ${process.versions.node} satisfies the supported runtime.` }
    : { id: 'node-runtime', status: 'fail', summary: `Node.js ${process.versions.node} is unsupported.`, nextAction: 'Install Node.js 22 or newer.' }
  const inventoryReadable = inventory.checks.find((check) => check.id === 'inventory-file')?.status === 'pass'
  const connectionStateReadable = connectionState.checks.find((check) => check.id === 'connection-state-file')?.status === 'pass'
  const nodes = inventoryReadable ? await repository.list() : []
  const persistedConnectionState = connectionStateReadable ? await connectionRepository.read() : null
  const connections = persistedConnectionState?.connections ?? []
  const connectionIds = new Set(connections.map((connection) => connection.id))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const missingReferences = nodes
    .map((node) => node.declared.location.connectionRef)
    .filter((reference): reference is string => reference?.startsWith('connection:') === true)
    .filter((reference) => !connectionIds.has(reference.slice('connection:'.length)))
  const referenceCheck: InventoryDiagnosticCheck = !inventoryReadable || persistedConnectionState === null
    ? { id: 'connection-reference-integrity', status: 'warning', summary: 'Connection references were not cross-checked because active local state is not safely readable.', nextAction: 'Repair or recover local state, then run doctor again.' }
    : missingReferences.length === 0
      ? { id: 'connection-reference-integrity', status: 'pass', summary: 'All inventory connection references resolve to configured records.' }
    : { id: 'connection-reference-integrity', status: 'fail', summary: `${missingReferences.length} inventory connection reference${missingReferences.length === 1 ? '' : 's'} do not resolve.`, nextAction: 'Restore the missing opaque connection record or update the affected inventory metadata.' }
  const missingDiscoverySources = (persistedConnectionState?.discoveries ?? [])
    .filter((discovery) => discovery.kind === 'peers' && !nodeIds.has(discovery.source.nodeId))
  const discoverySourceCheck: InventoryDiagnosticCheck = !inventoryReadable || persistedConnectionState === null
    ? { id: 'discovery-source-integrity', status: 'warning', summary: 'Peer discovery sources were not cross-checked because active local state is not safely readable.', nextAction: 'Repair or recover local state, then run doctor again.' }
    : missingDiscoverySources.length === 0
      ? { id: 'discovery-source-integrity', status: 'pass', summary: 'All persisted peer evidence resolves to an inventory source node.' }
    : { id: 'discovery-source-integrity', status: 'fail', summary: `${missingDiscoverySources.length} peer discovery source${missingDiscoverySources.length === 1 ? '' : 's'} no longer resolve to inventory nodes.`, nextAction: 'Dismiss orphaned peer evidence or restore the source inventory metadata.' }
  const orphanedProfiles = (persistedConnectionState?.accessProfiles ?? []).filter((profile) => !nodeIds.has(profile.nodeId))
  const accessProfileCheck: InventoryDiagnosticCheck = !inventoryReadable || persistedConnectionState === null
    ? { id: 'onboarding-access-profiles', status: 'warning', summary: 'Onboarding access profiles were not cross-checked because active local state is not safely readable.', nextAction: 'Repair or recover local state, then run doctor again.' }
    : orphanedProfiles.length === 0
      ? { id: 'onboarding-access-profiles', status: 'pass', summary: 'All onboarding access profiles resolve to inventory nodes and private connection records.' }
      : { id: 'onboarding-access-profiles', status: 'fail', summary: `${orphanedProfiles.length} onboarding access profile${orphanedProfiles.length === 1 ? '' : 's'} no longer resolves to an inventory node.`, nextAction: 'Restore the node or remove the orphaned private access profile.' }
  const journalCheck: InventoryDiagnosticCheck = {
    id: 'onboarding-journal',
    status: onboardingJournal.status,
    summary: onboardingJournal.summary,
    ...(onboardingJournal.nextAction === undefined ? {} : { nextAction: onboardingJournal.nextAction })
  }
  const agentConnections = connections.filter((connection) => connection.kind === 'agent')
  const secretStoreAvailable = agentConnections.length === 0 ? true : await context.secretStore.available()
  const missingCredentials = secretStoreAvailable
    ? (await Promise.all(agentConnections.map(async (connection) => await context.secretStore.get(connection.credentialRef) === null))).filter(Boolean).length
    : agentConnections.length
  const secretReferenceCheck: InventoryDiagnosticCheck = agentConnections.length === 0
    ? { id: 'onboarding-secret-references', status: 'pass', summary: 'No paired-agent credential references require a local secret-store check.' }
    : !secretStoreAvailable
      ? { id: 'onboarding-secret-references', status: 'fail', summary: 'The operating-system secret store is unavailable for paired-agent references.', nextAction: 'Unlock or configure the local secret store, then run doctor again.' }
      : missingCredentials === 0
        ? { id: 'onboarding-secret-references', status: 'pass', summary: 'All paired-agent credential references resolve in the operating-system secret store.' }
        : { id: 'onboarding-secret-references', status: 'fail', summary: `${missingCredentials} paired-agent credential reference${missingCredentials === 1 ? '' : 's'} cannot be resolved.`, nextAction: 'Re-pair the affected read-only agent or remove its stale private access binding.' }
  const aliasChecks = await Promise.all(connections.filter((connection) => connection.kind === 'ssh').map(async (connection): Promise<InventoryDiagnosticCheck> =>
    await context.aliasResolver.hasExactAlias(connection.hostAlias)
      ? { id: `connection-alias:${connection.id}`, status: 'pass', summary: 'The connection resolves to an exact private SSH-config alias.' }
      : { id: `connection-alias:${connection.id}`, status: 'fail', summary: 'The connection no longer resolves to an exact private SSH-config alias.', nextAction: 'Restore the private alias or remove the stale connection reference.' }
  ))
  const remoteChecks = parsed.values['check-connections']
    ? persistedConnectionState === null
      ? [{ id: 'remote-connection-probes', status: 'fail' as const, summary: 'Remote probes were not run because connection state is not safely readable.', nextAction: 'Repair or recover connection state before retrying explicit remote checks.' }]
      : await runRemoteChecks(context, connections.map((connection) => connection.id))
    : [{ id: 'remote-connection-probes', status: 'pass' as const, summary: 'Remote hosts were not contacted; use --check-connections for explicit bounded probes.' }]
  const checks = [runtimeCheck, ...inventory.checks, ...connectionState.checks, referenceCheck, discoverySourceCheck, accessProfileCheck, journalCheck, secretReferenceCheck, ...aliasChecks, ...remoteChecks]
  const healthy = checks.every((check) => check.status !== 'fail')
  const data = {
    healthy,
    recovered: recovered === undefined ? null : { revision: recovered.revision, nodes: recovered.nodes.length },
    recoveredConnectionState: recoveredConnectionState === undefined
      ? null
      : { revision: recoveredConnectionState.revision, connections: recoveredConnectionState.connections.length, discoveries: recoveredConnectionState.discoveries.length },
    remoteHostsContacted: parsed.values['check-connections'] && connections.length > 0,
    checks
  }
  if (output === 'json') {
    return { exitCode: healthy ? EXIT_CODES.success : EXIT_CODES.configuration, stdout: successEnvelope('doctor', data) }
  }
  const lines = [
    `Inventory doctor: ${healthy ? 'healthy' : 'attention required'}`,
    ...(recovered === undefined ? [] : [`Recovered inventory backup as revision ${recovered.revision}.`]),
    ...(recoveredConnectionState === undefined ? [] : [`Recovered connection-state backup as revision ${recoveredConnectionState.revision}.`]),
    '',
    ...checks.flatMap((check) => [
      `${statusMark(check.status)} ${check.id}: ${check.summary}`,
      ...(check.nextAction === undefined ? [] : [`    Next action: ${check.nextAction}`])
    ])
  ]
  return { exitCode: healthy ? EXIT_CODES.success : EXIT_CODES.configuration, stdout: lines.join('\n') }
}

async function runRemoteChecks(context: ApplicationContext, connectionIds: readonly string[]): Promise<readonly InventoryDiagnosticCheck[]> {
  const repository = context.connectionStateRepository
  if (repository === null) return []
  const checks: InventoryDiagnosticCheck[] = []
  for (const connectionId of connectionIds) {
    const initial = (await repository.read()).connections.find((candidate) => candidate.id === connectionId)
    if (initial === undefined) continue
    if (initial.kind !== 'ssh') {
      try {
        const kind = initial.kind === 'public-rpc'
          ? 'node.multiservice.chain-id' as const
          : initial.runtimeFlavor === 'teleno-monolith'
            ? 'node.teleno.status' as const
            : 'node.multiservice.chain-id' as const
        const transport = initial.kind === 'public-rpc' ? context.publicRpcTransport : context.agentProbeTransport
        const result = await transport.execute({ connection: initial, kind, timeoutMs: 10_000 })
        checks.push(result.outcome === 'success'
          ? { id: `remote-connection:${connectionId}`, status: 'pass', summary: 'The explicit bounded read-only connection probe succeeded.' }
          : { id: `remote-connection:${connectionId}`, status: 'fail', summary: `The explicit bounded read-only connection probe returned ${result.outcome}.`, nextAction: 'Review the private connection and its read-only capability without exposing coordinates.' })
      } catch {
        checks.push({ id: `remote-connection:${connectionId}`, status: 'fail', summary: 'The explicit bounded read-only connection probe failed safely.', nextAction: 'Review the private connection, credential, endpoint policy, and compatibility.' })
      }
      continue
    }
    try {
      await testConnection({ repository, aliasResolver: context.aliasResolver, probeTransport: context.probeTransport }, connectionId, 10_000)
    } catch (error: unknown) {
      if (!(error instanceof ApplicationError)) throw error
    }
    const connection = (await repository.read()).connections.find((candidate) => candidate.id === connectionId)
    const outcome = connection?.lastTest?.outcome
    checks.push(outcome === 'success'
      ? { id: `remote-connection:${connectionId}`, status: 'pass', summary: 'The explicit bounded read-only connection probe succeeded.' }
      : { id: `remote-connection:${connectionId}`, status: 'fail', summary: `The explicit bounded read-only connection probe returned ${outcome ?? 'no evidence'}.`, nextAction: 'Inspect private SSH configuration and retry the explicit connection test.' })
  }
  if (checks.length === 0) checks.push({ id: 'remote-connection-probes', status: 'pass', summary: 'No configured connections required a remote probe.' })
  return checks
}

function statusMark(status: InventoryDiagnosticCheck['status']): string {
  if (status === 'pass') return '[PASS]'
  if (status === 'warning') return '[WARN]'
  return '[FAIL]'
}
