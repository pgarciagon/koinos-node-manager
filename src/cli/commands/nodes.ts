import { parseArgs } from 'node:util'
import { getNode } from '../../core/get-node.js'
import { listNodes, type ListNodesQuery } from '../../core/list-nodes.js'
import {
  NODE_FUNCTIONS,
  type ManagementClass,
  type NetworkName,
  type NodeHealth
} from '../../domain/node.js'
import type { ApplicationContext } from '../application-context.js'
import { formatNodeDetail, formatNodeJson, formatNodesJson, formatNodesTable, type OutputFormat } from '../output.js'

const managementClasses: readonly ManagementClass[] = ['managed', 'connected', 'external', 'discovered']
const networks: readonly NetworkName[] = ['mainnet', 'testnet', 'custom', 'unknown']
const healthStates: readonly NodeHealth[] = ['healthy', 'degraded', 'unreachable', 'unknown']

function oneOf<T extends string>(name: string, value: string | undefined, values: readonly T[]): T | undefined {
  if (value === undefined) return undefined
  if ((values as readonly string[]).includes(value)) return value as T
  throw new Error(`Invalid --${name} value "${value}". Expected one of: ${values.join(', ')}.`)
}

export async function runNodesCommand(
  command: string | undefined,
  args: readonly string[],
  context: ApplicationContext
): Promise<string> {
  if (command === 'list') return runList(args, context)
  if (command === 'show') return runShow(args, context)
  throw new Error(`Unknown nodes command "${command ?? ''}". Run "knm nodes --help" for usage.`)
}

async function runList(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: {
      management: { type: 'string' },
      network: { type: 'string' },
      function: { type: 'string' },
      health: { type: 'string' },
      output: { type: 'string', default: 'table' }
    },
    allowPositionals: false,
    strict: true
  })
  const query: ListNodesQuery = {}
  const management = oneOf('management', parsed.values.management, managementClasses)
  const network = oneOf('network', parsed.values.network, networks)
  const nodeFunction = oneOf('function', parsed.values.function, NODE_FUNCTIONS)
  const health = oneOf('health', parsed.values.health, healthStates)
  if (management !== undefined) query.management = management
  if (network !== undefined) query.network = network
  if (nodeFunction !== undefined) query.function = nodeFunction
  if (health !== undefined) query.health = health
  const output = oneOf('output', parsed.values.output, ['table', 'json'] as const) as OutputFormat
  const result = await listNodes(context.nodeRepository, query)
  return output === 'json' ? formatNodesJson(result, query) : formatNodesTable(result)
}

async function runShow(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { output: { type: 'string', default: 'table' } },
    allowPositionals: true,
    strict: true
  })
  if (parsed.positionals.length !== 1) throw new Error('Usage: knm nodes show <node-id> [--output table|json]')
  const nodeId = parsed.positionals[0]
  if (nodeId === undefined) throw new Error('A node ID is required.')
  const output = oneOf('output', parsed.values.output, ['table', 'json'] as const) as OutputFormat
  const node = await getNode(context.nodeRepository, nodeId)
  return output === 'json' ? formatNodeJson(node) : formatNodeDetail(node)
}
