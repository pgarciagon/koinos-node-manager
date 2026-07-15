# Koinos Node Manager Agent Instructions

Last updated: 2026-07-15

This file is concise operational guidance for Codex sessions. Detailed plans,
architecture decisions, validation reports, benchmarks, and implementation
history belong under `docs/`.

## Repository Purpose

Koinos Node Manager is an operator application for installing, inspecting,
monitoring, upgrading, backing up, recovering, and safely managing fleets of
Koinos nodes.

The product is CLI-first. The advanced CLI, Electron desktop application, and
a possible future controller-backed web application must use the same reusable
functional core. Teleno is the first supported node flavor, but the domain model
must not assume that it is the only possible Koinos node implementation.

## Active Product Boundary

- Active repository: `https://github.com/pgarciagon/koinos-node-manager`.
- Product name: Koinos Node Manager.
- Koinos Node Manager owns inventory, remote connections, fleet health,
  lifecycle plans, rollouts, artifacts, receipts, multi-node backups, and
  independent producer-fleet planning.
- [Koinos One](https://github.com/koinos/koinos-one) is a separate desktop
  product for installing and operating one primary local Teleno node. Do not
  expand Node Manager by modifying Koinos One unless the user explicitly asks
  for a coordinated cross-repository change.
- [Teleno](https://github.com/koinos/teleno) owns the native monolithic node
  runtime, protocol behavior, runtime configuration, native backup/restore,
  and native build identity. Runtime changes belong in that repository.
- Remote-management code currently present in Koinos One is extraction input,
  not the permanent shared-library boundary. Extract pure contracts and logic
  deliberately and reproduce their tests before removing the original path.
- Shared functionality must use independently versioned, UI-neutral contracts
  or packages. Do not share application navigation, persisted application
  state, secret stores, or implicit active-node context.

Read `docs/PRODUCT_BOUNDARY.md` before changing product ownership or adding a
cross-repository dependency.

## Language Policy

The user may communicate with Codex in Spanish or another language, but every
artifact created or modified in this repository must be written in English.

This rule applies without exception to:

- source code, identifiers, inline comments, and docstrings;
- documentation, plans, ADRs, manuals, and developer guides;
- UI labels, dialogs, status messages, and errors;
- CLI commands, help, prompts, progress, and output;
- tests, fixtures, snapshots, and test descriptions;
- configuration examples, templates, changelogs, release notes, commits, branch
  descriptions, and pull-request content.

Conversation may remain in the user's preferred language. Translate the intent
into clear, idiomatic technical English before writing repository artifacts.
English is the source language when localization is implemented. Translations
must use the localization system and must not create mixed-language source copy.

## Documentation Map

- Product boundary: `docs/PRODUCT_BOUNDARY.md`
- Active strategy: `docs/strategy/NODE_FLEET_STRATEGY.md`
- Active implementation plan: `docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md`
- CLI implementation plan: `docs/plans/CLI_IMPLEMENTATION_PLAN.md`
- Node onboarding MVP plan:
  `docs/plans/NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`
- Node inspection desktop MVP plan:
  `docs/plans/NODE_INSPECTION_DESKTOP_MVP_IMPLEMENTATION_PLAN.md`
- Node inspection desktop implementation goal:
  `docs/plans/NODE_INSPECTION_DESKTOP_MVP_IMPLEMENTATION_GOAL.md`
- Node inspection desktop UX review:
  `docs/ux/NODE_INSPECTION_DESKTOP_MVP_UX_REVIEW.md`
- Node inspection desktop UX correction plan:
  `docs/plans/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_PLAN.md`
- Node inspection desktop UX correction audit:
  `docs/validation/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_AUDIT.md`
- Node onboarding operator guide:
  `docs/guides/NODE_ONBOARDING_GUIDE.md`
- Read-only node-agent protocol:
  `docs/protocols/KOINOS_NODE_AGENT_PROTOCOL.md`
- Node onboarding completion audit:
  `docs/validation/TWO_MODE_NODE_ONBOARDING_MVP_AUDIT.md`
- Interactive CLI plan: `docs/plans/INTERACTIVE_CLI_IMPLEMENTATION_PLAN.md`
- CLI Phase 3 plan: `docs/plans/CLI_PHASE_3_IMPLEMENTATION_PLAN.md`
- CLI architecture: `docs/CLI_ARCHITECTURE.md`
- Local CLI and seed inspection guide:
  `docs/guides/LOCAL_CLI_AND_SEED_INSPECTION.md`
- Historical source plans: `docs/archive/README.md`
- UI explorations: `assets/ui/`

Read the relevant strategy, plan, and future ADR before making broad decisions
about architecture, transports, inventory, artifacts, backups, rollouts,
producer operations, or mainnet safety. Update documentation as implementation
status changes; do not let plans claim that unvalidated behavior has shipped.

## Architecture Rules

### Shared Core

- CLI, Electron main, and a future controller API are peer adapters over one
  functional core.
- The core must not depend on React, Electron, terminal formatting, prompts,
  HTTP controllers, or a specific process transport.
- Electron must import and call the core through typed APIs. It must not use CLI
  text parsing or spawn the CLI as its primary integration mechanism.
- The browser renderer must not access secrets, execute processes, open SSH
  connections, construct executable commands, sign transactions, or decide
  whether an operation is safe.
- A future browser UI talks to a controller API; browser code never executes the
  CLI or imports privileged Node.js functionality.
- Keep domain contracts, planners, policies, and state reducers deterministic
  and independently testable.

### Operation Lifecycle

Every important operation follows:

```text
inspect -> plan -> review -> confirm -> execute -> verify -> receipt
```

- Planning and execution are distinct operations.
- Plans are immutable, versioned, short-lived, and content-addressed by digest.
- Plans bind node, network, chain identity, role, artifact, inventory revision,
  expected preconditions, postconditions, and stop criteria.
- Any relevant change invalidates the reviewed plan and requires a new preview.
- Process exit code alone never proves success; postconditions determine the
  result.
- Ambiguous or interrupted operations reconcile observed state before retry.

### Adapters And Transports

- Local execution, SSH, and a possible future authenticated agent implement a
  common execution contract.
- Teleno-specific configuration, artifact, health, backup, and lifecycle logic
  belongs behind a node-flavor adapter.
- Unsupported flavor/location/supervisor combinations return typed unavailable
  results. Never generate empty commands or silently fall back.
- Do not expose an arbitrary remote shell or accept user-authored commands as
  the primary management model.

## CLI Contract

- The CLI is a complete, testable product interface, not a debugging wrapper.
- Every command provides concise human-readable output and versioned structured
  output where automation is meaningful.
- Use stable schemas for JSON and JSON Lines progress events.
- Errors are typed and include a stable code, severity, retryability, safe
  summary, and next action.
- Exit codes are documented and stable.
- Interactive prompts are optional; every workflow needed by tests or
  automation has an explicit non-interactive form.
- Sensitive actions do not use a generic `--yes`. Confirmation must bind to the
  reviewed plan, node, network, and operation.
- Never print secrets, raw private connection data, passwords, wallet material,
  tokens, or unsanitized command output.

## Inventory And Remote Execution Safety

- Inventory stores sanitized desired state and opaque references to private
  connection material. It does not store raw passwords, private keys, provider
  tokens, or wallet secrets.
- Node IDs are stable and distinct from display names, hostnames, or addresses.
- Verify node ID, connection reference, network, chain ID, role, artifact,
  supervisor, data directory, and ports before mutation.
- Detect duplicate node IDs, ports, data directories, service names, producer
  addresses, and producer keys across the fleet.
- Execute mutating fleet operations one node at a time by default.
- Stop a rollout on the first failed, blocked, or unsafe node. Leave pending
  nodes untouched.
- Fleet-level review never replaces exact per-node confirmation.
- Prevent concurrent restore, backup, upgrade, cleanup, or lifecycle mutation
  on the same node.
- Read-only health checks may use bounded concurrency and must not overload
  managed nodes or networks.
- Persist execution state before mutation and after every transition so work
  can be reconciled after CLI, Electron, controller, or transport interruption.

## Security And Privacy

- Treat live inventories, hostnames, IP addresses, SSH users, workloads,
  reachability, tokens, keys, wallets, and protected producer addresses as
  private local operational data.
- Never copy private operational data into public code, tests, documentation,
  logs, screenshots, receipts, telemetry, or examples.
- Public artifacts use placeholders such as `<SSH_CONNECTION_REF>`,
  `<MAINNET_PRODUCER_ADDRESS>`, and `<NODE_DATA_DIR>`.
- Apply sanitization at every boundary: process output, transport errors,
  progress events, persistence, exports, receipts, screenshots, and support
  bundles.
- Administrative, backup, signing, and secret surfaces bind privately by
  default. Public administrative exposure is a hard stop.
- Do not perform hidden or background chain, wallet, producer, infrastructure,
  or host mutations.
- Follow least privilege for filesystem permissions, SSH access, API tokens,
  controller roles, and future agents.

## Mainnet Mutation Policy

- Mainnet producer registration, VHP burn or transfer, wallet send, key change,
  producer activation, default-account change, and any transaction signing or
  submission are high-risk operations.
- They require a fresh explicit user request, verified network and chain ID,
  signer, payer, target, amount, node, operation, reviewable plan, and exact
  confirmation bound to that plan.
- Mainnet mutation is never enabled merely because the equivalent testnet flow
  passes.
- Presets, startup, restore, upgrade, background jobs, health polling, and fleet
  automation never activate a producer or submit a transaction.
- Mainnet mutations are never batch-approved. Execute and verify one transaction
  and one node at a time.
- After timeout or ambiguous submission, query chain state before offering a
  retry. Never automatically resubmit.
- Protected local mainnet identities must never transfer funds away or change
  state without a newly confirmed request covering that exact operation.

## Observer-First Policy

- Every installed, restored, upgraded, or recovered node starts as an observer
  unless an independently reviewed producer-continuity plan explicitly applies.
- Producer activation is a separate operation after node health, network, chain
  identity, local key, on-chain registration, VHP, ports, backup readiness, and
  duplicate-identity checks pass.
- Installing, restoring, upgrading, or adding a node to inventory never implies
  promotion to producer.
- Returning a producer to observer mode must remain an explicit, safe recovery
  action that preserves node data.

## Database Preservation And Recovery

If a node reports a state merkle mismatch, RocksDB failure, restore failure,
artifact mismatch, unknown identity, or interrupted mutation:

- preserve the existing state database;
- do not clear `chain/blockchain`;
- do not start from an empty state database as the first action;
- do not force a full resync as the first action;
- stop the affected rollout and leave later nodes untouched;
- attempt validation-based recovery before destructive recovery;
- require explicit approval and evidence before moving or deleting state;
- treat cleanup as a separate destructive plan;
- if rollback fails, leave the node stopped and marked unsafe with state
  preserved;
- record preservation, recovery, and rollback decisions in the receipt.

## Receipts And Evidence

- Every mutation creates a sanitized, versioned receipt containing the exact
  app/interface/core versions, Git commit, plan digest, node, network, artifact,
  timestamps, preconditions, steps, postconditions, and preservation outcome.
- Receipts prove what Node Manager planned, observed, executed, and verified.
  They do not claim unverified economic, legal, or off-chain outcomes.
- Test and release evidence uses disposable testnet targets or separately
  approved observer-only mainnet canaries.
- Mask private inventory values in screenshots and reports before committing.

## Desktop UI And Localization

- Visible UI state, labels, descriptions, empty states, status messages, errors,
  receipts, and manuals must match implemented behavior.
- CLI and desktop may present information differently, but shared states and
  safety meanings must remain identical.
- All visible source copy is English and goes through the localization catalog
  when localization exists. Spanish translations must be complete and
  internally consistent.
- The renderer displays intent and state; privileged execution and policy
  enforcement remain outside React.
- Do not expose raw JSON, shell commands, debug logs, or secret-bearing output
  in simple operator workflows.

## Visual And Layout Guardrails

- Use light neutral surfaces, restrained lavender/purple accents, blue-gray
  text, subtle borders, gentle shadows, and quiet rounded controls.
- Operational screens should be compact and calm, not marketing-oriented.
- Do not introduce isolated dark cards, neon palettes, oversized typography,
  or visually dominant decorative panels.
- Match established hierarchy, typography, spacing, radii, contrast, controls,
  tables, and status treatment before adding new component styles.
- Prefer parent padding and flex/grid `gap` over `width: 100%` plus horizontal
  margins. Account explicitly for padding and borders in the box model.
- Keep approximately 12–16 px inside bordered containers and 10–16 px between
  sibling surfaces unless the design system defines another rhythm.
- Verify the running screen or a screenshot at the expected window size.
- Check that `scrollWidth` does not exceed `clientWidth` unless intentional,
  borders have balanced breathing room, text remains readable, and status does
  not depend on color alone.

## Versioning And Build Identity

- Use SemVer for the product and independently version shared contracts when
  compatibility requires it.
- Every CLI, desktop, controller, and packaged build exposes product version,
  interface, build timestamp, Git commit, release channel, and core version.
- Receipts record the exact interface and core build that executed the action,
  plus the managed node artifact identity.
- Development trees use an explicit development prerelease version after a
  release and do not identify themselves as the last released build.
- User-facing changes update the changelog and relevant manuals in the same
  change.
- Release only after version, changelog, documentation, tests, packaged
  artifacts, and build identity agree.

## Testing And Validation

- Prefer pure unit tests for contracts, migrations, planners, policies, state
  machines, redaction, health parsing, and confirmation rules.
- Test adapters against shared contract suites so CLI, Electron, controller,
  local, SSH, and future agent behavior cannot drift semantically.
- Provide fake transports, deterministic clocks, fixtures, and disposable node
  targets for reliable functional tests.
- Test success, failure, interruption, ambiguity, cancellation, resume,
  rollback, downgrade, stale evidence, and destructive-action blocking.
- Validate CLI human output, JSON schemas, JSON Lines progress, exit codes, and
  non-interactive flows.
- Validate Electron through typed IPC, renderer isolation, packaged execution,
  accessibility, localization, and visual overflow checks.
- Use testnet before any mainnet-capable implementation. Mainnet observer
  validation requires a separately approved canary and sanitized evidence.

## Release And Documentation Rules

- Keep active implementation status in current documentation and future work in
  plans/backlog; archive superseded plans instead of duplicating them.
- Documentation describes actual behavior and explicitly labels planned,
  experimental, unavailable, and mainnet-disabled functionality.
- A feature is not complete until failure, recovery, rollback, docs, tests,
  localization, receipts, and packaged validation match its risk.
- Do not publish a release tag or artifact until all required release gates
  pass and exact remote state has been verified.

## Out Of Scope Unless Explicitly Reopened

- managed hosting, billing, fiat on-ramps, or payment-provider integration;
- embedded EVM wallets or automated swap/bridge/burn chains;
- provider APIs as a core dependency;
- shared producer keys across active nodes;
- arbitrary remote shell access;
- a persistent remote agent as the initial transport;
- Fogata pool mutation before Layer 3 prerequisites and contract review;
- mainnet producer fleet mutation without a separate explicit approval.
