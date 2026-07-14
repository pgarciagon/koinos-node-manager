# Node Inspection Desktop MVP — Final Implementation Goal

Implement and fully validate the Node Inspection Desktop MVP for Koinos Node
Manager.

Use the current worktree and the following documents as the authoritative
specification:

- `AGENTS.md`
- `docs/PRODUCT_BOUNDARY.md`
- `docs/strategy/NODE_FLEET_STRATEGY.md`
- `docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md`
- `docs/plans/NODE_INSPECTION_DESKTOP_MVP_IMPLEMENTATION_PLAN.md`
- `docs/plans/NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`
- `docs/plans/CLI_IMPLEMENTATION_PLAN.md`
- `docs/CLI_ARCHITECTURE.md`
- `docs/validation/CLI_PHASE_4_MULTISERVICE_INSPECTION_MVP_AUDIT.md`
- `docs/validation/TWO_MODE_NODE_ONBOARDING_MVP_AUDIT.md`

The objective is to finish one simple, attractive, genuinely useful desktop
journey:

```text
Launch Koinos Node Manager
  -> see existing nodes
  -> add a node or open one
  -> understand its current read-only state
  -> refresh explicitly
```

Do not stop at scaffolding, a static mockup, a passing unit test, or the first
visually acceptable result. Continue implementing, launching, inspecting,
testing, capturing screenshots, identifying problems, and refining the tool
until the completion conditions below are satisfied.

## Product Budget

Simplicity and operator value are the primary design constraints.

Deliver only:

- two primary screens: **Nodes** and **Node Detail**;
- four Node Detail sections: **Overview**, **Components**, **Chain**, and
  **Governance**;
- one live action: **Refresh**;
- one direct handoff from completed onboarding to Node Detail; and
- one public read model shared with the CLI and functional core.

Do not add React, a frontend framework, or a router solely for this goal. Keep
the current HTML, CSS, and TypeScript renderer unless current evidence proves
that approach cannot complete this narrow product.

Do not implement charts, configurable dashboards, widgets, saved layouts,
background polling, notifications, fleet health, time-series history, search,
filters, pagination, bulk actions, logs, diagnostics bundles, installation,
lifecycle controls, backups, restore, upgrades, rollouts, wallets, producer
changes, VHP operations, signing, transaction submission, or any mainnet
mutation.

Do not create a release, tag, commit, or push unless separately requested.
Preserve all existing worktree changes and keep this implementation isolated
from unrelated edits.

## Required Implementation

### Public node directory

- Define a versioned, UI-neutral `PublicNodeSummary` and directory response.
- Include only stable node ID, display name, resolved network, resolved runtime
  flavor, available access modes, and preferred access mode.
- Derive and sort summaries in the functional core.
- Never send raw `NodeRecord`, connection references, endpoints, hostnames,
  users, private addresses, service names, paths, peer identities, producer
  addresses, credentials, keys, tokens, secrets, or placeholder-bearing
  internal records to the renderer.
- Add pure schema, ordering, sanitization, and invalid-record tests.

### Electron read bridge

- Add a narrow, versioned read bridge exposing only:

  ```text
  nodes.list()
  nodes.inspect(nodeId)
  ```

- Electron main must construct the existing application context and call the
  functional core directly.
- Reuse `NodeInspectionApi 1.0` and `PublicNodeInspectionSnapshot`; do not
  create a desktop-only inspection contract.
- Electron main owns access selection, bounded timeouts, transport use,
  validation, error conversion, and sanitization.
- Reject unknown or malformed IPC fields.
- Preserve context isolation, sandboxing, disabled Node integration, and
  `connect-src 'none'`.
- The renderer must never parse CLI output, choose a transport, resolve a
  connection reference, execute a process, open a socket, access the
  filesystem, inspect Docker, or receive raw configuration or command output.

### Nodes screen

- Start the application on Nodes.
- Show one simple responsive row per persisted node, sorted by display name.
- Show display name, stable node ID, network, runtime flavor, and available
  Quick, Full, or Expert access modes.
