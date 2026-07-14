# Node Inspection Desktop MVP Completion Audit

- Date: 2026-07-14
- Product version: `0.1.0-dev.0`
- Deterministic implementation status: complete
- Packaged application status: passed on macOS arm64
- New private-target desktop validation: pending separate execution approval
- Runtime and blockchain mutation: none implemented or authorized

## Result

The Node Inspection Desktop MVP is implemented as one small read-only product
journey:

```text
launch -> Nodes -> add or open -> Node Detail -> explicit Refresh
```

The real Electron application starts on a display-sorted persisted node
directory. It renders complete and partial inspections through Overview,
Components, Chain, and Governance, preserves evidence after a failed refresh,
and hands a committed Quick or Full onboarding review directly to the same
stable node. It does not add a framework, router, background polling, mutable
node operation, monitoring dashboard, or desktop-only inspection schema.

Electron main owns application context creation, public directory lookup,
access selection, bounded inspection, transport use, input validation, error
conversion, and sanitization. The sandboxed renderer receives only
`PublicNodeDirectory 1.0.0`, public onboarding reviews, and the existing
`NodeInspectionApi 1.0.0` response.

## Validation Gates

Passed on 2026-07-14:

```text
npm run verify
  192 tests passed
  compiled CLI smoke passed
  Electron development smoke: KNM_ELECTRON_SMOKE_OK

npm run test:electron:packaged
  macOS arm64 package built and packaged smoke marker passed

git diff --check
  passed
```

The aggregate gate was run after all source, test, and documentation changes;
this final result is the authoritative one recorded in the handoff.

The packaged `app.asar` contains the production Electron main, preload,
renderer, HTML, and CSS. It does not contain the deterministic browser fixture
generator or fixture bridge.

## Requirement Audit

### Public directory and application boundary

| Requirement | Status | Evidence |
| --- | --- | --- |
| Versioned UI-neutral public node directory | Passed | `src/domain/node-directory.ts`, `src/core/node-directory-api.ts` |
| Only stable ID, display name, network, flavor, and access modes cross the boundary | Passed | Exact-object assertions and private-field rejection in `tests/node-directory-api.test.ts` |
| Core-owned derivation and display-name ordering | Passed | `NodeDirectoryApi` uses validated inventory, resolved factual view, and deterministic access selection |
| Malicious strings remain inert text | Passed | Malicious display-name test plus renderer use of `textContent` only |
| Invalid or secret-bearing records fail closed | Passed | Inventory validation test returns typed `INVENTORY_RECORD_INVALID` |
| Restart persistence without snapshot persistence | Passed | Filesystem repository restart test proves the same directory and byte-identical inventory/connection files after listing |

### Electron bridge and isolation

| Requirement | Status | Evidence |
| --- | --- | --- |
| Narrow `nodes.list()` and `nodes.inspect(nodeId)` bridge | Passed | `src/electron/bridge.ts`, `preload.ts`, frozen channel tests |
| Existing inspection contract reused | Passed | `ElectronNodeInspection` contains the existing `NodeInspectionApiResponse`; no desktop inspection schema exists |
| Electron main calls the core directly | Passed | `createNodeDirectoryApi` and `createNodeInspectionApi` in `src/electron/main.ts` |
| Main owns public-directory authorization, access, timeout, transport, and error conversion | Passed | Target lookup precedes bounded 10-second inspection; handler uses the public error converter |
| Unknown and malformed IPC input rejected | Passed | `src/electron/node-read-ipc.ts` and typed invalid-input tests |
| Context isolation and renderer confinement | Passed | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP `connect-src 'none'` |
| No renderer CLI, network, process, filesystem, SSH, Docker, secret, or raw-output surface | Passed | Static renderer/preload boundary tests; no `fetch`, sockets, process calls, timers, clipboard, or HTML injection |
| Test fixture cannot enter production package | Passed | Package ignore rule, production HTML assertion, and `app.asar` inspection |

### Nodes and Node Detail

| Requirement | Status | Evidence |
| --- | --- | --- |
| Application starts on Nodes | Passed | Renderer calls `showNodes(false)` and the real built screen was captured |
| Persisted nodes are sorted and keyboard-accessible | Passed | Core ordering plus native button rows with explicit accessible names |
| No synthetic live health | Passed | Directory contract has no health field; screen shows only identity and access facts |
| One useful empty-state action | Passed | Empty state hides the duplicate header action and shows only **Add your first node** |
| Read-only Node Detail context | Passed | Persistent Read only label, stable ID, network, runtime, access, capture time, and freshness |
| Overview prioritizes operator facts | Passed | Chain progress/head/age/peers precede runtime, producer/API, and resource evidence |
| Components remain normalized and factual | Passed | Name, availability/state, restarts, uptime, and artifact render from the public snapshot |
| Chain evidence remains separate | Passed | Head, irreversible block, progress, block store, forks, gossip, and peers |
| Four governance meanings are never conflated | Passed | Separate Configured, Effective, Observed votes, and Network status cards |
| Unavailable, unknown, partial, and stale are explicit | Passed | Typed availability copy, Quick warning, stale badge, and retained error status |
| Warnings do not depend on color | Passed | Every status and warning includes concise text and next action |

### Refresh, onboarding, and recovery

