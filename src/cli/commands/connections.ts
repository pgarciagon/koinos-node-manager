import { parseArgs } from 'node:util'
import { addSshConnection, getConnection, listConnections, removeConnection, sanitizeConnection, testConnection } from '../../core/connections.js'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import type { ApplicationContext } from '../application-context.js'
import { CliInputError } from '../cli-input-error.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runConnectionsList(args: readonly string[], context: ApplicationContext): Promise<string> {
  const output = parseSimpleOutput(args)
  const connections = await listConnections(requireState(context))
  if (output === 'json') return successEnvelope('connections.list', { total: connections.length, connections: connections.map(sanitizeConnection) })
  if (connections.length === 0) return 'No connection references are configured.'
  return [
    'ID                       KIND        PRIVATE DATA  LAST TEST',
    ...connections.map((connection) => `${connection.id.padEnd(24)} ${connection.kind.padEnd(11)} configured  ${connection.lastTest?.outcome ?? 'never'}`),
    '',
    `${connections.length} connection${connections.length === 1 ? '' : 's'}`
  ].join('\n')
}

export async function runConnectionsShow(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm connections show <connection-id> [--output table|json]')
  const id = parsed.positionals[0] as string
  const connection = sanitizeConnection(await getConnection(requireState(context), id))
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('connections.show', { connection })
  return [
    `Connection ${connection.id}`,
    `  Kind:             ${connection.kind}`,
    '  Private access:   configured (coordinates redacted)',
    `  Created:          ${connection.createdAt}`,
    `  Updated:          ${connection.updatedAt}`,
    `  Last test:        ${connection.lastTest === null ? 'never' : `${connection.lastTest.outcome} at ${connection.lastTest.testedAt} (${connection.lastTest.durationMs} ms)`}`
  ].join('\n')
}

export async function runConnectionsAddSsh(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { id: { type: 'string' }, 'host-alias': { type: 'string' }, output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  const id = required('--id', parsed.values.id)
  const hostAlias = required('--host-alias', parsed.values['host-alias'])
  const result = await addSshConnection(services(context), { id, hostAlias })
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('connections.add.ssh', { revision: result.revision, connection: sanitizeConnection(result.connection) })
  return [
    `Added SSH connection reference ${result.connection.id}.`,
    `Connection-state revision: ${result.revision}`,
    'The SSH alias value is stored privately and is not displayed. No remote host was contacted.'
  ].join('\n')
}

export async function runConnectionsTest(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { 'timeout-ms': { type: 'string', default: '10000' }, output: { type: 'string', default: 'table' } },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm connections test <connection-id> [--timeout-ms <milliseconds>] [--output table|json]')
  const result = await testConnection(services(context), parsed.positionals[0] as string, timeout(parsed.values['timeout-ms']))
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('connections.test', { revision: result.revision, connectionId: result.connection.id, evidence: result.evidence, readOnly: true })
  return [
    `Connection ${result.connection.id}: ${result.evidence.outcome}`,
    `Duration: ${result.evidence.durationMs} ms`,
    'The probe was predefined, bounded, non-mutating, and did not expose resolved connection data.'
  ].join('\n')
}

export async function runConnectionsRemove(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { confirm: { type: 'string' }, output: { type: 'string', default: 'table' } },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm connections remove <connection-id> --confirm <connection-id> [--output table|json]')
  const id = parsed.positionals[0] as string
  const result = await removeConnection(requireState(context), context.nodeRepository, id, required('--confirm', parsed.values.confirm))
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('connections.remove', { revision: result.revision, removedConnection: { id: result.connection.id, kind: result.connection.kind }, metadataOnly: true })
  return [`Removed connection reference ${result.connection.id}.`, `Connection-state revision: ${result.revision}`, 'No remote host or SSH configuration was changed.'].join('\n')
}

export function requireState(context: ApplicationContext) {
  if (context.connectionStateRepository !== null) return context.connectionStateRepository
  throw new ApplicationError({
    code: 'LOCAL_CONNECTION_STATE_REQUIRED',
    exitCode: EXIT_CODES.safetyBlocked,
    severity: 'unsafe',
    retryable: false,
    message: 'Connection and discovery state is unavailable in simulation mode.',
    nextAction: 'Run the command without --simulation to use private local metadata.'
  })
}

export function services(context: ApplicationContext) {
  return { repository: requireState(context), aliasResolver: context.aliasResolver, probeTransport: context.probeTransport }
}

function parseSimpleOutput(args: readonly string[]) {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: false, strict: true })
  return parseOutputFormat(parsed.values.output)
}

function required(name: string, value: string | undefined): string {
  if (value !== undefined) return value
  throw new CliInputError(`The ${name} option is required.`)
}

export function timeout(value: string | undefined): number {
  const parsed = Number(value)
  if (Number.isSafeInteger(parsed) && parsed >= 1000 && parsed <= 30000) return parsed
  throw new CliInputError('Timeout must be an integer between 1000 and 30000 milliseconds.')
}
