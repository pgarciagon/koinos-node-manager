# Changelog

All notable changes to Koinos Node Manager will be documented in this file.

## [0.1.0-dev.0] - Unreleased

### Added

- Node Inspection Desktop MVP with a sanitized persisted node directory,
  responsive Nodes and empty states, and read-only Node Detail sections for
  Overview, Components, Chain, and Governance.
- Versioned `PublicNodeDirectory 1.0.0`, deterministic core-owned summary
  derivation and ordering, and a narrow Electron `nodes.list()` /
  `nodes.inspect(nodeId)` bridge over the existing inspection API.
- Explicit deduplicated Refresh with previous-snapshot retention and stale
  marking on failure, plus direct Quick and Full onboarding handoff to the same
  stable node.
- Deterministic browser fixtures isolated from production packages, an
  eight-state responsive screenshot matrix, Electron IPC and renderer-boundary
  tests, and packaged desktop validation.
- Two-mode existing-node onboarding across the functional core, batch and
  interactive CLI, and a thin Electron application: endpoint-only Quick
  Connect, authenticated read-only-agent Full Connect, and preserved
  exact-alias SSH Expert Connect.
- Versioned private public-RPC and agent connection records, multiple access
  bindings per stable node, deterministic Full/Expert/Quick selection, and
  Quick-to-Full in-place upgrade without duplicate inventory records.
- Digest- and revision-bound onboarding reviews, a private cross-repository
  commit journal, deterministic interruption reconciliation, cancellation,
  status, doctor checks, and operating-system secret-store references.
- SSRF-resistant fixed Koinos RPC transport with reviewed private destinations,
  pinned DNS resolution, no redirects, bounded concurrency, time, bytes, and
  JSON depth, plus an explicitly partial public-RPC inspection adapter.
- `KoinosNodeAgentProtocol 1.0.0`, deterministic fake agent, fixed HTTPS client,
  Ed25519 identity pinning and possession proof, signed build statements,
  short-lived single-use pairing, inspect-only revocable credentials, and a
  closed typed probe catalog with no arbitrary command or RPC surface.
- `onboarding quick preview|apply`, `onboarding full preview|pair|apply|revoke`,
  `onboarding status|cancel|reconcile`, private stdin and hidden interactive
  input, access override for `nodes inspect`, registry help, and completion.
- Electron Quick and Full onboarding workflows over the same core, typed IPC,
  main-owned clipboard pairing import, context isolation, renderer isolation,
  accessible states, responsive layout, smoke validation, and packaged-app
  validation.
- Onboarding ADR, threat model, agent protocol, operator guide, Electron
  boundary documentation, and a requirement-by-requirement completion audit.
- CLI-first TypeScript project, compiled `knm` binary, and strict test setup.
- Compositional node model for managed, connected, external, and discovered
  nodes with separate declared, desired, observed, and verified state.
- Deterministic simulation repository with default, empty, mixed-health, and
  stale-health scenarios.
- `knm nodes list` with table/JSON output and management, origin, flavor,
  network, location, authority, function, health, and staleness filters.
- `knm nodes show <node-id>` with complete human/JSON detail and focused
  summary, declared, desired, observed, and verified sections.
- `knm simulation scenarios` and explicit per-command `--simulation` selection.
- Typed application errors, versioned JSON error envelopes, and not-found exit
  code `3`.
- Typed command registry with independently registered CLI commands.
- `knm version` with product, interface, core, Git, channel, timestamp, and
  source-state build identity in human and JSON formats.
- Generated build metadata embedded in both development and compiled CLI runs.
- Top-level, resource-specific, and command-specific help generated from the
  command registry.
- Stable centralized exit-code constants and contract tests.
- Compiled CLI smoke validation and the aggregate `npm run verify` gate.
- CLI architecture and full command implementation roadmap.
- Shared process-independent command executor used by batch and interactive
  adapters.
- Initial `knm interactive` read-only prompt with visible simulation mode, session-local
  scenario switching, metacommands, sanitized in-memory history, and clean
  Ctrl+C/Ctrl+D behavior.
- Deterministic quoted-argument tokenizer that rejects shell operators,
  redirection, substitution, and oversized input.
- Registry-driven completion for commands, options, enum values, scenarios,
  node IDs, and node-detail sections.
- Readline terminal adapter with TTY enforcement, optional color, terminal-width
  handling, compact narrow inventory output, and compiled non-TTY validation.
- Portable local storage paths with `KNM_HOME`, platform conventions, and the
  `knm paths` support command.
- Versioned filesystem inventory with optimistic revisions, an exclusive
  writer lock, private permissions, synchronized temporary files, atomic
  replacement, and bounded backups.
- Backup-before-migration support for inventory schema `0` to schema `1`.
- Sanitized corruption quarantine evidence and explicit recovery from the
  newest valid inventory backup.
- `knm nodes add`, `nodes update`, and confirmation-bound inventory-only
  `nodes remove` commands in human and schema v2 JSON forms.
- `knm doctor` checks for runtime compatibility, path permissions, inventory
  schema and records, duplicate IDs, backups, quarantine evidence, and
  interrupted temporary writes.
- Persisted-inventory unit, migration, fault-injection, recovery, source CLI,
  interactive parity, restart-persistence, and compiled CLI tests.
- Private versioned `connection-state.json` persistence with revisions, atomic
  replacement, migration, backups, corruption quarantine, and recovery.
