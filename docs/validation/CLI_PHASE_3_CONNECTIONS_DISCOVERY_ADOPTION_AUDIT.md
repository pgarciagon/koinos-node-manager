# CLI Phase 3 Connections, Discovery, And Adoption Audit

- Status: deterministic implementation complete; live exit criterion pending
- Audited: 2026-07-12
- Product version: `0.1.0-dev.0`
- Scope: CLI Phase 3 only
- Live target: unavailable; no disposable testnet target was separately approved

## Outcome

All deterministic Phase 3 implementation and validation requirements are
complete. Connection references survive restarts, the transport accepts only
predefined read-only probes, discovery never creates inventory implicitly, and
adoption writes only reviewed inventory metadata. Complete evidence produces a
managed adopted observer-safe record; incomplete authority produces a
connected limited-authority record.

Phase 3 is not marked fully complete because the required live validation was
not authorized or available. No archived alias, private production host, or
mainnet producer was reused as a test target.

## Requirement Audit

| Requirement | Evidence | Result |
| --- | --- | --- |
| Versioned persisted connection metadata | Connection-state schema `1`, private filesystem repository, optimistic revisions, atomic replacement, backups, migration, quarantine, and recovery are covered by repository-contract tests. | Pass |
| Opaque connection commands | `connections list`, `show`, `add ssh`, `test`, and confirmation-bound `remove` provide human and schema v2 JSON output. Alias values are redacted from output. | Pass |
| SSH alias-only resolution | `SshConfigAliasResolver` accepts exact `Host` entries from bounded config includes and rejects wildcard or negated targets. Resolved hosts, users, passwords, tokens, and key paths are never persisted. | Pass |
| Reusable typed probe contract | `ReadOnlyProbeTransport`, `SshAliasResolver`, and `ConnectionStateRepository` are independent of CLI formatting and terminal state. | Pass |
| No arbitrary shell execution | The probe kind union contains only handshake, host inventory, and peer snapshot. The SSH adapter maps each to a constant, invokes `ssh` directly, and has no user-command input. | Pass |
| Bounded and sanitized transport behavior | Batch authentication, connection and total timeouts, output caps, typed outcomes, and sanitized errors are covered by fake and real child-process adapter tests. | Pass |
| Deterministic transport scenarios | Success, authentication failure, timeout, unreachable, malformed, unsupported, and partial-authority scenarios are covered. | Pass |
| Non-mutating host discovery | Strict Teleno manifests cover flavor, network, chain identity, supervisor, runtime, data-directory reference, ports, functions, endpoints, artifact, identity presence, and capabilities. | Pass |
| Flavor adapter boundary | Teleno interpretation is isolated in the functional core. Unsupported runtime flavors and malformed or unsafe manifests return typed unavailable errors. | Pass |
| Peer discovery safety | Peer evidence drops raw identities and addresses. It is ephemeral by default and `--save` persists evidence only; inventory remains unchanged. | Pass |
| Persisted discovery evidence | Host and peer records include source references, provenance, capture time, expiry, status, sanitized findings, detail, listing, and dismissal. | Pass |
| Adoption inspection and planning | Fresh host evidence creates an immutable digest review bound to discovery, inventory revision, connection-state revision, node proposal, and expiry. | Pass |
| Evidence-based authority | Reachability alone grants nothing. Full management requires complete identity, runtime, and explicit capability evidence. Producer and wallet authority are always false. | Pass |
| Provenance and stable state | Adopted records retain stable IDs and adoption provenance while declared, desired, observed, and verified layers remain separate. | Pass |
| Explicit review and inventory-only application | Exact review ID and digest confirmation are required. Stale evidence or revisions block application. Only the inventory repository is written. | Pass |
| Managed and limited outcomes | Complete evidence creates `managed-adopted`; incomplete authority creates `connected-limited` with no desired-state control. | Pass |
| No active-node context | Every connection, discovery, node, and review target is explicit in batch and interactive commands. | Pass |
| Batch and interactive parity | Both adapters use the same registry, executor, handlers, core ports, repositories, schema v2 output, and errors. Dynamic nested completion covers node, connection, discovery, and adoption IDs. | Pass |
| Existing safety contracts | Typed errors, stable exit codes, build identity, sanitization, atomic persistence, revision conflicts, backups, corruption handling, and Phase 0-2 regressions remain green. | Pass |
| Doctor diagnostics | Default doctor checks connection storage, discovery records, inventory references, and exact aliases without remote contact. `--check-connections` is required for bounded remote handshakes. | Pass |
| Documentation and status | Help, README, changelog, architecture, active plan, Phase 3 plan, and this audit describe actual behavior and the pending live gate. | Pass |
| Approved disposable live target | No separately approved disposable target was available. | Pending |

## Persistence, Failure, And Recovery Evidence

The repository and workflow suites prove:

- connection metadata survives independent CLI process restarts;
- failed replacement before rename leaves the prior revision readable;
- stale revisions cannot overwrite newer connection or discovery state;
- schema `0` is backed up and migrated to schema `1` exactly once;
- unsafe or corrupt state is removed from service and produces only sanitized
  hash, length, reason, and timestamp evidence;
- explicit recovery selects a valid backup without silently accepting corrupt
  records;
- connection removal is blocked while inventory or discovery evidence still
  references it;
- failed connection probes retain only typed outcome, timestamp, and duration;
- stale discoveries, changed revisions, and incorrect adoption digests block
  inventory application;
- repeated adoption application reconciles an already-written identical record
  without duplicate inventory state.

## Scope Audit

No Phase 4 or later behavior was introduced. Phase 3 does not implement:

- continuous or real health polling, logs, diagnostics bundles, or support
  bundles;
- arbitrary local or remote shell execution;
- installation, configuration mutation, start, stop, restart, or lifecycle
  execution;
- durable lifecycle plans, executions, progress streams, or receipts;
- backup, restore, upgrade, rollback, rollout, or artifact acquisition;
- wallet access, producer activation or control, VHP operations, signing,
  transaction submission, or mainnet mutation.

The adoption review is deliberately scoped to one local inventory metadata
write and is not the Phase 5 lifecycle plan or execution system.

## Verification Gate

The final `npm run verify` gate passed on 2026-07-12:

- strict TypeScript checking passed;
- 127 source tests across 31 suites passed, including Phase 3 unit, schema, repository, migration,
  transport, timeout, sanitization, invalid-input, structured-output,
  interactive-parity, and restart-persistence coverage;
- compiled CLI smoke passed for nested help, connection persistence and
  redaction, default non-remote doctor behavior, and connection removal;
- `git diff --check` passed.

## Remaining Exit Criterion

To close Phase 3, the user must separately approve a disposable testnet target
whose SSH alias and versioned read-only manifests are prepared for inspection.
The validation must record that adoption produced either `managed-adopted` or
`connected-limited`, and must independently confirm that no runtime process,
configuration, data, or network role changed. Until then, the live criterion
remains pending and Phase 3 is not represented as fully complete.
