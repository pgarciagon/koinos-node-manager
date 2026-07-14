# CLI Implementation Plan

- Status: active
- Last updated: 2026-07-14
- Product version: `0.1.0-dev.0`
- Current implementation: Phases 0, 1, 1.5, 2, focused Phase 4 inspection, and
  deterministic Phase 4.5 two-mode onboarding are complete; Phase 3 live
  adoption, onboarding live validation, and a production agent artifact remain
  separately pending
- Current delivery target: preserve the completed onboarding slice while the
  broader monitoring/lifecycle scope remains frozen
- Delivery principle: CLI first, shared functional core, Electron as a peer
  adapter
- Intermediate interactive shell: `INTERACTIVE_CLI_IMPLEMENTATION_PLAN.md`
- Two-mode onboarding MVP: `NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`

## 1. Objective

Build an advanced command-line interface that can develop, test, automate, and
prove the complete Koinos Node Manager functional model before equivalent
desktop workflows are added. The CLI is a product interface over the shared
core, not the core itself and not a subprocess API for Electron.

The implemented inspection journey is intentionally narrow:

```text
initialize and diagnose
  -> inventory nodes
  -> reference an existing SSH connection
  -> inspect one existing multiservice node
  -> compare overview, components, chain, and governance evidence
  -> consume the same snapshot from a future desktop dashboard
```

The implemented Phase 4.5 journey adds Quick endpoint onboarding and Full
read-only-agent pairing before inspection. The broader journey through health
monitoring, logs, plans, execution, receipts, lifecycle, backups, and upgrades
remains in the roadmap, but is not the current implementation target. Producer
mutation, VHP movement, Fogata, cloud provisioning, and any general-purpose or
mutation-capable node agent remain outside this MVP.

## Implementation Progress

Implemented on `codex/cli-list-nodes`:

- compositional node domain model with declared, desired, observed, and
  verified state plus a repository port;
- deterministic simulation adapter;
- central CLI dispatcher and application context;
- typed application errors and centralized exit-code mapping;
- human and versioned JSON envelopes;
- `knm nodes list` with management, origin, flavor, network, location,
  authority, function, health, and staleness filters;
- `knm nodes show <node-id>` with all/summary/declared/desired/observed/verified
  sections;
- `knm simulation scenarios`;
- explicit `--simulation default|empty|mixed-health|stale-health` selection;
- typed registry with independently registered commands;
- top-level, resource-specific, and command-specific help;
- `knm version` with embedded product, interface, core, Git, channel,
  timestamp, and source-state identity;
- centralized documented exit-code constants and contract tests;
- schema v2 structured envelopes for the explicit node state model;
- shared batch/interactive command executor;
- `knm interactive` with deterministic tokenization, metacommands,
  registry-driven completion, sanitized history, and terminal lifecycle
  handling;
- platform-aware local storage paths and the `KNM_HOME` portable override;
- versioned, private, revision-checked, atomic filesystem inventory with a
  writer lock and bounded backups;
- backup-before-migration, sanitized corruption quarantine evidence, and
  explicit backup recovery;
- `knm nodes add`, `nodes update`, and exact-confirmation inventory-only
  `nodes remove`;
- `knm paths` and local `knm doctor` integrity, permission, backup, quarantine,
  and recoverability checks;
- persisted inventory parity in batch and interactive modes, including dynamic
  node-ID completion and explicit switching between local and simulation data;
- versioned private atomic connection, discovery, and adoption-review storage;
- exact SSH-config alias references and bounded allowlisted read-only probes;
- `connections list`, `show`, `add ssh`, `test`, and confirmation-bound
  `remove` commands;
- sanitized Teleno host discovery, peer evidence with no implicit inventory
  creation, discovery listing/detail/dismissal, and evidence freshness;
- digest-reviewed inventory-only adoption with evidence-based managed-adopted
  and connected-limited outcomes;
- Phase 3 batch/interactive parity with dynamic connection, discovery, and
  adoption completion;