- Provide one prominent **Add node** action using the existing onboarding
  workflow.
- Provide an honest empty state with one **Add your first node** action.
- Make every node row keyboard accessible and open Node Detail.
- Do not display synthetic live health or imply that a previously verified
  connection means a node is currently healthy.

### Node Detail

- Show display name, stable node ID, network, runtime, access mode used,
  persistent **Read only** label, capture time, freshness, **Back to nodes**,
  and **Refresh**.
- Request Overview, Components, Chain, and Governance through the existing
  inspection API.
- Overview must prioritize runtime/build, supervisor/layout, uptime, chain
  progress, head height and age, last irreversible block, P2P/peers, API
  exposure warnings, producer configured/effective state, recent production,
  and reliable resource evidence.
- Components must show normalized name, state, restart count, uptime, and
  artifact identity when available.
- Chain must show head, irreversible block, progress, block-store agreement,
  fork evidence, gossip, and peers.
- Governance must keep configured proposal IDs, effective proposal IDs,
  observed block-header votes, and network proposal status/tally as four
  visibly separate evidence categories.
- Render `available`, `unavailable`, and `unknown` honestly. Absence of evidence
  must never become zero, false, healthy, or no votes.
- Translate typed availability reasons into concise operator language without
  exposing transport or runtime internals.
- Preserve warnings and stale evidence visibly without relying on color.

### Refresh and errors

- Refresh is always explicit. Do not add intervals, timers, startup polling
  loops, or background inspection.
- While refreshing, retain the previous snapshot and mark it as refreshing.
- Replace the snapshot only after a complete sanitized response arrives.
- On refresh failure, retain the previous snapshot, mark it stale, and show
  the typed safe error and next action.
- Prevent accidental duplicate refresh requests.
- Cover empty, loading, complete, partial, stale, unavailable, timeout,
  authentication failure, malformed response, mismatched chain, stalled head,
  component failure, governance unavailable, and generic safe-error states.

### Onboarding handoff

- Preserve existing Quick and Full onboarding behavior and security.
- After apply, open Node Detail for the same stable node ID.
- Reuse the onboarding inspection only while it is valid and current;
  otherwise perform one bounded inspection.
- Quick-to-Full upgrade must not create a duplicate node.
- Cancel returns to the previous safe view.
- Pairing secrets and private endpoints must never enter renderer state,
  screenshots, errors, events, persistence, or test fixtures.

## Several-Hour Execution Cadence

Use the following as an execution order, not as a reason to wait or stop. If a
stage finishes early, continue immediately. If it takes longer, continue until
its exit condition passes. Do not sleep between stages.

### 0:00–0:30 — Baseline and risk audit

- inspect the complete worktree and preserve unrelated changes;
- read the authoritative plans and current Electron implementation;
- run the current focused tests and record the baseline;
- trace inventory, access-profile, inspection, onboarding, Electron-main,
  preload, and renderer boundaries; and
- identify the smallest compatible file changes.

Exit: a concrete implementation checklist exists and no private or unrelated
worktree data is at risk.

### 0:30–1:30 — Public contracts and Electron bridge

- implement the public directory contract and application API;
- extend Electron main and preload with the narrow read bridge;
- add contract, sanitization, invalid-input, typed-error, and IPC tests; and
- run the focused test set after each coherent change.

Exit: Electron can list safe summaries and inspect a node without renderer or
CLI coupling.

### 1:30–2:30 — Nodes screen

- implement the application shell, directory state reducer, Nodes screen,
  empty state, navigation, and onboarding entry;
- use restrained existing visual tokens and responsive layout; and
- validate keyboard access and overflow before moving on.

Exit: the real built application opens to a useful node directory.

### 2:30–3:45 — Node Detail

- implement the detail state reducer, inspection request, high-value Overview,
  Components, Chain, and Governance sections;
- make partial, unknown, unavailable, and stale facts understandable; and
- implement explicit refresh with previous-snapshot retention.

