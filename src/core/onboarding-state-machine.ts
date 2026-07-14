import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'
import type { OnboardingEvent, OnboardingState } from '../domain/onboarding.js'

const TRANSITIONS: Readonly<Record<OnboardingState['status'], Partial<Record<OnboardingEvent['type'], OnboardingState['status']>>>> = {
  idle: { 'start-validation': 'validating', cancelled: 'cancelled' },
  validating: { 'start-probe': 'probing', 'start-pairing': 'pairing', cancelled: 'cancelled', failed: 'failed' },
  probing: { 'review-ready': 'review-ready', cancelled: 'cancelled', failed: 'failed' },
  pairing: { 'start-verification': 'verifying', cancelled: 'cancelled', failed: 'failed' },
  verifying: { 'review-ready': 'review-ready', cancelled: 'cancelled', failed: 'failed' },
  'review-ready': { 'start-commit': 'committing', cancelled: 'cancelled', failed: 'failed' },
  committing: { committed: 'committed', failed: 'failed' },
  committed: {},
  cancelled: {},
  failed: { 'start-validation': 'validating', cancelled: 'cancelled' }
}

export function reduceOnboardingState(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  const next = TRANSITIONS[state.status][event.type]
  if (next !== undefined) return { status: next }
  throw new ApplicationError({
    code: 'ONBOARDING_TRANSITION_INVALID',
    exitCode: EXIT_CODES.invalidInput,
    severity: 'error',
    retryable: false,
    message: 'The onboarding operation cannot perform that transition from its current state.',
    nextAction: 'Inspect the current onboarding status and restart the review when necessary.'
  })
}
