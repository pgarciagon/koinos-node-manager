import type { OnboardingReviewRecord, PublicOnboardingReview } from '../domain/onboarding.js'

export function sanitizeOnboardingReview(review: OnboardingReviewRecord, existing: boolean): PublicOnboardingReview {
  return {
    schemaVersion: review.schemaVersion,
    contractVersion: review.contractVersion,
    id: review.id,
    digest: review.digest,
    mode: review.mode,
    status: review.status,
    node: {
      id: review.candidateNode.id,
      displayName: review.candidateNode.displayName,
      existing
    },
    connectionKind: review.candidateConnection.kind,
    access: structuredClone(review.accessSummary),
    inspection: review.inspection === null ? null : structuredClone(review.inspection),
    createdAt: review.createdAt,
    expiresAt: review.expiresAt,
    appliedAt: review.appliedAt,
    ...(review.pairingSessionRef === undefined ? {} : { pairingSessionRef: review.pairingSessionRef }),
    readOnly: true
  }
}
