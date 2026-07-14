# Two-Mode Node Onboarding MVP Completion Audit

- Date: 2026-07-14
- Product version: `0.1.0-dev.0`
- Deterministic implementation status: complete
- Live Quick target: pending separate target approval
- Live Full target: pending separate target approval
- Production reference-agent repository/artifact: pending separate authorization
- Runtime and blockchain mutation: none implemented or authorized

## Result

The in-repository Two-Mode Node Onboarding MVP is implemented. Quick Connect
adds and inspects a limited endpoint-backed node without SSH. Full Connect
pairs the versioned deterministic agent without an SSH config entry, upgrades
the same stable node ID, selects the stronger access path, and revokes its
credential. Existing exact-alias SSH inspection remains compatible as Expert
Connect.

The functional core, CLI, interactive CLI, and Electron main share the same
versioned onboarding, inspection, persistence, and sanitization boundaries.
The Electron renderer does not parse CLI output or own networking, SSH,
Docker, clipboard pairing data, credentials, persistence, or runtime-specific
interpretation.

No live target or external agent artifact was authorized for this goal. Those
criteria remain explicitly pending and are not reported as passed.

## Validation Gates

Passed on 2026-07-14:

```text
npm run verify
npm run test:electron:packaged
```

The aggregate gate completed type checking, every source test, compiled CLI
validation, and Electron development smoke execution. The packaging gate built
the macOS arm64 application and executed its packaged smoke marker. Browser
layout validation covered Quick and Full views at 760x560 and 360x640 without
horizontal overflow.

## Requirement Audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| UI-neutral onboarding and access contracts | Passed | `src/domain/onboarding.ts`, `src/core/node-onboarding-api.ts` |
| Deterministic onboarding state machine | Passed | Pure reducer and contract tests |
| Closed SSH/public-RPC/agent connection union | Passed | Connection schema 2, strict validation, migration tests |
| Quick Connect without SSH | Passed | Fixed RPC transport, partial adapter, core and CLI end-to-end tests |
| Honest Quick unavailable facts | Passed | Components, resources, producer, and governance remain typed unavailable |
| Endpoint SSRF protections | Passed | Scheme, credentials, metadata/link-local, private review, pinned DNS, redirects, concurrency, time, size, and depth controls |
| Private endpoint input and output safety | Passed | Dedicated stdin/main paths and human/JSON sanitization tests |
| Multiple access bindings | Passed | One node may retain Quick, Full, and Expert paths |
| Deterministic access selection | Passed | Full, Expert, then Quick; explicit `nodes inspect --access` override |
| Stable Quick-to-Full upgrade | Passed | Filesystem workflow test proves one unchanged node ID and two bindings |
| Atomic/recoverable onboarding commit | Passed | Private journal and fault injection before connection write, inventory write, and journal clear |
| Agent discovery and protocol negotiation | Passed | Protocol `1.0.0`, strict schemas, signed build statement, runtime adapter selection |
| Replay-resistant pairing | Passed | High-entropy maximum-ten-minute session, transcript HMAC, single-use consumption, replay and expiry tests |
| Identity pinning and possession proof | Passed | Ed25519 fingerprint match and transcript signature verification |
| Inspect-only scoped credential | Passed | Only `inspect` is accepted; credential stored through opaque OS secret-store reference |
| Credential revocation | Passed | Remote revocation, local deletion, binding disable, and rejected post-revocation probe tests |
| Closed agent probes | Passed | Nine fixed typed probes; arbitrary command, RPC, URL, path, environment, and extra-field rejection |
| Malicious and oversized responses | Passed | Strict unknown-field checks, typed fact codec bounds, HTTPS byte/depth limits, deterministic rejection tests |
| Shared inspection normalization | Passed | Public RPC, agent, and SSH feed `RuntimeInspectionAdapter` and `NodeInspectionSnapshot` |
| Expert SSH compatibility | Passed | Existing exact-alias inspection tests remain green; legacy single references use the compatibility path |
| Batch and interactive parity | Passed | Shared command registry/executor, private prompt input, help, completion, and full-suite tests |
| Typed errors and stable exits | Passed | Existing envelope and exit-code contracts preserved; new errors sanitize unknown failures |
| Doctor local-only checks | Passed | Storage, profiles, journal, credential references, schema, recovery; remote contact only with explicit option |
| Electron Quick workflow | Passed | Typed bridge, main-owned network/persistence, review/apply/cancel states |
| Electron Full workflow | Passed | Explicit main-owned clipboard import, clipboard clear, main-memory secret, identity/capability review |
| Renderer isolation | Passed | Context isolation, sandbox, no Node integration, CSP `connect-src 'none'`, static boundary tests |
| Accessibility and non-color state | Passed | Semantic tabs/forms/status, labels, keyboard-native controls, textual state and error messages |
| Visual overflow | Passed | Browser validation at 760x560 and 360x640 reported `scrollWidth === clientWidth` in Quick and Full views |
| Compiled CLI | Passed | Aggregate compiled CLI smoke and help validation |
| Electron development smoke | Passed | `KNM_ELECTRON_SMOKE_OK` |
| Electron packaging | Passed | macOS arm64 application packaged and smoke-launched from `.artifacts` |
| Production agent package | Pending | Requires separate repository/artifact authorization and publisher trust material |
| Live Quick validation | Pending | Requires separate approval for a public observer or seed target |
| Live Full/restart/revocation validation | Pending | Requires separate approval for a disposable existing node and compatible agent deployment |

## Security Boundary Findings

- Public connection DTOs expose capability class and presence markers, never
  endpoints, SSH aliases, pinned identity values, or credential references.
- Filesystem connection state may contain private endpoints and opaque secret
  references, but never agent credential tokens or pairing secrets.
- Inventory contains only a private-endpoint placeholder and opaque connection
  reference.
- Pairing secrets do not enter command arguments, environment variables,
  reviews, journals, filesystem JSON, public errors, output, IPC responses, or
  renderer state.
- The agent client has four fixed paths and the RPC client has four fixed
  methods. Neither accepts caller-authored method names, bodies, headers, or
  commands.
- Full authority is `paired-inspect`; all configure, lifecycle, backup,
  producer, wallet, signing, and transaction authority remains false.

## Scope Audit

No blank-host provisioning, automatic agent installation, cloud-provider
integration, relay, background polling, continuous monitoring, log access,
lifecycle operation, backup, restore, upgrade, rollout, producer activation,
VHP operation, wallet operation, signing, transaction submission, Teleno
change, separate repository, external publication, or live infrastructure
deployment was implemented.

The deterministic implementation can be released only as an experimental
client surface until a production agent artifact and approved live validation
are completed. This status does not block continued use of Quick Connect or
the existing Expert SSH path within their documented constraints.
