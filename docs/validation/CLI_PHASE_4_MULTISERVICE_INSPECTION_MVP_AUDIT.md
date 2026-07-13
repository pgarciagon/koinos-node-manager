# CLI Phase 4 Read-Only Multiservice Inspection MVP Audit

- Date: 2026-07-13
- Product version: `0.1.0-dev.0`
- Deterministic implementation: complete
- Approved live validation: passed
- Scope: one GUI-ready, read-only inspection vertical for existing legacy
  multiservice inventory nodes, plus Teleno contract compatibility

## 1. Result

The deterministic Phase 4 implementation is complete. Batch CLI, interactive
CLI, the versioned application API, both runtime adapters, the public DTO
boundary, fixed probe catalog, deterministic fixtures, and compiled CLI use the
same functional-core contract.

A separately approved existing legacy prodnet multiservice target passed the
strictly read-only live audit. The private target identity remains local and is
not recorded here. Pre/post evidence matched exactly for configuration digest,
the fixed primary and secondary component catalog, component state, restart
count, and start time. Inventory and connection revisions remained unchanged,
no inspection evidence was persisted, and no runtime or blockchain mutation
surface was invoked.

## 2. Requirement Audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| Versioned UI-neutral snapshot | Passed | `src/domain/inspection.ts` defines schema `1`, contract `1.0.0`, and the complete `NodeInspectionSnapshot`. |
| Typed capabilities and evidence states | Passed | `RuntimeInspectionCapabilities` and `InspectionValue<T>` distinguish `available`, `unavailable`, and `unknown`, with typed reasons. |
| Provenance, time, freshness, authority, and warnings | Passed | Every evidence value carries source, observation time, freshness, and authority; the snapshot carries capture time, aggregate freshness, evidence, and typed warnings. |
| Sanitized public DTO | Passed | `src/core/sanitize-inspection.ts` validates the complete closed schema, rejects undeclared or forbidden private fields and secret/path patterns, then clones the DTO. |
| Reusable runtime adapter contract | Passed | `src/core/runtime-inspection-adapter.ts` has no CLI, Electron, SSH, Docker, JSON-RPC, or flavor implementation dependency. |
| Legacy multiservice adapter | Passed deterministically | `src/adapters/inspection/legacy-multiservice-inspection-adapter.ts` normalizes fixed Docker, restricted configuration, JSON-RPC, and storage evidence. |
| Opaque connection and exact SSH alias | Passed | `src/core/inspect-node.ts` resolves `connection:<id>`, requires observe authority, verifies the exact configured alias, and passes the private record only to the transport boundary. |
| No arbitrary command execution | Passed | Probe kinds are a closed TypeScript union; the SSH adapter selects constant argument vectors and rejects unknown kinds before invoking SSH. |
| CLI command and sections | Passed | `nodes inspect <node-id>` supports overview, components, chain, governance, table, JSON, and bounded timeout options from the shared registry. |
| Batch and interactive parity | Passed | Both modes invoke the same registry handler and application API; help and completion come from registry metadata. |
| Human/JSON fact parity | Passed | Both render the same sanitized snapshot; JSON uses envelope schema `2` and embeds inspection schema `1`. |
| No observation persistence | Passed | The application response declares `runtimeChanged: false` and `persisted: false`; restart tests prove inventory and connection revisions do not change. |
| Teleno compatibility | Passed for current status surface | `TelenoInspectionAdapter` maps versioned `node.get_status` evidence into the same snapshot and reports absent capabilities explicitly. |
| GUI-ready application boundary | Passed | `NodeInspectionApi` version `1.0.0` returns the public DTO directly and has no CLI or renderer dependency. |
| Live no-mutation validation | Passed | A separately approved existing target returned equivalent batch/interactive snapshots; exact sanitized pre/post configuration and component evidence matched. |
| Broader fleet scope remains frozen | Passed | No discovery/adoption expansion, polling, logs, lifecycle, backup, upgrade, wallet, producer mutation, transaction, or mainnet behavior was added. |

## 3. Snapshot Coverage

### Legacy multiservice adapter

| Area | Current evidence |
| --- | --- |
| Overview | Runtime flavor/version, instance presence, expected network and queried chain identity, build/image identity, Docker supervisor, legacy-services layout, component-derived uptime, and snapshot capture/freshness. |
| Components | The fixed known Koinos service catalog, including a normalized secondary producer component, explicit availability, typed running state, restart count, sanitized version/digest, and uptime where Docker exposes a valid start time. Missing components remain `not-configured`. |
| Chain | Head height/ID, last irreversible block, head age, recently advancing/stalled/unknown progress, chain/block-store agreement, fork-head evidence, and P2P gossip availability. Peer count remains unavailable. Head evidence older than the bounded 300-second threshold is marked stale. |
| APIs | Deduplicated JSON-RPC, gRPC, REST, and administrative component availability with local/private/public/unknown exposure classification; addresses and ports are never returned. Public administrative exposure produces an unsafe warning. The live target produced the warning for public JSON-RPC without exposing its binding. |
| Producer | Primary or normalized secondary block-producer component presence, effective running state, an independently parsed address-presence boolean, and configured production percentage. Recent production counters remain unavailable. |
| Governance | Configured proposal IDs are available when safely parsed. Effective loaded proposal IDs, recent block-header votes, and network-wide status/tally remain separate and unavailable. |
| Resources | Filesystem total/used/free byte aggregates when the fixed probe succeeds. CPU and memory remain unavailable. |

