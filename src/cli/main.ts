#!/usr/bin/env node

import { createApplicationContext } from './application-context.js'
import { runNodesCommand } from './commands/nodes.js'
import { runSimulationCommand } from './commands/simulation.js'
import { errorEnvelope, exitCodeFor, toStructuredError } from './envelope.js'

type GlobalArguments = {
  args: readonly string[]
  simulationScenario: string
  outputJsonRequested: boolean
}

function help(): string {
  return `Koinos Node Manager CLI

Usage:
  knm [--simulation <scenario>] nodes list [options]
  knm [--simulation <scenario>] nodes show <node-id> [options]
  knm simulation scenarios [--output table|json]

Global options:
  --simulation <value>  Select an explicit deterministic simulation scenario
  --help                Show this help

Run "knm simulation scenarios" to inspect available scenarios.`
}

function parseGlobalArguments(argv: readonly string[]): GlobalArguments {
  const args = [...argv]
  let simulationScenario = 'default'
  if (args[0] === '--simulation') {
    const value = args[1]
    if (value === undefined) throw new Error('The --simulation option requires a scenario name.')
    simulationScenario = value
    args.splice(0, 2)
  }
  return {
    args,
    simulationScenario,
    outputJsonRequested: args.includes('--output') && args[args.indexOf('--output') + 1] === 'json'
  }
}

export async function runCli(argv: readonly string[]): Promise<{ code: number; stdout?: string; stderr?: string }> {
  let global: GlobalArguments | undefined
  let commandName = 'unknown'
  try {
    global = parseGlobalArguments(argv)
    if (global.args.includes('--help') || global.args.length === 0) return { code: 0, stdout: help() }
    const [group, command, ...args] = global.args
    commandName = `${group ?? 'unknown'}.${command ?? 'unknown'}`
    if (group === 'simulation') return { code: 0, stdout: await runSimulationCommand(command, args) }
    const context = createApplicationContext(global.simulationScenario)
    if (group === 'nodes') return { code: 0, stdout: await runNodesCommand(command, args, context) }
    throw new Error(`Unknown command "${global.args.join(' ')}". Run "knm --help" for usage.`)
  } catch (error: unknown) {
    const json = global?.outputJsonRequested ?? argv.includes('json')
    if (json) return { code: exitCodeFor(error), stderr: errorEnvelope(commandName, error) }
    const structured = toStructuredError(error)
    return { code: exitCodeFor(error), stderr: `Error [${structured.code}]: ${structured.message}\nNext action: ${structured.nextAction}` }
  }
}

const result = await runCli(process.argv.slice(2))
if (result.stdout !== undefined) console.log(result.stdout)
if (result.stderr !== undefined) console.error(result.stderr)
process.exitCode = result.code
