# Koinos Node Manager Desktop MVP — Iterative UX Review and Correction Proposal Goal

Act as a senior desktop-product UX designer, UX researcher, accessibility
specialist, and technical product writer.

Evaluate the completed Koinos Node Manager read-only Desktop MVP and produce an
evidence-backed, prioritized UX correction proposal.

This goal is an iterative UX audit and design-planning exercise. Do not modify
production application code during this goal. Small ignored prototypes,
wireframes, and annotated screenshots are allowed, but implementation requires
a separate explicit goal.

## Authoritative Inputs

Use the current worktree and these repository documents:

- `AGENTS.md`
- `docs/PRODUCT_BOUNDARY.md`
- `docs/strategy/NODE_FLEET_STRATEGY.md`
- `docs/plans/NODE_INSPECTION_DESKTOP_MVP_IMPLEMENTATION_PLAN.md`
- `docs/plans/NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`
- `docs/validation/NODE_INSPECTION_DESKTOP_MVP_AUDIT.md`
- `docs/validation/TWO_MODE_NODE_ONBOARDING_MVP_AUDIT.md`
- `docs/CLI_ARCHITECTURE.md`

Inspect the current desktop implementation directly:

- `src/electron/index.html`
- `src/electron/styles.css`
- `src/electron/renderer.ts`
- `src/electron/desktop-view-model.ts`
- `src/electron/onboarding-view-model.ts`
- relevant Electron, onboarding, accessibility, reducer, responsive, and
  packaged tests.

Use this verified live-validation presentation as the evidence index:

<https://docs.google.com/presentation/d/1SZ4vyFCj8AisdTDBbz7N3CgjOJLrbz-f52rMF9SA7vw/edit>

Review all 12 documented user interactions, not only the final summary. The
presentation's annotation columns are explanatory evidence and are not part of
the application UI. Inspect the application screenshots themselves and,
whenever possible, launch the current built application to verify the real
interaction.

## Research Baseline

Use current primary guidance where relevant:

- [Nielsen Norman Group's ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/);
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), especially keyboard operation,
  focus order, focus visibility, focus not obscured, contrast, labels, status
  messages, error identification, target sizing, and consistent navigation;
- [Apple Human Interface Guidelines for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/)
  for window behavior, information density, keyboard use, familiar controls,
  navigation, and toolbar placement; and
