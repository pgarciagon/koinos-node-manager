import type { ProbeKind, ProbeRequest, ProbeResponse, ReadOnlyProbeTransport } from '../../core/probe-transport.js'
import type { ConnectionTestOutcome } from '../../domain/connection.js'

export type FakeProbeScenario = {
  outcome: ConnectionTestOutcome
  outcomes?: Partial<Record<ProbeKind, ConnectionTestOutcome>>
  payloads?: Partial<Record<ProbeKind, string>>
  durationMs?: number
}

export class FakeProbeTransport implements ReadOnlyProbeTransport {
  readonly requests: ProbeRequest[] = []

  constructor(private readonly scenario: FakeProbeScenario) {}

  async execute(request: ProbeRequest): Promise<ProbeResponse> {
    this.requests.push(structuredClone(request))
    const outcome = this.scenario.outcomes?.[request.kind] ?? this.scenario.outcome
    return {
      outcome,
      durationMs: this.scenario.durationMs ?? 25,
      payload: outcome === 'success' ? this.scenario.payloads?.[request.kind] ?? null : null
    }
  }
}

export class FakeSshAliasResolver {
  constructor(private readonly aliases: readonly string[]) {}

  async hasExactAlias(alias: string): Promise<boolean> {
    return this.aliases.includes(alias)
  }
}
