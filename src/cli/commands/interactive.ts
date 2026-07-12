import { parseArgs } from 'node:util'
import { simulationScenarios } from '../../adapters/simulation/scenarios.js'
import { getBuildIdentity } from '../../core/build-identity.js'
import { ApplicationError } from '../../core/application-error.js'
import { EXIT_CODES } from '../../core/exit-codes.js'
import type { CommandHandlerResult, CommandRuntime } from '../command-registry.js'
import { runInteractiveSession } from '../interactive/interactive-session.js'
import { NodeReadlineTerminal } from '../interactive/node-readline-terminal.js'

export async function runInteractiveCommand(
  args: readonly string[],
  runtime: CommandRuntime
): Promise<CommandHandlerResult> {
  const parsed = parseArgs({
    args,
    options: { 'no-color': { type: 'boolean', default: false } },
    allowPositionals: false,
    strict: true
  })
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new ApplicationError({
      code: 'INTERACTIVE_TTY_REQUIRED',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'Interactive mode requires an attached terminal.',
      nextAction: 'Run a one-shot command in non-interactive environments, or start "knm interactive" from a terminal.'
    })
  }

  const scenarios = new Map(simulationScenarios.map((scenario) => [
    scenario.id,
    scenario.nodes.map((node) => node.id)
  ]))
  if (runtime.inventorySource.kind === 'simulation' && !scenarios.has(runtime.inventorySource.scenario)) {
    throw new ApplicationError({
      code: 'SIMULATION_SCENARIO_NOT_FOUND',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'The requested simulation scenario was not found.',
      nextAction: 'Run "knm simulation scenarios" to inspect available scenarios.'
    })
  }
  const terminal = new NodeReadlineTerminal({
    input: process.stdin,
    output: process.stdout,
    error: process.stderr,
    noColor: parsed.values['no-color']
  })
  const exitCode = await runInteractiveSession({
    terminal,
    executeCommand: runtime.executeCommand,
    registry: runtime.registry,
    identity: getBuildIdentity(),
    initialSource: runtime.inventorySource,
    scenarios,
    nodeIdsForSource: async (source) => {
      if (source.kind === 'simulation') return scenarios.get(source.scenario) ?? []
      return (await runtime.applicationContextFor(source).nodeRepository.list()).map((node) => node.id)
    },
    phase3IdsForSource: async (source) => {
      if (source.kind === 'simulation') return { connectionIds: [], discoveryIds: [], adoptionIds: [] }
      const repository = runtime.applicationContextFor(source).connectionStateRepository
      if (repository === null) return { connectionIds: [], discoveryIds: [], adoptionIds: [] }
      const state = await repository.read()
      return {
        connectionIds: state.connections.map((connection) => connection.id),
        discoveryIds: state.discoveries.map((discovery) => discovery.id),
        adoptionIds: state.adoptionReviews.map((review) => review.id)
      }
    }
  })
  return { exitCode }
}
