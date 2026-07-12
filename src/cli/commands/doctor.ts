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
  const aliasChecks = await Promise.all(connections.map(async (connection): Promise<InventoryDiagnosticCheck> =>
    await context.aliasResolver.hasExactAlias(connection.hostAlias)
      ? { id: `connection-alias:${connection.id}`, status: 'pass', summary: 'The connection resolves to an exact private SSH-config alias.' }
      : { id: `connection-alias:${connection.id}`, status: 'fail', summary: 'The connection no longer resolves to an exact private SSH-config alias.', nextAction: 'Restore the private alias or remove the stale connection reference.' }
  ))
  const remoteChecks = parsed.values['check-connections']
    ? persistedConnectionState === null
      ? [{ id: 'remote-connection-probes', status: 'fail' as const, summary: 'Remote probes were not run because connection state is not safely readable.', nextAction: 'Repair or recover connection state before retrying explicit remote checks.' }]
      : await runRemoteChecks(context, connections.map((connection) => connection.id))
    : [{ id: 'remote-connection-probes', status: 'pass' as const, summary: 'Remote hosts were not contacted; use --check-connections for explicit bounded probes.' }]
  const checks = [runtimeCheck, ...inventory.checks, ...connectionState.checks, referenceCheck, discoverySourceCheck, ...aliasChecks, ...remoteChecks]
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