| Requirement | Status | Evidence |
| --- | --- | --- |
| Refresh is explicit and bounded | Passed | Only the button calls inspect; no intervals, timers, or background inspection |
| Duplicate refresh is prevented | Passed | View reducer and disabled-button behavior; reducer deduplication test |
| Previous snapshot remains while refreshing | Passed | `refreshing` state retains `ElectronNodeInspection`; reducer test |
| Failure retains evidence and marks it stale | Passed | Reducer test plus final failed-refresh browser capture |
| Typed safe error and next action | Passed | Public error contract rendered without transport internals |
| Onboarding applies and opens Node Detail | Passed | Browser exercise completed Quick review/apply and opened `mainnet-seed` detail |
| Fresh onboarding snapshot is reused safely | Passed | Renderer checks `freshness === 'fresh'`; otherwise it performs bounded inspect |
| Quick-to-Full keeps one ID | Passed | Existing onboarding workflow test and unchanged stable-ID handoff |
| Cancel remains non-mutating | Passed | Existing onboarding reducer/workflow tests and safe return path |
| Endpoint and pairing material never enter screenshots or public DTOs | Passed | Security tests, blanked endpoint input after preview, sanitized fictional captures |

### Scope and semantic parity

| Requirement | Status | Evidence |
| --- | --- | --- |
| CLI and desktop use one factual core | Passed | Shared directory/access resolution and `NodeInspectionApi`; no CLI parsing |
| Human and structured inspection semantics preserved | Passed | Existing CLI human/JSON tests remained green in the aggregate gate |
| No inspection persistence | Passed | API response remains `persisted: false`; filesystem restart test detects no write |
| No runtime mutation | Passed | API response remains `runtimeChanged: false`; only read-only adapters are reachable |
| Scope exclusions preserved | Passed | No charts, search, polling, logs, lifecycle, backup, upgrade, wallet, producer, VHP, signing, transaction, or mainnet mutation code added |

## Screenshot Matrix

The final captures use only deterministic fictional IDs and values. They are
stored under the ignored `.artifacts/ui-review/` directory and are not release
assets.

| Capture | Dimensions | SHA-256 | Review result |
| --- | ---: | --- | --- |
| `01-populated-nodes-1060x720.png` | 1060x720 | `8c9259fa54f880f6096fd549d8d7564358eb10bb9c57804e4501b20a987dfadf` | Clear directory and primary Add action |
| `02-empty-nodes-760x560.png` | 760x560 | `4d9d7da61def4f77443a80d777e3d72a46f76b22afe63a4ba6db67ddc0f94ce6` | One honest onboarding action |
| `03-complete-overview-1060x720.jpg` | 1060x720 | `8fd494344ac1b3775280ad1d5527aba0e55b6ba8f035a0d699431ca35bd747d1` | Read-only context and high-value facts visible |
| `04-complete-components-1060x720.png` | 1060x720 | `241139d7c4ca8cc7a5c66f7fe2c22dfc424072e0f01554f9eeb9aa3c58384f15` | Compact normalized component evidence |
| `05-complete-governance-1060x720.png` | 1060x720 | `ff12c76fdcb2586a68e5b2c2f512e6c4f29aac0408ef638ad9a3710127d43c91` | Four governance categories visually distinct |
| `06-partial-detail-760x560.png` | 760x560 | `dc1e0757462eacc7463d215fcae36e3fb51618730bc62e52efa247a59a67023f` | Quick limitations and available chain facts explicit |
| `07-refresh-failure-retained-760x560.png` | 760x560 | `3a5a4e82bae2e6c9cc4797957398f7fc64b1d4ddbd9b200545e50205c16e5ae3` | Previous snapshot retained and marked Stale |
| `08-narrow-nodes-360x640.png` | 360x640 | `0d90a11482c0f0c33821a2e1568e9d967d916b8b375901289f2e610a78f6f2c8` | Readable responsive rows and visible primary action |

Browser checks reported `scrollWidth === clientWidth` for populated, empty,
complete, component, governance, partial, failed-refresh, and narrow states.
Two consecutive full review cycles found no critical or major functional,
security, accessibility, layout, or usability issue.

## Simplicity And Usability Review

All ten review questions passed in the final two cycles:

1. Add and open actions are identifiable immediately.
2. Read only remains visible in both the application and Node Detail.
3. Chain progress, freshness, and warnings precede secondary detail.
4. Quick Connect explains why host and governance evidence is unavailable.
5. Configured, effective, observed, and network governance evidence is separate.
6. Each state has one obvious primary action.
7. No fact is stronger than its source evidence.
8. Duplicate empty-state action and unnecessary focus decoration were removed.
9. Native controls, focus targets, labels, and tabs support keyboard use.
10. Refresh explicitly says that it runs bounded probes and never changes the node.

## Pending External Criterion

The underlying legacy multiservice adapter already has a separately approved
strictly read-only live audit with matching pre/post evidence in
`CLI_PHASE_4_MULTISERVICE_INSPECTION_MVP_AUDIT.md`. This goal did not open or
capture a private real inventory in the desktop application. A fresh
private-target desktop journey therefore remains pending separate execution
approval and sanitized evidence capture; it is not reported as passed.

That pending external criterion does not affect the completed deterministic,
compiled, packaged, security, responsive, or usability result.

## Scope Audit

No React or router, background polling, fleet health, charts, search, filters,
pagination, bulk action, logs, diagnostics bundle, installation, lifecycle
mutation, backup, restore, upgrade, rollout, wallet operation, producer change,
VHP operation, signing, transaction submission, mainnet mutation, release,
tag, commit, or push was implemented or performed.
