# CLI Architecture

Last updated: 2026-07-12

## Executable Verticals

The implemented query verticals expose node listing and detail through
independently registered commands and four functional layers:

```text
typed command registry, help, parser, and output
        |
listNodes / getNode use cases
        |
resolveNodeView factual-state policy
        |
NodeRepository / InventoryRepository ports
       |
FileSystemInventoryRepository / SimulatedNodeRepository adapters
```

- `src/domain/node.ts` defines the compositional node model.
- `src/core/node-repository.ts` defines the inventory read port.
- `src/core/node-inventory.ts` owns inventory-only add, update, remove,
  observer-safe defaults, and exact removal confirmation.
- `src/core/validate-node.ts` validates stable IDs, opaque references, complete
  records, unknown fields, sensitive fields, and duplicate IDs.
- `src/core/list-nodes.ts` contains filtering and ordering without UI or storage
  dependencies.
- `src/core/get-node.ts` resolves stable node IDs and returns typed not-found
  errors.
- `src/core/node-view.ts` resolves effective factual state without consulting
  desired intent or a wall clock.
- `src/core/sanitize-node.ts` creates output-safe node views that redact private
  endpoints and raw operational identity values.
- `src/adapters/simulation/` contains deterministic example nodes.
- `src/adapters/filesystem/` resolves portable paths and implements versioned,
  atomic, revision-checked inventory storage.
- `src/cli/` parses arguments and renders table or JSON output.
- `src/cli/command-registry.ts` registers and resolves commands without a
  central conditional dispatcher.
- `src/cli/help.ts` derives top-level, resource, and command help from the same
  registry metadata used for execution.

Electron main will call the same core use case directly. It must not parse the
human CLI table or use the CLI process as its primary integration mechanism.

## Connection, Probe, Discovery, And Adoption Core

Phase 3 adds peer adapters over reusable ports rather than placing SSH or
discovery interpretation in command handlers:

```text
batch CLI / interactive CLI
          |
connections / discoveries / adoption use cases
          |
ConnectionStateRepository / ReadOnlyProbeTransport / SshAliasResolver
          |
atomic filesystem state / SSH adapter / deterministic fake adapters
          |
Teleno discovery interpreter
```

`connection-state.json` uses schema `1` independently of inventory schema and
the schema v2 CLI envelope. It stores private exact SSH aliases, sanitized
connection-test evidence, host and peer discovery evidence, and immutable
adoption reviews. It uses private permissions, synchronized atomic
replacement, optimistic revisions, a writer lock, bounded backups, migration,
sanitized quarantine, and explicit recovery.

`ReadOnlyProbeTransport` accepts only `connection.handshake`,
`host.inventory`, and `peers.snapshot`. The SSH adapter maps those identifiers
to constant commands, invokes `ssh` directly without a local shell, applies
batch authentication, bounded connection and total timeouts, and capped
output. There is no API for user-authored command text, remote shell access, or
a resolved host, user, password, token, or key path.

SSH targets are exact `Host` aliases from SSH config or bounded includes;
wildcard matches are not configured targets. Host discovery reads a strict
versioned Teleno manifest, transforms service names and data paths to opaque
hashes, drops endpoint addresses and raw identities, and preserves only
presence evidence. Unsupported runtimes and unsafe or malformed manifests
return typed unavailable results.

Discovery evidence records source, capture time, expiry, status, and sanitized
findings. Peer inspection persists evidence only with `--save` and never adds,
adopts, or manages a peer. Adoption planning binds fresh host evidence,
inventory and connection-state revisions, the proposed node, expiry, and a
digest. Exact digest confirmation is required before inventory-only
application. Complete evidence creates a managed adopted observer-safe record;
incomplete evidence creates a connected limited-authority record. Producer and
wallet authority are always false, and no Phase 3 path mutates the runtime.

## Simulated Inventory

The fixtures intentionally cover different combinations rather than one rigid
node type:

- a provisioned, fully managed local Teleno observer;
- an adopted, fully managed remote legacy producer and seed;
- a connected NAS adoption candidate with limited authority;
- an imported external public API;
- an imported external public seed;
- an unknown peer discovered through P2P observation.

All addresses and identities are sanitized placeholders. Simulation is an
explicit execution source; commands without `--simulation` use local persisted
inventory.

## Persisted Inventory Adapter

The current inventory schema is independent from the CLI response envelope:

```text
inventory schema 1
  schemaVersion: 1
  revision: non-negative integer
  updatedAt: ISO timestamp or null
  nodes: NodeRecord[]
```

The adapter returns an empty revision `0` snapshot when no inventory exists.
Every write validates the complete candidate fleet, acquires an exclusive
writer lock, verifies the expected revision, creates a bounded backup when an
active inventory exists, writes and synchronizes a private temporary file,
renames it atomically, and synchronizes the parent directory. A failed write
before rename leaves the previous inventory active. A revision mismatch never
overwrites newer state.

Storage roots and child directories use user-only permissions, and inventory
and backup files use mode `0600`. `KNM_HOME` is the portable override used by
tests and isolated installations. Without it, path resolution follows macOS,
Windows, XDG, and Unix conventions. `knm paths` renders home-relative support
paths where possible. The reported `config.json` path is reserved for later
typed configuration; Phase 2 does not persist arbitrary settings or secrets.

