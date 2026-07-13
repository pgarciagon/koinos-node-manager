import { inspectNode, type NodeInspectionServices } from './inspect-node.js'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import {
  INSPECTION_SECTIONS,
  type InspectionSection,
  type PublicNodeInspectionSnapshot
} from '../domain/inspection.js'

export const NODE_INSPECTION_API_VERSION = '1.0.0' as const

export type NodeInspectionApiRequest = {
  nodeId: string
  sections: readonly InspectionSection[]
  timeoutMs: number
}

export type NodeInspectionApiResponse = {
  apiVersion: typeof NODE_INSPECTION_API_VERSION
  snapshot: PublicNodeInspectionSnapshot
  runtimeChanged: false
  persisted: false
}

export interface NodeInspectionApi {
  inspect(request: NodeInspectionApiRequest): Promise<NodeInspectionApiResponse>
}

export function createNodeInspectionApi(services: NodeInspectionServices): NodeInspectionApi {
  return {
    async inspect(request): Promise<NodeInspectionApiResponse> {
      validateInspectionApiRequest(request)
      return {
        apiVersion: NODE_INSPECTION_API_VERSION,
        snapshot: await inspectNode(services, request.nodeId, request.sections, request.timeoutMs),
        runtimeChanged: false,
        persisted: false
      }
    }
  }
}

function validateInspectionApiRequest(request: NodeInspectionApiRequest): void {
  if (
    typeof request !== 'object'
    || request === null
    || Object.keys(request).some((key) => !['nodeId', 'sections', 'timeoutMs'].includes(key))
    || typeof request.nodeId !== 'string'
    || request.nodeId.length === 0
    || request.nodeId.length > 128
    || !Array.isArray(request.sections)
    || request.sections.length === 0
    || request.sections.length > INSPECTION_SECTIONS.length
    || request.sections.some((section) => !INSPECTION_SECTIONS.includes(section))
    || !Number.isInteger(request.timeoutMs)
    || request.timeoutMs < 1_000
    || request.timeoutMs > 30_000
  ) {
    throw new ApplicationError({
      code: 'INVALID_NODE_INSPECTION_REQUEST',
      exitCode: EXIT_CODES.invalidInput,
      severity: 'error',
      retryable: false,
      message: 'The node inspection request does not match application API version 1.0.0.',
      nextAction: 'Provide one node ID, one or more supported sections, and a 1000-30000 millisecond timeout.'
    })
  }
}
