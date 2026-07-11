import type { NodeRepository } from '../../core/node-repository.js'
import type { NodeRecord } from '../../domain/node.js'
import { getSimulationScenario } from './scenarios.js'
import { ApplicationError } from '../../core/application-error.js'

export class SimulatedNodeRepository implements NodeRepository {
  constructor(private readonly nodes: readonly NodeRecord[]) {}

  static forScenario(scenarioId = 'default'): SimulatedNodeRepository {
    const scenario = getSimulationScenario(scenarioId)
    if (scenario === undefined) {
      throw new ApplicationError({
        code: 'SIMULATION_SCENARIO_NOT_FOUND',
        exitCode: 2,
        severity: 'error',
        retryable: false,
        message: `Simulation scenario "${scenarioId}" was not found.`,
        nextAction: 'Run "knm simulation scenarios" to inspect available scenarios.'
      })
    }
    return new SimulatedNodeRepository(scenario.nodes)
  }

  async list(): Promise<readonly NodeRecord[]> {
    return structuredClone(this.nodes)
  }
}
