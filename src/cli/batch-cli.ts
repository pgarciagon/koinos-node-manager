import { createApplicationContext, LOCAL_INVENTORY_SOURCE, type InventorySource } from './application-context.js'
import { cliCommandRegistry } from './command-catalog.js'
import { CliInputError } from './cli-input-error.js'
import { commandFailure, executeCommand } from './execution/command-executor.js'
import type { CommandExecutionResult } from './execution/execution-result.js'

type GlobalArguments = {
  args: readonly string[]
  inventorySource: InventorySource
}

export async function runCli(argv: readonly string[]): Promise<CommandExecutionResult> {
  try {
    const global = parseGlobalArguments(argv)
    return executeCommand(global, {
      registry: cliCommandRegistry,
      createApplicationContext
    })
  } catch (error: unknown) {
    return commandFailure('unknown', error, argv.includes('json'))
  }
}

function parseGlobalArguments(argv: readonly string[]): GlobalArguments {
  const args = [...argv]
  let inventorySource: InventorySource = LOCAL_INVENTORY_SOURCE
  if (args[0] === '--simulation') {
    const value = args[1]
    if (value === undefined) throw new CliInputError('The --simulation option requires a scenario name.')
    inventorySource = { kind: 'simulation', scenario: value }
    args.splice(0, 2)
  }
  return { args, inventorySource }
}
