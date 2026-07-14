# Node Inspection Desktop MVP Implementation Plan

- Status: complete; deterministic, packaged, and approved public mainnet
  live-desktop gates passed on 2026-07-14
- Date: 2026-07-14
- Product: Koinos Node Manager
- Product principle: simplicity with immediate operator value
- Execution goal:
  `docs/plans/NODE_INSPECTION_DESKTOP_MVP_IMPLEMENTATION_GOAL.md`
- Depends on:
  - `docs/PRODUCT_BOUNDARY.md`
  - `docs/strategy/NODE_FLEET_STRATEGY.md`
  - `docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md`
  - `docs/plans/NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`
  - `docs/CLI_ARCHITECTURE.md`
  - `docs/validation/CLI_PHASE_4_MULTISERVICE_INSPECTION_MVP_AUDIT.md`

## 1. Decision

The next GUI slice is a small read-only node directory and inspection view.
It completes the useful journey that currently stops after onboarding:

```text
Open application
  -> see existing nodes
  -> select one node
  -> inspect its current evidence
  -> refresh explicitly
```

Successful Quick or Full onboarding opens the same node inspection view. The
renderer consumes the existing sanitized `NodeInspectionSnapshot`; it does not
parse CLI output or interpret transport-specific data.

This is not a fleet dashboard, monitoring system, or lifecycle console. It is
the smallest desktop surface that lets an operator answer: **What node is
this, is its chain progressing, what is running, and what governance evidence
is active or observable?**

## 2. Value And Complexity Budget

The MVP is limited to:

- **two primary screens:** Nodes and Node Detail;
- **four detail sections:** Overview, Components, Chain, and Governance;
- **one live action:** Refresh inspection;
- **one navigation handoff:** completed onboarding opens Node Detail; and
- **one read model:** the same public DTO already used by the inspection core.

The implementation must not add:

- a frontend framework or router solely for this slice;
- charts, configurable dashboards, widgets, or saved layouts;
- background polling, notifications, fleet health, or historical time series;
- persisted inspection snapshots or a new cache;
- search, filters, pagination, bulk selection, or multi-node actions;
- logs, diagnostics bundles, lifecycle controls, backups, upgrades, rollouts,
  wallets, producer changes, or transaction submission; or
- renderer access to Node.js, the filesystem, connections, secrets, SSH,
  Docker, HTTP, JSON-RPC, or runtime-specific payloads.

If a proposed feature does not help the operator understand one selected node
in the current session, it is deferred.

## 3. Operator Journeys

### 3.1 Open an existing node

1. Launch Koinos Node Manager.
2. See persisted inventory nodes sorted by display name.
3. Select a node.
4. Electron main performs one bounded read-only inspection using the preferred
   verified access path.
5. Node Detail renders the sanitized result and its capture time.
6. Select **Refresh** to repeat the bounded inspection explicitly.

Opening a node does not change inventory, runtime, host, producer, wallet, or
blockchain state.

### 3.2 Continue after onboarding

1. Complete the existing Quick or Full review.
2. Apply the reviewed node.
3. Navigate directly to Node Detail using the stable node ID.
4. Render the inspection returned by onboarding when it is still current;
   otherwise run one explicit inspection.
5. Provide **Back to nodes** as the primary return path.

The operator must not have to add the node and then rediscover it manually.

### 3.3 Understand partial evidence

Quick Connect and unsupported runtime capabilities are normal partial states,
not generic failures. The UI renders `available`, `unavailable`, and `unknown`
values explicitly and includes the typed reason in plain language.

The interface never infers component health, producer state, or local
governance configuration from endpoint reachability alone.

## 4. Screen Contract

### 4.1 Nodes

The Nodes screen contains:

- product title and **Add node** action;
- one row per persisted node;
- display name and stable node ID;
- declared network and runtime flavor;
- available access modes as `Quick`, `Full`, or `Expert`; and
- an honest empty state with one **Add your first node** action.

It does not show live health. A directory row must not look healthy merely
because a connection exists or was verified previously.

The first version uses a simple responsive list. Inventory order and public
field derivation belong in the functional core, not the renderer.

### 4.2 Node Detail

The header contains:

- display name and stable node ID;
- network and runtime flavor;
- access mode used for the current inspection;
- a persistent **Read only** label;
- capture time and `Fresh` or `Stale` state;
- **Back to nodes**; and
- **Refresh**.

The default Overview section presents the highest-value facts:

