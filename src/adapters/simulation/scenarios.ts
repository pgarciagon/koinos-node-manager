import type { NodeRecord } from '../../domain/node.js'
import { simulatedNodes } from './fixtures.js'

export type SimulationScenario = {
  id: string
  description: string
  nodes: readonly NodeRecord[]
}

function withNodeChanges(node: NodeRecord, changes: Partial<NodeRecord>): NodeRecord {
  return { ...structuredClone(node), ...changes }
}

const mixedHealthNodes = simulatedNodes.map((node, index) => {
  if (index === 0) return withNodeChanges(node, { health: 'unreachable' })
  if (index === 1) return withNodeChanges(node, { health: 'degraded' })
  return structuredClone(node)
})

const staleHealthNodes = simulatedNodes.map((node) => withNodeChanges(node, {
  lastObservedAt: '2026-01-01T00:00:00Z'
}))

export const simulationScenarios: readonly SimulationScenario[] = [
  {
    id: 'default',
    description: 'Representative managed, connected, external, and discovered nodes.',
    nodes: simulatedNodes
  },
  {
    id: 'empty',
    description: 'An empty inventory with no nodes.',
    nodes: []
  },
  {
    id: 'mixed-health',
    description: 'A fleet containing healthy, degraded, unreachable, and unknown states.',
    nodes: mixedHealthNodes
  },
  {
    id: 'stale-health',
    description: 'Nodes whose last observations are intentionally stale.',
    nodes: staleHealthNodes
  }
]

export function getSimulationScenario(scenarioId: string): SimulationScenario | undefined {
  return simulationScenarios.find((scenario) => scenario.id === scenarioId)
}
