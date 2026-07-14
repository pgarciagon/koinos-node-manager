import {
  applyOnboarding,
  cancelOnboarding,
  getOnboardingStatus,
  pairFull,
  previewFull,
  previewQuick,
  revokeFull,
  reconcileOnboarding,
  type FullOnboardingServices,
  type PreviewFullInput,
  type PreviewQuickInput
} from './onboarding.js'
import { sanitizeOnboardingReview } from './sanitize-onboarding.js'
import type { PublicOnboardingReview } from '../domain/onboarding.js'

export const NODE_ONBOARDING_API_VERSION = '1.0.0' as const

export type OnboardingApplyResult = {
  apiVersion: typeof NODE_ONBOARDING_API_VERSION
  review: PublicOnboardingReview
  connectionRevision: number
  inventoryRevision: number
  reconciled: boolean
  runtimeChanged: false
}

export interface NodeOnboardingApi {
  previewQuick(input: PreviewQuickInput): Promise<PublicOnboardingReview>
  previewFull(input: PreviewFullInput): Promise<PublicOnboardingReview>
  pairFull(reviewId: string, pairingSecret: string): Promise<PublicOnboardingReview>
  apply(reviewId: string, digest: string): Promise<OnboardingApplyResult>
  status(reviewId: string): Promise<PublicOnboardingReview>
  cancel(reviewId: string): Promise<PublicOnboardingReview>
  reconcile(): Promise<OnboardingApplyResult>
  revokeFull(nodeId: string): Promise<{ nodeId: string; connectionId: string; revoked: true; connectionRevision: number; runtimeChanged: false }>
}

export function createNodeOnboardingApi(services: FullOnboardingServices): NodeOnboardingApi {
  return {
    previewQuick: (input) => previewQuick(services, input),
    previewFull: (input) => previewFull(services, input),
    pairFull: (reviewId, pairingSecret) => pairFull(services, reviewId, pairingSecret),
    async apply(reviewId, digest) {
      const result = await applyOnboarding(services, reviewId, digest)
      return {
        apiVersion: NODE_ONBOARDING_API_VERSION,
        review: sanitizeOnboardingReview(result.review, true),
        connectionRevision: result.connectionRevision,
        inventoryRevision: result.inventoryRevision,
        reconciled: result.reconciled,
        runtimeChanged: false
      }
    },
    status: (reviewId) => getOnboardingStatus(services.connectionRepository, services.inventoryRepository, reviewId),
    cancel: (reviewId) => services.now === undefined
      ? cancelOnboarding(services.connectionRepository, reviewId)
      : cancelOnboarding(services.connectionRepository, reviewId, services.now),
    async reconcile() {
      const result = await reconcileOnboarding(services)
      return {
        apiVersion: NODE_ONBOARDING_API_VERSION,
        review: sanitizeOnboardingReview(result.review, true),
        connectionRevision: result.connectionRevision,
        inventoryRevision: result.inventoryRevision,
        reconciled: true,
        runtimeChanged: false
      }
    },
    revokeFull: (nodeId) => revokeFull(services, nodeId)
  }
}