- `doctor` connection-reference, alias, discovery-storage, recovery, and
  explicit remote-probe checks;
- versioned `NodeInspectionSnapshot`, runtime capabilities, typed evidence,
  availability, freshness, precedence, warnings, and sanitized public DTO;
- `LegacyMultiserviceInspectionAdapter` over fixed bounded Docker,
  restricted-configuration, JSON-RPC, and storage probes;
- `TelenoInspectionAdapter` over the current versioned `node.get_status`
  surface with missing capabilities explicit;
- `knm nodes inspect <node-id>` overview, components, chain, and governance
  sections in human and schema-versioned JSON output;
- versioned `NodeInspectionApi` for direct CLI, Electron-main, and future
  controller use without CLI parsing;
- inspection unit, adapter-contract, deterministic fixture, redaction,
  batch/interactive parity, restart, typed-error, and compiled-CLI tests;
- compiled CLI and unit/end-to-end command tests.
- Quick Connect fixed-RPC endpoint policy, partial inspection, digest-reviewed
  persistence, journal reconciliation, CLI/interactive commands, and compiled
  validation;
- Full Connect protocol and HTTPS client, deterministic fake agent, Ed25519
  identity pinning, inspect-only secret-store credential, revocation,
  Quick-to-Full stable-ID upgrade, and explicit access override;
- thin context-isolated Electron Quick and Full workflows over typed IPC and
  the same `NodeOnboardingApi`, including main-owned clipboard pairing import;
- Electron accessibility and overflow validation, smoke execution, and
  packaged-app validation.

Phase 3 live adoption validation remains pending. Phase 4 live multiservice
inspection passed after separate explicit approval for a strictly read-only
run; matching pre/post evidence proved that no configuration, component, or
producer state changed. Real health, logs, lifecycle plans and execution,
backups, upgrades, producer operations, and managed-runtime mutations remain
planned and frozen.

## 2. Design Decisions

### 2.1 Command grammar

Use plural resource groups and explicit node identifiers:

```text
knm <resource> <command> [identifier] [options]
```

Examples:

```bash
knm nodes list
knm nodes show berlin-observer
knm plans show plan_01
knm receipts list --node berlin-observer
```

Do not introduce a persistent global “active node” context. Read-only shortcuts
may be added later, but every mutation must name its target in the reviewed
plan. This prevents a previous selection from redirecting a later operation.

### 2.2 Queries, inventory changes, and managed-node mutations

Commands belong to three safety classes:

1. **Queries** read inventory or current observed state and execute immediately.
2. **Inventory changes** alter Node Manager metadata, never the managed host.
3. **Managed-node mutations** always create and apply immutable plans.

Removing an inventory record, uninstalling a runtime, and deleting node data
are separate operations with separate safety policies.

### 2.3 Output contracts

Every automation-relevant command supports:

- `--output table` for concise human output;
- `--output json` for a versioned final envelope;
- `--output jsonl` for long-running event streams where applicable.

JSON success envelope:

```json
{
  "schemaVersion": 2,
  "ok": true,
  "command": "nodes.list",
  "query": {},
  "data": {},
  "warnings": [],
  "errors": []
}
```

JSON error envelope:

```json
{
  "schemaVersion": 2,
  "ok": false,
  "command": "nodes.show",
  "data": null,
  "warnings": [],
  "errors": [{
    "code": "NODE_NOT_FOUND",
    "severity": "error",
    "retryable": false,
    "message": "Node \"missing\" was not found.",
    "nextAction": "Run \"knm nodes list\" to inspect available nodes."
  }]
}
```

Human formatting may evolve without changing `schemaVersion`. Breaking
structured-output changes increment it.

### 2.4 Exit codes

Initial stable categories:

| Code | Meaning |
| ---: | --- |
| `0` | Success |
| `2` | Invalid command, option, or input |
| `3` | Requested resource not found |
| `4` | Configuration or local persistence failure |
| `10` | Plan expired or observed state changed |
| `20` | Safety policy blocked the operation |
| `30` | Execution or postcondition failure |
| `40` | Transport unavailable or authentication failed |

