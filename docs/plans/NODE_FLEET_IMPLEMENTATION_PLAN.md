# Node Fleet Implementation Plan

- Status: planned; implementation and validation remain phase-specific
- Last updated: 2026-07-10
- Initial repository: `pgarciagon/koinos-node-manager`
- Strategy source: `NODE_FLEET_STRATEGY.md`
- Native runtime owner: `koinos/teleno`; integration must use released,
  versioned artifacts and contracts

## 1. Objective

Implement the Node Fleet Strategy as a staged evolution from the current
remote-node MVP into one fleet system for local and remote Koinos nodes. An
operator must be able to inventory, install, restore, run, monitor, upgrade,
roll back, back up, and recover multiple nodes through the same lifecycle
model. Validated observers can later become independent testnet producers;
mainnet producer mutation remains separately approved.

The architecture preserves three independent axes:

- **flavor**: what implementation runs;
- **location**: local process or remote host;
- **supervisor**: foreground, launchd, systemd, or Docker.

Supported combinations must not become architectural assumptions. “Remote”
must not implicitly mean Docker, and “local” must not implicitly mean one
foreground Teleno process.

## 2. Scope And Boundaries

Included:

- versioned fleet inventory and migration of current remote-node records;
- first-class flavor, location, supervisor, artifact, instance, and role data;
- a common lifecycle contract and deterministic plan representation;
- multiple local Teleno instances with isolated data, ports, logs, and state;
- remote SSH execution through the existing sanitized executor;
- fleet status and sequential mutating rollouts;
- durable Electron-main orchestration with interruption recovery;
- digest-pinned install, upgrade, rollback, and artifact history;
- normalized health, restore progress, receipts, and stop criteria;
- prodnet observer canaries and later sequential observer expansion;
- independent producer identities, funding plans, and VHP simulation on
  testnet;
- localization, packaging, tests, documentation, and release evidence.

Excluded from the committed roadmap:

- managed hosting, billing, fiat on-ramps, and payment providers;
- embedded EVM wallets, in-app swaps, and swap/bridge/burn automation;
- provider APIs as a core dependency;
- shared active producer keys or arbitrary remote shell access;
- a persistent remote agent as the first transport;
- Fogata pools before Layer 3 and a contract security review;
- mainnet producer mutation without fresh explicit approval.

## 3. Current Baseline

This plan starts from working components currently located in Koinos One and
scheduled for deliberate extraction:

- `src/app/remote-nodes.ts`: inventory types, normalization, notices,
  deterministic plans, provider import, and rollout planning;
- `src/app/remote-node-execution.ts`: renderer execution state;
- `electron/lib/remote-node-service.ts`: confirmation gates, SSH execution,
  sanitization, health parsing, progress, stop behavior, and receipts;
- `electron/lib/teleno-storage.ts`: local-only inventory and receipt storage;
- Electron IPC/preload handlers and `RemoteNodesPanel.tsx`;
- tests for plan generation, gates, execution, health, redaction, receipts, and
  UI behavior.

Phase 0 must verify these claims in a current-state gap matrix before broad
refactoring. Strategy statements that differ from behavior must be corrected or
recorded as remaining work.

## 4. Safety Invariants

1. Every installed or restored node starts as an observer.
2. Mainnet mutations never run from startup, presets, refresh, or implicit
   fleet approval.
3. Plans name node, network, role, flavor, supervisor, artifact, data location,
   and expected safety state.
4. Mutations run one node at a time and stop on failed, blocked, or unsafe
   evidence.
5. Fleet review never replaces exact per-node confirmation.
6. State databases are preserved on merkle mismatch, restore/digest/rollback
   failure, unknown identity, or interruption.
7. JSON-RPC and admin/backup APIs bind to loopback by default; public admin
   exposure is a hard stop.
8. Active producers have independent identities, data folders, ports, and VHP.
9. Inventory, events, receipts, exports, screenshots, and docs contain no raw
   host, SSH, token, wallet, key, or protected-address data.
10. Artifact identity is immutable inside an approved plan; changes invalidate
    approval.
11. Mutating plans are short-lived and bound to current inventory revision and
    observed state.
