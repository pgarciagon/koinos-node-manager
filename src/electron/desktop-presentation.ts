import type { InspectionSection, PublicNodeInspectionSnapshot } from '../domain/inspection.js'
import type { AccessMode } from '../domain/onboarding.js'

export const ROVING_TAB_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'] as const
export type RovingTabKey = (typeof ROVING_TAB_KEYS)[number]

export function nextRovingTabIndex(current: number, key: RovingTabKey, count: number): number {
  if (count <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const safeCurrent = current >= 0 && current < count ? current : 0
  return (safeCurrent + (key === 'ArrowRight' ? 1 : -1) + count) % count
}

export function accessModeLabel(mode: AccessMode): string {
  if (mode === 'quick') return 'Basic'
  if (mode === 'full') return 'Complete'
  return 'Expert'
}

export function sectionTabLabel(section: InspectionSection, snapshot?: PublicNodeInspectionSnapshot): string {
  const base = section[0]?.toUpperCase() + section.slice(1)
  if (snapshot === undefined) return base
  if (section === 'components' && snapshot.components.availability !== 'available') return `${base} · Limited`
  if (section === 'governance' && governanceUnavailable(snapshot)) return `${base} · Limited`
  return base
}

export function isBasicInspection(snapshot: PublicNodeInspectionSnapshot): boolean {
  return snapshot.components.availability !== 'available'
    && snapshot.producer.configured.availability !== 'available'
    && snapshot.resources.storage.availability !== 'available'
    && governanceUnavailable(snapshot)
}

export function relativeCaptureTime(capturedAt: string, nowMs: number): string {
  const capturedMs = Date.parse(capturedAt)
  if (!Number.isFinite(capturedMs)) return 'at an unknown time'
  const seconds = Math.max(0, Math.round((nowMs - capturedMs) / 1_000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds} sec ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hr ago`
  return `${Math.round(hours / 24)} days ago`
}

function governanceUnavailable(snapshot: PublicNodeInspectionSnapshot): boolean {
  return Object.values(snapshot.governance).every((value) => value.availability !== 'available')
}
