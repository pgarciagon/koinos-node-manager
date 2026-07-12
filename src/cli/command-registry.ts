import type { ApplicationContext, InventorySource } from './application-context.js'
import type { NestedCommandExecutor } from './execution/execution-result.js'

export type CommandPath = readonly [string, ...string[]]

export type CommandOption = {
  syntax: string
  description: string
  values?: readonly string[]
  completionSource?: 'node-id' | 'connection-id' | 'discovery-id' | 'adoption-id'
}

export type CommandCompletion = {
  positionalSources?: readonly ('node-id' | 'connection-id' | 'discovery-id' | 'adoption-id')[]
}

export type CommandHandlerResult = string | {
  exitCode?: number
  stdout?: string
  stderr?: string
}

export type CommandRuntime = {
  applicationContext: () => ApplicationContext
  applicationContextFor: (inventorySource: InventorySource) => ApplicationContext
  executeCommand: NestedCommandExecutor
  registry: CommandRegistry
  inventorySource: InventorySource
  terminalWidth?: number
}

export type CommandDefinition = {
  path: CommandPath
  commandName: string
  summary: string
  usage: string
  options: readonly CommandOption[]
  completion?: CommandCompletion
  run: (args: readonly string[], runtime: CommandRuntime) => Promise<CommandHandlerResult>
}

export type ResolvedCommand = {
  definition: CommandDefinition
  args: readonly string[]
}

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition>()

  register(definition: CommandDefinition): this {
    const key = pathKey(definition.path)
    if (this.#commands.has(key)) throw new Error(`Command "${definition.path.join(' ')}" is already registered.`)
    this.#commands.set(key, definition)
    return this
  }

  definitions(): readonly CommandDefinition[] {
    return [...this.#commands.values()]
  }

  commandsInGroup(group: string): readonly CommandDefinition[] {
    return this.definitions().filter((definition) => definition.path.length > 1 && definition.path[0] === group)
  }

  exact(path: readonly string[]): CommandDefinition | undefined {
    return this.#commands.get(pathKey(path))
  }

  resolve(args: readonly string[]): ResolvedCommand | undefined {
    const lengths = [...new Set(this.definitions().map((definition) => definition.path.length))].sort((left, right) => right - left)
    for (const pathLength of lengths) {
      const definition = this.exact(args.slice(0, pathLength))
      if (definition !== undefined) return { definition, args: args.slice(pathLength) }
    }
    return undefined
  }
}

function pathKey(path: readonly string[]): string {
  return path.join('\u0000')
}