Schema `0` is the supported migration fixture. Migration is sequential and
idempotent, keeps the original as a private backup, increments the revision,
and atomically writes schema `1`. Syntax errors, unknown schemas, malformed
records, duplicate IDs, unknown fields, or sensitive fields cannot enter
service. The unsafe active file is removed and a sanitized quarantine evidence
record stores only its SHA-256 digest, byte length, failure class, and time.
`knm doctor --recover-inventory` restores only the newest valid backup and only
when no readable active inventory exists.

Inventory mutation use cases remain in the functional core. `nodes add` and
`nodes update` accept a restricted metadata model; opaque connection references
never accept credentials or filesystem paths. Fully managed records receive an
observer-safe desired function state with producer disabled. `nodes remove`
requires confirmation equal to the stable ID and removes only metadata. None
of these commands contact a node, change a runtime, uninstall software, or
delete node data.

## Inventory State Model

Every node record keeps four state layers separate:

- **declared**: inventory facts supplied by an operator, import, provisioner,
  or discovery source;
- **desired**: runtime intent controlled by Node Manager, or `null` when Node
  Manager has no desired-state authority;
- **observed**: the most recent live facts, health, observation timestamp, and
  explicit `fresh` or `stale` evidence state, or `null` when never observed;
- **verified**: the subset supported by stronger verification evidence and its
  timestamp, or `null` when no verification exists.

List filters and summaries use a deterministic effective factual view:
verified fields override observed fields, and observed fields override declared
fields. Desired state never participates in factual filtering. A record with no
live observation has unknown health and `never` freshness. This policy lives in
the functional core so CLI and future Electron adapters cannot interpret the
same record differently.

Before human or structured output is rendered, a separate functional-core
boundary replaces private endpoint addresses and raw peer, runtime-instance,
and producer identity values with explicit redaction or presence markers.

## Command Contracts

```text
knm nodes list
  [--management managed|connected|external|discovered]
  [--origin provisioned|adopted|imported|discovered]
  [--flavor teleno-monolith|legacy-microservices|unknown]
  [--network mainnet|testnet|custom|unknown]
  [--location local|remote|external|unknown]
  [--authority none|observe|limited|full]
  [--function observer|producer|seed|api|backup-source]
  [--health healthy|degraded|unreachable|unknown]
  [--staleness fresh|stale|never]
  [--output table|json]
```

```text
knm nodes show <node-id>
  [--section all|summary|declared|desired|observed|verified]
  [--output table|json]

knm simulation scenarios
  [--output table|json]

knm --simulation <scenario> nodes list|show ...

knm nodes add --id <node-id> --name <name> [metadata options]
knm nodes update <node-id> [metadata options]
knm nodes remove <node-id> --confirm <node-id>
knm paths [--output table|json]
knm doctor [--recover-inventory] [--recover-connection-state]
  [--check-connections] [--output table|json]

knm connections list|show|add ssh|test|remove
knm discover host|peers
knm discoveries list|show|dismiss
knm nodes adoption inspect|plan|apply|list
```

The JSON response uses envelope schema version `2`. Version 2 introduced the
explicit four-layer node state shape. Future schema-breaking changes must
increment `schemaVersion`; formatting changes to the human table do not change
that contract.

Invalid input and application failures use typed structured errors and the
central exit-code contract: success `0`, invalid input `2`, not found `3`,
configuration `4`, stale plan `10`, safety block `20`, execution failure `30`,
and unavailable transport `40`.

Available scenarios are `default`, `empty`, `mixed-health`, and `stale-health`.
Selection is explicit per invocation and does not alter persistent state.

## Build Identity

`knm version` exposes product version, CLI interface version, core version, Git
commit, release channel, build timestamp, and source-tree state. The build step
generates this metadata before type checking, development execution, tests, and
compiled output so a packaged executable does not infer its identity from the
runtime environment.

`npm run verify` checks types, runs the source-level contract and end-to-end
tests, compiles the CLI, and smoke-tests the compiled executable.

## Interactive Terminal Adapter

`knm interactive` starts a command REPL on an attached TTY. Batch and
interactive modes call the same process-independent command executor, typed
registry, handlers, application context, use cases, output formatters, and
sanitization boundaries. Interactive mode never spawns or parses the batch CLI.

```text
NodeReadlineTerminal
        |
InteractiveSession reducer and tokenizer
        |
shared executeCommand
        |
CommandRegistry -> use cases -> adapters
```

The prompt shows `[inventory:local]` for persisted inventory and
`[sim:<scenario>]` for a read-only simulation. Product commands use the normal
grammar without the leading `knm`; slash-prefixed metacommands manage only
session presentation state. `/scenario` selects an in-memory simulation and
`/inventory` returns to local persistence. Scenario changes and history are
discarded at exit. Inventory mutations themselves persist through the shared
repository. There is no active-node context.

The tokenizer supports quoted arguments but rejects shell operators,
redirection, command substitution, and oversized input. Readline history is
sanitized synchronously, and displayed session history is separately bounded
and sanitized. Completion derives from command metadata plus the current
inventory source and refreshes node, connection, discovery, and adoption
review identifiers after state changes. Nested command paths use the same
registry-driven execution, help, and completion.

At widths below 120 columns, `nodes list` uses a compact record layout. JSON is
never line-wrapped by the interactive adapter. Non-TTY invocation fails
immediately with `INTERACTIVE_TTY_REQUIRED` and exit code `2`.

## Next Steps

1. Validate Phase 3 read-only inspection and adoption metadata against a
   separately approved disposable testnet target.
2. Begin Phase 4 real health and reachability only after recording the Phase 3
   live result honestly.
3. Add large, conflicting, unsafe, and interrupted simulation scenarios.
4. Expose the same core use cases through an Electron-main typed bridge.