Commands return typed errors from the core and map them centrally. Individual
commands must not invent conflicting exit-code meanings.

### 2.5 Simulation safety

Simulation is explicit and visible. Prefer:

```bash
knm --simulation default nodes list
```

over a hidden persistent mode. A future `simulation use` command may store a
development preference, but production-capable commands must display a clear
simulation banner and receipts must identify their simulated source. Simulated
records use sanitized placeholders only.

## 3. Architecture

```text
CLI command adapter
       |
application use cases
       |
domain policies and contracts
       |
repository / transport / clock / secret / artifact ports
       |
simulation, filesystem, SSH, Teleno, and future agent adapters
```

The CLI dispatcher resolves the command, parses adapter-level arguments,
creates an application context, invokes one use case, and renders one typed
result. Business filtering, validation, plan creation, safety gates, and state
transitions remain outside the CLI folder.

Electron main will create the same application context and call the same use
cases through typed IPC. React will never parse CLI output.

## 4. Command Catalog

### 4.1 Global commands

```text
knm --help
knm version [--output table|json]
knm doctor [--recover-inventory] [--recover-connection-state]
  [--check-connections] [--output table|json]
knm paths [--output table|json]
knm [--simulation <scenario>] interactive [--no-color]
```

`version` reports product, interface, core, commit, channel, and build time.
`doctor` validates the local runtime, storage paths, permissions, inventory and
connection-state integrity, backups, quarantine evidence, discovery storage,
inventory connection references, exact SSH aliases, and recoverability.
Recovery is explicit and remote hosts are not contacted unless
`--check-connections` is supplied; required-tool, disk, and receipt checks
arrive with later subsystems. `paths` exposes sanitized
local locations useful for support. `interactive` starts the prompt-driven
shell defined in `INTERACTIVE_CLI_IMPLEMENTATION_PLAN.md`.

### 4.2 Configuration

```text
knm config show [--output table|json]
knm config get <key> [--output table|json]
knm config set <key> <value>
```

Configuration commands are not yet implemented. Phase 2 reserved the
`config.json` path without persisting arbitrary settings; typed configuration
arrives with the phase that first needs a persistent preference. Configuration
never stores raw passwords, private keys, provider tokens, or wallet material.

### 4.3 Simulation

```text
knm simulation scenarios [--output table|json]
knm simulation show [--output table|json]
knm --simulation <scenario> <command>
```

`simulation scenarios` and explicit `--simulation` selection are implemented;
`simulation show` is not yet implemented.

Implemented scenarios:

- `default`: representative mixed inventory;
- `empty`: no nodes;
- `mixed-health`: healthy, degraded, unreachable, and unknown nodes;
- `stale-health`: expired observations.

Planned scenarios, to be added with the phases that exercise them:

- `conflicts`: duplicate ports, identities, or data paths;
- `unsafe-mainnet`: unexpected producer or exposure signals;
- `interrupted-rollout`: durable execution requiring reconciliation;
- `large-fleet`: deterministic scale fixture.

The persisted filesystem inventory is now the default execution source, so
simulation always requires explicit selection per invocation or a session-local
`/scenario` switch inside `knm interactive`. Persistent scenario selection
remains deferred until typed configuration exists.

### 4.4 Nodes and inventory

```text
knm nodes list [filters] [--output table|json]
knm nodes show <node-id> [--section <name>] [--output table|json]
knm nodes add --id <node-id> --name <display-name> [metadata options]
knm nodes update <node-id> [metadata options]
knm nodes remove <node-id> --confirm <node-id>
```

`nodes list` filters management, origin, flavor, network, location, authority,
function, health, and staleness. `nodes show` distinguishes declared, desired,
observed, and verified state. `add` and `update` accept declared metadata only
— management class, origin, flavor, network, location kind, environment,
authority level, an opaque connection reference that never accepts credentials
or key paths, and repeatable declared functions — and never contact a node.
`remove` binds its confirmation to the exact stable node ID, removes only the
inventory record, and explicitly states that it does not stop a node,
uninstall software, or delete data.

