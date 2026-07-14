import { createApplicationContext, LOCAL_INVENTORY_SOURCE, type InventorySource } from './application-context.js'
import { cliCommandRegistry } from './command-catalog.js'
import { CliInputError } from './cli-input-error.js'
import { commandFailure, executeCommand } from './execution/command-executor.js'
import type { CommandExecutionResult } from './execution/execution-result.js'

type GlobalArguments = {
  args: readonly string[]
  inventorySource: InventorySource
}

export async function runCli(argv: readonly string[], injectedPrivateInputs?: readonly string[]): Promise<CommandExecutionResult> {
  try {
    const global = parseGlobalArguments(argv)
    const privateInputCount = global.args.filter((arg) => arg.endsWith('-stdin')).length
    const privateInputs = injectedPrivateInputs ?? (privateInputCount === 0 ? [] : await readPrivateInputs(privateInputCount))
    return executeCommand({ ...global, privateInputs }, {
      registry: cliCommandRegistry,
      createApplicationContext
    })
  } catch (error: unknown) {
    return commandFailure('unknown', error, argv.includes('json'))
  }
}

async function readPrivateInputs(count: number): Promise<readonly string[]> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 16_384) throw new CliInputError('Private stdin input exceeds the supported size.')
    chunks.push(buffer)
  }
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length !== count) throw new CliInputError(`Expected ${count} private stdin value${count === 1 ? '' : 's'}.`)
  return lines
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
