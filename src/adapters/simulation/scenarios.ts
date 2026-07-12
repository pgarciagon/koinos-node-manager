import type { NodeRecord } from '../../domain/node.js'
import { simulatedNodes } from './fixtures.js'

export type SimulationScenario = {
  id: string
  description: string
  nodes: readonly NodeRecord[]
}

function withObservedChanges(node: NodeRecord, changes: Partial<NonNullable<NodeRecord['observed']>>): NodeRecord {
  const copy = structuredClone(node)
  if (copy.observed === null) return copy
  return { ...copy, observed: { ...copy.observed, ...changes } }
}

const mixedHealthNodes = simulatedNodes.map((node, index) => {
  if (index === 0) return withObservedChanges(node, { health: 'unreachable' })
  if (index === 1) return withObservedChanges(node, { health: 'degraded' })
  return structuredClone(node)
})

const staleHealthNodes = simulatedNodes.map((node) => withObservedChanges(node, {
  observedAt: '2026-01-01T00:00:00Z',
  freshness: 'stale'
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
    description: 'All available observations are stale; never-observed records remain never.',
    nodes: staleHealthNodes
  }
]

export function getSimulationScenario(scenarioId: string): SimulationScenario | undefined {
  return simulationScenarios.find((scenario) => scenario.id === scenarioId)
}
