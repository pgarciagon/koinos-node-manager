# Node Inspection Desktop MVP UX Review

Status: review complete; the recommended first correction slice was implemented
and validated on 2026-07-15.

Implementation evidence:
`docs/validation/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_AUDIT.md`

Status: proposed correction set validated; no production code changed

Review date: 2026-07-14

Product surface: read-only Node Inspection Desktop MVP

## Executive summary

The desktop MVP already has the right safety foundation: it starts with a
clear node directory, never invents health, keeps refresh explicit, retains the
last snapshot after a failed refresh, and separates the four governance
evidence categories. The visual system is calm and consistent, and the tested
layouts do not overflow horizontally at 1060x720, 760x560, or 360x640.

The highest-value correction is to reorganize the journey around operator
outcomes instead of connection architecture. A new operator currently has to
interpret terms such as JSON-RPC, SSH, agent, Node ID, private-network
destination, and review digest before the product has established what each
choice lets them learn. After Quick Connect, fifteen repeated unavailable
facts can dominate the Overview even though the available chain evidence is
useful.

No Critical defect was found. Five Major findings require correction before
the journey should be considered professionally resolved:

1. Quick and Full modes lead with implementation terms instead of inspection
   outcomes.
2. The private-destination confirmation is presented even when it is not
   relevant.
3. Partial Overview over-repeats unavailable evidence and obscures useful
   results.
4. The onboarding mode tablist does not implement expected keyboard tab
   behavior.
5. Visible focus is too faint for dependable keyboard orientation.

A six-item first implementation slice addresses those problems without adding
screens, features, background work, or new dependencies. Two iterative review
cycles were applied to the proposed corrections. The first exposed a narrow
layout issue and two boundary risks; the proposal was simplified. The second
found no unresolved Critical or Major issue in the correction set.

## Personas and core jobs

### New node operator

The operator knows where a node can be reached but may not know JSON-RPC,
runtime internals, agents, or Koinos governance implementation details. Their
job is to add the node safely, understand what the selected access mode can
show, and reach a useful first inspection without configuring the runtime.

### Experienced Koinos operator

The operator understands runtime and chain terminology. Their job is to verify
chain progress, components, governance evidence, warnings, and freshness
quickly without mistaking stored inventory for current live evidence.

### Keyboard or assistive-technology user

The operator must complete the same journey using semantic controls, a logical
focus order, conventional tab keyboard behavior, visible focus, and announced
status or error changes.

The shared core job is:

```text
find or add a node
  -> choose the least access needed
  -> understand the current read-only evidence
  -> refresh deliberately
  -> recover without losing the previous evidence
```

## Evidence and methodology

The review used four evidence layers:

