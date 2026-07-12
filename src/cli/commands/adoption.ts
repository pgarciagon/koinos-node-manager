import { parseArgs } from 'node:util'
import { applyAdoption, listAdoptionReviews, planAdoption } from '../../core/adoption.js'
import { sanitizeNodeForDisplay } from '../../core/sanitize-node.js'
import type { AdoptionReview } from '../../domain/connection.js'
import type { ApplicationContext } from '../application-context.js'
import { CliInputError } from '../cli-input-error.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'
import { requireState } from './connections.js'
import { runDiscoverHost } from './discovery.js'

export async function runAdoptionInspect(args: readonly string[], context: ApplicationContext): Promise<string> {
  return runDiscoverHost(args, context, 'nodes.adoption.inspect')
}

export async function runAdoptionPlan(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      discovery: { type: 'string' }, connection: { type: 'string' }, id: { type: 'string' }, name: { type: 'string' }, output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  if (context.inventoryRepository === null) throw new CliInputError('Adoption planning requires the local persisted inventory.')
  if (parsed.values.id === undefined || parsed.values.name === undefined) throw new CliInputError('The --id and --name options are required.')
  const result = await planAdoption({ connectionRepository: requireState(context), inventoryRepository: context.inventoryRepository }, {
    ...(parsed.values.discovery === undefined ? {} : { discoveryId: parsed.values.discovery }),
    ...(parsed.values.connection === undefined ? {} : { connectionId: parsed.values.connection }),
    nodeId: parsed.values.id,
    displayName: parsed.values.name
  })
  const output = parseOutputFormat(parsed.values.output)
  return output === 'json'
    ? successEnvelope('nodes.adoption.plan', { connectionStateRevision: result.connectionStateRevision, review: sanitizeReview(result.review), remoteMutation: false })
    : formatReview(result.review)
}

export async function runAdoptionApply(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({ args, options: { confirm: { type: 'string' }, output: { type: 'string', default: 'table' } }, allowPositionals: true, strict: true })
  if (parsed.positionals.length !== 1 || parsed.values.confirm === undefined) throw new CliInputError('Usage: knm nodes adoption apply <review-id> --confirm <digest> [--output table|json]')
  if (context.inventoryRepository === null) throw new CliInputError('Adoption application requires the local persisted inventory.')
  const result = await applyAdoption({ connectionRepository: requireState(context), inventoryRepository: context.inventoryRepository }, parsed.positionals[0] as string, parsed.values.confirm)
  const output = parseOutputFormat(parsed.values.output)
  return output === 'json'
    ? successEnvelope('nodes.adoption.apply', { inventoryRevision: result.inventoryRevision, connectionStateRevision: result.connectionStateRevision, reconciled: result.reconciled, review: sanitizeReview(result.review), inventoryOnly: true, runtimeChanged: false })
    : [`Applied adoption review ${result.review.id}.`, `Node: ${result.review.node.id}`, `Disposition: ${result.review.disposition}`, `Inventory revision: ${result.inventoryRevision}`, `Connection-state revision: ${result.connectionStateRevision}`, `Reconciled: ${result.reconciled ? 'yes' : 'no'}`, 'Only local inventory metadata changed; the inspected runtime was not contacted or modified.'].join('\n')
}

export async function runAdoptionList(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({ args, options: { output: { type: 'string', default: 'table' } }, allowPositionals: false, strict: true })
  const reviews = await listAdoptionReviews(requireState(context))
  if (parseOutputFormat(parsed.values.output) === 'json') return successEnvelope('nodes.adoption.list', { total: reviews.length, reviews: reviews.map(sanitizeReview) })
  if (reviews.length === 0) return 'No adoption reviews are stored.'
  return reviews.map((review) => `${review.id}  ${review.disposition.padEnd(17)}  ${review.application === null ? 'pending' : 'applied'}  ${review.node.id}`).join('\n')
}

function sanitizeReview(review: AdoptionReview): AdoptionReview {
  return { ...structuredClone(review), node: sanitizeNodeForDisplay(review.node) }
}

function formatReview(review: AdoptionReview): string {
  return [
    `Adoption review ${review.id}`,
    `  Digest:                    ${review.digest}`,
    `  Discovery:                 ${review.discoveryId}`,
    `  Node:                      ${review.node.displayName} (${review.node.id})`,
    `  Disposition:               ${review.disposition}`,
    `  Inventory revision:        ${review.inventoryRevision}`,
    `  Connection-state revision: ${review.connectionStateRevision}`,
    `  Expires:                   ${review.expiresAt}`,
    '',
    `Apply only after review: knm nodes adoption apply ${review.id} --confirm ${review.digest}`,
    'Applying changes only local inventory metadata and never contacts or mutates the runtime.'
  ].join('\n')
}
