# Node Inspection Desktop MVP UX Correction Audit

- Status: complete
- Completed: 2026-07-15
- Scope: presentation and interaction corrections only
- Source plan: `docs/plans/NODE_INSPECTION_DESKTOP_MVP_UX_CORRECTION_PLAN.md`
- Source review: `docs/ux/NODE_INSPECTION_DESKTOP_MVP_UX_REVIEW.md`

## Result

The six-requirement correction slice is implemented and validated. The
desktop now describes inspection outcomes before transport mechanisms, asks
for private-destination confirmation only after the privileged policy requires
it, prioritizes useful evidence for partial nodes, groups freshness and
recovery, follows keyboard tab conventions, and previews unavailable sections
as Limited.

No public DTO, contract version, access identifier, transport, persistence
schema, renderer privilege, inspection meaning, or remote-node state changed.

## Requirement Evidence

| Requirement | Status | Implementation evidence | Validation evidence |
| --- | --- | --- | --- |
| R1. Outcome-led onboarding language | Pass | `src/electron/index.html`; `src/electron/desktop-presentation.ts` maps `quick`/`full` to Basic/Complete for display only | `tests/electron-desktop-presentation.test.ts`; `tests/electron-onboarding.test.ts`; complete and partial captures |
| R2. Contextual private-destination confirmation | Pass | Hidden review groups in `src/electron/index.html`; typed `private-review-required` state in `src/electron/onboarding-view-model.ts`; reveal/focus in `src/electron/renderer.ts` | Public fixture proceeds without confirmation; private fixture reveals it only after `ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED`; renderer source contains no URL, DNS, or IP classification |
| R3. Compact partial inspection | Pass | `renderOverview` in `src/electron/renderer.ts` puts chain facts first, shows one Basic limits callout, uses compact API exposure, and keeps typed missing facts in a disclosure | Partial 1060x720, 760x560, and 360x640 captures; complete fixture retains supported evidence; existing adapter and schema tests pass |
| R4. Unified freshness, Refresh, and recovery | Pass | `inspection-status-group` in `src/electron/index.html`; `relativeCaptureTime` selector; explicit loading, refreshing, ready, retained-error, and initial-error rendering in `src/electron/renderer.ts` | Refreshing retains the prior head and disables the action; success advances the deterministic head; failure retains the prior capture, marks it Stale, and exposes Try again; initial failure shows one local retry |
| R5. Keyboard tabs and focus visibility | Pass | Shared `installRovingTablist`; pure `nextRovingTabIndex`; 3 px white plus dark-purple focus treatment in `src/electron/styles.css` | Arrow wrap, Home, and End unit tests; real Electron Basic-to-Complete keyboard selection; Tab exits after one selected tab; accessibility tree exposes selected tab and controlled panel |
| R6. Limited section preview | Pass | `sectionTabLabel` derives Components and Governance qualifiers from the existing snapshot | Partial fixture exposes `Components · Limited` and `Governance · Limited`; complete fixture has no qualifier; narrow layout has two columns and no horizontal overflow |

## State And Interaction Validation

The deterministic fixture bridge remains test-only and excluded from packaged
production output. The running built renderer was exercised for:

- empty and populated Nodes;
- Basic and Complete onboarding;
- approved public and review-required private destinations;
- approved-agent unavailable guidance;
- complete and partial Overview;
- Components and Governance supported and Limited states;
- initial loading and initial typed failure;
- explicit Refresh in progress, success, duplicate prevention, retained
  failure, and retry;
- complete, partial, unavailable, stale, timeout, unreachable,
  authentication-failure, malformed, mismatched-chain, stalled-head,
  component-failure, and governance-unavailable fixtures inherited by the
  desktop inspection suite;
- keyboard-only onboarding and detail-section navigation; and
- 1060x720, 760x560, and 360x640 layouts.

At every required width, measured `scrollWidth <= clientWidth`. Long safe
values wrap, action controls remain visible, and status meaning does not rely
on color.

## Screenshot Evidence

Sanitized ignored evidence is stored under
`.artifacts/ux-correction-review/`:

| Capture | Purpose |
| --- | --- |
| `02-private-review-760x560.png` | Typed private-destination review appears contextually |
| `03-refreshing-retained-760x560.png` | Prior evidence retained while Refresh is disabled |
| `04-refresh-failed-retained-760x560.png` | Stale retained evidence with local retry |
| `05-partial-narrow-360x640.png` | Narrow partial state with no horizontal overflow |
| `06-complete-overview-1060x720.png` | Complete evidence without Limited qualifiers |
| `07-complete-agent-unavailable-760x560.png` | Honest Complete-inspection prerequisite |
| `08-refined-partial-overview-1060x720.png` | Available chain evidence precedes one limits summary |
| `10-cycle2-initial-error-760x560.png` | One typed initial error and one Try again action |
| `11-cycle2-partial-1060x720.png` | Second-cycle partial Overview result |

The artifacts contain fictional identifiers and values and are ignored by Git.
They contain no credentials, pairing material, private hosts, SSH aliases,
users, paths, producer addresses, peer identities, keys, or tokens.

## Iterative Review

### Cycle 1

The first implementation review found two presentation problems: the initial
inspection error repeated the same error and left empty detail navigation
visible, and API exposure occupied more space than its decision value. Both
were corrected by hiding detail tabs and badges until a snapshot exists,
showing one contextual error, and rendering API exposure as a compact row.

### Cycle 2

The corrected initial-error and partial Overview states were re-exercised at
760x560 and 1060x720, then checked with complete, narrow, keyboard, refresh,
and private-review states. No unresolved Critical or Major functional,
security, accessibility, layout, or comprehension issue remained.

## Automated Gates

| Gate | Result |
| --- | --- |
| `npm run verify` | Pass: 199 tests in 50 suites, compiled CLI smoke, and Electron development smoke |
| `npm run test:electron:packaged` | Pass: macOS arm64 package created and packaged smoke completed |
| `git diff --check` | Pass |

Focused presentation tests cover access labels, Limited labels, Basic
inspection detection, relative capture time, tab wraparound, Home/End, typed
private-review presentation, semantic tab attributes, hidden review groups,
renderer policy separation, and focus treatment.

## Security And Scope Audit

- Electron context isolation, sandboxing, disabled Node integration, and the
  existing content security policy are unchanged.
- The renderer still has no filesystem, process, network, SSH, Docker, secret,
  or CLI-parsing capability.
- Endpoint classification remains in the privileged endpoint-policy path.
- Refresh remains explicit and bounded. No interval, background inspection,
  or persisted snapshot was added.
- Quick/Full/Expert identifiers and selection precedence are unchanged; only
  desktop labels changed.
- Available, unavailable, and unknown meanings are unchanged. No missing fact
  becomes zero, false, healthy, or empty.
- Governance configured, effective, observed, and network categories remain
  independent.
- No runtime, inventory, wallet, producer, service, container, blockchain, or
  other remote state was mutated.

## Deferred Questions

- Automatic Stable Node ID generation remains deferred pending collision,
  rename, migration, CLI parity, and upgrade rules.
- Complete inspection remains selectable with an honest approved-agent
  prerequisite until a signed reference artifact exists.
- Technical review details remain visible in the existing review presentation;
  a separate progressive-disclosure change was not required for this slice.

## Completion Decision

The correction-plan completion gate passes. The result is a smaller, clearer,
keyboard-consistent desktop journey with unchanged safety and evidence
semantics. No external live target is required for this presentation-only
correction; the underlying inspection adapter retains its separately approved
read-only live validation evidence.