- all twelve interactions in the
  [live-validation presentation](https://docs.google.com/presentation/d/1SZ4vyFCj8AisdTDBbz7N3CgjOJLrbz-f52rMF9SA7vw/edit),
  including the explanatory annotation column as evidence rather than
  application UI;
- the current Electron HTML, CSS, renderer, reducers, IPC tests, onboarding
  tests, adapter tests, and packaged behavior;
- an isolated Electron launch with a temporary `KNM_HOME`, keyboard navigation,
  and accessibility-tree inspection;
- sanitized deterministic fixtures at 1060x720, 760x560, and 360x640.

The current deterministic gate passed before review: 194 tests in 49 suites,
the TypeScript build, compiled CLI smoke, and Electron development smoke. That
baseline proves contract and behavior coverage; it does not replace the visual
and interaction observations in this review.

Current screenshots, keyboard evidence, and the scenario-to-evidence map are
stored under `.artifacts/ux-review/`. The live journey contact sheet is
`.artifacts/ux-review/evidence/live-journey-contact-sheet.jpg`. The detailed
scenario map is `.artifacts/ux-review/evidence/SCENARIO_MATRIX.md`.

Evaluation used Nielsen Norman Group's ten usability heuristics, WCAG 2.2,
Apple's macOS interaction guidance, and Electron's official accessibility
guidance. The most relevant principles were visibility of system status,
match with operator language, error recovery, recognition over recall,
keyboard operation, focus visibility, focus not obscured, labels, status
messages, target sizing, and consistent navigation.

### Observation discipline

An **observation** below describes something visible or reproducible in the
current product. An **interpretation** explains the likely operator effect. A
**proposal** is a testable design hypothesis, not an implemented result.

## Walkthrough of the twelve live interactions

| Interaction | Direct observation | UX interpretation | Evidence |
|---|---|---|---|
| 1. Launch with empty inventory | The Nodes screen explains the empty state and presents one clear `Add your first node` action. | Strong start. The duplicate header action is correctly removed in the empty state. | `current/01-launch-empty-nodes.jpg` |
| 2. Open onboarding and choose Quick | Quick and Full are visible together. Their labels rely on JSON-RPC, SSH, and agent knowledge. | The choice is discoverable, but the decision model is architecture-first. | `current/02-open-quick-connect.jpg` |
| 3. Enter connection details | Node ID is required and constrained; the private-destination checkbox is visible for a public endpoint. | The form asks for two concepts whose relevance is not yet explained. | `current/03-enter-connection-details.jpg` |
| 4. Review live connection | Network, available evidence, limitations, and the binding digest are shown before Add node. | The review is trustworthy, but the long digest receives novice-level visual prominence. | `current/04-review-live-connection.jpg` |
| 5. Add node and open Overview | Successful apply opens the same stable node directly and marks the inspection read only. | The handoff is functionally complete, although repeated safety copy competes with freshness and chain progress. | `current/05-add-node-overview.jpg` |
| 6. Open Components | Components remain selectable and explicitly unavailable through Quick access. | Honest, but the tab gives no advance indication that its content is limited. | `current/06-components-limited.jpg` |
| 7. Open Chain before refresh | Head, irreversible block, progress, gossip, peers, and agreement are grouped as operational evidence. | This is the clearest high-value screen in the Quick journey. | `current/07-chain-before-refresh.jpg` |
| 8. Select Refresh | Refresh is explicit; the next capture shows the head advanced by twelve blocks and no runtime mutation. | Strong visibility and safety behavior. The action, progress, capture time, and freshness could be one tighter status group. | `current/08-chain-after-refresh.jpg` |
| 9. Open Governance | Configured, effective, observed, and network evidence stay separate and each reports its limitation. | The domain model is correct. Four similar unavailable cards create a dead-end feeling for Quick access. | `current/09-governance-limited.jpg` |
| 10. Return to populated Nodes | The directory shows identity, network, runtime, and access without claiming live health. | Strong separation between inventory and live evidence. | `current/10-back-to-populated-nodes.jpg` |
| 11. Restart application | The node remains in the directory after restart. | Persistence is understandable and does not imply that inspection evidence was persisted. | `current/11-restart-persisted-nodes.jpg` |
| 12. Reopen the node | Reopening first shows loading and then a newly captured Overview. | Correct current-versus-stored behavior; the loading-to-fresh transition should be announced and visually anchored near Refresh. | `current/12-reopen-node-loading.jpg`, `current/13-reopen-fresh-overview.jpg` |

## Observed strengths to preserve

- The directory never presents stored access verification as current health.
- Read-only intent is persistent and refresh is the only live inspection
  action.
- Refresh uses bounded inspection, prevents duplicate requests, and retains the
  prior snapshot when a refresh fails.
- Stale and failed states do not erase previously captured facts.
- Available, unavailable, and unknown remain semantically distinct.
- Governance keeps configured, effective, observed, and network facts separate.
- The layout uses a restrained operational hierarchy, consistent surfaces,
  and readable safe-value wrapping.
- The renderer remains isolated from transports, secrets, the filesystem,
  process execution, and endpoint-policy decisions.
- Nodes, onboarding, and detail use real HTML buttons, headings, labels,
  tablists, and status regions rather than click-only containers.

These strengths are constraints on every correction, not optional polish.

## Prioritized findings

| ID | Screen and state | Observation | Evidence | Severity | Heuristic or WCAG criterion | Operator impact | Proposed correction | Acceptance test | Effort |
|----|------------------|-------------|----------|----------|-----------------------------|-----------------|---------------------|-----------------|--------|
| UX-01 | Onboarding mode choice | `Quick Connect` and `Full Connect` are explained with JSON-RPC, SSH, and agent language before their inspection outcomes. | Interaction 2; `index.html` mode tabs and form intros | Major | Match between system and real world; recognition rather than recall | A new operator may abandon onboarding or choose access based on unfamiliar technology. | Lead with `Basic inspection` and `Complete inspection`; state what each reveals, then place transport terminology in secondary copy. Preserve Quick and Full as internal mode names if contracts require them. | In a five-second moderated prompt, the operator can identify which mode shows components and governance without defining SSH, agent, or JSON-RPC. | S |
| UX-02 | Quick and Full forms | `I reviewed this private-network destination` is always visible, including for a public HTTPS endpoint. | Interactions 3-4; both forms in `index.html` | Major | Error prevention; relevance; help users recognize and recover | The operator must acknowledge a condition that may not exist and may learn to ignore a real security challenge later. | Show the confirmation only after the privileged application layer classifies the destination as requiring review; explain the reason in plain language. The renderer must not classify endpoints. | Public approved endpoints proceed without the checkbox; private or loopback destinations cannot proceed until the typed policy result requires and receives explicit review. | M |
| UX-03 | Quick/partial Overview | Fifteen facts repeat `Unavailable through this connection`, while useful chain evidence is present. | `evidence/partial-1060x720.png`; `evidence/partial-760x560.png` | Major | Aesthetic and minimalist design; information hierarchy | The operator must scan absence rather than understand current chain progress and the limits of Quick access. | Put available decision facts first, add one concise `Basic inspection limits` summary, and keep detailed unavailable reasons in the relevant section. Do not remove facts from the public DTO. | At 760x560, chain progress, freshness, head, and one limitation summary appear before repeated unavailable details; every unavailable fact remains reachable and explicit. | M |
| UX-04 | Onboarding mode tablist, keyboard only | Focus reaches Quick, but Right Arrow, Left Arrow, Home, and End do not change or focus the mode. Detail tabs implement arrows but leave every tab in the sequential Tab order. | Real Electron accessibility run; `evidence/focus-mode-quick.png`; renderer event handlers | Major | WCAG 2.1.1 Keyboard; 2.4.3 Focus Order; consistent navigation; ARIA tabs pattern | Keyboard and assistive-technology users encounter a control that announces itself as tabs but does not behave like tabs. | Implement one shared roving-tabindex behavior for onboarding and detail tablists with arrows, Home, End, selection, focus, and one sequential Tab stop. | Keyboard-only tests cover wraparound, Home, End, selected state, panel visibility, one tab stop per tablist, and focus preservation at all viewport sizes. | M |
| UX-05 | All focused controls | The general focus outline is a low-opacity lavender ring; focused brand and mode controls are difficult to locate quickly. | `evidence/focus-brand.png`; `evidence/focus-primary-action.png`; `evidence/focus-mode-quick.png`; `styles.css` focus rule | Major | WCAG 2.4.7 Focus Visible; 2.4.11 Focus Not Obscured; 1.4.11 Non-text Contrast | A keyboard user can lose orientation even when focus technically exists. | Use a solid, high-contrast 3 px `:focus-visible` ring with offset and test it on neutral, selected-purple, error, and warning surfaces. | Every interactive control has an unobscured indicator with at least 3:1 contrast against adjacent colors; screenshots verify default and selected modes. | S |
| UX-06 | Node Detail fresh, refreshing, and failed refresh | Refresh action, capture time, freshness pill, live status, and retained-error message are separated across the header. | Interactions 5, 8, 12; `evidence/refresh-failed-retained-760x560.png` | Moderate | Visibility of system status; status messages | Operators must assemble whether evidence is current and what Refresh did from several locations. | Group `Fresh/Stale · Updated <relative time>` with Refresh; change the action label to `Refreshing…` while active; on failure use a contextual `Try again` action while retaining the original capture time. | Ready, refreshing, success, and failure are distinguishable without color; the previous capture remains visible and unchanged after failure. | M |
| UX-07 | Components and Governance unavailable | Tabs look identical to fully available sections until selected. | Interactions 6 and 9 | Moderate | Visibility of system status; match with expectations | Selecting a section can feel like opening a dead end. | Add a textual `Limited` qualifier derived from capabilities while keeping the tab enabled and the typed explanation inside the panel. | Quick access shows `Components · Limited` and `Governance · Limited`; Full/complete access does not; the qualifier is exposed in the accessible name. | S |
| UX-08 | Onboarding form | Node ID is mandatory, uses a technical slug pattern, and has no explanation of permanence or purpose. | Interaction 3; Quick and Full form labels | Moderate | Match with real world; error prevention; help and documentation | New operators may confuse the ID with a hostname or believe it changes the remote node. | In the first slice, label it `Stable Node ID` and add one short helper: local inventory identifier, not sent to or configured on the node. Consider automatic generation only after the product decision below. | A novice can state that the value identifies local inventory and survives later access upgrades; validation errors explain the allowed format. | S |
| UX-09 | Onboarding and Node Detail | Read-only intent appears in the global `Read-only MVP` badge, onboarding eyebrow, introductory copy, status copy, detail badge, capture line, and success messages. | Interactions 1-5; `index.html` | Moderate | Minimalist design; hierarchy | Repetition competes with freshness and operational evidence while `MVP` is internal product language. | Keep a persistent `Read only` context label and mutation-specific assurance where consequence matters; remove repeated generic sentences and remove `MVP` from operator-facing copy. | Every screen still makes read-only intent unambiguous, but no screen repeats the same assurance in adjacent regions. | S |
| UX-10 | Connection review | A long content digest appears at the same hierarchy as network and limitations. | Interaction 4 | Moderate | Progressive disclosure; recognition rather than recall | Novices may assume they must interpret or record the digest. | Keep the binding unchanged but place it under collapsed `Technical review details`, accessible by keyboard. | Network, evidence, limitations, and Add node are visible first; digest remains selectable, copyable, and available before apply. | S |
| UX-11 | Failed initial inspection | Typed next action appears as status text, but recovery uses the generic header Refresh action even when no previous snapshot exists. | Deterministic unreachable, timeout, authentication, and malformed-response cases | Moderate | Help users recognize, diagnose, and recover from errors; WCAG 3.3.1 Error Identification | The correct recovery action can be visually detached from the error. | Put a single contextual `Try again` button with the safe error; keep the header Refresh only when prior evidence is visible. | Each typed failure names the safe problem and one next action; retry is keyboard focusable and does not duplicate requests. | M |
| UX-12 | Narrow detail and onboarding | The production layout avoids horizontal overflow, but dense status, badges, and repeated facts create long vertical scanning. | 360x640 and 760x560 captures; measured `scrollWidth === clientWidth` | Minor | Reflow; target size; minimalist design | The journey remains usable but slower on a narrow window. | Use the same grouping corrections above; do not add mobile navigation or hide evidence. Stack mode cards and refresh context as one column. | At 360x640 there is no horizontal overflow, modes are one column, primary action remains visible, and long safe values wrap. | S |

## Heuristic review

### Visibility of system status

Loading, refreshing, success, stale, and error states exist and use polite live
status regions. The reducer correctly retains the previous inspection during
refresh and failure. The issue is spatial: capture time, freshness, status, and
the Refresh control are distributed. UX-06 consolidates them without changing
state semantics.

### Match with operator language

Node, network, chain head, and read only are understandable in context. The
onboarding decision is less successful because transport language precedes
outcome language. `Unknown runtime` is technically accurate, but should be
paired with a short consequence, such as `Runtime details are not available
with Basic inspection`, not treated as an error or silently converted to an
empty value.

### User control and freedom

Back, Cancel, explicit Refresh, and review-before-apply are strong. The
proposal preserves cancellation and does not add automatic inspection or
background polling.

### Consistency and standards

The four detail sections are consistent across CLI/core meaning and desktop
presentation. The onboarding mode control is the exception: its `tablist`
semantics do not match its keyboard behavior. One shared tab interaction
utility avoids separate partial fixes.

### Error prevention and recovery

Review-before-apply and digest binding are strong. The always-visible private
destination checkbox weakens rather than strengthens prevention because it is
not contextual. Failed refresh retention is exemplary; initial failure needs a
more local recovery action.

### Recognition, minimalist design, and help

The product exposes evidence honestly, but partial access renders the same
limitation repeatedly. A single high-level limitation summary plus detailed
reasons in the affected sections preserves truth while reducing scan cost.

## Accessibility and keyboard findings

- Empty inventory, Add node, Back, form fields, and action buttons are native
  keyboard-operable controls.
- Entering onboarding moves programmatic focus to its heading, providing
  useful screen-change orientation.
- The mode selector announces tabs, but arrow keys do not operate it. This was
  reproduced in the real Electron application, not inferred from source alone.
- Detail tabs accept arrows, Home, and End, but do not implement roving
  `tabindex`; all four remain sequential Tab stops.
- Focus is not obscured, but its translucent ring is too weak to provide
  dependable visual orientation.
- Status elements use `role="status"` and `aria-live="polite"`; error and
  progress wording should remain concise so repeated changes are not noisy.
- Primary buttons measured at 40 px or more in reviewed states. The proposed
  corrections do not shrink targets.
- Color is supplemented by text for read only, freshness, unavailable,
  unknown, warning, and error states. This must remain true for `Limited`.

## Responsive findings

Measured production and fixture captures had no unintended horizontal
overflow:

| Viewport | States checked | Result |
|---|---|---|
| 1060x720 | Populated Nodes, complete and partial detail | `scrollWidth === clientWidth` |
| 760x560 | Quick form, review, handoff, partial detail, failed refresh | `scrollWidth === clientWidth` |
| 360x640 | Populated directory | `scrollWidth === clientWidth`; rows fit within 336 px |

The first correction prototype kept two mode cards side by side at 360 px.
That created avoidable density even though it did not overflow. The revised
prototype stacks modes, makes the refresh group full width, and uses two-column
section tabs. Its measured width is 360 px client and 360 px scroll, with a
344 px review board and 288 px content controls.

## Terminology and content design

Recommended operator-facing hierarchy:

| Current term | Recommended presentation | Rationale |
|---|---|---|
| Quick Connect | Basic inspection | Describes the outcome; retain `quick` internally. |
| Full Connect | Complete inspection | Describes evidence breadth; explain the read-only agent second. |
| JSON-RPC endpoint | Node address | Put `JSON-RPC` in helper or technical detail. |
| Node ID | Stable Node ID | Explain that it is local inventory identity and is not applied to the node. |
| Unknown runtime | Runtime not identified with this access | Adds consequence without inventing a reason. |
| Unavailable through this connection | Not available with Basic inspection | Connects limitation to the operator's chosen mode. |
| Read-only MVP | Read only | Removes internal lifecycle language. |
| Review digest | Technical review digest | Preserves security meaning under progressive disclosure. |

Do not replace `unavailable` with `No`, `Off`, `0`, or an empty list. Do not
replace `unknown` with a negative claim. The four governance categories must
retain their current names or equivalent explanatory labels and remain
independent.

## Iterative proposal validation

### Cycle 1

The first prototype applied outcome-led mode selection, contextual private
review, compact partial evidence, limited-tab labels, unified refresh context,
and stronger focus.

Re-testing found three issues:

1. A presentation-only implementation could accidentally make the renderer
   classify private destinations. The plan now requires a typed result from
   the existing privileged endpoint-policy boundary.
2. Automatically generating Node IDs would change identity behavior and is not
   necessary to resolve the first journey. It is now a separate product
   decision; the first slice only explains the field.
3. Two prototype mode cards remained side by side at 360 px. They now stack in
   one column.

### Cycle 2

The revised proposals were checked against complete, partial, unavailable,
stale, failed-refresh, initial-failure, keyboard, 1060x720, 760x560, and
360x640 states. No unresolved Critical or Major problem was found in the
proposed solution set. Remaining questions are bounded product choices, not
blockers to the recommended first slice.

Prototype evidence:

- `.artifacts/ux-review/prototypes/onboarding-before-after.png`
- `.artifacts/ux-review/prototypes/partial-before-after-cropped.png`
- `.artifacts/ux-review/prototypes/recovery-before-after-cropped.png`
- `.artifacts/ux-review/prototypes/ux-corrections.html`

## Unresolved product questions

1. **Node ID ownership:** should the operator always choose the stable ID, or
   should the product generate it from the display name with an Advanced
   override? Recommendation: retain explicit input for the first slice; decide
   generation only with migration and collision behavior specified.
2. **Public/private review disclosure:** should a private destination show its
   classification reason before or after the first bounded validation?
   Recommendation: show it as soon as the privileged policy can determine it,
   before any disallowed connection attempt.
3. **Full inspection availability:** until a signed reference agent exists,
   should Complete inspection remain selectable with honest unavailable
   guidance or be labelled `Requires approved agent` in the mode card?
   Recommendation: keep it selectable and label the prerequisite; hiding it
   would obscure the upgrade path.
4. **Technical digest disclosure:** should technical review details be expanded
   by default for expert users? Recommendation: collapsed by default with a
   persistent, keyboard-operable disclosure; do not create a user preference
   yet.

## External guidance

- Nielsen Norman Group, [Ten Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)
- W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- Apple, [Human Interface Guidelines: Windows](https://developer.apple.com/design/human-interface-guidelines/windows), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), and [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)
- Electron, [Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility)

## Review conclusion

The MVP does not need a new navigation model, dashboard, framework, or feature
set. It needs a smaller language and hierarchy correction: explain inspection
outcomes first, make exceptional security review contextual, prioritize useful
evidence over repeated absence, and make keyboard focus behavior dependable.
The accompanying correction plan limits the first implementation goal to that
coherent slice.

## Implementation follow-up

The six-item first slice is now implemented without changing public DTOs,
transport ownership, persistence, or read-only semantics. Outcome-led access
labels, contextual private-destination review, compact partial evidence,
unified inspection status, roving tab behavior, strong focus, and Limited
section qualifiers passed deterministic, compiled, packaged, responsive, and
keyboard validation. The remaining UX-08 through UX-10 ideas stay deferred;
the initial-error recovery part of UX-11 was completed with the unified status
work. See the correction audit for exact evidence and remaining product
questions.
