# Node Inspection Desktop MVP UX Correction Plan

Status: complete (2026-07-15)

Source review: `docs/ux/NODE_INSPECTION_DESKTOP_MVP_UX_REVIEW.md`

Scope: presentation and interaction corrections only

Completion evidence:
`docs/validation/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_AUDIT.md`

## Objective

Make the existing read-only desktop journey understandable to a new operator
without weakening evidence accuracy, security boundaries, keyboard access, or
the narrow MVP budget.

The completed implementation goal authorized this focused slice. It changed no
product ownership, transport, runtime behavior, persistence model, public
inspection contract, or remote node state.

## Correction principles

1. Describe operator outcomes before implementation mechanisms.
2. Present security confirmation only when the existing policy says it is
   relevant.
3. Prioritize available decision evidence; summarize repetition without hiding
   unavailable or unknown facts.
4. Put action, progress, freshness, and recovery in one predictable region.
5. Make native semantics and keyboard behavior agree.
6. Remove repeated copy before adding explanation.
7. Preserve the exact public DTO meanings and renderer isolation.

## Recommended first implementation slice

Implement these six related corrections as one bounded goal:

1. **Outcome-led access choice.** Present Quick as `Basic inspection` and Full
   as `Complete inspection`, with evidence coverage first and JSON-RPC/agent
   terminology second.
2. **Contextual destination review.** Render the private-destination
   confirmation only when a typed result from the privileged endpoint-policy
   path requires it. Do not move endpoint classification into the renderer.
3. **Compact partial evidence.** Put available chain and freshness evidence
   first, show one Basic-inspection limitation summary, and retain precise
   unavailable reasons in Components, Governance, and relevant detail groups.
4. **Unified inspection status.** Group freshness, capture time, Refresh,
   progress, retained stale evidence, and contextual retry.
5. **Complete keyboard tab behavior and focus.** Add shared roving-tabindex
   behavior to onboarding and detail tablists and replace the faint focus ring
   with a solid, tested indicator.
6. **Preview section capability.** Mark unavailable Components and Governance
   as `Limited` in the tab accessible name while keeping them selectable.

This slice resolves UX-01 through UX-07. It contains no new screen, mode,
transport, background task, saved preference, or data source.

## Requirement-by-requirement plan

### R1. Outcome-led onboarding language

Replace architecture-first headings with outcome-first presentation:

- `Basic inspection` — chain progress and public network evidence; fastest
  path, no node agent required.
- `Complete inspection` — adds runtime, components, resources, producer, and
  local governance evidence when a compatible approved read-only agent is
  available.

Keep `quick` and `full` values in existing contracts and persistence. Secondary
copy may explain `public JSON-RPC` and `paired read-only agent`; primary labels
must not require that knowledge.

Acceptance criteria:

- a new operator can identify which mode includes components and governance in
  five seconds;
- the difference is understandable without defining SSH, agent, or JSON-RPC;
- both modes state that inspection is read only without adjacent repetition;
- no test snapshot or copy describes unavailable evidence as absent, false, or
  healthy.

### R2. Contextual private-destination confirmation

Reuse the existing endpoint-policy boundary. If its current result is not
sufficient for presentation, add the smallest typed internal application
result that says whether explicit destination review is required and why. Do
not expose the raw endpoint or private network details to untrusted renderer
state beyond the existing approved form interaction.

Acceptance criteria:

- a public approved HTTPS node address does not show or require private-network
  confirmation;
- private and loopback destinations show a concise reason and cannot proceed
  until explicit review is received;
- redirects, resolved destinations, and TOCTOU checks remain enforced in the
  privileged process;
- the renderer never performs IP, DNS, URL-policy, or connection safety
  classification;
- existing sanitization and typed errors remain unchanged.

### R3. Compact partial inspection

Change rendering hierarchy, not evidence contracts:

- show chain progress, head, head age, freshness, and major warnings first;
- replace repeated Overview limitation rows with one `Basic inspection limits`
  summary;
- keep every typed unavailable or unknown fact visible in its relevant section;
- do not synthesize components, producer state, runtime identity, resources, or
  governance results.

Acceptance criteria:

- at 760x560, the first visible detail region contains freshness, chain
  progress, head, and the limitation summary;
- complete inspection still shows all supported Overview facts;
- partial, unsupported, timeout, malformed, mismatched, and stalled fixtures
  retain their exact domain meanings;
- configured, effective, observed, and network governance remain four separate
  categories;
- human meaning remains equivalent to the CLI/public DTO.

### R4. Unified freshness, Refresh, and recovery

Place one compact inspection-status group in the detail toolbar or header:

```text
Fresh · Updated 22 sec ago     Refresh
Refreshing… · Previous capture retained
Stale · Last successful capture 4 min ago     Try again
```

Absolute capture time remains available. Relative time must update only as a
display calculation; it must not trigger inspection, polling, or persistence.