- `connections list`, `show`, `add ssh`, `test`, and exact-confirmation
  `remove` commands over opaque SSH-config aliases.
- Typed allowlisted read-only probe contract, exact SSH alias resolver, bounded
  SSH adapter, and deterministic success, authentication, timeout,
  unreachable, malformed, unsupported, and partial-authority scenarios.
- Sanitized Teleno host and peer discovery with retained provenance,
  freshness, dismissal, and no implicit inventory creation.
- Digest-reviewed `nodes adoption inspect`, `plan`, `apply`, and `list`
  workflows that create managed adopted or connected limited-authority
  inventory records without runtime mutation.
- Phase 3 batch, interactive, restart, repository, migration, sanitization,
  fake-transport, timeout, structured-output, and compiled-CLI validation.
- Versioned, UI-neutral `NodeInspectionSnapshot` schema and inspection
  capability/evidence contracts with explicit available, unavailable, and
  unknown states, provenance, freshness, authority, warnings, and typed
  reasons.
- Sanitized public inspection DTO and versioned `NodeInspectionApi` suitable
  for direct Electron-main and future controller use without CLI parsing.
- `LegacyMultiserviceInspectionAdapter` over fixed bounded read-only Docker,
  restricted configuration, Koinos JSON-RPC, and storage probes.
- `TelenoInspectionAdapter` mapping the existing versioned `node.get_status`
  surface into the same runtime-neutral contract with unsupported facts left
  explicit.
- `knm nodes inspect <node-id>` overview, components, chain, and governance
  views in human and schema-versioned JSON output, with batch/interactive help
  and completion parity.
- Deterministic inspection schema, evidence, adapter-contract, fixture,
  redaction, invalid-input, typed-error, restart, interactive, and compiled-CLI
  validation.
- Separately approved live legacy-multiservice validation with identical
  pre/post configuration and component evidence, batch/interactive parity, and
  no persisted inspection state or runtime mutation.
- Additional approved legacy seed-node validation proving that a deployed and
  running block-producer service is not reported as configured or effective
  production without independent producer-address evidence.
- Approved isolated live-desktop validation against a public mainnet seed using
  Quick Connect, including explicit refresh, section navigation, CLI parity,
  and restart persistence without runtime or blockchain mutation.

### Changed

- Desktop onboarding now presents the persisted Quick and Full access contracts
  as outcome-led **Basic inspection** and **Complete inspection** choices while
  retaining the existing core, CLI, persistence, and inspection semantics.
- Private-destination confirmation is hidden for approved public destinations
  and appears only after the privileged endpoint policy returns its typed
  review-required error; the renderer performs no endpoint classification.
- Partial Node Detail now prioritizes available chain evidence, summarizes
  Basic-inspection limitations once, keeps all typed unavailable details
  reachable, and labels unavailable Components and Governance sections as
  **Limited**.
- Freshness, capture time, explicit Refresh, retained stale evidence, and local
  retry now form one status interaction; initial inspection failure presents a
  single contextual retry without empty detail tabs.
- Onboarding and detail tablists now use roving tabindex with arrow, Home, End,
  and wraparound behavior, plus a high-contrast focus-visible indicator and
  responsive layouts validated at 1060x720, 760x560, and 360x640.
- Consolidated local CLI installation, SSH key onboarding, persisted seed-node
  registration, read-only inspection, interactive use, and troubleshooting into
  one operator guide linked from the README.
- Refocused the active implementation roadmap on a read-only MVP for inspecting
  existing legacy multiservice nodes, with a shared versioned inspection
  contract for CLI, Teleno compatibility, Electron, and a future controller.
- Structured envelopes now use schema version `2` because node records expose
  explicit state layers instead of a mixed flat state.
- Effective inventory facts resolve verified evidence before observed evidence
  and observed evidence before declarations; desired intent is never treated
  as factual state.
- Observation freshness is explicit and deterministic as `fresh`, `stale`, or
  `never`.
- Human and structured node views redact private endpoints and replace raw
  operational identity values with presence markers at the output boundary.
- Normal CLI and interactive sessions now use the persisted local inventory by
  default; deterministic simulations require explicit `--simulation` or a
  session-local `/scenario` command.
- Interactive mode now displays `[inventory:local]` for persisted state,
  supports `/inventory` to leave simulation mode, refreshes node-ID completion
  after inventory changes, and runs inventory mutations through the shared
  command executor.
- Opaque connection references are accepted only in a restricted format and
  are replaced by presence markers in human and structured output.
- Interactive completion now supports nested command paths plus dynamic
  connection, discovery, and adoption review identifiers.
- `doctor` now checks connection-state storage, inventory connection-reference
  integrity, and exact SSH aliases without remote contact; bounded remote
  handshakes require explicit `--check-connections`.
- Legacy chain identity parsing now accepts bounded padded base64/base64url
  encodings, block-store samples newer than the concurrent chain sample remain
  unknown instead of producing a false mismatch, and the fixed secondary
  producer service is normalized without exposing its runtime-specific name.
- Pinned HTTPS DNS lookup now supports both the single-address and `all: true`
  callback shapes used by Node.js 22, preserving address pinning for public RPC
  and node-agent requests without false unreachable results.
- Public RPC inspection now recognizes the canonical Koinos mainnet chain ID,
  and deterministic mainnet fixtures use the same identity.
