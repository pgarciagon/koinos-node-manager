import type { BuildIdentity } from '../../core/build-identity.js'
import type { InventorySource } from '../application-context.js'
import { toStructuredError } from '../envelope.js'
import type { CommandRegistry } from '../command-registry.js'
import type { NestedCommandExecutor } from '../execution/execution-result.js'
import { createInteractiveCompleter } from './interactive-completion.js'
import { sanitizeInteractiveHistory } from './interactive-history.js'
import {
  renderInteractiveHelp,
  renderInteractivePrompt,
  renderInteractiveStartup,
  wrapInteractiveOutput
} from './interactive-renderer.js'
import {
  createInteractiveSessionState,
  reduceInteractiveSession,
  type InteractiveSessionState
} from './interactive-session-state.js'
import type { InteractiveTerminal } from './interactive-terminal.js'
import { tokenizeInteractiveInput } from './interactive-tokenizer.js'

export type InteractiveSessionOptions = {
  terminal: InteractiveTerminal
  executeCommand: NestedCommandExecutor
  registry: CommandRegistry
  identity: BuildIdentity
  initialSource: InventorySource
  scenarios: ReadonlyMap<string, readonly string[]>
  nodeIdsForSource: (source: InventorySource) => Promise<readonly string[]>
  phase3IdsForSource?: (source: InventorySource) => Promise<{
    connectionIds: readonly string[]
    discoveryIds: readonly string[]
    adoptionIds: readonly string[]
    onboardingIds: readonly string[]
  }>
}

export async function runInteractiveSession(options: InteractiveSessionOptions): Promise<number> {
  if (options.initialSource.kind === 'simulation' && !options.scenarios.has(options.initialSource.scenario)) {
    options.terminal.close()
    throw new Error('Unknown initial simulation scenario.')
  }
  let state = createInteractiveSessionState(options.initialSource)
  let nodeIds = await options.nodeIdsForSource(state.inventorySource).catch(() => [])
  let phase3Ids = await loadPhase3Ids(options, state.inventorySource)
  options.terminal.setHistorySanitizer(sanitizeInteractiveHistory)
  options.terminal.setCompleter(createInteractiveCompleter({
    registry: options.registry,
    scenarioIds: [...options.scenarios.keys()],
    nodeIds: () => nodeIds,
    connectionIds: () => phase3Ids.connectionIds,
    discoveryIds: () => phase3Ids.discoveryIds,
    adoptionIds: () => phase3Ids.adoptionIds,
    onboardingIds: () => phase3Ids.onboardingIds,
    excludedCommandNames: ['interactive']
  }))
  options.terminal.write(renderInteractiveStartup(options.identity, state.inventorySource))

  try {
    while (state.phase !== 'closed') {
      state = reduceInteractiveSession(state, { type: 'read-started' })
      const input = await options.terminal.readLine(renderInteractivePrompt(state, options.terminal.colorEnabled))
      if (input.kind === 'eof') return closeSession(options.terminal, state, 0)
      if (input.kind === 'interrupt') {
        state = reduceInteractiveSession(state, { type: 'idle-interrupted' })
        if (state.consecutiveIdleInterrupts >= 2) return closeSession(options.terminal, state, 130)
        options.terminal.write('Input cleared. Press Ctrl+C again to exit.')
        continue
      }

      state = reduceInteractiveSession(state, { type: 'line-received', line: input.value })
      const trimmed = input.value.trim()
      if (trimmed === '') continue

      try {
        const tokens = tokenizeInteractiveInput(trimmed)
        if (tokens.length === 0) continue
        if (tokens[0]?.startsWith('/') === true) {
          const outcome = await handleMetaCommand(tokens, state, options)
          state = outcome.state
          nodeIds = await options.nodeIdsForSource(state.inventorySource).catch(() => [])
          phase3Ids = await loadPhase3Ids(options, state.inventorySource)
          if (outcome.exitCode !== undefined) return closeSession(options.terminal, state, outcome.exitCode)
          continue
        }
        if (tokens[0] === 'interactive') {
          throw new Error('An interactive session is already running. Use /status or /exit.')
        }

        state = reduceInteractiveSession(state, { type: 'command-started' })
        const privateInputs = await collectPrivateInputs(tokens, options.terminal)
        const result = await options.executeCommand(tokens, {
          inventorySource: state.inventorySource,
          terminalWidth: options.terminal.width,
          ...(privateInputs.length === 0 ? {} : { privateInputs })
        })
        if (result.stdout !== undefined) {
          const outputIndex = tokens.indexOf('--output')
          const output = outputIndex >= 0 && tokens[outputIndex + 1] === 'json'
            ? result.stdout
            : wrapInteractiveOutput(result.stdout, options.terminal.width)
          options.terminal.write(output)
        }
        if (result.stderr !== undefined) {
          options.terminal.writeError(wrapInteractiveOutput(
            sanitizeInteractiveHistory(result.stderr),
            options.terminal.width
          ))
        }
        state = reduceInteractiveSession(state, { type: 'command-finished', result })
        nodeIds = await options.nodeIdsForSource(state.inventorySource).catch(() => [])
        phase3Ids = await loadPhase3Ids(options, state.inventorySource)
      } catch (error: unknown) {
        const structured = toStructuredError(error)
        options.terminal.writeError(wrapInteractiveOutput(
          `Error [${structured.code}]: ${structured.message}\nNext action: ${structured.nextAction}`,
          options.terminal.width
        ))
      }
    }
    return 0
  } finally {
    options.terminal.close()
  }
}

