import type { PublicApplicationError } from '../core/public-error.js'
import type { PublicOnboardingReview } from '../domain/onboarding.js'

export type OnboardingViewState =
  | { status: 'idle'; mode: 'quick' | 'full' }
  | { status: 'loading'; mode: 'quick' | 'full'; message: string }
  | { status: 'pairing'; mode: 'full'; review: PublicOnboardingReview }
  | { status: 'review'; mode: 'quick' | 'full'; review: PublicOnboardingReview }
  | { status: 'completed'; mode: 'quick' | 'full'; review: PublicOnboardingReview }
  | { status: 'cancelled'; mode: 'quick' | 'full' }
  | { status: 'error'; mode: 'quick' | 'full'; category: OnboardingErrorCategory; error: PublicApplicationError }

export type OnboardingErrorCategory =
  | 'private-review-required'
  | 'agent-unavailable'
  | 'incompatible-protocol'
  | 'pairing-expired'
  | 'pairing-rejected'
  | 'replay-detected'
  | 'identity-changed'
  | 'credential-unavailable'
  | 'stale-review'
  | 'persistence-conflict'
  | 'interruption'
  | 'generic'

export type OnboardingViewEvent =
  | { type: 'select-mode'; mode: 'quick' | 'full' }
  | { type: 'loading'; message: string }
  | { type: 'review'; review: PublicOnboardingReview }
  | { type: 'completed'; review: PublicOnboardingReview }
  | { type: 'cancelled' }
  | { type: 'failed'; error: PublicApplicationError }

export function reduceOnboardingView(state: OnboardingViewState, event: OnboardingViewEvent): OnboardingViewState {
  if (event.type === 'select-mode') return { status: 'idle', mode: event.mode }
  if (event.type === 'loading') return { status: 'loading', mode: state.mode, message: event.message }
  if (event.type === 'review') return event.review.status === 'pairing'
    ? { status: 'pairing', mode: 'full', review: event.review }
    : { status: 'review', mode: event.review.mode, review: event.review }
  if (event.type === 'completed') return { status: 'completed', mode: event.review.mode, review: event.review }
  if (event.type === 'cancelled') return { status: 'cancelled', mode: state.mode }
  return { status: 'error', mode: state.mode, category: errorCategory(event.error.code), error: event.error }
}

export function errorCategory(code: string): OnboardingErrorCategory {
  if (code === 'ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED') return 'private-review-required'
  if (code === 'AGENT_UNREACHABLE') return 'agent-unavailable'
  if (code === 'AGENT_PROTOCOL_INCOMPATIBLE' || code === 'AGENT_BUILD_UNTRUSTED') return 'incompatible-protocol'
  if (code === 'AGENT_PAIRING_EXPIRED') return 'pairing-expired'
  if (code === 'AGENT_PAIRING_REJECTED') return 'pairing-rejected'
  if (code === 'AGENT_PAIRING_REPLAYED') return 'replay-detected'
  if (code === 'AGENT_IDENTITY_CHANGED' || code === 'AGENT_POSSESSION_PROOF_INVALID') return 'identity-changed'
  if (code === 'AGENT_CREDENTIAL_UNAVAILABLE') return 'credential-unavailable'
  if (code === 'ONBOARDING_REVIEW_STALE') return 'stale-review'
  if (code.includes('REVISION_CONFLICT')) return 'persistence-conflict'
  if (code === 'ONBOARDING_COMMIT_INTERRUPTED') return 'interruption'
  return 'generic'
}