- [Electron's official accessibility guidance](https://www.electronjs.org/docs/latest/tutorial/accessibility).

Use platform guidance as evaluation evidence, not as a reason to imitate native
macOS controls mechanically or to expand the product scope.

## Product Objective

Make this narrow journey feel professional, calm, trustworthy, and easy for a
new operator:

```text
launch
  -> understand the Nodes screen
  -> add or open a node
  -> choose Quick or Full access confidently
  -> understand the current read-only evidence
  -> refresh explicitly
  -> recover from partial or failed inspection
  -> return and reopen the node
```

The operator should understand what is known, what is unavailable, why it is
unavailable, whether the evidence is current, and what action is safe to take
next.

Professional quality means clear hierarchy, predictable interaction,
appropriate density, accessible controls, precise language, and operator
confidence. It does not mean adding decoration, dashboards, or more features.

## Scope Guardrails

Preserve the existing MVP budget:

- two primary screens: Nodes and Node Detail;
- four detail sections: Overview, Components, Chain, and Governance;
- Quick and Full onboarding;
- one live inspection action: Refresh;
- explicit read-only behavior;
- no background polling;
- no persisted inspection snapshots;
- no lifecycle or producer mutations;
- no charts, configurable dashboards, logs, notifications, fleet monitoring,
  search, filters, bulk actions, or historical data;
- no frontend framework, router, or design-system dependency solely for this
  review.

Never weaken:

- renderer sandboxing and context isolation;
- typed IPC boundaries;
- secret and endpoint sanitization;
- evidence accuracy;
- separation of available, unavailable, and unknown;
- separation of configured, effective, observed, and network governance facts;
- explicit freshness and read-only semantics.

Do not introduce synthetic health or make unavailable evidence appear healthy,
false, empty, or zero.

## Primary UX Questions

Investigate these as hypotheses, not predetermined defects:

1. Can a new operator identify the primary action on every screen in five
   seconds?
2. Is the difference between Quick Connect and Full Connect understandable
   without knowing SSH, agents, JSON-RPC, or the internal architecture?
3. Does the operator understand what Node ID means and why it is required?
4. Is the public/private destination confirmation shown only when relevant and
   explained in plain language?
5. Is read-only safety sufficiently visible without being repeated so often
   that important operational evidence loses prominence?
6. Can the operator distinguish current evidence from stored inventory data?
7. Are capture time, freshness, Refresh progress, and retained stale evidence
   sufficiently prominent?
8. Does Overview prioritize the information needed for an immediate decision,
   or does repeated unavailable content dominate the screen?
9. Are `Unknown runtime`, `Unavailable through this connection`, and similar
   states understandable and actionable to a non-expert?
10. Should unavailable Components or Governance sections remain normal tabs,
    communicate their limited state before selection, or use another treatment
    that preserves honesty without creating dead ends?
11. Is the four-part governance model understandable without requiring prior
    Koinos implementation knowledge?
12. Does the node directory communicate identity and available access without
    implying live health?
13. Does successful onboarding feel complete, or is the transition to Node
    Detail abrupt?
14. Can the complete journey be performed efficiently with keyboard only?
15. Are focus indicators, focus order, status announcements, error recovery,
    contrast, target sizes, and responsive behavior accessible?
16. Does the interface remain usable at 1060x720, 760x560, and a narrow
    360x640 viewport without clipping or excessive scrolling?
17. Does each screen contain one visually dominant action?
18. Can any label, badge, warning, card, border, or explanatory sentence be
    removed without losing meaning or safety?

## Required Test Scenarios

Evaluate at minimum:

- empty inventory;
- populated inventory;
- Quick Connect form and review;
- Full Connect form and partial or unavailable agent state;
- complete inspection fixture;
- Quick or partial inspection;
- initial loading;
- explicit Refresh in progress;
- successful Refresh;
- duplicate Refresh prevention;
- failed Refresh retaining previous evidence;
- stale evidence;
- unreachable node;
- authentication failure;
- malformed response;
- mismatched chain;
- stalled chain;
- unavailable Components;
- unavailable Governance;
- populated governance evidence with configured, effective, observed, and
  network categories;
- application restart and node reopening;
- wide, medium, and narrow layouts;
- mouse, keyboard-only, and accessibility-tree navigation.

Use an isolated temporary `KNM_HOME` and sanitized deterministic fixtures. Use
a live target only when separately approved and only through read-only
inspection.

## Iterative Review Loop

Repeat the following loop. Do not stop after the first list of observations.

### 1. Observe

Launch the real built application and execute a coherent operator journey.
Record the exact action, visible response, focus movement, wait state, and
recovery path.

### 2. Capture

Capture sanitized screenshots at the relevant desktop sizes. Store temporary
captures under `.artifacts/ux-review/` or another ignored location.

Never capture credentials, pairing material, private endpoints, SSH aliases,
users, filesystem paths, producer addresses, peer identities, or secrets.

### 3. Evaluate

Evaluate the current state against:

- task completion and comprehension;
- Nielsen's usability heuristics;
- WCAG 2.2;
- desktop-platform expectations;
- the repository's simplicity and safety principles.

Separate direct observations from interpretations and design hypotheses.

### 4. Prioritize

Classify findings as:

- **Critical:** blocks completion, misrepresents safety or evidence, or creates
  a serious accessibility failure;
- **Major:** causes likely misunderstanding, abandonment, wrong mode selection,
  or loss of trust;
- **Moderate:** creates avoidable friction, cognitive load, or inefficiency;
- **Minor:** visual or wording refinement with limited task impact.

Prioritize operator impact and frequency before aesthetic preference.

### 5. Propose

For the highest-value finding, propose the smallest coherent correction.

Every proposal must state:

- the observed problem;
- affected user and journey step;
- evidence screenshot or test reference;
- relevant heuristic or accessibility criterion;
- operator consequence;
- proposed correction;
- why the correction is smaller and safer than adding functionality;
- acceptance criteria;
- implementation risk;
- estimated effort: S, M, or L;
- whether contracts or only presentation would change.

### 6. Prototype

For Critical, Major, and selected Moderate findings, create an annotated
before-and-after wireframe or a disposable test-only HTML/CSS prototype.

Do not alter production source during this goal.

Prototypes must preserve real content density and unavailable states. Do not
present an unrealistically complete or idealized node.

### 7. Re-test

Test the proposed correction against complete, partial, unavailable, stale,
failure, responsive, and keyboard scenarios.

Check that solving one state does not weaken another state or hide important
safety information.

### 8. Simplify

Remove unnecessary new copy, controls, cards, badges, icons, borders, and
intermediate steps from the proposal.

A correction that adds more explanation everywhere is not automatically an
improvement.

### 9. Repeat

Continue until two consecutive review cycles discover no unresolved Critical
or Major problem in the proposed correction set.

## Required Finding Format

Use one row per finding:

| ID | Screen and state | Observation | Evidence | Severity | Heuristic or WCAG criterion | Operator impact | Proposed correction | Acceptance test | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Do not write vague findings such as "make it more modern" or "improve visual
hierarchy". Describe the precise behavior, consequence, and measurable
correction.

## Required Deliverables

Create, in English:

1. `docs/ux/NODE_INSPECTION_DESKTOP_MVP_UX_REVIEW.md`

   Include:

   - executive summary;
   - evaluated personas and core jobs;
   - evidence and methodology;
   - walkthrough of all 12 live-test interactions;
   - heuristic and accessibility findings;
   - responsive and keyboard findings;
   - terminology and content-design findings;
   - observed strengths that must be preserved;
   - prioritized issue table;
   - unresolved product questions.

2. `docs/plans/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_PLAN.md`

   Include:

   - correction principles;
   - recommended first implementation slice;
   - requirement-by-requirement correction plan;
   - exact acceptance criteria;
   - affected files and tests;
   - implementation order;
   - scope exclusions;
   - validation and screenshot matrix.

3. Ignored review artifacts under `.artifacts/ux-review/`:

   - current-state screenshots;
   - annotated findings;
   - before-and-after proposals for Critical and Major issues;
   - responsive examples;
   - keyboard and focus evidence.

4. A final handoff containing:

   - the five highest-value corrections;
   - corrections recommended for the next implementation goal;
   - improvements explicitly deferred;
   - product decisions that require user input;
   - links to the review and correction plan.

## Correction-Plan Constraints

The recommended first implementation slice should contain no more than three
to seven related corrections.

Prefer corrections such as:

- clearer hierarchy;
- better terminology;
- reduced repetition;
- contextual explanations;
- improved partial-state presentation;
- more obvious freshness and Refresh feedback;
- stronger focus visibility;
- better responsive grouping;
- more understandable recovery actions.

Do not recommend architecture churn or feature expansion when wording, layout,
grouping, or interaction feedback can solve the problem.

Do not recommend a sidebar merely because desktop applications often have one.
The current product has only two primary screens and four detail sections.
Navigation complexity must justify any structural change.

## Validation Criteria For Every Proposed Correction

A proposal passes only when:

- the primary action is discoverable in five seconds;
- read-only intent remains unambiguous;
- evidence is never represented more strongly than its source supports;
- freshness and current activity are understandable;
- unavailable and unknown states remain explicit;
- Quick and Full modes remain distinguishable;
- the complete journey works with keyboard only;
- visible focus is strong and unobscured;
- status and warning meaning does not depend on color;
- no horizontal overflow occurs at required sizes;
- long safe values wrap without moving controls off-screen;
- renderer isolation and security boundaries remain unchanged;
- the change reduces or maintains cognitive load;
- complete and partial nodes both remain useful.

## Completion Gate

Do not mark this UX goal complete until:

- every live-validation interaction has been reviewed;
- every required deterministic state has been exercised;
- observations and hypotheses are clearly separated;
- all Critical and Major findings have actionable proposals;
- proposals include measurable acceptance criteria;
- proposals have been tested against partial, failure, and responsive states;
- two consecutive iterative review cycles find no unresolved Critical or Major
  defect in the proposed solution set;
- the first correction slice is small enough for one focused implementation
  goal;
- the written review and correction plan agree;
- no production code, public contract, secret boundary, or product scope was
  changed;
- no commit or push was performed unless separately requested.

The final response must lead with the highest-value UX conclusion, identify the
recommended first correction slice, list any product decisions requiring user
input, and provide the review and plan file paths.
