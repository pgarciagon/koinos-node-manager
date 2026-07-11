# Product And Repository Boundary

Last updated: 2026-07-11

## Decision

Koinos One and Koinos Node Manager are separate products.

Koinos One has one primary job: install and operate one local, high-performance
monolithic Koinos node through a native desktop experience. Koinos Node Manager
has a different operator job: manage many nodes, usually remote, through an
inventory, health policies, rollouts, receipts, and recovery workflows.

## Ownership

### Koinos One

- one local Teleno runtime;
- first-run installation and local data folder;
- public-backup restore and local synchronization;
- local Explorer, Dashboard, Node, Producer, Wallet, and Backup experiences;
- packaged macOS application, followed by other desktop platforms;
- local node and wallet safety.

### Koinos Node Manager

- fleet inventory and desired/observed state;
- remote and optional additional local nodes;
- SSH/server connection references;
- multi-node health and alerts;
- install, upgrade, rollback, backup, and restore plans;
- canary and sequential fleet rollouts;
- artifact policies and receipts;
- independent producer identities and VHP allocation planning;
- future multi-operator controller or authenticated node agent.

### Teleno

- native monolithic Koinos runtime;
- protocol components and compatibility;
- runtime configuration and build identity;
- health and administrative capabilities exposed through stable interfaces;
- native backup and restore implementation.

## Shared Components

Potential shared packages must be independently versioned and must not import
application UI or application persistence:

- node capability and health contracts;
- Teleno administrative client;
- artifact manifest and build-identity schemas;
- plan, progress, receipt, and redaction primitives;
- Koinos network and producer-readiness query types;
- optional design tokens and low-level controls.

Koinos One remains usable without Koinos Node Manager. Koinos Node Manager must
manage nodes without launching Koinos One on every target.

## Migration Rule

Remote/fleet source currently implemented in Koinos One is migration input, not
the permanent shared library boundary. Extract pure contracts and planners
first, reproduce their tests here, and only then remove application-specific
remote UI/services from Koinos One in a separately reviewed change.

Historical documents may mention Koinos One because that is where the remote
MVP originated. They are preserved as evidence and are not current ownership
statements.
