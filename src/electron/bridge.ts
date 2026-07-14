import type { OnboardingApplyResult } from '../core/node-onboarding-api.js'
import type { NodeInspectionApiResponse } from '../core/node-inspection-api.js'
import type { PublicApplicationError } from '../core/public-error.js'
import type { PreviewQuickInput } from '../core/onboarding.js'
import type { PublicNodeDirectory, PublicNodeSummary } from '../domain/node-directory.js'
import type { PublicOnboardingReview } from '../domain/onboarding.js'

export const ELECTRON_INSPECTION_BRIDGE_VERSION = '1.0.0' as const
export const ELECTRON_NODE_READ_BRIDGE_VERSION = '1.0.0' as const

export const ELECTRON_CHANNELS = Object.freeze({
  previewQuick: 'knm:onboarding:quick:preview',
  previewFullFromClipboard: 'knm:onboarding:full:preview-from-clipboard',
  pairFullImported: 'knm:onboarding:full:pair-imported',
  revokeFull: 'knm:onboarding:full:revoke',
  apply: 'knm:onboarding:apply',
  status: 'knm:onboarding:status',
  cancel: 'knm:onboarding:cancel',
  reconcile: 'knm:onboarding:reconcile'
} as const)

export const ELECTRON_NODE_CHANNELS = Object.freeze({
  list: 'knm:nodes:list',
  inspect: 'knm:nodes:inspect'
} as const)

export type DesktopResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PublicApplicationError }

export interface ElectronOnboardingBridge {
  readonly version: typeof ELECTRON_INSPECTION_BRIDGE_VERSION
  previewQuick(input: PreviewQuickInput): Promise<DesktopResult<PublicOnboardingReview>>
  previewFullFromClipboard(input: { nodeId: string; displayName?: string; allowPrivate: boolean; allowLoopbackHttp: boolean }): Promise<DesktopResult<PublicOnboardingReview>>
  pairFullImported(reviewId: string): Promise<DesktopResult<PublicOnboardingReview>>
  revokeFull(nodeId: string): Promise<DesktopResult<{ nodeId: string; connectionId: string; revoked: true; connectionRevision: number; runtimeChanged: false }>>
  apply(reviewId: string, digest: string): Promise<DesktopResult<OnboardingApplyResult>>
  status(reviewId: string): Promise<DesktopResult<PublicOnboardingReview>>
  cancel(reviewId: string): Promise<DesktopResult<PublicOnboardingReview>>
  reconcile(): Promise<DesktopResult<OnboardingApplyResult>>
}

export type ElectronNodeInspection = {
  node: PublicNodeSummary
  inspection: NodeInspectionApiResponse
}

export interface ElectronNodeReadBridge {
  readonly version: typeof ELECTRON_NODE_READ_BRIDGE_VERSION
  list(): Promise<DesktopResult<PublicNodeDirectory>>
  inspect(nodeId: string): Promise<DesktopResult<ElectronNodeInspection>>
}
