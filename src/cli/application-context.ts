import { SimulatedNodeRepository } from '../adapters/simulation/simulated-node-repository.js'
import type { NodeRepository } from '../core/node-repository.js'

export type ApplicationContext = {
  nodeRepository: NodeRepository
  simulationScenario: string
}

export function createApplicationContext(simulationScenario: string): ApplicationContext {
  return {
    nodeRepository: SimulatedNodeRepository.forScenario(simulationScenario),
    simulationScenario
  }
}