Acceptance criteria:

- ready, refreshing, success, stale, initial error, and retained-error states
  are distinguishable without color;
- Refresh is disabled or deduplicated while one request is active;
- old evidence remains visible and unchanged until a complete sanitized
  response arrives;
- failure retains original capture time and visibly marks the evidence stale;
- initial failure presents one local `Try again` action;
- status changes remain announced through a concise polite live region;
- no interval or background inspection is introduced.

### R5. Keyboard tabs and focus visibility

Create one small renderer utility for both tablists:

- only the selected tab has `tabindex="0"`;
- other tabs use `tabindex="-1"`;
- Left/Right arrows wrap and move selection and focus;
- Home and End select and focus first and last;
- activation updates `aria-selected`, controlled panel visibility, and focus;
- Tab leaves the tablist for the active panel or next control.

Use a solid 3 px `:focus-visible` outline with enough offset and contrast on
neutral, purple-selected, warning, and error surfaces.

Acceptance criteria:

- the complete Nodes -> onboarding -> review -> detail -> sections -> Refresh
  -> Back journey works with keyboard only;
- each tablist contributes one sequential Tab stop;
- arrows, Home, End, wraparound, selection, and panel changes have automated
  tests;
- focus remains visible and unobscured at all required sizes;
- the indicator has at least 3:1 contrast against adjacent colors;
- screen change continues to focus an appropriate heading.

### R6. Limited section preview

Derive display qualifiers from existing snapshot capabilities:

- `Components · Limited` when component evidence is unavailable through the
  current access;
- `Governance · Limited` when governance evidence is unavailable through the
  current access;
- no qualifier when the section is supported;
- unknown or partially available sections use truthful wording determined by
  the current evidence, never a synthetic pass/fail state.

Acceptance criteria:

- qualifiers are text, not color-only indicators;
- accessible names contain the qualifier;
- limited tabs remain selectable and explain the typed reason;
- complete fixtures do not show a limitation qualifier;
- 360x640 uses a two-column section layout without horizontal overflow.

## Planned follow-up corrections

These may follow after the first slice but should not expand it:

- explain `Stable Node ID` and improve format-error copy (UX-08);
- remove adjacent read-only repetition and operator-facing `MVP` terminology
  while retaining a persistent safety label (UX-09);
- place the review digest under keyboard-accessible technical details (UX-10);
- keep contextual retry adjacent to typed initial-inspection errors (UX-11), if
  not completed with R4.

Do not auto-generate Node IDs until collision, rename, migration, CLI parity,
and Quick-to-Full upgrade behavior are explicitly decided.

## Affected files

Production files used by the completed implementation goal:

- `src/electron/index.html` — copy, helper text, semantic attributes, and
  status grouping;
- `src/electron/styles.css` — hierarchy, focus ring, limited labels, and
  responsive grouping;
- `src/electron/renderer.ts` — shared tab behavior, capability qualifiers,
  conditional review presentation, and status rendering;
- `src/electron/desktop-view-model.ts` — only if a pure presentational state
  selector makes refresh/recovery behavior clearer;
- `src/electron/onboarding-view-model.ts` — only if typed policy presentation
  needs an explicit view state;
- `src/core/endpoint-policy.ts` or the Electron application boundary — only if
  required to expose a non-secret typed `review required` result; do not move
  policy into the renderer.

Tests extended by the completed implementation:

- `tests/electron-onboarding.test.ts`;
- `tests/electron-desktop-view-model.test.ts`;
- `tests/electron-node-read-ipc.test.ts` when the typed IPC presentation result
  changes;
- `tests/onboarding-quick-workflow.test.ts`;
- `tests/onboarding-full-workflow.test.ts`;
- add a focused renderer DOM/accessibility test only if current tests cannot
  exercise roving tabindex, accessible names, focus, and responsive overflow.

The implementation did not weaken or rewrite existing adapter,
sanitization, CLI, compiled, Electron isolation, or packaged tests to obtain a
green result.

## Implementation order

1. Freeze before/after wording and the typed destination-review presentation
   result.
2. Add failing tests for public/private review relevance, tab keyboard
   behavior, focus attributes, capability qualifiers, and refresh status.
3. Implement the shared tab behavior and focus styles.
4. Implement outcome-led onboarding copy and contextual private review.
5. Implement partial Overview hierarchy and limited section qualifiers.
6. Consolidate freshness, Refresh, and recovery presentation.
7. Run focused tests after each coherent change.
8. Build and launch the actual Electron application with isolated fixtures.
9. Capture and inspect the complete screenshot matrix.
10. Run full deterministic, compiled, Electron development, and packaged
    gates; update documentation only to match implemented behavior.

## Validation matrix