### 4.5 Connections

```text
knm connections list [--output table|json]
knm connections show <connection-id> [--output table|json]
knm connections add ssh --id <id> --host-alias <ssh-alias> [--output table|json]
knm connections test <connection-id> [--timeout-ms <milliseconds>] [--output table|json]
knm connections remove <connection-id> --confirm <connection-id> [--output table|json]
```

Implemented. SSH uses exact aliases from configured SSH config and opaque
connection IDs. Output never exposes the alias, resolved host or user, private
keys, passwords, raw tokens, or unsanitized targets. Tests can execute only a
predefined bounded handshake probe.

### 4.6 Discovery

```text
knm discover host --connection <connection-id>
knm discover peers --from <node-id> [--save]
knm discoveries list
knm discoveries show <discovery-id>
knm discoveries dismiss <discovery-id>
```

Implemented. Discovery never creates an inventory record. `discover peers`
returns ephemeral sanitized evidence by default; `--save` retains evidence
only. Host evidence records provenance, source connection, capture time,
expiry, status, and strict Teleno findings.

### 4.7 Adoption

```text
knm nodes adoption inspect --connection <connection-id>
knm nodes adoption plan (--discovery <id>|--connection <id>) --id <node-id> --name <name>
knm nodes adoption apply <review-id> --confirm <digest>
knm nodes adoption list
```

Implemented. Inspection detects flavor, network, chain ID, supervisor, runtime, basedir,
ports, functions, endpoints, artifact, and available authority. Applying the
adoption plan produces either a fully managed adopted node or a connected
limited-authority record. Node Manager preserves adoption provenance and never
contacts or mutates the runtime during plan or application.

### 4.8 Status, health, and reachability

```text
knm nodes inspect <node-id>
  [--section overview|components|chain|governance]
  [--output table|json]
```

`show` reads stored inventory state; the MVP `inspect` command contacts one
existing node and returns a fresh, sanitized `NodeInspectionSnapshot`. The
first adapter targets legacy multiservice deployments and normalizes Docker,
configuration, and JSON-RPC evidence into four operator sections:

- `overview`: runtime flavor, instance, network, chain identity, build/image
  identity when available, uptime, and snapshot freshness;
- `components`: normalized component name, availability, running state,
  restart count, and artifact identity, where supported;
- `chain`: head, last irreversible block, head age, advancement/stall evidence,
  block-store agreement, P2P availability, and peer count when available;
- `governance`: configured proposal IDs, effective loaded proposal IDs,
  recently observed block-header votes, and network proposal status/tally.

Producer evidence includes enabled/configured state, address presence without
exposing the address, and recent production activity when available. API
evidence reports endpoint type and exposure policy without leaking private
addresses. Storage/resource basics may be included only when existing probes
provide bounded, sanitized evidence.

Every field carries availability and evidence freshness/provenance. A missing
runtime capability returns a typed reason; it is never replaced by a guessed
value. Multiservice containers and Teleno embedded subsystems are both exposed
as `components`, so presentation adapters do not branch on runtime internals.

The initial implementation uses only fixed, allowlisted, bounded read-only SSH
probes plus existing node interfaces. It does not require a new agent or
microservice. Runtime extensions are follow-up work only where the MVP audit
proves a material fact cannot be obtained safely. Teleno then implements the
same inspection contract through its existing versioned status surface.

`nodes status`, `nodes health`, `nodes reachability`, `fleet health`, continuous
polling, logs, diagnostics, and support bundles are deferred until after the
focused inspection MVP and its GUI contract have been reviewed.

### 4.9 Logs and diagnostics

```text
knm nodes logs <node-id> [--lines N] [--since duration] [--follow]
knm nodes diagnostics <node-id>
knm support-bundles create --node <node-id>
```

All streams are sanitized. Support bundles preview included and redacted data
before creation.

### 4.10 Plans and executions

