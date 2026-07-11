import type { NodeRepository } from '../../core/node-repository.js'
import type { NodeRecord } from '../../domain/node.js'
import { simulatedNodes } from './fixtures.js'

export class SimulatedNodeRepository implements NodeRepository {
  constructor(private readonly nodes: readonly NodeRecord[] = simulatedNodes) {}

  async list(): Promise<readonly NodeRecord[]> {
    return structuredClone(this.nodes)
  }
}
