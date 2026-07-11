#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { SimulatedNodeRepository } from '../adapters/simulation/simulated-node-repository.js'
import { listNodes, type ListNodesQuery } from '../core/list-nodes.js'
import {
  NODE_FUNCTIONS,
  type ManagementClass,
  type NetworkName,
  type NodeFunction,
  type NodeHealth
} from '../domain/node.js'
import { formatNodesJson, formatNodesTable, type OutputFormat } from './output.js'

const managementClasses: readonly ManagementClass[] = ['managed', 'connected', 'external', 'discovered']
const networks: readonly NetworkName[] = ['mainnet', 'testnet', 'custom', 'unknown']
const healthStates: readonly NodeHealth[] = ['healthy', 'degraded', 'unreachable', 'unknown']

function help(): string {
  return `Koinos Node Manager CLI

Usage:
  knm nodes list [options]

Options:
  --management <value>  managed | connected | external | discovered
  --network <value>     mainnet | testnet | custom | unknown
  --function <value>    observer | producer | seed | api | backup-source
  --health <value>      healthy | degraded | unreachable | unknown
  --output <value>      table | json (default: table)
  --help                Show this help

The first version uses a deterministic simulation repository.`
}

function oneOf<T extends string>(name: string, value: string | undefined, values: readonly T[]): T | undefined {
  if (value === undefined) return undefined
  if ((values as readonly string[]).includes(value)) return value as T
  throw new Error(`Invalid --${name} value "${value}". Expected one of: ${values.join(', ')}.`)
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes('--help') || argv.length === 0) {
    console.log(help())
    return 0
  }

  const [group, command, ...optionArgs] = argv
  if (group !== 'nodes' || command !== 'list') {
    throw new Error(`Unknown command "${argv.join(' ')}". Run "knm --help" for usage.`)
  }

  const parsed = parseArgs({
    args: optionArgs,
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
  const repository = new SimulatedNodeRepository()
  const result = await listNodes(repository, query)

  console.log(output === 'json' ? formatNodesJson(result, query) : formatNodesTable(result))
  return 0
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown CLI error.'
    console.error(`Error: ${message}`)
    process.exitCode = 2
  }
)
