import { ApplicationError } from './application-error.js'
import type { NodeRepository } from './node-repository.js'
import type { NodeRecord } from '../domain/node.js'
import { EXIT_CODES } from './exit-codes.js'
import { assertValidNodeId } from './validate-node.js'

export async function getNode(repository: NodeRepository, nodeId: string): Promise<NodeRecord> {
  assertValidNodeId(nodeId)
  const node = (await repository.list()).find((candidate) => candidate.id === nodeId)
  if (node !== undefined) return node

  throw new ApplicationError({
    code: 'NODE_NOT_FOUND',
    exitCode: EXIT_CODES.notFound,
    severity: 'error',
    retryable: false,
    message: `Node "${nodeId}" was not found.`,
    nextAction: 'Run "knm nodes list" to inspect available nodes.'
  })
}