- runtime, build, supervisor, deployment layout, and uptime;
- chain progress, head height, head age, and last irreversible block;
- P2P gossip and peer count when available;
- API exposure warnings;
- producer configured/effective state and recent activity without exposing an
  address; and
- resource evidence only when the adapter reports it reliably.

The remaining sections contain:

- **Components:** normalized name, state, restart count, uptime, and artifact;
- **Chain:** head, irreversible block, progress, block-store agreement, fork
  evidence, gossip, and peers; and
- **Governance:** configured proposal IDs, effective proposal IDs, votes
  observed in block headers, and network proposal status/tally as four
  separate evidence categories.

Unavailable fields show a concise explanation such as **Unavailable through
Quick Connect**. Detailed transport, command, path, endpoint, peer identity,
producer address, or configuration data never appears.

### 4.3 View states

The renderer has a small explicit state model:

```text
directory: loading | empty | ready | error
detail:    loading | ready | partial | stale | error
```

During refresh, retain the previous snapshot visibly and mark it as being
refreshed. Replace it only after a complete sanitized response arrives. If the
refresh fails, keep the previous snapshot, mark it stale, and show the typed
safe error and next action.

The UI never represents an unavailable node as having zero components, zero
peers, or no governance votes. Absence of evidence is not negative evidence.

## 5. Application And Security Design

### 5.1 Public node directory contract

Add one narrow, versioned, UI-neutral directory API. It returns only the
fields needed by the Nodes screen:

```text
PublicNodeSummary 1.0
  nodeId
  displayName
  network
  runtimeFlavor
  availableAccessModes[]
  preferredAccessMode
```

Connection references, endpoints, hostnames, users, paths, service names,
credentials, identities, and raw `NodeRecord` values do not cross this
boundary. The directory API owns sorting and public DTO construction.

### 5.2 Existing inspection contract

Reuse `NodeInspectionApi 1.0` and `PublicNodeInspectionSnapshot`. Do not create
a desktop-only inspection schema and do not duplicate availability,
freshness, evidence-precedence, or sanitization logic in Electron.

The first detail load requests all four supported inspection sections with a
bounded timeout. Access selection remains in the functional core. The response
must continue to declare `runtimeChanged: false` and `persisted: false`.

### 5.3 Electron boundary

Expose one new narrow preload bridge with two operations:

```text
nodes.list()
nodes.inspect(nodeId)
```

Electron main constructs the existing application context, calls the public
directory and inspection APIs, validates unknown input fields, converts errors
to the existing public error contract, and returns sanitized DTOs only.

The renderer does not choose transports, resolve connection references, set
timeouts, construct probes, or receive command output. Existing context
isolation, sandboxing, disabled Node integration, and `connect-src 'none'`
remain mandatory.

### 5.4 Renderer structure

Keep the current HTML, CSS, and TypeScript approach. Add a small application
view reducer and focused rendering modules instead of introducing React or a
router for two screens.

Use text nodes and safe attribute assignment; never render operator or runtime
data through `innerHTML`. Navigation is in-memory application state. On launch,
the application opens Nodes. On successful onboarding, it opens Node Detail.

## 6. Implementation Sequence

### Step 1 — Freeze the public directory and desktop bridge

- define `PublicNodeSummary` and its versioned response envelope;
- implement directory mapping and sorting in the functional core;
- prove that private references and placeholder-bearing internal records
  cannot cross the public boundary;
- extend Electron main and preload with `list` and `inspect`; and
- add malformed-input and structured-public-error tests.

Exit: Electron main can list safe node summaries and inspect one node without
renderer changes or CLI parsing.

### Step 2 — Add the Nodes screen

- introduce a minimal application shell and view reducer;
- render loading, empty, ready, and error states;
- add **Add node** and preserve the existing onboarding wizard;
- open Node Detail from a keyboard-accessible node row; and
- verify responsive layout without horizontal overflow.

Exit: an operator can launch the application, see persisted nodes, begin
onboarding, and select a node.

### Step 3 — Add Node Detail

- request all inspection sections through the typed bridge;
- render the header, warnings, freshness, and four sections;
- map every availability reason to concise safe copy;
- keep governance evidence categories separate;
- add explicit Refresh with previous-snapshot preservation; and
- keep unsupported evidence visible and honest.

Exit: complete, partial, stale, and unavailable snapshots are understandable
without exposing raw operational data.

### Step 4 — Complete the onboarding handoff

