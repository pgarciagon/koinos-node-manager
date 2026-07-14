import type { InventorySource } from '../application-context.js'

export type CommandExecutionResult = {
  code: number
  commandName: string
  stdout?: string
  stderr?: string
}

export type CommandExecutionRequest = {
  args: readonly string[]
  inventorySource: InventorySource
  terminalWidth?: number
  privateInputs?: readonly string[]
}

export type NestedCommandOptions = {
  inventorySource?: InventorySource
  terminalWidth?: number
  privateInputs?: readonly string[]
}

export type NestedCommandExecutor = (
  args: readonly string[],
  options?: NestedCommandOptions
) => Promise<CommandExecutionResult>