12. Failed or ambiguous transactions are never resubmitted automatically.

## 5. Target Domain Model

### Fleet inventory

```text
FleetInventory
  schemaVersion / revision / nodes[] / policies / timestamps

FleetNode
  id / displayName
  flavor { id, version, capabilities }
  location { kind, connectionRef? }
  supervisor { kind, serviceName? }
  network { kind, chainId, rpcPolicy }
  role { desired, observed }
  instance { baseDirRef, ports, logRef }
  artifact { source, version, digest, signatureRef, checksum }
  backupPolicy / producerProfileRef? / desiredState
  observedSnapshot? / trustEvidence / labels
```

`connectionRef`, `baseDirRef`, and secret references are opaque local IDs.
Desired and observed state stay separate. IDs remain stable across display-name
or host changes. Migrations are pure, sequential, idempotent, fixture-tested,
previewed before persistence, and keep a rollback copy.

### Runtime capabilities

Adapters declare support for install, configure, start/stop/restart, health,
logs, public restore, private backup/restore, upgrade/verify/rollback, artifact
identity, and producer inspection/enablement. Unsupported combinations return a
typed reason, never empty commands or best-effort behavior.

### Lifecycle plan

```text
LifecyclePlan
  id / schemaVersion / digest / expiresAt
  action / nodeId / inventoryRevision
  expectedBefore / desiredAfter / artifactEvidence
  steps[] / confirmationPolicy / rollbackPlan? / stopCriteria[]

LifecycleStep
  id / phase / capability
  mutability / destructive / cancellability
  sanitizedSummary / adapterPayload
  preconditions / postconditions / timeout / retryPolicy
```

The planner emits adapter-neutral intent. Local and SSH executors translate the
payload; the renderer never builds executable shell commands.

### Durable execution

Persist execution before mutation: plan digest, inventory revision, node,
action, state, current step, sanitized progress, pre/post health and artifact
evidence, rollback availability, confirmations, and app/native build identity.
After Electron restart, mark work interrupted, inspect reality, and offer a
deterministic resume/verify/stop choice. Never repeat an ambiguous step until
idempotency or observed state proves retry is safe.

## 6. Module Boundaries

Create a pure fleet domain layer for schemas, migrations, conflicts,
capabilities, plans, rollout reducers, health policy, and sanitized display
models. It must have no React, Electron, filesystem, SSH, subprocess, or network
dependency.

Create focused Electron services:

- inventory: atomic storage, migrations, and revision checks;
- planning: adapter selection and immutable plans;
- execution: queue, stop-after-current, resume, cancel, events, receipts;
- health: bounded read-only polling and snapshots;
- artifacts: manifests, digest/signature verification, cache, history;
- local executor: foreground and launchd lifecycle;
- SSH executor: adapt the existing remote service;
- producer fleet: later identity, funding, and transaction state machines.

Finalize the proposed flavor/location/supervisor ADR before merging the runtime
abstraction. Native behavior changes belong in `koinos/teleno` and arrive via a
versioned submodule bump, not copied Electron code.

IPC methods must be narrow and typed: inventory CRUD/migration preview, status,
plan/review/invalidate, confirm/start/cancel/resume, receipts, artifacts, and
later producer readiness/simulation. Electron validates unknown fields, plan
digest, revision, and confirmation again and sanitizes all responses/events.

## 7. Workstreams

### A. Inventory migration and fleet view

1. Freeze valid, malformed, and edge-case v1 fixtures.
2. Implement v2 schema, migration preview, atomic write, rollback copy, and
   bounded history.
3. Add flavor, location, supervisor, artifact, instance, desired/observed role,
   and opaque references.
4. Detect duplicate IDs, basedirs, ports, services, and producer identities
   across the whole fleet.
5. Preserve current remote workflows through a compatibility façade.
6. Add filters and fleet summaries without hiding degraded/unsafe nodes.

Exit: valid records migrate without losing trust evidence; ambiguous records
are quarantined rather than guessed; rollback works before node mutation.

### B. Runtime and artifact foundation

