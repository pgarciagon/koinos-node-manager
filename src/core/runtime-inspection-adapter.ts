import type {
  InspectionSection,
  NodeInspectionSnapshot,
  RuntimeInspectionCapabilities
} from '../domain/inspection.js'
import type { NetworkName, NodeFlavorId } from '../domain/node.js'
import type { ProbeResponse, RuntimeInspectionProbeKind } from './probe-transport.js'

export type RuntimeInspectionTarget = {
  nodeId: string
  displayName: string
  flavor: NodeFlavorId
  expectedNetwork: NetworkName
  expectedChainId?: string
}

export interface RuntimeInspectionProbe {
  execute(kind: RuntimeInspectionProbeKind, timeoutMs: number): Promise<ProbeResponse>
}

export type RuntimeInspectionRequest = {
  target: RuntimeInspectionTarget
  sections: readonly InspectionSection[]
  timeoutMs: number
  capturedAt: string
  probe: RuntimeInspectionProbe
}

export interface RuntimeInspectionAdapter {
  readonly flavor: NodeFlavorId
  readonly contractVersion: string
  capabilities(): RuntimeInspectionCapabilities
  inspect(request: RuntimeInspectionRequest): Promise<NodeInspectionSnapshot>
}
