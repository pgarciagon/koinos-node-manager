# Koinos Node Manager

Koinos Node Manager is a planned operator application for installing,
monitoring, upgrading, backing up, and safely managing fleets of Koinos nodes.

It is intentionally separate from
[Koinos One](https://github.com/koinos/koinos-one):

- **Koinos One** runs and operates one high-performance local Teleno node on a
  desktop computer.
- **Koinos Node Manager** manages multiple local or remote nodes for operators
  responsible for infrastructure at fleet scale.
- **Teleno** is the native monolithic node runtime and remains independently
  versioned in [`koinos/teleno`](https://github.com/koinos/teleno).

## Status

This repository is in active CLI implementation. CLI Phases 0, 1, 1.5, and 2
are complete. Phase 3 connections, discovery, and adoption are implemented and
deterministically validated; its disposable-live-testnet exit criterion remains
pending because no target has been separately approved. The compiled executable provides batch commands and a prompt-driven
interactive terminal over the same typed command executor and functional core.
It includes stable structured errors and exit codes, human and JSON output,
deterministic simulations, hierarchical help and completion, exact build
identity, complete inventory filters, explicit declared, desired, observed,
and verified node state, and a versioned atomic local inventory with migration,
backup, quarantine, and recovery checks. It also provides opaque SSH-alias
connections, bounded allowlisted read-only probes, sanitized discovery
evidence, and digest-reviewed inventory-only adoption.

The existing remote-management MVP was developed inside Koinos One; its
technical plans and evidence have been moved here as the starting point for a
clean product extraction.

No mainnet producer mutation is authorized or implemented by this repository
at this stage.

## CLI Quick Start

Requirements: Node.js 22 or later.

```bash
npm install
npm run cli -- paths
npm run cli -- doctor
npm run cli -- nodes list
npm run cli -- connections --help
npm run cli -- version
npm run cli -- nodes --help
```

Start the interactive terminal from a real TTY:

```bash
npm run cli -- interactive
npm run cli -- --simulation stale-health interactive --no-color
```

The prompt starts on the local persisted inventory. Inside it, omit the leading
`knm`:

```text
[inventory:local] knm> nodes list
[inventory:local] knm> nodes add --id lab-observer --name "Lab Observer" --network testnet
[inventory:local] knm> nodes show lab-observer
[inventory:local] knm> /scenario stale-health
[sim:stale-health] knm> /help
[sim:stale-health] knm> /inventory
[inventory:local] knm> nodes remove lab-observer --confirm lab-observer
[inventory:local] knm> /exit
```

The interactive terminal supports registry-driven completion, sanitized
in-memory history, `/help`, `/commands`, `/status`, `/inventory`, `/scenario`,
`/history`, `/clear`, and `/exit`. It does not interpret natural language or
shell syntax, does not remember an active node, and does not persist prompt
history or presentation state. Inventory commands use the same persisted
repository as batch mode.

## Persisted Inventory

Normal commands use the local inventory. Add and update sanitized metadata
without contacting a node:

```bash
npm run cli -- nodes add \
  --id lab-observer \
  --name "Lab Observer" \
  --management managed \
  --origin provisioned \
  --flavor teleno-monolith \
  --network testnet \
  --location local \
  --environment mac \
  --authority full \
  --function observer

npm run cli -- nodes update lab-observer --name "Primary Lab Observer"
npm run cli -- nodes show lab-observer
npm run cli -- nodes remove lab-observer --confirm lab-observer
```

`nodes remove` deletes only the inventory record. It does not stop the node,
uninstall software, or delete node data. Managed records always receive an
observer-safe desired role; adding inventory metadata never activates a
producer.

The storage root resolves in this order:

1. `KNM_HOME` for an explicit portable or isolated root;
2. `~/Library/Application Support/Koinos Node Manager` on macOS;
3. `%APPDATA%/Koinos Node Manager` on Windows;
4. `$XDG_CONFIG_HOME/koinos-node-manager` or
   `~/.config/koinos-node-manager` on Linux and other Unix systems.

The repository uses private directories and files, optimistic revisions, an
exclusive writer lock, file and directory synchronization, and atomic rename.
It retains up to ten backups before replacements. Supported legacy data is
backed up before migration. Corrupt or unsafe active data is removed from
service and replaced by sanitized quarantine evidence containing only a hash,
size, reason, and timestamp.

Inspect readiness or recover the newest valid backup explicitly:

```bash
npm run cli -- doctor
npm run cli -- doctor --output json
npm run cli -- doctor --recover-inventory
npm run cli -- doctor --recover-connection-state
```

## Connections, Discovery, And Adoption

Configure the private host, user, identity file, and other SSH details in a
normal exact `Host` entry in SSH config. Node Manager stores the alias only in
its private connection-state repository and never stores or displays resolved
hosts, users, passwords, key paths, or tokens:

```bash
npm run cli -- connections add ssh --id lab-target --host-alias my-private-ssh-alias
npm run cli -- connections list
npm run cli -- connections show lab-target
npm run cli -- connections test lab-target
```

`connections test` can run only the predefined bounded handshake probe. Host
and peer discovery can read only the versioned inspection manifests documented
in the Phase 3 plan; callers cannot provide command text:

```bash
npm run cli -- discover host --connection lab-target
npm run cli -- discoveries list
npm run cli -- discover peers --from lab-observer
```

Peer discovery does not add inventory records. `--save` retains sanitized
evidence only. Adoption is a separate review and exact-digest application:

```bash
npm run cli -- nodes adoption inspect --connection lab-target
npm run cli -- nodes adoption plan --connection lab-target --id lab-observer --name "Lab Observer"
npm run cli -- nodes adoption apply <review-id> --confirm <review-digest>
```

Adoption writes only Node Manager inventory metadata. It never installs,
configures, starts, stops, restarts, upgrades, or deletes the inspected runtime.
Complete verified evidence produces a managed adopted observer-safe record;
incomplete evidence produces a connected limited-authority record. Producer
and wallet authority remain disabled.

`doctor` checks inventory-to-connection references, exact SSH aliases, and
discovery storage without contacting any host. Remote handshake probes occur
only with the explicit `doctor --check-connections` option.

Filter the simulated inventory:

```bash
npm run cli -- --simulation default nodes list --management managed
npm run cli -- --simulation default nodes list --origin imported --flavor teleno-monolith
npm run cli -- --simulation default nodes list --location remote --authority limited
npm run cli -- --simulation default nodes list --network mainnet --function seed --health healthy
npm run cli -- --simulation stale-health nodes list --staleness stale
npm run cli -- --simulation default nodes show node-nas-observer
npm run cli -- --simulation default nodes show node-nas-observer --section observed
npm run cli -- simulation scenarios
npm run cli -- --simulation empty nodes list
```

Request the schema v2 structured envelope:

```bash
npm run cli -- --simulation default nodes list --management external --output json
```

Build and execute the compiled CLI:

```bash
npm run build
node dist/cli/main.js nodes list
```

Run the complete source and compiled-CLI verification:

```bash
npm run verify
```

The CLI calls shared inventory use cases through `NodeRepository` and
`InventoryRepository` ports. `FileSystemInventoryRepository` is the default
local adapter and `SimulatedNodeRepository` remains an explicit deterministic
test adapter. Electron main can use the same typed ports and use cases without
parsing CLI output. `nodes show` returns a typed `NODE_NOT_FOUND` error with
exit code `3` when the stable ID does not exist.

Inventory filters and table summaries use an effective factual view resolved
in the functional core: verified facts take precedence over observed facts,
which take precedence over declared facts. Desired state is shown separately
and is never treated as evidence. Observation freshness is explicit as
`fresh`, `stale`, or `never`; simulation results do not depend on the wall
clock.

`knm version` reports the product, CLI interface, functional core, Git commit,
release channel, build timestamp, and whether the source tree was clean at
build time.

## Documentation

- [Product and architecture boundary](docs/PRODUCT_BOUNDARY.md)
- [Node Fleet strategy](docs/strategy/NODE_FLEET_STRATEGY.md)
- [Implementation plan](docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md)
- [CLI implementation plan](docs/plans/CLI_IMPLEMENTATION_PLAN.md)
- [Interactive CLI implementation plan](docs/plans/INTERACTIVE_CLI_IMPLEMENTATION_PLAN.md)
- [CLI Phase 3 implementation plan](docs/plans/CLI_PHASE_3_IMPLEMENTATION_PLAN.md)
- [CLI Phase 2 persisted inventory audit](docs/validation/CLI_PHASE_2_PERSISTED_INVENTORY_AUDIT.md)
- [CLI Phase 3 completion audit](docs/validation/CLI_PHASE_3_CONNECTIONS_DISCOVERY_ADOPTION_AUDIT.md)
- [Archived source plans](docs/archive/README.md)
- [UI explorations](assets/ui/)

## Intended Architecture

```text
Koinos Node Manager
  |
  +-- fleet inventory and policy
  +-- deterministic plans and receipts
  +-- health, rollout, backup, and recovery orchestration
  +-- SSH transport initially; authenticated agent/controller later if needed
  |
  +-- Teleno nodes
  +-- other compatible Koinos node flavors in the future
```

Shared code with Koinos One should be limited to versioned contracts and
libraries such as node capabilities, health schemas, artifact identity,
administrative clients, plan/receipt formats, and reusable visual tokens.
Application navigation, persisted state, secrets, and orchestration remain
product-specific.

## License

No license has been selected yet. Until one is added, all rights are reserved.