Exit: a complete and a Quick/partial deterministic node are both useful and
truthful in the real GUI.

### 3:45–4:30 — Onboarding handoff and recovery

- connect successful onboarding to Node Detail;
- verify stable-ID Quick-to-Full behavior;
- complete loading, cancellation, error, and refresh-recovery paths; and
- rerun renderer-isolation and secret-boundary tests.

Exit: onboarding ends in useful node information and every failure has a safe
recovery path.

### 4:30 onward — Repeated visual and usability loop

Run the iteration loop below repeatedly. Do not stop after the first clean
render or first green test run. Continue until two consecutive complete review
cycles find no critical or major functional, security, accessibility, layout,
or usability issue.

### Final stage — Full validation and documentation

- run the complete deterministic, compiled, Electron, packaged, and document
  gates;
- update actual implementation status and completion audit;
- perform separately approved live read-only validation when a target is
  available; and
- prepare a final screenshot gallery and evidence-backed handoff.

## Mandatory Iteration Loop

Repeat this loop until all exit criteria pass:

1. **Choose the highest-value gap.** Prefer a broken journey, misleading fact,
   secret boundary, inaccessible control, or confusing state over decorative
   polish.
2. **Make the smallest coherent change.** Keep business interpretation in the
   core and presentation in the renderer.
3. **Run focused tests.** Fix every regression before adding another feature.
4. **Build the actual application.** Do not review an obsolete installed app
   or a disconnected mockup.
5. **Launch with isolated sanitized data.** Use a temporary `KNM_HOME` and
   deterministic fake adapters or a test-only bridge that cannot be enabled in
   a production package. Never use or capture private inventory data.
6. **Exercise the GUI.** Navigate with mouse and keyboard, change sections,
   refresh, return to Nodes, and complete onboarding handoff.
7. **Capture screenshots.** Capture the required states and dimensions below.
8. **Inspect the screenshots visually.** Check hierarchy, spacing, density,
   legibility, alignment, borders, clipping, wrapping, overflow, focus, status
   meaning, and whether the primary action is obvious.
9. **Run the simplicity review.** Remove unnecessary copy, controls, cards,
   decoration, repeated facts, and technical language.
10. **Record issues by severity.** Fix critical and major issues immediately;
    fix minor issues when they improve comprehension without expanding scope.
11. **Repeat.** A green test suite does not replace visual inspection, and a
    beautiful screenshot does not replace functional validation.

Provide concise progress updates after meaningful milestones and at least once
per hour during sustained work. Do not pause merely to report progress.

If one path is blocked, continue every safe independent task. Ask for user
input only when the remaining work genuinely requires new authority, a live
credential, or a product decision that cannot be derived from the plan.

## Required Screenshot Matrix

Capture screenshots from the current built implementation, not design boards:

1. populated Nodes at 1060x720;
2. empty Nodes at 760x560;
3. complete Node Detail Overview at 1060x720;
4. complete Components at 1060x720;
5. complete Governance at 1060x720;
6. Quick/partial Node Detail at 760x560;
7. stale or failed refresh retaining the previous snapshot at 760x560; and
8. one representative narrow 360x640 view.

Use sanitized fictional IDs and values. Do not show real endpoints, hosts,
users, connection references, paths, peer identities, producer addresses,
credentials, keys, tokens, or private infrastructure details.

Store review captures under `.artifacts/ui-review/` or another ignored
temporary location. Include the final representative images inline in the
handoff, not only as file links.

For every capture, verify:

- `scrollWidth <= clientWidth` unless intentional;
- the primary action is visible and unambiguous;
- the screen explains its current state without relying on color;
- text remains readable without excessive density or empty decoration;
- cards and borders have balanced 12–16 px internal spacing;
- long safe values wrap without pushing controls off-screen; and
- no private data appears.

## Simplicity And Usability Review

At the end of every visual loop, answer these questions from the running GUI:

1. Can a new operator identify how to add or open a node within five seconds?
2. Can the operator tell whether the view is read-only?
3. Are chain progress, freshness, and major warnings visible before secondary
   details?