| State | 1060x720 | 760x560 | 360x640 | Keyboard | Required assertion |
|---|---:|---:|---:|---:|---|
| Empty Nodes | Yes | Yes | Yes | Yes | One obvious Add action; no synthetic health |
| Populated Nodes | Yes | Yes | Yes | Yes | Identity and access only; safe wrapping |
| Basic form | Yes | Yes | Yes | Yes | Outcome-first mode; contextual private review |
| Complete form, agent unavailable | Yes | Yes | Yes | Yes | Prerequisite and safe next step are explicit |
| Connection review | Yes | Yes | Yes | Yes | Limits before technical digest; bound Add action |
| Complete Overview | Yes | Yes | Representative | Yes | No loss of supported evidence |
| Partial Overview | Yes | Yes | Yes | Yes | Chain evidence precedes one limitation summary |
| Components limited | Yes | Yes | Representative | Yes | Limited qualifier and typed reason |
| Governance complete | Yes | Yes | Representative | Yes | Four categories remain separate |
| Governance limited | Yes | Yes | Representative | Yes | Four categories remain honest and selectable |
| Initial loading | Yes | Yes | Representative | Yes | Status announced; no duplicate request |
| Refreshing | Yes | Yes | Representative | Yes | Previous capture retained; action disabled |
| Refresh success | Yes | Yes | Representative | Yes | New capture replaces old only on completion |
| Refresh failure | Yes | Yes | Yes | Yes | Previous capture retained, stale, local retry |
| Timeout/unreachable/auth/malformed | Yes | Yes | Representative | Yes | Typed safe error and one next action |
| Mismatch/stalled/component failure | Yes | Yes | Representative | Yes | Warning prominent; no inferred health |

For every screenshot verify:

- `scrollWidth <= clientWidth` unless intentional;
- one visually dominant action per state;
- no meaning depends on color;
- visible focus is strong and unobscured;
- long safe values wrap;
- no secret, private endpoint, SSH alias, user, path, producer address, peer
  identity, credential, token, or key appears.

## Test and release gates

Run at minimum:

```bash
npm run verify
npm run test:electron:packaged
git diff --check
```

Also perform a real Electron keyboard journey and sanitized screenshot review.
Two consecutive review cycles must find no Critical or Major functional,
security, accessibility, layout, or comprehension issue.

## Scope exclusions

Do not add or change:

- screens beyond Nodes and Node Detail;
- detail sections beyond Overview, Components, Chain, and Governance;
- access modes beyond Quick/Basic and Full/Complete;
- background polling, persisted inspection snapshots, monitoring, history,
  charts, search, filters, logs, notifications, or bulk actions;
- lifecycle, producer, wallet, backup, upgrade, or other mutating controls;
- a sidebar, router, frontend framework, design-system dependency, or desktop
  preference store;
- public DTO evidence meanings, renderer privileges, endpoint sanitization, or
  transport ownership.

## Product decisions requiring input

The first slice can proceed with the recommendations below; only a different
choice requires intervention:

1. Keep stable Node ID operator-provided with better explanation, or authorize
   a separate auto-generation design.
2. Keep Complete inspection selectable when no signed agent is available, with
   `Requires approved agent`, or hide the mode until distribution exists.
3. Keep technical review details collapsed by default, or show the digest by
   default for every operator.

Recommended defaults: explicit stable ID, selectable Complete inspection with
honest prerequisite, and collapsed technical digest.

## Completion gate

The correction implementation is complete only when:

- all six first-slice requirements and acceptance criteria pass;
- a new operator can choose the appropriate access level without architecture
  knowledge;
- irrelevant private-destination confirmation is absent while required review
  remains enforced by the privileged policy;
- partial Overview makes useful evidence prominent without hiding absence;
- freshness, Refresh activity, stale retention, and recovery are one coherent
  interaction;
- both tablists follow keyboard conventions and focus is strongly visible;
- complete and partial evidence remain semantically identical to the public
  DTO and CLI;
- renderer isolation, CSP, sandboxing, sanitization, and read-only behavior are
  unchanged;
- required viewport, keyboard, deterministic, compiled, and packaged gates
  pass;
- two visual review cycles find no unresolved Critical or Major issue;
- documentation and screenshots describe the actual result.

## Implementation-goal boundary

This correction plan is intentionally small enough for one focused
implementation goal. It improves comprehension, hierarchy, feedback, and
keyboard operation; it does not turn the MVP into a dashboard or fleet
monitoring product.

## Completion record

All six first-slice requirements are implemented. The complete aggregate gate
passes with 199 tests, the compiled CLI and Electron smoke pass, the packaged
macOS Electron smoke passes, and `git diff --check` passes. The running
application was exercised with keyboard-only navigation and sanitized
deterministic states at 1060x720, 760x560, and 360x640. Two consecutive visual
review cycles found no unresolved Critical or Major issue. Exact evidence is
recorded in the linked completion audit; ignored screenshots remain under
`.artifacts/ux-correction-review/`.
