# CLI Phase 2 Persisted Inventory Completion Audit

- Status: complete
- Audited: 2026-07-12
- Product version: `0.1.0-dev.0`
- Scope: CLI Phase 2 only
- Next phase: CLI Phase 3 connections, discovery, and adoption

## Outcome

Phase 2 is complete. Normal batch and interactive commands use a local,
versioned inventory. Deterministic simulations remain explicit and read-only.
Inventory metadata survives process restarts, invalid data cannot enter
service, atomic replacement and recovery behavior are tested, and no command in
this phase contacts or mutates a managed node.

## Requirement Audit

| Requirement | Evidence | Result |
| --- | --- | --- |
| Portable configuration and inventory paths | `inventory-paths.ts`, `knm paths`, and `inventory-paths.test.ts` cover `KNM_HOME`, macOS, Windows, XDG, and Unix conventions. | Pass |
| Versioned atomic filesystem repository | Inventory schema `1`, revisions, private modes, exclusive lock, stale-lock reconciliation, file/directory sync, temporary file, atomic rename, and bounded backups are implemented in `file-system-inventory-repository.ts`. | Pass |
| Inventory CRUD commands | `nodes add`, `nodes update`, and exact-confirmation inventory-only `nodes remove` have human and schema v2 JSON contracts. | Pass |
| Stable compositional state | IDs cannot be updated; declared, desired, observed, and verified layers remain separate; metadata updates preserve evidence layers. Managed records receive observer-safe desired functions. | Pass |
| Invalid and duplicate record rejection | Strict runtime validation rejects malformed records, unknown fields, invalid IDs/references, unsupported enums, and duplicate IDs before persistence. | Pass |
| Secret exclusion and sanitization | CLI inputs cannot persist passwords, keys, tokens, mnemonic material, wallet material, private key paths, or arbitrary fields. Opaque connection references use a restricted syntax and render only as presence markers. | Pass |
| Migration and backup | Supported schema `0` is validated, backed up, migrated once, revisioned, and written atomically. Repeated reads are idempotent. | Pass |
| Corruption quarantine and recovery | Unsafe active data is removed from service. Quarantine stores only digest, size, reason, and timestamp. `doctor --recover-inventory` restores the newest valid backup explicitly. | Pass |
| Inventory doctor | Runtime, root and file permissions, schema, records, duplicates, backups, quarantine evidence, temporary writes, and writer lock state are checked without contacting nodes. | Pass |
| Batch and interactive parity | Both adapters use the shared executor, mutation use cases, and repository. Interactive completion refreshes after writes and `/scenario` and `/inventory` switch sources explicitly. | Pass |
| Existing CLI contracts | Typed errors, stable exit codes, schema v2 envelopes, help, build identity, sanitization, and simulation behavior remain covered by regression tests. | Pass |
| Documentation and status | README, changelog, CLI architecture, interactive plan, active CLI plan, and this audit describe the implemented behavior and boundaries. | Pass |

## Failure And Recovery Evidence

The filesystem contract suite proves:

- a fault before atomic rename leaves the previous revision readable;
- a stale expected revision returns `INVENTORY_REVISION_CONFLICT` with exit code
  `10` instead of overwriting newer data;
- a concurrent live or recent writer lock blocks with `INVENTORY_LOCKED`;
- an old lock whose process no longer exists is reconciled before writing;
- invalid syntax and raw sensitive fields leave no active inventory and create
  sanitized corruption evidence without reproducing sensitive values;
- a valid backup restores service only through explicit recovery;
- schema migration creates a rollback copy before replacement;
- group or other access on the inventory file fails the permission check.

## Verification Gate

The final `npm run verify` gate passed on 2026-07-12:

- TypeScript strict type checking passed;
- 109 source tests across 26 suites passed;
- compiled CLI smoke validation passed for version, simulation, help, local
  add/list/remove persistence, doctor, structured output, and non-TTY behavior;
- `git diff --check` passed.

A disposable `KNM_HOME` manual exercise also covered paths, empty startup,
add, show, update, doctor, removal, revisions, backups, and private local files.
A real PTY exercise covered the local prompt, persisted add/show/remove,
schema v2 JSON, explicit stale-health simulation switching, `/inventory`, and a
clean exit code `0`.
No live host, Koinos RPC endpoint, SSH connection, wallet, producer, or mainnet
mutation was used.

## Explicitly Deferred

- arbitrary configuration values and secret storage;
- SSH and remote execution;
- connection testing, discovery, and adoption;
- real health polling, logs, diagnostics, and support bundles;
- lifecycle plans, runtime mutation, receipts, and rollouts;
- producer, wallet, VHP, transaction, and mainnet operations.
