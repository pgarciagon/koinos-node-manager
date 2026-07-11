import { parseArgs } from 'node:util'
import { simulationScenarios } from '../../adapters/simulation/scenarios.js'
import { successEnvelope } from '../envelope.js'
import type { OutputFormat } from '../output.js'

export async function runSimulationCommand(command: string | undefined, args: readonly string[]): Promise<string> {
  if (command !== 'scenarios') {
    throw new Error(`Unknown simulation command "${command ?? ''}". Run "knm simulation scenarios".`)
  }
  const parsed = parseArgs({
    args,
    options: { output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  const output = parsed.values.output as OutputFormat
  if (output !== 'table' && output !== 'json') throw new Error('Invalid --output value. Expected table or json.')
  if (output === 'json') return successEnvelope('simulation.scenarios', { scenarios: simulationScenarios.map(withoutNodes) })

  const rows = simulationScenarios.map((scenario) => `${scenario.id.padEnd(16)} ${scenario.nodes.length.toString().padStart(3)}  ${scenario.description}`)
  return ['SCENARIO        NODES  DESCRIPTION', '--------------------------------------------------------------------------', ...rows].join('\n')
}

function withoutNodes(scenario: (typeof simulationScenarios)[number]): { id: string; description: string; nodeCount: number } {
  return { id: scenario.id, description: scenario.description, nodeCount: scenario.nodes.length }
}
