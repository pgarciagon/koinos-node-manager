import type { NodeRecord } from '../domain/node.js'

export interface NodeRepository {
  list(): Promise<readonly NodeRecord[]>
}
