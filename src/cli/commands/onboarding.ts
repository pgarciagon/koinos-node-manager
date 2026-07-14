import { parseArgs } from 'node:util'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import { applyOnboarding, cancelOnboarding, getOnboardingStatus, pairFull, previewFull, previewQuick, reconcileOnboarding, revokeFull } from '../../core/onboarding.js'
import { sanitizeOnboardingReview } from '../../core/sanitize-onboarding.js'
import type { PublicOnboardingReview } from '../../domain/onboarding.js'
import type { ApplicationContext } from '../application-context.js'
import type { CommandRuntime } from '../command-registry.js'
import { CliInputError } from '../cli-input-error.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runOnboardingQuickPreview(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      id: { type: 'string' }, name: { type: 'string' }, 'rpc-endpoint-stdin': { type: 'boolean', default: false },
      'allow-private': { type: 'boolean', default: false }, 'allow-loopback-http': { type: 'boolean', default: false },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  if (!parsed.values['rpc-endpoint-stdin']) throw new CliInputError('Use --rpc-endpoint-stdin so private endpoint data cannot enter process arguments or history.')
  const context = runtime.applicationContext()
  const review = await previewQuick(quickServices(context), {
    nodeId: required('--id', parsed.values.id),
    ...(parsed.values.name === undefined ? {} : { displayName: parsed.values.name }),
    endpoint: runtime.takePrivateInput('RPC endpoint'),
    allowPrivate: parsed.values['allow-private'],
    allowLoopbackHttp: parsed.values['allow-loopback-http']
  })
  return renderReview('onboarding.quick.preview', review, parseOutputFormat(parsed.values.output))
}

