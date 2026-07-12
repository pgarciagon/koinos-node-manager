import { parseArgs } from 'node:util'
import { simulationScenarios } from '../../adapters/simulation/scenarios.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runSimulationScenarios(args: readonly string[]): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  const output = parseOutputFormat(parsed.values.output)
  if (output === 'json') return successEnvelope('simulation.scenarios', { scenarios: simulationScenarios.map(withoutNodes) })

  const rows = simulationScenarios.map((scenario) => `${scenario.id.padEnd(16)} ${scenario.nodes.length.toString().padStart(3)}  ${scenario.description}`)
  return ['SCENARIO        NODES  DESCRIPTION', '--------------------------------------------------------------------------', ...rows].join('\n')
}

function withoutNodes(scenario: (typeof simulationScenarios)[number]): { id: string; description: string; nodeCount: number } {
  return { id: scenario.id, description: scenario.description, nodeCount: scenario.nodes.length }
}
