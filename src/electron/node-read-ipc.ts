import { ApplicationError } from '../core/application-error.js'
import { EXIT_CODES } from '../core/exit-codes.js'
import { isValidNodeId } from '../core/validate-node.js'

export function assertNodeDirectoryIpcRequest(args: readonly unknown[]): void {
  if (args.length !== 0) throw invalidNodeReadRequest('The node directory request does not accept input.')
}

export function parseNodeInspectionIpcRequest(args: readonly unknown[]): string {
  const nodeId = args[0]
  if (args.length !== 1 || typeof nodeId !== 'string' || !isValidNodeId(nodeId)) {
    throw invalidNodeReadRequest('The node inspection request must contain one valid stable node ID.')
  }
  return nodeId
}

export function invalidNodeReadRequest(message: string): ApplicationError {
  return new ApplicationError({
    code: 'INVALID_ELECTRON_NODE_REQUEST',
    exitCode: EXIT_CODES.invalidInput,
    severity: 'error',
    retryable: false,
    message,
    nextAction: 'Return to Nodes and select one listed node.'
  })
}
