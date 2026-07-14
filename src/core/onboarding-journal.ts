import type { ConnectionRecord } from '../domain/connection.js'
import type { NodeAccessProfile, OnboardingReviewRecord } from '../domain/onboarding.js'
import type { NodeRecord } from '../domain/node.js'

export type OnboardingJournal = {
  schemaVersion: 1
  reviewId: string
  digest: string
  expectedConnectionRevision: number
  expectedInventoryRevision: number
  connection: ConnectionRecord
  accessProfile: NodeAccessProfile
  node: NodeRecord
  preparedAt: string
}

export interface OnboardingJournalRepository {
  read(): Promise<OnboardingJournal | null>
  prepare(journal: OnboardingJournal): Promise<void>
  clear(reviewId: string): Promise<void>
  diagnose(): Promise<{ status: 'pass' | 'warning' | 'fail'; summary: string; nextAction?: string }>
}

export type OnboardingCommitResult = {
  review: OnboardingReviewRecord
  connectionRevision: number
  inventoryRevision: number
  reconciled: boolean
}