Implement the Teleno adapter first. It validates configuration, layout, ports,
build identity, app/runtime compatibility, supervisors, health, and restore
progress. Local native artifacts use release version, Git identity, and SHA-256;
remote containers use immutable digests.

Artifact manifests include platform, architecture, digest/checksum, signature,
minimum app version, config/database compatibility, and rollback metadata.
Cache by digest, retain current and previous verified artifacts/configs, and
block before stopping a healthy node on any mismatch.

Exit: local and SSH paths express equivalent lifecycle intent; tampering or an
unsupported combination fails before mutation; receipts match installed build.

### C. Local multi-instance runtime

Each instance gets a stable ID, basedir, ports, logs, supervisor identity,
backup policy, network/chain identity, observer role, artifact pin, and receipts.
Port allocation checks inventory, listeners, reservations, and existing config.

Delivery order:

1. foreground adapter for deterministic tests;
2. packaged macOS launchd adapter;
3. existing remote Docker through the common contract;
4. remote systemd after Layer 2 Docker validation.

Creation inspects storage/conflicts, stages runtime and optional restore,
validates before activation, starts observer, then verifies PID, ports, chain,
producer-disabled state, peers, and advancing head.

Exit: two local testnet observers plus one remote observer coexist with no
shared ports/data/logs/process identity; independent lifecycle actions survive
app restart; deletion of inventory never deletes data implicitly.

### D. Unified health and verification

Normalize planned, needs-server, installing, restoring, starting, syncing,
healthy, degraded, stalled, unsafe, stopping, stopped, failed, and unknown.
Evidence includes freshness, supervisor/RPC, chain ID, head/time/progress,
peers/seeds, components, disk, role, artifact, exposure, backups, and severe
logs. Stale evidence is never healthy; postconditions, not process exit code,
determine success.

Hard stops: wrong chain, merkle/RocksDB failure, unexpected producer, public
admin exposure, disk floor, stalled head, artifact/signature mismatch, duplicate
producer identity, revision/confirmation mismatch, or repeating severe logs.

### E. Durable rollout orchestration

Move rollout ownership from React into Electron main with persisted states:

`draft -> reviewed -> queued -> preflighting -> executing -> verifying ->
succeeded | blocked | failed | interrupted | cancelled`

Snapshot inventory, order canaries, require fleet and per-node reviews, execute
one mutation at a time, persist every transition, support stop-after-current,
cancel only cancellable steps, and reconcile after restart. Inventory edits
invalidate plans. Export sanitized reports.

Exit: renderer closure does not interrupt or duplicate work; forced failure
skips later nodes; restart is safely reconciled; every receipt identifies exact
artifact, pre/post evidence, and DB preservation.

### F. Upgrade, rollback, and recovery

Sequence: refresh health; verify current and target identity/compatibility;
capture rollback artifact/config; create backup when policy requires; stop only
the target; install without deleting prior state; start observer; verify; commit
or roll back.

Canary order: testnet observer, testnet observers, later testnet producers,
prodnet observer canary, prodnet observers. Prodnet producers stay excluded.
Missing rollback evidence blocks upgrade. Failed rollback preserves state and
leaves the node stopped/unsafe. Cleanup is a distinct destructive plan.

Exit: an injected failure in a two-node testnet upgrade restores the canary and
leaves node two untouched; prodnet observer canary catches up without manual
SSH and passes its observation window.

### G. Restore and backup

Parse native JSON into phases, bytes/files, speed, ETA, freshness, integrity,
activation, catch-up, and health. Use one model locally/remotely. Cancellation
is phase-specific. Receipts record source policy, metadata/signature, digest,
destination, preservation, and validation. Enforce signed prodnet metadata when
available. Prevent concurrent restore/backup/upgrade/start per node. Download
completion alone is not restore success.

### H. Prodnet observer fleet

Require digest/signature evidence, reviewed bootstrap policy and prior proof,
loopback admin/RPC, disk validation, preserved-data/rollback evidence,
`OBSERVER_ONLY`, equivalent testnet evidence, and no producer/key reuse. Start
with one canary; review catch-up, peers, disk, exposure, logs, backup, identity,
and observation window before each sequential expansion. Never promote during
install, restore, upgrade, or rollout.