```text
knm plans list [filters]
knm plans show <plan-id>
knm plans validate <plan-id>
knm plans apply <plan-id> [--confirm <exact-text>]
knm plans cancel <plan-id>

knm executions list [filters]
knm executions show <execution-id>
knm executions stop-after-current <execution-id>
knm executions resume <execution-id>
knm executions reconcile <execution-id>
```

Plans are intent; executions are durable attempts. Resume never repeats an
ambiguous step before observing real state. Fleet review never replaces
per-node confirmation.

### 4.11 Lifecycle

```text
knm nodes plan install <node-id> [options]
knm nodes plan start <node-id>
knm nodes plan stop <node-id>
knm nodes plan restart <node-id>
knm nodes plan uninstall <node-id>
knm nodes plan cleanup <node-id>
```

Lifecycle commands only create plans. `uninstall` and destructive `cleanup`
remain separate. All installs and restores produce observer-safe desired state.

### 4.12 Artifacts and upgrades

```text
knm artifacts list
knm artifacts show <artifact-id>
knm artifacts fetch <artifact-id>
knm artifacts verify <artifact-id>
knm nodes plan upgrade <node-id> --artifact <artifact-id>
knm nodes plan rollback <node-id>
```

Verification covers digest, signature, platform, architecture, compatibility,
and rollback evidence before stopping a healthy node.

### 4.13 Backups and restore

```text
knm backups list --node <node-id>
knm backups show <backup-id>
knm public-backups list --network <network>
knm nodes plan backup <node-id>
knm nodes plan restore <node-id> --backup <backup-id>
knm nodes plan restore-public <node-id> --snapshot <snapshot-id>
```

Restore plans include current-data preservation, disk requirements, source
policy, metadata/signature/digest evidence, observer-safe configuration,
catch-up, and health postconditions.

### 4.14 Rollouts

```text
knm rollouts plan upgrade --selector <selector> --artifact <artifact-id>
knm rollouts show <rollout-id>
knm rollouts apply <rollout-id>
knm rollouts stop-after-current <rollout-id>
knm rollouts resume <rollout-id>
knm rollouts reconcile <rollout-id>
```

Rollouts expand to immutable per-node plans and execute sequentially through a
canary policy. The first unsafe result stops the rollout and preserves pending
nodes.

### 4.15 Receipts

```text
knm receipts list [filters]
knm receipts show <receipt-id>
knm receipts verify <receipt-id>
knm receipts export <receipt-id> --format json
```

Receipts are versioned and sanitized and include plan digest, interface/core
identity, target, artifact, timestamps, steps, postconditions, and data
preservation outcome.

### 4.16 Producer read-only milestone

```text
knm producers list
knm producers show <profile-id>
knm producers readiness <profile-id>
knm producers vhp simulate [options]
```

The initial producer milestone is read-only. Funding, burns, registration, VHP
transfer, and activation require the plan engine, typed confirmations, receipts,
testnet evidence, and separate mainnet approval.

## 5. Delivery Phases

### Phase 0 — CLI foundation (complete)

- command dispatcher and application context;
- typed success/error envelopes and central exit codes;
- output format abstraction;
- deterministic simulation catalog;
- build identity and help structure.

Validated by the typed registry, help, build-identity, output-format,
exit-code, source CLI, and compiled CLI contract tests. `npm run verify` is the
aggregate gate.

Exit: commands can be registered independently, errors have stable structured
output, and tests can select simulation scenarios without global state.

### Phase 1 — Inventory queries (complete)

- `nodes list` (implemented);
- `nodes show` (implemented);
- expanded list filters (implemented);
- `simulation scenarios` and explicit `--simulation` selection (implemented);
- empty, mixed-health, and stale fixtures (implemented).

Validated by core tests for every filter and evidence-precedence rule; human
and schema v2 JSON tests for complete and focused node detail; default, empty,
mixed-health, and stale scenario tests; sanitization checks; and compiled CLI
smoke validation.

Exit: the complete compositional node model can be inspected in human and JSON
forms across deterministic scenarios.

### Phase 1.5 — Interactive terminal shell (complete)