async function collectPrivateInputs(tokens: readonly string[], terminal: InteractiveTerminal): Promise<readonly string[]> {
  const inputs: string[] = []
  for (const token of tokens) {
    const prompt = token === '--rpc-endpoint-stdin'
      ? { label: 'Private RPC endpoint: ', hidden: false }
      : token === '--agent-endpoint-stdin'
        ? { label: 'Private agent endpoint: ', hidden: false }
        : token === '--pairing-secret-stdin'
          ? { label: 'Pairing secret: ', hidden: true }
          : undefined
    if (prompt === undefined) continue
    const value = await terminal.readPrivateLine(prompt.label, prompt.hidden)
    if (value.kind !== 'line') throw new Error('Private input was cancelled.')
    inputs.push(value.value)
  }
  return inputs
}

async function loadPhase3Ids(options: InteractiveSessionOptions, source: InventorySource) {
  const loaded = await options.phase3IdsForSource?.(source).catch(() => undefined)
  return loaded === undefined
    ? { connectionIds: [], discoveryIds: [], adoptionIds: [], onboardingIds: [] }
    : { ...loaded, onboardingIds: loaded.onboardingIds ?? [] }
}

type MetaCommandOutcome = {
  state: InteractiveSessionState
  exitCode?: number
}

async function handleMetaCommand(
  tokens: readonly string[],
  state: InteractiveSessionState,
  options: InteractiveSessionOptions
): Promise<MetaCommandOutcome> {
  const [command, ...args] = tokens
  if (command === '/exit' || command === '/quit') return { state, exitCode: 0 }
  if (command === '/help') {
    expectArgumentCount(command, args, 0)
    options.terminal.write(renderInteractiveHelp())
    return { state }
  }
  if (command === '/commands') {
    expectArgumentCount(command, args, 0)
    options.terminal.write(renderRegisteredCommands(options.registry))
    return { state }
  }
  if (command === '/status') {
    expectArgumentCount(command, args, 0)
    options.terminal.write(renderSessionStatus(state, options.identity))
    return { state }
  }
  if (command === '/inventory') {
    expectArgumentCount(command, args, 0)
    const next = reduceInteractiveSession(state, { type: 'inventory-source-changed', inventorySource: { kind: 'local' } })
    options.terminal.write('Switched to the local persisted inventory for this session.')
    return { state: next }
  }
  if (command === '/scenario') {
    expectArgumentCount(command, args, 1)
    const scenario = args[0]
    if (scenario === undefined || !options.scenarios.has(scenario)) {
      throw new Error('Unknown simulation scenario. Use /commands or "simulation scenarios".')
    }
    const next = reduceInteractiveSession(state, {
      type: 'inventory-source-changed',
      inventorySource: { kind: 'simulation', scenario }
    })
    options.terminal.write(`Scenario changed to ${scenario} for this session.`)
    return { state: next }
  }
  if (command === '/history') {
    expectArgumentCount(command, args, 0)
    options.terminal.write(state.history.length === 0
      ? 'No commands in session history.'
      : state.history.map((line, index) => `${String(index + 1).padStart(3)}  ${line}`).join('\n'))
    return { state }
  }
  if (command === '/clear') {
    expectArgumentCount(command, args, 0)
    options.terminal.clear()
    return { state }
  }
  throw new Error('Unknown interactive metacommand. Use /help.')
}

function expectArgumentCount(command: string | undefined, args: readonly string[], count: number): void {
  if (args.length !== count) throw new Error(`${command ?? 'Metacommand'} expects ${count} argument${count === 1 ? '' : 's'}.`)
}

function renderRegisteredCommands(registry: CommandRegistry): string {
  return [
    'Product commands:',
    ...registry.definitions()
      .filter((definition) => definition.commandName !== 'interactive')
      .map((definition) => `  ${definition.path.join(' ').padEnd(22)} ${definition.summary}`)
  ].join('\n')
}

function renderSessionStatus(state: InteractiveSessionState, identity: BuildIdentity): string {
  const local = state.inventorySource.kind === 'local'
  return [
    'Session status',
    `  Mode:       ${local ? 'local persisted inventory' : 'read-only simulation'}`,
    `  Source:     ${state.inventorySource.kind === 'local' ? 'local' : `simulation:${state.inventorySource.scenario}`}`,
    `  Build:      ${identity.productVersion} (${identity.gitCommit.slice(0, 12)}, ${identity.sourceState})`,
    `  Last result: ${state.lastResult === undefined ? 'none' : `${state.lastResult.commandName}, exit ${state.lastResult.code}`}`
  ].join('\n')
}

function closeSession(terminal: InteractiveTerminal, state: InteractiveSessionState, exitCode: number): number {
  const closing = reduceInteractiveSession(state, { type: 'closing' })
  reduceInteractiveSession(closing, { type: 'closed' })
  terminal.write('Session ended.')
  return exitCode
}