### I. Producer identity and funding — testnet first

Each profile binds network/chain, control address, vault reference, active hot
key, node instance, registration evidence, KOIN/Mana/VHP/activity snapshot, and
standby/rotation state. Cross-fleet duplicates block activation.

Resumable flow:

`plan -> identity -> fund -> burn -> register -> restore/sync -> validate ->
enable -> monitor`

Each transaction preview names network, signer, payer, source, target, amount,
Mana impact, operation, expiry, and postcondition. Confirmation binds to its
digest. Ambiguity triggers chain inspection before retry.

Funding priority: an explicitly connected user-owned Koinos wallet, manual external funding with
balance watcher, verified free-Mana support, and only later a separately
designed sponsor path. Non-KOIN funding stays guide-only.

The VHP simulator supports equal/weighted/manual targets, concentration
warnings, reserves, rounding, deltas, export, and deterministic plans. Mainnet
is read-only; testnet execution is confirmed per transaction.

Exit: a fresh testnet flow produces with every mutation verified; one local and
one remote producer use independent identities; interruption does not duplicate
transactions; simulator matches chain state; disable returns one producer to
observer; mainnet execution is impossible.

## 8. UI, Copy, And Accessibility

Fleet overview shows counts plus prominent unsafe/degraded nodes. Node rows show
network, role, location, flavor, supervisor, artifact, health, head freshness,
peers, disk, and active operation. Details use Overview, Lifecycle, Health,
Backups, Logs, Receipts, and Producer sections. Rollout review exposes order,
canary, plan differences, confirmations, progress, stop-after-current, and
evidence. Preserve simple and expert modes.

Follow the first-run assistant palette and existing operational density. Avoid
marketing cards and oversized copy. Use parent padding/gap, verify no accidental
horizontal overflow, balance bordered spacing, and never encode status by color
alone. All visible copy must use the application's English and Spanish catalog with
consistent terminology and safety meaning.

## 9. Test Matrix

### Unit

- migrations/corruption, schemas, opaque references, all conflict classes;
- capability combinations, deterministic plans/digests/expiry;
- confirmation/revision invalidation and rollout reducers;
- manifests, signatures, compatibility, health/freshness/stop criteria;
- restore progress monotonicity, VHP allocation/rounding/concentration;
- transaction ambiguity/duplicate prevention and redaction of every payload.

### Electron integration

- malformed IPC rejection and no renderer command/secret access;
- atomic revision-checked storage;
- local/SSH lifecycle parity;
- renderer close and Electron restart behavior;
- cancellability, postcondition failures, receipts, concurrency locks;
- bounded parallel read-only health without parallel mutations.

### Component and packaged

- migration preview, invalid/empty/large fleets, filters, stale status;
- simple/expert safety, rollout failure/stop/resume/receipts;
- producer recovery, keyboard/focus/screen reader, reduced motion;
- EN/ES parity, long copy, expected window sizes, overflow checks;
- clean packaged macOS instance and exact build identity.

### Live testnet

- two local plus one remote observer;
- foreground, launchd, Docker, then systemd;
- lifecycle, backup, successful upgrade, injected rollback failure;
- renderer/Electron interruption at every rollout phase;
- offline/auth/no-peers/stall/low-disk/occupied-port/wrong-chain/digest/public-
  exposure/merkle cases;
- independent local/remote producers and fund/burn/register/enable/disable;
- sanitized receipt and screenshot review.

Prodnet evidence remains a separately approved observer canary with no producer
configuration, no public admin exposure, exact artifact/bootstrap identity,
catch-up/peer/disk/log/backup observation, and state-preserving rollback proof.

## 10. Delivery Phases And PR Sequence

### Phase 0 — Baseline and decisions

1. Current implementation/strategy gap matrix.
2. Finalize ADR 0001 for flavor/location/supervisor and packaging.
3. Inventory v2/migration ADR.
4. Lifecycle plan/execution/receipt ADR.
5. Health/rollout policy ADR and threat model.

Exit: decisions and validation matrix approved before broad refactoring.