export async function runOnboardingQuickApply(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { confirm: { type: 'string' }, output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding quick apply <review-id> --confirm <digest> [--output table|json]')
  const context = runtime.applicationContext()
  const result = await applyOnboarding(commitServices(context), parsed.positionals[0] as string, required('--confirm', parsed.values.confirm))
  const review = sanitizeOnboardingReview(result.review, true)
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('onboarding.quick.apply', { review, connectionRevision: result.connectionRevision, inventoryRevision: result.inventoryRevision, reconciled: result.reconciled })
  return [
    `Quick Connect committed for node ${review.node.id}.`,
    `Access: ${review.access.authority} (${review.access.mode})`,
    `Connection-state revision: ${result.connectionRevision}`,
    `Inventory revision: ${result.inventoryRevision}`,
    'The endpoint remains private and the node runtime was not mutated.'
  ].join('\n')
}

export async function runOnboardingFullPreview(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      id: { type: 'string' }, name: { type: 'string' }, 'agent-endpoint-stdin': { type: 'boolean', default: false },
      'pairing-session': { type: 'string' }, 'identity-digest': { type: 'string' },
      'allow-private': { type: 'boolean', default: false }, 'allow-loopback-http': { type: 'boolean', default: false },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  if (!parsed.values['agent-endpoint-stdin']) throw new CliInputError('Use --agent-endpoint-stdin so the private agent endpoint cannot enter process arguments or history.')
  const review = await previewFull(fullServices(runtime.applicationContext()), {
    nodeId: required('--id', parsed.values.id),
    ...(parsed.values.name === undefined ? {} : { displayName: parsed.values.name }),
    endpoint: runtime.takePrivateInput('agent endpoint'),
    pairingSessionRef: required('--pairing-session', parsed.values['pairing-session']),
    expectedIdentityDigest: required('--identity-digest', parsed.values['identity-digest']),
    allowPrivate: parsed.values['allow-private'],
    allowLoopbackHttp: parsed.values['allow-loopback-http']
  })
  return renderReview('onboarding.full.preview', review, parseOutputFormat(parsed.values.output))
}

export async function runOnboardingFullPair(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { 'pairing-secret-stdin': { type: 'boolean', default: false }, output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding full pair <review-id> --pairing-secret-stdin [--output table|json]')
  if (!parsed.values['pairing-secret-stdin']) throw new CliInputError('Use --pairing-secret-stdin so the single-use pairing secret cannot enter process arguments or history.')
  const review = await pairFull(fullServices(runtime.applicationContext()), parsed.positionals[0] as string, runtime.takePrivateInput('pairing secret'))
  return renderReview('onboarding.full.pair', review, parseOutputFormat(parsed.values.output))
}

export async function runOnboardingFullApply(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { confirm: { type: 'string' }, output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding full apply <review-id> --confirm <digest> [--output table|json]')
  const result = await applyOnboarding(commitServices(runtime.applicationContext()), parsed.positionals[0] as string, required('--confirm', parsed.values.confirm))
  const review = sanitizeOnboardingReview(result.review, true)
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('onboarding.full.apply', { review, connectionRevision: result.connectionRevision, inventoryRevision: result.inventoryRevision, reconciled: result.reconciled })
  return [
    `${review.node.existing ? 'Upgraded' : 'Added'} node ${review.node.id} with Full Connect.`,
    `Access: ${review.access.authority} (${review.access.mode})`,
    `Connection-state revision: ${result.connectionRevision}`,
    `Inventory revision: ${result.inventoryRevision}`,
    'The credential remains in the operating-system secret store and the node runtime was not mutated.'
  ].join('\n')
}

export async function runOnboardingFullRevoke(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { confirm: { type: 'string' }, output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding full revoke <node-id> --confirm <node-id> [--output table|json]')
  const nodeId = parsed.positionals[0] as string
  if (parsed.values.confirm !== nodeId) throw new CliInputError('Full credential revocation confirmation must match the exact node ID.')
  const result = await revokeFull(fullServices(runtime.applicationContext()), nodeId)
  if (parseOutputFormat(parsed.values.output) === 'json') return successEnvelope('onboarding.full.revoke', result)
  return [`Revoked Full Connect inspection access for node ${result.nodeId}.`, `Connection-state revision: ${result.connectionRevision}`, 'The node runtime was not changed; Quick or Expert access remains available when configured.'].join('\n')
}

export async function runOnboardingStatus(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding status <review-id> [--output table|json]')
  const context = runtime.applicationContext()
  const review = await getOnboardingStatus(requireConnection(context), requireInventory(context), parsed.positionals[0] as string)
  return renderReview('onboarding.status', review, parseOutputFormat(parsed.values.output))
}

export async function runOnboardingCancel(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm onboarding cancel <review-id> [--output table|json]')
  const review = await cancelOnboarding(requireConnection(runtime.applicationContext()), parsed.positionals[0] as string)
  return renderReview('onboarding.cancel', review, parseOutputFormat(parsed.values.output))
}

export async function runOnboardingReconcile(args: readonly string[], runtime: CommandRuntime): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: false, strict: true })
  const result = await reconcileOnboarding(commitServices(runtime.applicationContext()))
  const review = sanitizeOnboardingReview(result.review, true)
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('onboarding.reconcile', { review, connectionRevision: result.connectionRevision, inventoryRevision: result.inventoryRevision, reconciled: true })
  return [`Reconciled onboarding review ${review.id}.`, `Node: ${review.node.id}`, `Status: ${review.status}`, 'The exact reviewed metadata is active and the private journal was cleared.'].join('\n')
}

function renderReview(command: string, review: PublicOnboardingReview, output: 'table' | 'json'): string {
  if (output === 'json') return successEnvelope(command, { review })
  return [
    `Onboarding review ${review.id}`,
    `  Mode:        ${review.mode}`,
    `  Status:      ${review.status}`,
    `  Node:        ${review.node.id} (${review.node.displayName})`,
    `  Connection:  ${review.connectionKind} (private coordinates hidden)`,
    `  Authority:   ${review.access.authority}`,
    `  Capabilities: ${capabilities(review)}`,
    `  Expires:     ${review.expiresAt}`,
    `  Digest:      ${review.digest}`,
    review.access.warnings.length === 0 ? '  Warnings:    none' : `  Warnings:    ${review.access.warnings.join(', ')}`,
    'Read-only: yes. No runtime, producer, wallet, or chain state was changed.'
  ].join('\n')
}

function capabilities(review: PublicOnboardingReview): string {
  return Object.entries(review.access.capabilities).filter(([, available]) => available).map(([name]) => name).join(', ') || 'none'
}

function quickServices(context: ApplicationContext) {
  return {
    connectionRepository: requireConnection(context),
    inventoryRepository: requireInventory(context),
    journalRepository: requireJournal(context),
    transport: context.publicRpcTransport,
    adapter: context.publicRpcAdapter
  }
}

function fullServices(context: ApplicationContext) {
  return {
    ...quickServices(context),
    agentClient: context.agentClient,
    agentTransport: context.agentProbeTransport,
    secretStore: context.secretStore,
    inspectionAdapters: context.inspectionAdapters
  }
}

function commitServices(context: ApplicationContext) {
  return { connectionRepository: requireConnection(context), inventoryRepository: requireInventory(context), journalRepository: requireJournal(context) }
}

function requireConnection(context: ApplicationContext) {
  if (context.connectionStateRepository !== null) return context.connectionStateRepository
  throw localRequired()
}

function requireInventory(context: ApplicationContext) {
  if (context.inventoryRepository !== null) return context.inventoryRepository
  throw localRequired()
}

function requireJournal(context: ApplicationContext) {
  if (context.onboardingJournalRepository !== null) return context.onboardingJournalRepository
  throw localRequired()
}

function localRequired(): ApplicationError {
  return new ApplicationError({ code: 'LOCAL_ONBOARDING_STATE_REQUIRED', exitCode: EXIT_CODES.safetyBlocked, severity: 'unsafe', retryable: false, message: 'Onboarding is unavailable in simulation mode.', nextAction: 'Run the command without --simulation to use private local state.' })
}

function required(name: string, value: string | undefined): string {
  if (value !== undefined && value.length > 0) return value
  throw new CliInputError(`The ${name} option is required.`)
}
