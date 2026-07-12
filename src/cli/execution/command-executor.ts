import type { ApplicationContext } from '../application-context.js'
import type { InventorySource } from '../application-context.js'
import type { CommandRegistry, CommandRuntime } from '../command-registry.js'
import { CliInputError } from '../cli-input-error.js'
import { errorEnvelope, exitCodeFor, toStructuredError } from '../envelope.js'
import type { CommandExecutionRequest, CommandExecutionResult } from './execution-result.js'
import { renderHelp } from '../help.js'

export type CommandExecutorDependencies = {
  registry: CommandRegistry
  createApplicationContext: (inventorySource: InventorySource) => ApplicationContext
}

export async function executeCommand(
  request: CommandExecutionRequest,
  dependencies: CommandExecutorDependencies
): Promise<CommandExecutionResult> {
  let commandName = commandNameFor(dependencies.registry, request.args)
  try {
    const helpIndex = request.args.indexOf('--help')
    if (request.args.length === 0 || helpIndex === 0) {
      return { code: 0, commandName: 'help', stdout: renderHelp(dependencies.registry) }
    }
    if (helpIndex > 0) {
      return {
        code: 0,
        commandName: commandNameFor(dependencies.registry, request.args.slice(0, helpIndex)),
        stdout: renderHelp(dependencies.registry, request.args.slice(0, helpIndex))
      }
    }

    const resolved = dependencies.registry.resolve(request.args)
    if (resolved === undefined) {
      const safePath = safeUnknownCommandPath(dependencies.registry, request.args)
      throw new CliInputError(
        `Unknown command "${safePath}".`,
        nextHelpAction(dependencies.registry, request.args)
      )
    }
    commandName = resolved.definition.commandName
    let context: ApplicationContext | undefined
    const runtime: CommandRuntime = {
      applicationContext: () => {
        context ??= dependencies.createApplicationContext(request.inventorySource)
        return context
      },
      applicationContextFor: dependencies.createApplicationContext,
      executeCommand: (args, options = {}) => executeCommand({
        args,
        inventorySource: options.inventorySource ?? request.inventorySource,
        ...(options.terminalWidth === undefined ? {} : { terminalWidth: options.terminalWidth })
      }, dependencies),
      registry: dependencies.registry,
      inventorySource: request.inventorySource,
      ...(request.terminalWidth === undefined ? {} : { terminalWidth: request.terminalWidth })
    }
    const handlerResult = await resolved.definition.run(resolved.args, runtime)
    if (typeof handlerResult === 'string') return { code: 0, commandName, stdout: handlerResult }
    const result: CommandExecutionResult = {
      code: handlerResult.exitCode ?? 0,
      commandName
    }
    if (handlerResult.stdout !== undefined) result.stdout = handlerResult.stdout
    if (handlerResult.stderr !== undefined) result.stderr = handlerResult.stderr
    return result
  } catch (error: unknown) {
    return commandFailure(commandName, error, outputJsonRequested(request.args))
  }
}

export function commandFailure(commandName: string, error: unknown, json: boolean): CommandExecutionResult {
  const code = exitCodeFor(error)
  if (json) return { code, commandName, stderr: errorEnvelope(commandName, error) }
  const structured = toStructuredError(error)
  return {
    code,
    commandName,
    stderr: `Error [${structured.code}]: ${structured.message}\nNext action: ${structured.nextAction}`
  }
}

function nextHelpAction(registry: CommandRegistry, args: readonly string[]): string {
  const group = args[0]
  return group !== undefined && registry.commandsInGroup(group).length > 0
    ? `Run "knm ${group} --help" to inspect available commands.`
    : 'Run "knm --help" to inspect available commands.'
}

function commandNameFor(registry: CommandRegistry, args: readonly string[]): string {
  const path = safeUnknownCommandPath(registry, args)
  return path === '' ? 'unknown' : path.replaceAll(' ', '.')
}

function safeUnknownCommandPath(registry: CommandRegistry, args: readonly string[]): string {
  const group = args[0]
  if (group === undefined || group.startsWith('-')) return ''
  if (registry.commandsInGroup(group).length === 0) return group
  const command = args[1]
  return command === undefined || command.startsWith('-') ? group : `${group} ${command}`
}

function outputJsonRequested(args: readonly string[]): boolean {
  const outputIndex = args.indexOf('--output')
  return outputIndex >= 0 && args[outputIndex + 1] === 'json'
}