### Phase 1 — Fleet domain and compatibility

1. Schemas, migrations, fixtures, validation.
2. Revisioned atomic storage.
3. Compatibility façade for current remote workflows.
4. Read-only fleet list/detail, localization, docs, packaged regression.

Exit: existing users migrate without losing remote functionality.

### Phase 2 — Runtime adapter and local instances

1. Capability contract and Teleno adapter.
2. Artifact verification/history.
3. port/basedir/service allocation.
4. Foreground executor, then packaged launchd.
5. Two-local-plus-one-remote validation.

Exit: Layer 1 strategy criterion passes.

### Phase 3 — Orchestration and health

1. Shared lifecycle/execution schemas.
2. Electron queue and persisted state machine.
3. SSH adaptation and unified health/postconditions.
4. UI progress, stop-after-current, resume, receipts.
5. Full interruption/fault matrix.

Exit: renderer-independent sequential rollouts resume safely.

### Phase 4 — Operations hardening

1. Artifact/config history and compatibility-gated upgrade/rollback.
2. Structured restore progress and richer receipts.
3. Signature enforcement when inputs exist.
4. Forced testnet canary failure.
5. Explicit prodnet observer canary and report.

Exit: Layer 2 evidence exists; wider prodnet observers require canary review.

### Phase 5 — Testnet producer fleet

1. Network-scoped profile migration and duplicates.
2. Read-only readiness and chain queries.
3. Funding planner and transaction plan service.
4. Burn/register resumable flow.
5. enable/monitor/disable and standby rules.
6. VHP simulator/execution and two-producer live test.

Exit: Layer 3 passes; mainnet remains read-only.

### Phase 6 — Mainnet decision gate

1. Mainnet inventory/readiness/simulation only.
2. Independent security review.
3. Preview-only dry runs.
4. Review all Layer 2/3 evidence and human approval policy.
5. Obtain separate explicit authorization before any mainnet producer mutation.

There is no automatic transition to mainnet execution.

## 11. Release, Documentation, And Evidence

Temporary flags may control inventory v2, local instances, Electron rollouts,
systemd, prodnet observer batches, producer readiness, and testnet transactions.
`fleetProducerTransactionsMainnet` remains off until separate approval. Flags
control availability, never authorization; disabling one must not block safe
stop, backup, restore, export, or recovery.

Establish independent SemVer and changelog files before implementation begins.
Every user-facing PR updates the Node Manager changelog and documentation, adds
EN/ES copy, and records sanitized evidence with app/native/artifact identity. A
release requires docs, tests, package build, packaged validation, dated notes,
tag, and matching artifacts.

Never commit live inventory, targets, users, hosts, wallets, producer addresses,
tokens, or unsanitized receipts/screenshots. Move implemented durable behavior
to `docs/current/`; archive superseded details rather than duplicating plans.

## 12. Definition Of Done

A layer is complete only when:

- models/migrations and all safety gates are versioned and tested;
- success, failure, interruption, cancellation, resume, rollback, and downgrade
  are verified;
- local and remote paths meet the same lifecycle contract;
- UI is accessible, localized, visually inspected, and overflow-free;
- packaged validation and appropriate live evidence pass;
- receipts prove artifact, preconditions, postconditions, and DB preservation;
- manuals/current status and both changelogs match behavior;
- no critical/high safety or security issue remains;
- mainnet authority has not expanded implicitly.

The strategy is complete when Layers 1–3 pass, Layer 2 has approved prodnet
observer evidence, and the project separately decides Layer 4. Conditional
Fogata/provider/EVM explorations are not part of this definition.

## 13. Immediate Next Actions

1. Produce the Phase 0 gap matrix with file and test evidence.
2. Add and approve the ADR referenced by the strategy.
3. Decide runtime packaging and CLI ownership.
4. Freeze inventory v1 fixtures and design v2 migration.
5. Define lifecycle plan, execution, receipt, and health schemas.
6. Prepare disposable local/remote testnet validation targets.
7. Implement Phase 1 through compatibility-preserving PRs.
8. Re-estimate later phases from measured Phase 2 cost rather than speculative
   calendar dates.
