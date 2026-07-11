# CLI Implementation Plan

- Status: active
- Last updated: 2026-07-11
- Product version: `0.1.0-dev.0`
- Current implementation: `knm nodes list`
- Delivery principle: CLI first, shared functional core, Electron as a peer
  adapter

## 1. Objective

Build an advanced command-line interface that can develop, test, automate, and
prove the complete Koinos Node Manager functional model before equivalent
desktop workflows are added. The CLI is a product interface over the shared
core, not the core itself and not a subprocess API for Electron.

The first useful operator journey is:

```text
initialize and diagnose
  -> inventory nodes
  -> connect or discover
  -> inspect and adopt
  -> monitor health and logs
  -> create an immutable plan
  -> review and confirm
  -> execute and verify
  -> inspect the receipt
```

The first delivery concentrates on observer operations. Producer mutation,
VHP movement, Fogata, cloud provisioning, and a persistent node agent remain
outside the initial functional milestone.

## Implementation Progress

Implemented on `codex/cli-list-nodes`:

- compositional node domain model and repository port;
- deterministic simulation adapter;
- central CLI dispatcher and application context;
- typed application errors and centralized exit-code mapping;
- human and versioned JSON envelopes;
- `knm nodes list` with management, network, function, and health filters;
- `knm nodes show <node-id>`;
- `knm simulation scenarios`;
- explicit `--simulation default|empty|mixed-health|stale-health` selection;
- compiled CLI and unit/end-to-end command tests.

The persisted inventory, SSH, discovery, adoption, real health, plans, and
mutating operations remain planned.

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
  "schemaVersion": 1,
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
  "schemaVersion": 1,
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
knm doctor [--output table|json]
knm paths [--output table|json]
```

`version` reports product, interface, core, commit, channel, and build time.
`doctor` validates Node.js, directories, inventory, secure storage, SSH,
required tools, disk, and receipt integrity without contacting nodes unless the
operator explicitly requests remote checks. `paths` exposes sanitized local
locations useful for support.

### 4.2 Configuration

```text
knm config show [--output table|json]
knm config get <key> [--output table|json]
knm config set <key> <value>
```

Configuration never stores raw passwords, private keys, provider tokens, or
wallet material.

### 4.3 Simulation

```text
knm simulation scenarios [--output table|json]
knm simulation show [--output table|json]
knm --simulation <scenario> <command>
```

Initial scenarios:

- `default`: representative mixed inventory;
- `empty`: no nodes;
- `mixed-health`: healthy, degraded, unreachable, and unknown nodes;
- `stale-health`: expired observations;
- `conflicts`: duplicate ports, identities, or data paths;
- `unsafe-mainnet`: unexpected producer or exposure signals;
- `interrupted-rollout`: durable execution requiring reconciliation;
- `large-fleet`: deterministic scale fixture.

Persistent scenario selection is deferred until configuration persistence and
the real inventory adapter exist.

### 4.4 Nodes and inventory

```text
knm nodes list [filters] [--output table|json]
knm nodes show <node-id> [--section <name>] [--output table|json]
knm nodes add [options]
knm nodes update <node-id> [metadata options]
knm nodes remove <node-id>
```

`nodes list` filters management, origin, flavor, network, location, authority,
function, health, and staleness. `nodes show` distinguishes declared, desired,
observed, and verified state. `remove` removes only the inventory record and
must explicitly say that it does not stop a node, uninstall software, or delete
data.

### 4.5 Connections

```text
knm connections list
knm connections show <connection-id>
knm connections add ssh --id <id> --host-alias <ssh-alias>
knm connections test <connection-id>
knm connections remove <connection-id>
```

The first SSH implementation uses `~/.ssh/config` aliases and opaque connection
references. Output never exposes resolved private keys, passwords, raw tokens,
or unsanitized targets.

### 4.6 Discovery

```text
knm discover host --connection <connection-id>
knm discover peers --from <node-id> [--save]
knm discoveries list
knm discoveries show <discovery-id>
knm discoveries dismiss <discovery-id>
```

Discovery never silently creates a managed node. Saved peers enter as
`management: discovered`, with unknown flavor and functions unless evidence
supports stronger states.

### 4.7 Adoption

```text
knm nodes adoption inspect --connection <connection-id>
knm nodes adoption plan --connection <connection-id> --name <name>
```

Inspection detects flavor, network, chain ID, supervisor, runtime, basedir,
ports, functions, endpoints, artifact, and available authority. Applying the
adoption plan produces either a fully managed adopted node or a connected
limited-authority record. Node Manager preserves pre-adoption provenance.

### 4.8 Status, health, and reachability

```text
knm nodes inspect <node-id>
knm nodes status <node-id>
knm nodes health <node-id>
knm nodes reachability <node-id>
knm fleet health [--only-problems]
```

`show` reads stored state; `inspect` contacts the node and collects new
evidence. Health includes freshness, supervisor, chain, head progress, peers,
disk, components, role, artifact, exposure, backup freshness, and stop criteria.
Reachability separates local listening, host firewall, public reachability,
advertised identity, NAT/router actions, and public administrative exposure.

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

### Phase 0 — CLI foundation (in progress)

- command dispatcher and application context;
- typed success/error envelopes and central exit codes;
- output format abstraction;
- deterministic simulation catalog;
- build identity and help structure.

Exit: commands can be registered independently, errors have stable structured
output, and tests can select simulation scenarios without global state.

### Phase 1 — Inventory queries (in progress)

- `nodes list` (implemented);
- `nodes show` (implemented);
- expanded list filters;
- `simulation scenarios` and explicit `--simulation` selection (implemented);
- empty, mixed-health, and stale fixtures (implemented).

Exit: the complete compositional node model can be inspected in human and JSON
forms across deterministic scenarios.

### Phase 2 — Persisted inventory

- configuration and paths;
- versioned atomic filesystem repository;
- `nodes add`, `update`, and inventory-only `remove`;
- migrations, corruption quarantine, and backups;
- `doctor` inventory checks.

Exit: inventory survives CLI restarts, rejects invalid records, and never stores
raw secrets.

### Phase 3 — Connections, discovery, and adoption

- SSH connection references and non-mutating test;
- host discovery and flavor adapters;
- peer discovery;
- adoption inspection and plan;
- authority calculation and provenance.

Exit: an existing disposable testnet node becomes a managed adopted node, or a
connected limited node when authority is incomplete, without changing its
runtime during inspection.

### Phase 4 — Read-only operations

- inspect/status/health/reachability;
- fleet health with bounded concurrency;
- sanitized logs and diagnostics;
- support-bundle preview.

Exit: mixed local/remote observers can be monitored without mutation, secret
leakage, or stale healthy results.

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

The first slice began Phase 0 and Phase 1:

1. refactor CLI dispatch and application context (implemented);
2. introduce typed CLI errors and central exit-code mapping (implemented);
3. implement `knm nodes show <node-id>` (implemented);
4. implement `knm simulation scenarios` (implemented);
5. implement explicit `knm --simulation <scenario> nodes list/show`
   (implemented);
6. add `empty`, `mixed-health`, and `stale-health` scenarios (implemented);
7. test human output, JSON envelopes, not-found errors, and scenario isolation
   (implemented).

The next slice should finish the remaining Phase 0 foundations: build identity,
top-level and resource-specific help, a typed command registry, and documented
exit-code contract tests. It should then begin Phase 2 with `paths`, versioned
configuration, and the atomic filesystem inventory repository.