- explicit `knm interactive` entry point;
- shared process-independent command executor for batch and prompt adapters;
- deterministic tokenizer and session state machine;
- registry-driven help and completion;
- session-local simulation switching and sanitized in-memory history;
- readline terminal adapter with TTY, width, color, Ctrl+C, and EOF handling;
- Phase 0/1 command parity without an active-node context.

Validated by executor parity tests, pure tokenizer/history/reducer/completion
tests, fake-terminal integration, non-TTY error tests, compiled smoke, and a
real PTY exercise covering completion, compact output, scenario switching,
history, JSON, Ctrl+C, and exit status.

Exit: all implemented read-only commands run repeatedly in one terminal
session with batch-equivalent results, visible mode/scenario, safe input
handling, and no Phase 2 persistence or real-node access. Detailed scope and
validation are defined in `INTERACTIVE_CLI_IMPLEMENTATION_PLAN.md`.

### Phase 2 — Persisted inventory (complete)

- platform-aware paths with the `KNM_HOME` override; typed configuration
  persistence itself was deferred, with only the `config.json` path reserved;
- versioned atomic filesystem repository;
- `nodes add`, `update`, and inventory-only `remove`;
- migrations, corruption quarantine, and backups;
- `doctor` inventory checks.

Implemented with inventory schema `1`, revision-conflict detection, an
exclusive writer lock, private filesystem permissions, synchronized temporary
writes and atomic rename, ten-entry backup retention, idempotent schema `0`
migration, sanitized corruption evidence, and explicit recovery from the newest
valid backup. Normal commands use local persisted inventory; simulation now
requires explicit selection. Batch and interactive adapters share the same
mutation use cases and repository.

Validated by pure validation and mutation tests, portable path tests,
filesystem repository contract tests, injected pre-rename failure, lock and
permission tests, migration and recovery tests, raw-secret rejection,
cross-process CLI persistence, structured errors and output, interactive local
inventory parity, source compilation, and compiled CLI smoke. The detailed
completion audit is recorded in
`../validation/CLI_PHASE_2_PERSISTED_INVENTORY_AUDIT.md`.

Exit: inventory survives CLI restarts, rejects invalid records, and never stores
raw secrets.

### Phase 3 — Connections, discovery, and adoption (deterministic implementation complete; live exit pending)

- SSH connection references and non-mutating test;
- host discovery and flavor adapters;
- peer discovery;
- adoption inspection and plan;
- authority calculation and provenance.

Exit: an existing disposable testnet node becomes a managed adopted node, or a
connected limited node when authority is incomplete, without changing its
runtime during inspection. All deterministic gates pass, but this exit remains
pending until a disposable target is separately approved and validated.

### Phase 4 — Existing multiservice inspection MVP (complete)

1. **Done:** Define a versioned, UI-neutral `NodeInspectionSnapshot`, runtime capability
   declaration, structured evidence provenance/freshness, and sanitized public
   DTO in the functional core.
2. **Done:** Resolve opaque SSH references in the use case and implement
   `LegacyMultiserviceInspectionAdapter` over a connection-bound, fixed
   read-only probe port for Docker metadata, runtime configuration, and
   existing JSON-RPC methods. The adapter never receives the alias or exposes
   arbitrary command execution.
3. **Done:** Add `knm nodes inspect <node-id>` with overview, components, chain, and
   governance sections in human and schema-versioned JSON output.
4. **Done:** Keep governance facts separate: configured proposal IDs, effective loaded
   proposal IDs, block-header votes, and network-wide proposal status/tally.
5. **Done:** Add deterministic adapter-contract, partial-capability, unavailable,
   malformed, timeout, stale, redaction, CLI, interactive-parity, and compiled
   CLI tests.
6. **Done:** Validate read-only behavior against a separately approved existing
   multiservice node and record sanitized no-mutation evidence.
7. **Done for the current status surface:** Implement `TelenoInspectionAdapter` parity through versioned read-only
   runtime methods where necessary, using the same contract suite.