Complete, partial-capability, stale/stalled, unsupported, unreachable, timeout,
authentication-failure, malformed, chain-mismatch, block-store-mismatch,
component-failure, and governance-unavailable evidence paths are deterministic.
Partial evidence remains usable; a total transport failure returns a typed error
with stable transport exit code `40`.

The live run also found and closed three compatibility defects before the exit
was accepted: padded base64url chain identities were initially rejected, a
newer concurrent block-store sample could create a false mismatch, and a fixed
secondary producer service was not included in effective producer state.

### Teleno adapter

Teleno's current versioned `node.get_status` surface provides runtime version,
embedded service availability, head height, and last irreversible block. The
adapter maps these facts without exposing the runtime instance name. Network
identity, supervisor, uptime, head age/trend, block-store agreement, forks, P2P
gossip/peer count, API binding classification, producer evidence, governance,
and resources remain explicitly unavailable or unknown.

## 4. Runtime API Gap Proposals

No cross-repository runtime change was made. If live evidence confirms these
facts are important, the smallest compatible additions are:

1. Legacy multiservice P2P: a versioned aggregate read-only method returning a
   peer count and gossip availability, without peer IDs or addresses.
2. Legacy block producer: a versioned read-only status method returning
   configured/effective enabled booleans, producer-address presence, production
   counters and window, configured/effective proposal IDs, and no key or
   address value.
3. Governance: a bounded versioned query returning public proposal ID, status,
   tally, and threshold only. Recent header votes may be derived by a bounded
   core query if the live audit proves that existing block queries are safe and
   stable enough; they must not be inferred from configuration.
4. Teleno: extend `node.get_status` compatibly, or add a versioned
   `node.get_inspection_status`, with sanitized network/chain identity, head
   time/progress, P2P aggregate, API exposure classification, producer status
   and counters, effective proposal IDs, and optional aggregate resources.

All additions belong in their owning runtime repository and must return narrow
data, not commands, raw configuration, paths, endpoints, peer identities,
producer addresses, keys, or secrets.

## 5. Deterministic Validation

The aggregate gate covers:

- pure schema, evidence precedence, freshness, availability, and sanitization
  tests;
- a shared adapter contract suite used by both runtime adapters;
- multiservice and Teleno adapter fixtures and typed failure mapping;
- probe allowlist tests proving unknown command-like probe kinds are rejected
  before SSH execution;
- CLI human, schema-versioned JSON, invalid input, typed error, stable exit
  code, interactive completion/handler parity, restart, and no-persistence
  tests; and
- built executable inspection smoke tests with a deterministic fake SSH
  transport.

Final result on the completed worktree:

- `npm run check`: passed;
- source tests: 150 passed, 0 failed, across 37 suites; and
- compiled CLI smoke validation: passed, including human and JSON inspection.

The aggregate `npm run verify` gate passed.

## 6. Live Validation Evidence

The user separately and explicitly authorized a strictly read-only inspection
of an existing private prodnet target after its role was disclosed. The run
used an isolated temporary `KNM_HOME`; no private connection data entered the
normal inventory or this report.

Sanitized evidence:

1. The pre-capture contained 13 fixed primary/secondary component facts plus a
   configuration digest.
2. Complete human and schema-versioned JSON inspection succeeded. Human and
   JSON output for overview, components, chain, and governance also succeeded
   independently.
3. The interactive prompt executed the same registered components command and
   returned the normalized secondary producer without its runtime-specific
   service name.
4. The snapshot was fresh: all 13 components were present, none failed, chain
   progress was advancing, chain/block-store evidence agreed, and P2P gossip
   was available.
5. Producer configuration, effective running state, and address presence were
   independently available. No producer address value was returned.
6. Configured proposal IDs were available; effective proposal IDs, recent
   header votes, network-wide proposal status/tally, peer count, CPU, memory,
   and recent production remained explicitly unavailable.
7. Public JSON-RPC exposure generated
   `INSPECTION_PUBLIC_ADMIN_EXPOSURE`; no endpoint address or port crossed the
   public boundary.
8. Post-capture matched the pre-capture exactly for configuration digest,
   component count, state, restart count, and start time.
9. Isolated inventory and connection revisions remained `1`; one record of
   each type remained, and no inspection evidence was persisted.
10. All application responses declared `readOnly: true`,
    `runtimeChanged: false`, and `persisted: false`. No wallet, transaction,
    lifecycle, configuration-write, or producer-control method was invoked.

Validated build identity: product `0.1.0-dev.0`, CLI interface `1`, core
`0.1.0-dev.0`, development channel, Git commit
`68de9620a044846b97e2e05252fd4ad620a4dcc5`, source state `dirty`, build
timestamp `2026-07-13T17:33:03.570Z`.

## 7. Scope Audit

The implementation added no periodic scheduler, health repository, background
polling, active-node context, arbitrary shell, persisted inspection evidence,
runtime mutation, discovery/adoption expansion, logs, diagnostics bundle,
lifecycle plan/execution, installation, configuration change, start/stop/
restart, backup/restore, upgrade, rollout, wallet, producer activation, VHP,
transaction submission, or mainnet mutation. The future renderer remains a
thin consumer of `NodeInspectionApi`; no broad desktop application was built.