4. Does Quick Connect clearly explain why host and governance configuration
   may be unavailable?
5. Are configured, effective, observed, and network governance facts visibly
   distinct?
6. Is there one obvious primary action per state?
7. Is any displayed fact inferred more strongly than its evidence supports?
8. Can any copy be removed without losing meaning?
9. Can the full journey be completed with a keyboard?
10. Would an operator trust that Refresh does not mutate the node?

If any answer is no or uncertain, continue the loop.

## Visual Direction

Follow the repository guardrails:

- light neutral surfaces;
- restrained lavender/purple accents;
- blue-gray text;
- subtle borders, quiet rounded controls, and gentle shadows;
- compact operational hierarchy rather than marketing composition;
- approximately 12–16 px inside bordered containers and 10–16 px between
  sibling surfaces;
- clear textual status in addition to color; and
- consistent typography, spacing, radii, controls, tables, and status
  treatment across onboarding, Nodes, and Node Detail.

Do not add dark isolated cards, neon colors, oversized headings, decorative
hero panels, excessive gradients, dense monitoring charts, or a different
visual system for each screen.

## Test And Validation Requirements

Add and pass, as applicable:

- public-directory unit and schema tests;
- public DTO sanitization and malicious-string tests;
- directory and detail reducer tests;
- complete, partial, unavailable, stale, timeout, unreachable, malformed,
  mismatch, stalled, component-failure, and governance-unavailable fixtures;
- Electron IPC success, malformed-input, typed-error, and isolation tests;
- onboarding-to-detail and Quick-to-Full stable-ID tests;
- refresh deduplication, retention, failure, and retry tests;
- accessibility, keyboard, focus, responsive, and overflow tests;
- restart persistence without inspection-snapshot persistence;
- compiled CLI regression tests;
- Electron development smoke;
- packaged Electron smoke; and
- sanitized screenshot review.

Run at minimum:

```bash
npm run verify
npm run test:electron:packaged
git diff --check
```

Do not weaken, delete, skip, or rewrite existing tests merely to obtain a green
gate. Fix the implementation or update a test only when the authoritative
contract intentionally changes.

## Documentation And Audit

Update, according to actual behavior:

- CLI and Electron architecture documentation;
- README desktop usage and local launch instructions;
- changelog;
- node onboarding guide;
- active fleet and desktop implementation status;
- hierarchical help only if shared terminology changes; and
- `docs/validation/NODE_INSPECTION_DESKTOP_MVP_AUDIT.md`.

The audit must list every requirement, its status, exact evidence, test or
screenshot reference, and any separately pending live criterion. Do not claim
that unavailable live validation passed.

## Completion Gate

Do not give the final completion response until:

- the real application starts on Nodes and lists persisted sanitized nodes;
- empty inventory has a useful onboarding action;
- selecting a node opens a working read-only Node Detail;
- successful Quick and Full onboarding open the same stable node;
- Overview, Components, Chain, and Governance render correctly;
- complete and partial nodes are both useful and honest;
- unavailable, unknown, stale, and failed states are explicit;
- Refresh is bounded, explicit, deduplicated, non-mutating, and retains the
  previous snapshot on failure;
- no renderer secret, transport, filesystem, process, or network boundary is
  weakened;
- CLI and GUI facts remain semantically equivalent;
- all required automated and packaged gates pass;
- every required screenshot has been captured and inspected;
- two consecutive complete visual/usability review loops have no critical or
  major issue;
- documentation and the completion audit match reality; and
- the final handoff can show a simple, attractive, working tool with concise
  launch instructions and representative screenshots.

If a separately approved live target is unavailable, complete the entire
deterministic and packaged product and mark only that external criterion
pending. The absence of a live target is not a reason to stop before the GUI is
working with deterministic sanitized data.

The final response must lead with the working result, include representative
screenshots inline, list the validation gates and their outcomes, identify any
honestly pending external criterion, and provide the exact local command for
launching the tool.