8. **Done at the application boundary:** Freeze the public DTO for a narrow Electron-main typed bridge; the renderer
   must never parse CLI output or raw SSH/Docker/RPC responses.

Exit status: passed. A separately approved existing multiservice node was
inspected without runtime mutation; component state, chain progress, producer
state, and governance evidence are distinguishable; unsupported facts are
explicit; batch, interactive, and future GUI consumers receive the same
sanitized snapshot; deterministic and compiled gates pass.

Continuous monitoring, fleet health, reachability diagnosis, logs,
diagnostics, and support bundles are not part of this phase.

### Phase 4.5 — Two-mode onboarding MVP (implemented; live and external gates pending)

- Quick Connect accepts a compatible JSON-RPC endpoint and produces an
  explicitly limited `NodeInspectionSnapshot` without requiring SSH.
- Full Connect pairs a versioned authenticated read-only node agent and
  produces the full inspection evidence supported by that runtime.
- Quick-to-Full upgrade preserves the stable node ID and adds a stronger
  private access binding rather than duplicating the node.
- Existing exact-alias SSH inspection remains available as Expert Connect.
- CLI, interactive CLI, Electron main, and a future controller call the same
  onboarding and inspection core. The renderer never opens connections,
  handles credentials, or parses CLI output.
- Both modes remain read-only. Blank-host provisioning, automatic agent
  installation, continuous monitoring, and lifecycle or chain mutation stay
  outside the slice.

Detailed phases, security gates, test matrices, and completion criteria are in
`NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`.

Exit: a Quick node can be saved and inspected with accurate limitations, then
upgraded in place to a paired Full inspection connection without SSH, secret
disclosure, runtime mutation, or node-ID change. Automated and separately
approved live gates pass, or unavailable live validation remains explicit.

### Phase 5 — Durable plans and lifecycle

- plan persistence, digest, expiry, review, confirmation, and invalidation;
- execution persistence and event stream;
- start/stop/restart/install observer plans;
- interruption reconciliation and receipts.

Exit: a disposable testnet observer can be installed and controlled, and every
interruption point resumes or blocks without duplicate mutation.

### Phase 6 — Artifacts, backups, and rollouts

- artifact identity and compatibility;
- upgrade and rollback;
- private/public backup and restore;
- sequential canary rollouts;
- stop-after-current, resume, and reconcile.

Exit: forced canary failure restores the prior artifact/config, preserves the
database, and leaves pending nodes untouched.

### Phase 7 — Producer read-only

- profiles and duplicate identities;
- readiness queries;
- VHP allocation simulator;
- mainnet read-only enforcement.

Exit: Node Manager explains producer readiness and VHP distribution without
submitting transactions or enabling production.

## 6. Testing Policy

Every command requires:

- pure use-case tests independent of CLI and adapters;
- CLI human-output and structured-envelope tests;
- invalid input, not-found, empty, stale, and unsafe cases;
- stable exit-code tests;
- redaction tests for every external string;
- adapter contract tests;
- compiled CLI smoke validation.

Mutating phases additionally require interruption, ambiguity, cancellation,
resume, rollback, postcondition, and database-preservation tests. Live tests use
disposable testnet targets. Mainnet remains read-only until separately approved.

## 7. Definition Of Done

A command is complete only when:

- its use case is available independently of the CLI;
- table and structured output are documented and tested;
- errors and exit codes are stable;
- sensitive data is sanitized;
- help text and examples are current;
- simulation and relevant persisted adapters pass the same contract tests;
- failure and recovery behavior match the command's risk;
- Electron can call the use case without parsing CLI output.

## 8. Immediate Implementation Slice

The first two slices completed Phases 0 and 1:

1. refactor CLI dispatch and application context (implemented);
2. introduce typed CLI errors and central exit-code mapping (implemented);
3. implement `knm nodes show <node-id>` (implemented);
4. implement `knm simulation scenarios` (implemented);
5. implement explicit `knm --simulation <scenario> nodes list/show`
   (implemented);