- navigate a committed Quick or Full review to the stable node detail route;
- reuse a current onboarding inspection where safe;
- preserve the node ID during Quick-to-Full upgrade;
- ensure Cancel returns to the prior safe screen; and
- keep pairing secrets and private endpoints out of renderer state.

Exit: the onboarding journey ends in useful node information rather than a
terminal success message.

### Step 5 — Validate and document

- update CLI help only if shared terminology changes;
- update README, architecture, active implementation status, changelog, and
  operator guide;
- add `docs/validation/NODE_INSPECTION_DESKTOP_MVP_AUDIT.md`;
- run `npm run verify` and `npm run test:electron:packaged`; and
- perform a sanitized read-only desktop validation against a separately
  approved node when available.

Exit: deterministic, compiled, Electron, packaged, visual, and documentation
gates agree with actual behavior.

## 7. Test Matrix

### Pure and application tests

- public directory schema/version and deterministic sorting;
- no private connection, endpoint, identity, path, or secret fields;
- complete, Quick/partial, stale, unsupported, unreachable, timeout,
  malformed, mismatched-chain, stalled-head, component-failure, and
  governance-unavailable snapshots;
- availability-reason copy and evidence-category separation; and
- view reducer transitions, refresh retention, cancellation, and error
  recovery.

### Electron boundary tests

- renderer receives only public node summaries and public snapshots;
- malformed or unknown IPC fields are rejected;
- public typed errors preserve stable code, severity, retryability, safe
  summary, and next action;
- renderer source cannot access Node.js, network, filesystem, SSH, Docker,
  secrets, or CLI execution; and
- malicious node names and evidence strings render as text, not markup.

### Visual and accessibility tests

- keyboard navigation, focus placement, semantic tabs, and live status;
- status meaning does not depend on color;
- readable unavailable and stale states;
- no horizontal overflow at 1060x720, 760x560, and 360x640;
- long display names and maximum safe warning text; and
- screenshots of Nodes, complete detail, and Quick/partial detail with all
  private values masked.

### Persistence and packaged tests

- nodes remain listed after application restart;
- inspection remains explicit and is not silently persisted;
- packaged Electron uses the same core and bridge versions; and
- packaged smoke exposes exact product, interface, core, Git, channel, and
  build identity.

## 8. Completion Criteria

The desktop MVP is complete only when:

- the application starts on a useful Nodes screen;
- an existing persisted node can be opened without mutation;
- completed onboarding opens the same stable node in Node Detail;
- Overview, Components, Chain, and Governance render the sanitized inspection
  contract accurately;
- partial, unavailable, unknown, stale, and failed evidence remain explicit;
- governance configuration, effective state, observed votes, and network
  status are never conflated;
- Refresh is explicit and no background polling exists;
- renderer isolation and sanitization tests pass;
- CLI and desktop facts remain semantically equivalent;
- `npm run verify` and `npm run test:electron:packaged` pass;
- required responsive screenshots are reviewed; and
- the completion audit and active plans match the shipped behavior.

Live validation may remain pending only when no target is separately approved.
That pending criterion must be documented and must not be reported as passed.

## 9. Next Decision After This MVP

Do not automatically start the larger fleet dashboard. Review actual operator
use first. The next slice should be selected from observed value:

1. simple directory search when real inventory size requires it;
2. optional manual comparison of two fresh snapshots;
3. bounded fleet health only after a health contract and polling policy exist;
   or
4. lifecycle work only after its plan, confirmation, execution, verification,
   receipt, and recovery contracts are approved.

Until that review, the desktop remains a simple read-only node inspection
product.

## 10. Completion Record

All five implementation steps are complete. `PublicNodeDirectory 1.0.0` and
the Electron node-read bridge expose only sanitized public summaries and the
existing `NodeInspectionApi 1.0.0`. The application starts on Nodes, supports
the honest empty state and existing onboarding, opens complete and partial
Node Detail evidence, retains the previous snapshot after a failed explicit
refresh, and keeps all privileged work in Electron main and the functional
core.

`npm run verify`, `npm run test:electron:packaged`, and `git diff --check`
pass. The final eight-state screenshot matrix was reviewed at 1060x720,
760x560, and 360x640; two consecutive full review cycles found no critical or
major functional, security, accessibility, layout, or usability issue. The
requirement evidence and the one separately pending live desktop criterion are
recorded in
`docs/validation/NODE_INSPECTION_DESKTOP_MVP_AUDIT.md`.
