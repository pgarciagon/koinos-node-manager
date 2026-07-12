import { parseArgs } from 'node:util'
import { getNode } from '../../core/get-node.js'
import { addInventoryNode, removeInventoryNode, updateInventoryNode, type UpdateNodeInput } from '../../core/node-inventory.js'
import { listNodes, type ListNodesQuery } from '../../core/list-nodes.js'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import { sanitizeNodeForDisplay } from '../../core/sanitize-node.js'
import {
  AUTHORITY_LEVELS,
  LOCATION_KINDS,
  MANAGEMENT_CLASSES,
  NETWORKS,
  NODE_ENVIRONMENTS,
  NODE_FLAVORS,
  NODE_FUNCTIONS,
  NODE_HEALTH_STATES,
  NODE_ORIGINS,
  OBSERVATION_FRESHNESS_STATES
} from '../../domain/node.js'
import type { ApplicationContext } from '../application-context.js'
import { CliInputError } from '../cli-input-error.js'
import { successEnvelope } from '../envelope.js'
import {
  NODE_DETAIL_SECTIONS,
  formatNodeDetail,
  formatNodeJson,
  formatNodesJson,
  formatNodesTable,
  parseOutputFormat
} from '../output.js'

function oneOf<T extends string>(name: string, value: string | undefined, values: readonly T[]): T | undefined {
  if (value === undefined) return undefined
  if ((values as readonly string[]).includes(value)) return value as T
  throw new CliInputError(`Invalid --${name} value. Expected one of: ${values.join(', ')}.`)
}

export async function runNodesList(
  args: readonly string[],
  context: ApplicationContext,
  terminalWidth?: number
): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      management: { type: 'string' },
      origin: { type: 'string' },
      flavor: { type: 'string' },
      network: { type: 'string' },
      location: { type: 'string' },
      authority: { type: 'string' },
      function: { type: 'string' },
      health: { type: 'string' },
      staleness: { type: 'string' },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  const query: ListNodesQuery = {}
  const management = oneOf('management', parsed.values.management, MANAGEMENT_CLASSES)
  const origin = oneOf('origin', parsed.values.origin, NODE_ORIGINS)
  const flavor = oneOf('flavor', parsed.values.flavor, NODE_FLAVORS)
  const network = oneOf('network', parsed.values.network, NETWORKS)
  const location = oneOf('location', parsed.values.location, LOCATION_KINDS)
  const authority = oneOf('authority', parsed.values.authority, AUTHORITY_LEVELS)
  const nodeFunction = oneOf('function', parsed.values.function, NODE_FUNCTIONS)
  const health = oneOf('health', parsed.values.health, NODE_HEALTH_STATES)
  const staleness = oneOf('staleness', parsed.values.staleness, OBSERVATION_FRESHNESS_STATES)
  if (management !== undefined) query.management = management
  if (origin !== undefined) query.origin = origin
  if (flavor !== undefined) query.flavor = flavor
  if (network !== undefined) query.network = network
  if (location !== undefined) query.location = location
  if (authority !== undefined) query.authority = authority
  if (nodeFunction !== undefined) query.function = nodeFunction
  if (health !== undefined) query.health = health
  if (staleness !== undefined) query.staleness = staleness
  const output = parseOutputFormat(parsed.values.output)
  const result = await listNodes(context.nodeRepository, query)
  return output === 'json' ? formatNodesJson(result, query) : formatNodesTable(result, terminalWidth)
}

export async function runNodesShow(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      section: { type: 'string', default: 'all' },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm nodes show <node-id> [--section <name>] [--output table|json]')
  const nodeId = parsed.positionals[0]
  if (nodeId === undefined) throw new CliInputError('A node ID is required.')
  const output = parseOutputFormat(parsed.values.output)
  const section = oneOf('section', parsed.values.section, NODE_DETAIL_SECTIONS) ?? 'all'
  const node = await getNode(context.nodeRepository, nodeId)
  return output === 'json' ? formatNodeJson(node, section) : formatNodeDetail(node, section)
}

export async function runNodesAdd(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      id: { type: 'string' },
      name: { type: 'string' },
      management: { type: 'string', default: 'connected' },
      origin: { type: 'string', default: 'imported' },
      flavor: { type: 'string', default: 'unknown' },
      network: { type: 'string', default: 'unknown' },
      location: { type: 'string', default: 'unknown' },
      environment: { type: 'string', default: 'unknown' },
      authority: { type: 'string', default: 'observe' },
      'connection-ref': { type: 'string' },
      function: { type: 'string', multiple: true },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  const id = requiredOption('--id', parsed.values.id)
  const displayName = requiredOption('--name', parsed.values.name)
  const output = parseOutputFormat(parsed.values.output)
  const result = await addInventoryNode(requireInventoryRepository(context), {
    id,
    displayName,
    management: oneOf('management', parsed.values.management, MANAGEMENT_CLASSES) ?? 'connected',
    origin: oneOf('origin', parsed.values.origin, NODE_ORIGINS) ?? 'imported',
    flavor: oneOf('flavor', parsed.values.flavor, NODE_FLAVORS) ?? 'unknown',
    network: oneOf('network', parsed.values.network, NETWORKS) ?? 'unknown',
    location: oneOf('location', parsed.values.location, LOCATION_KINDS) ?? 'unknown',
    environment: oneOf('environment', parsed.values.environment, NODE_ENVIRONMENTS) ?? 'unknown',
    authorityLevel: oneOf('authority', parsed.values.authority, AUTHORITY_LEVELS) ?? 'observe',
    ...(parsed.values['connection-ref'] === undefined ? {} : { connectionRef: parsed.values['connection-ref'] }),
    functions: repeatedOneOf('function', parsed.values.function, NODE_FUNCTIONS)
  })
  if (output === 'json') {
    return successEnvelope('nodes.add', {
      revision: result.revision,
      node: sanitizeNodeForDisplay(result.node),
      managedNodeMutation: false
    })
  }
  return [
    `Added inventory record ${result.node.displayName} (${result.node.id}).`,
    `Inventory revision: ${result.revision}`,
    'No node was contacted, started, stopped, installed, or configured.'
  ].join('\n')
}