6. add `empty`, `mixed-health`, and `stale-health` scenarios (implemented);
7. test human output, JSON envelopes, not-found errors, and scenario isolation
   (implemented).

Phases 0, 1, 1.5, and 2 are complete. Phase 3 deterministic implementation is
complete; its live disposable-testnet adoption exit remains pending. Phase 4's
shared contract, multiservice and Teleno adapters, CLI vertical, application
API, deterministic tests, compiled validation, and separately approved live
no-mutation audit are complete. Phase 4.5 Quick, Full, Expert compatibility,
CLI/interactive, Electron, persistence, protocol, security, and deterministic
validation are implemented. Approved live onboarding targets and a separately
published production agent artifact remain pending. The broader monitoring and
lifecycle roadmap remains frozen.

## 9. Amendment Summary — 2026-07-12

This plan was reconciled against the implemented code on
`codex/cli-list-nodes`. Amendments:

1. **Global commands (4.1).** Added the implemented
   `knm interactive [--no-color]` entry point and the implemented
   `doctor --recover-inventory` flag. Rescoped the `doctor` description to
   what the code does today (local runtime, paths, permissions, inventory
   integrity, backups, quarantine, recoverability) and marked SSH, tool,
   disk, and receipt checks as future-phase scope.
2. **Configuration (4.2).** Marked `config show/get/set` as not yet
   implemented; recorded that Phase 2 only reserved the `config.json` path.
3. **Simulation (4.3).** Split the scenario catalog into the four implemented
   scenarios (`default`, `empty`, `mixed-health`, `stale-health`) and the four
   still-planned ones. Marked `simulation show` as unimplemented. Recorded
   that local persisted inventory is now the default source and simulation is
   always explicit, including the session-local `/scenario` switch.
4. **Nodes and inventory (4.4).** Updated command signatures to the
   implemented forms (`add --id --name`, `remove --confirm <node-id>`) and
   documented the implemented metadata option set, including environment,
   authority, opaque connection references, and repeatable functions.
5. **Phase 2 record (5).** Corrected the completed-scope bullet: paths and
   `KNM_HOME` shipped; typed configuration persistence was deferred.
6. **Immediate slice (8).** Replaced the stale "next slice begins Phase 2"
   closing with the actual state (Phases 0–2 complete, verify gate green) and
   the concrete Phase 3 opening slice.
7. **Phase 3 implementation.** Recorded the private connection-state
   repository, exact-alias and allowlisted-probe contracts, sanitized discovery
   evidence, inventory-only adoption review, interactive parity, doctor checks,
   and the still-pending disposable-live-target criterion.

No architectural decision changed. The exit-code table, envelope
`schemaVersion: 2` contract, command grammar, and safety classes in this plan
match `src/core/exit-codes.ts`, `src/cli/envelope.ts`, and
`src/cli/command-catalog.ts` as implemented.

## 10. MVP Refocus — 2026-07-13

The next target was narrowed after product review to read-only inspection of
existing legacy multiservice nodes. Phase 4 now defines that vertical
explicitly, including the common snapshot, governance evidence semantics,
runtime compatibility adapters, approved live validation, and the typed
boundary required by a later graphical interface. Previously listed fleet
health, reachability, logs, diagnostics, and support bundles remain planned but
are no longer part of Phase 4.

The deterministic implementation now matches the refocused scope. It exposes
one sanitized snapshot through batch, interactive, and typed application API
interfaces, and includes both runtime adapters. A later separately approved
live run passed with matching pre/post component and configuration evidence.
No runtime repository or managed runtime state was modified.

## 11. Two-Mode Onboarding Selection — 2026-07-13

Product review selected the next MVP slice: Quick Connect through fixed public
RPC probes, and Full Connect through a paired authenticated read-only agent.
SSH remains Expert Connect. The new slice is defined in
`NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md` and is now implemented across the
core, CLI, interactive CLI, and Electron onboarding surface. Live target and
production agent artifact gates remain pending. The implementation does not
unfreeze provisioning, monitoring, lifecycle, producer, or chain mutation.
