import type {
  InspectionAvailabilityReason,
  InspectionEvidence,
  InspectionEvidenceAuthority,
  InspectionEvidenceFreshness,
  InspectionEvidenceSource,
  InspectionValue
} from '../domain/inspection.js'

export function inspectionEvidence(
  source: InspectionEvidenceSource,
  observedAt: string,
  authority: InspectionEvidenceAuthority = 'observed',
  freshness: InspectionEvidenceFreshness = 'fresh'
): InspectionEvidence {
  return { source, observedAt, freshness, authority }
}

export function available<T>(value: T, evidence: InspectionEvidence): InspectionValue<T> {
  return { availability: 'available', value: structuredClone(value), evidence: structuredClone(evidence) }
}

export function unavailable<T>(
  reason: InspectionAvailabilityReason,
  evidence: InspectionEvidence
): InspectionValue<T> {
  return { availability: 'unavailable', reason, evidence: structuredClone(evidence) }
}

export function unknown<T>(
  reason: InspectionAvailabilityReason,
  evidence: InspectionEvidence
): InspectionValue<T> {
  return { availability: 'unknown', reason, evidence: structuredClone(evidence) }
}

export function collectInspectionEvidence(values: readonly unknown[]): readonly InspectionEvidence[] {
  const result = new Map<string, InspectionEvidence>()
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const record = value as Record<string, unknown>
    if (
      typeof record.source === 'string'
      && typeof record.observedAt === 'string'
      && typeof record.freshness === 'string'
      && typeof record.authority === 'string'
    ) {
      const evidence = record as InspectionEvidence
      result.set(`${evidence.source}\0${evidence.observedAt}\0${evidence.freshness}\0${evidence.authority}`, structuredClone(evidence))
    }
    for (const nested of Object.values(record)) visit(nested)
  }
  for (const value of values) visit(value)
  return [...result.values()].sort((left, right) => left.source.localeCompare(right.source))
}

export function selectBestInspectionValue<T>(values: readonly InspectionValue<T>[]): InspectionValue<T> {
  if (values.length === 0) throw new Error('At least one inspection value is required.')
  return structuredClone([...values].sort((left, right) => inspectionValueRank(right) - inspectionValueRank(left))[0] as InspectionValue<T>)
}

function inspectionValueRank<T>(value: InspectionValue<T>): number {
  const availability = value.availability === 'available' ? 100 : value.availability === 'unknown' ? 10 : 0
  const freshness = value.evidence.freshness === 'fresh' ? 20 : 0
  const authority = value.evidence.authority === 'verified' ? 3 : value.evidence.authority === 'observed' ? 2 : 1
  return availability + freshness + authority
}