export async function runNodesUpdate(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      management: { type: 'string' },
      origin: { type: 'string' },
      flavor: { type: 'string' },
      network: { type: 'string' },
      location: { type: 'string' },
      environment: { type: 'string' },
      authority: { type: 'string' },
      'connection-ref': { type: 'string' },
      'clear-connection-ref': { type: 'boolean', default: false },
      function: { type: 'string', multiple: true },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm nodes update <node-id> [metadata options]')
  const nodeId = parsed.positionals[0]
  if (nodeId === undefined) throw new CliInputError('A node ID is required.')
  if (parsed.values['clear-connection-ref'] && parsed.values['connection-ref'] !== undefined) {
    throw new CliInputError('Use either --connection-ref or --clear-connection-ref, not both.')
  }
  const input: UpdateNodeInput = {}
  if (parsed.values.name !== undefined) input.displayName = parsed.values.name
  const management = oneOf('management', parsed.values.management, MANAGEMENT_CLASSES)
  const origin = oneOf('origin', parsed.values.origin, NODE_ORIGINS)
  const flavor = oneOf('flavor', parsed.values.flavor, NODE_FLAVORS)
  const network = oneOf('network', parsed.values.network, NETWORKS)
  const location = oneOf('location', parsed.values.location, LOCATION_KINDS)
  const environment = oneOf('environment', parsed.values.environment, NODE_ENVIRONMENTS)
  const authority = oneOf('authority', parsed.values.authority, AUTHORITY_LEVELS)
  if (management !== undefined) input.management = management
  if (origin !== undefined) input.origin = origin
  if (flavor !== undefined) input.flavor = flavor
  if (network !== undefined) input.network = network
  if (location !== undefined) input.location = location
  if (environment !== undefined) input.environment = environment
  if (authority !== undefined) input.authorityLevel = authority
  if (parsed.values['clear-connection-ref']) input.connectionRef = null
  else if (parsed.values['connection-ref'] !== undefined) input.connectionRef = parsed.values['connection-ref']
  if (parsed.values.function !== undefined) input.functions = repeatedOneOf('function', parsed.values.function, NODE_FUNCTIONS)
  const output = parseOutputFormat(parsed.values.output)
  const result = await updateInventoryNode(requireInventoryRepository(context), nodeId, input)
  if (output === 'json') {
    return successEnvelope('nodes.update', {
      revision: result.revision,
      node: sanitizeNodeForDisplay(result.node),
      managedNodeMutation: false
    })
  }
  return [
    `Updated inventory record ${result.node.displayName} (${result.node.id}).`,
    `Inventory revision: ${result.revision}`,
    'No managed node runtime state was changed.'
  ].join('\n')
}

export async function runNodesRemove(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      confirm: { type: 'string' },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new CliInputError('Usage: knm nodes remove <node-id> --confirm <node-id> [--output table|json]')
  const nodeId = parsed.positionals[0]
  if (nodeId === undefined) throw new CliInputError('A node ID is required.')
  const confirmation = requiredOption('--confirm', parsed.values.confirm)
  const output = parseOutputFormat(parsed.values.output)
  const result = await removeInventoryNode(requireInventoryRepository(context), nodeId, confirmation)
  if (output === 'json') {
    return successEnvelope('nodes.remove', {
      revision: result.revision,
      removedNode: { id: result.node.id, displayName: result.node.displayName },
      inventoryOnly: true,
      runtimeChanged: false,
      dataDeleted: false
    })
  }
  return [
    `Removed inventory record ${result.node.displayName} (${result.node.id}).`,
    `Inventory revision: ${result.revision}`,
    'The node was not stopped, software was not uninstalled, and node data was not deleted.'
  ].join('\n')
}

function requiredOption(name: string, value: string | undefined): string {
  if (value !== undefined) return value
  throw new CliInputError(`The ${name} option is required.`)
}

function repeatedOneOf<T extends string>(name: string, values: readonly string[] | undefined, allowed: readonly T[]): readonly T[] {
  if (values === undefined) return []
  return [...new Set(values.map((value) => {
    const parsed = oneOf(name, value, allowed)
    if (parsed === undefined) throw new CliInputError(`The --${name} option requires a value.`)
    return parsed
  }))]
}

function requireInventoryRepository(context: ApplicationContext) {
  if (context.inventoryRepository !== null) return context.inventoryRepository
  throw new ApplicationError({
    code: 'SIMULATION_INVENTORY_READ_ONLY',
    exitCode: EXIT_CODES.safetyBlocked,
    severity: 'unsafe',
    retryable: false,
    message: 'Simulation inventories are read-only and cannot be persisted.',
    nextAction: 'Run the command without --simulation to change the local inventory.'
  })
}
