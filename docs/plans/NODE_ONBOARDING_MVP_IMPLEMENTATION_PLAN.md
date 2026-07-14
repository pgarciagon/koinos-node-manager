# Two-Mode Node Onboarding MVP Implementation Plan

- Status: deterministic implementation complete; separately approved live
  Quick/Full validation and production agent artifact remain pending
- Date: 2026-07-14
- Product: Koinos Node Manager
- Depends on:
  - `docs/PRODUCT_BOUNDARY.md`
  - `docs/strategy/NODE_FLEET_STRATEGY.md`
  - `docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md`
  - `docs/plans/CLI_IMPLEMENTATION_PLAN.md`
  - `docs/CLI_ARCHITECTURE.md`
  - `docs/validation/CLI_PHASE_4_MULTISERVICE_INSPECTION_MVP_AUDIT.md`
- Delivery principle: functional core first, CLI proof second, Electron as a
  peer adapter, and no CLI-output parsing in the GUI

## 1. Objective

Make adding an existing Koinos node simple for a non-expert without making SSH
the permanent product experience.

The MVP exposes two operator-facing modes:

1. **Quick Connect** — enter a reachable Koinos JSON-RPC URL and immediately
   receive an explicitly limited read-only snapshot. No SSH configuration,
   agent, credential, or host mutation is required.
2. **Full Connect** — pair a small authenticated read-only node agent and
   receive the complete inspection snapshot supported by the runtime. Routine
   inspection no longer uses SSH after pairing.

The existing SSH path remains available as **Expert Connect** for legacy
operators and as a development/bootstrap fallback. It is not one of the two
primary GUI onboarding modes.

This plan extends the proven `NodeInspectionSnapshot` vertical. It does not
start lifecycle mutation, provisioning, continuous monitoring, or mainnet
producer operations.

## 2. Product Decisions

### 2.1 A connection is required; SSH is not

Node Manager always needs an authenticated or public communication path to
observe a node. The functional core must not depend on which transport supplies
that evidence.

```text
                              Quick Connect
                         PublicRpcProbeTransport
                                    |
GUI / CLI -> Onboarding API -> inspection use case -> NodeInspectionSnapshot
                                    |
                              Full Connect
                           AgentProbeTransport
                                    |
                              Expert Connect
                            SSH probe transport
```

Every transport implements closed, typed read-only operations. None accepts
operator-authored command text.

### 2.2 Quick Connect is deliberately partial

A public RPC URL can prove chain identity, head state, freshness, and selected
public P2P/API facts. It cannot prove Docker component state, disk space,
private runtime configuration, effective producer configuration, or locally
configured governance votes.

The GUI must label this state **Quick / limited inspection**. Missing facts
remain typed `unavailable` or `unknown`; they are never inferred from
reachability.

### 2.3 Full Connect means full inspection, not full mutation

During this MVP, Full Connect authorizes the agent only for the versioned
read-only probe catalog. It does not enable install, configure, start, stop,
restart, backup, upgrade, wallet, producer, signing, or transaction methods.

Future lifecycle capabilities require separate protocol scopes, plans,
confirmation, receipts, and roadmap approval. Pairing in this phase must not
silently pre-authorize them.

### 2.4 Quick-to-full upgrade preserves the node ID

An operator who starts with Quick Connect and later pairs an agent upgrades the
same inventory node. The display name, stable node ID, provenance, network and
historical evidence identity remain stable. The product must not create a
second node merely because a stronger connection becomes available.

### 2.5 A blank host remains out of scope

Both modes onboard an existing Koinos runtime. They do not provision a blank
server, install Docker, install a runtime, initialize data, open firewall
ports, or create a producer. Agent installation is an explicit one-time host
setup action performed through a provider console, package manager, or other
separately approved method.

## 3. Operator Journeys

### 3.1 Quick Connect

The desktop journey is intentionally short:

1. Select **Add Node**.
2. Select **Quick Connect**.
3. Enter a Koinos JSON-RPC URL and optional display name.
4. Node Manager validates the URL and runs bounded fixed RPC probes.
5. Review detected chain identity, network, head freshness, and capability
   limitations.
6. Select **Add Limited Node**.
7. Open the node overview backed by the same public DTO used by the CLI.

The normal success screen communicates limitations rather than treating them
as errors:

```text
Mainnet Seed
Connected with limited inspection
Chain advancing | P2P available | Host details unavailable
[Enable Full Inspection]
```

If the endpoint is reachable but identity evidence is incomplete, the operator
may save a connected limited record only after the unknown fields are shown.
A chain-ID mismatch or unsafe redirect blocks persistence.

### 3.2 Full Connect

Full Connect assumes a compatible read-only agent is installed or can be
installed through an explicit one-time host action:

1. Select **Add Node** or **Enable Full Inspection** on a Quick node.
2. Select **Full Connect**.
3. Node Manager checks for the versioned agent discovery document.
4. If absent, ask the operator to select the host platform and show matching
   signed package installation instructions. Do not claim to detect a platform
   through an unavailable agent, and do not execute a hidden installer.
5. The agent generates a high-entropy, single-use, short-lived pairing secret
   and a human-verifiable agent identity fingerprint.
6. Import the pairing payload through an Electron-main-owned clipboard or QR
   action. The renderer receives only an opaque pairing-session reference.
7. Electron main verifies the proof, pins the agent identity, stores the client
   credential in the operating-system secret store, and runs a capability
   probe.
8. Review network, chain, agent identity presence, authority, and supported
   inspection sections.
9. Select **Add Node** or **Upgrade Existing Node**.
10. Open the full read-only inspection view.

The user does not create an SSH config entry and never sees Docker commands,
private keys, raw agent responses, or runtime-specific parsing.

### 3.3 Expert Connect

The existing exact-alias SSH workflow remains documented and supported for
legacy deployments. It appears under an **Advanced / SSH** choice, not as the
default path. Existing SSH connections and nodes migrate without behavior
change.

## 4. Scope

### 4.1 Included

- versioned UI-neutral onboarding contracts and state machine;
- Quick Connect over bounded Koinos JSON-RPC;
- Full Connect through a versioned authenticated read-only agent protocol;
- partial and full `NodeInspectionSnapshot` production;
- stable node upgrade from Quick to Full;
- private versioned connection persistence and schema migration;
- operating-system secret-store abstraction for agent credentials;
- deterministic connection selection and explicit fallback visibility;
- batch CLI, interactive CLI, Electron-main API, and thin renderer parity;
- accessible progress, limitation, failure, and recovery states;
- fake transports and a disposable live validation target;
- documentation, threat model, protocol audit, and completion audit.

### 4.2 Explicitly excluded

- blank-server provisioning or cloud-provider APIs;
- automatic agent installation through public RPC;
- `curl | sh` as the required production installation path;
- central relay, hosted controller, account system, or billing;
- background polling, continuous monitoring, alerts, or fleet health;
- logs or support bundles;
- arbitrary local or remote shell execution;
- lifecycle, backup, restore, upgrade, or rollout mutation;
- wallet, producer activation, VHP, signing, or transaction submission;
- hidden firewall, reverse-proxy, SSH, Docker, or runtime changes;
- mainnet mutation of any kind.

## 5. Shared Domain Contracts

### 5.1 Onboarding contract

Add a versioned contract in the functional core. Names are illustrative but
the semantic fields are binding:

```text
NodeOnboardingContract 1.0
  mode: quick | full
  candidate:
    proposedNodeId / displayName
    connectionKind
    expectedNetwork?
  status:
    validating | probing | review-ready | pairing | verifying
    committed | cancelled | failed
  detected:
    runtimeFlavor / network / chainIdPresence
    capabilitySummary / freshness / warnings
  authority:
    public-observe | paired-inspect
  review:
    reviewId / digest / createdAt / expiresAt
    inventoryRevision / connectionRevision
  remediation:
    typed reason / safe summary / next action
```

The public onboarding DTO must contain no endpoint, DNS result, IP, SSH alias,
user, certificate, pairing secret, token, private key, key path, raw response,
Docker object, or runtime configuration.

### 5.2 Deterministic state machine

The core owns a pure reducer for:

```text
idle
  -> validating-input
  -> probing
  -> review-ready
  -> committing
  -> completed

review-ready
  -> pairing
  -> verifying-agent
  -> full-review-ready
  -> committing
  -> completed

any non-terminal state
  -> cancelled | failed
```

Retries create new bounded evidence. A stale review, changed endpoint identity,
changed chain identity, changed agent identity, changed inventory revision, or
changed connection revision invalidates the review digest.

### 5.3 Access summary

Expose a sanitized access summary to CLI and GUI:

```text
NodeAccessSummary
  mode: quick | full | expert
  status: connected | degraded | unavailable
  capabilities: overview / components / chain / apis / producer / governance / resources
  authority: public-observe | paired-inspect | ssh-observe
  lastVerifiedAt / freshness / typedWarnings
```

The summary reports transport class but never connection identity or private
coordinates.

## 6. Connection And Inventory Model

### 6.1 Private connection union

Migrate connection-state persistence from the current SSH-only shape to a
closed discriminated union:

```text
PrivateConnectionRecord
  SSH:
    id / kind=ssh / exactHostAlias / lastTest
  Public RPC:
    id / kind=public-rpc / privateEndpoint / endpointPolicy / lastTest
  Agent:
    id / kind=agent / privateEndpoint / pinnedAgentIdentity
    credentialRef / protocolVersion / scopes / lastTest
```

The connection repository remains private and atomically versioned. The
public connection DTO exposes ID, kind, status, capability class, timestamps,
and warnings only.

Raw agent credentials are never stored in filesystem JSON. `credentialRef` is
an opaque reference to an operating-system secret-store port. Deterministic
tests use an in-memory fake secret store.

### 6.2 Multiple access bindings

Quick, Full, and Expert paths may coexist for one node. Add a versioned private
binding model rather than overloading runtime identity:

```text
NodeAccessProfile
  nodeId
  bindings[]:
    connectionRef
    mode: quick | full | expert
    capabilityClass
    verifiedAt
    enabled
  preferredInspectionMode: automatic | quick | full | expert
```

Automatic selection is deterministic: verified Full, then verified Expert,
then verified Quick. Selection never increases management authority, is shown
in evidence provenance, and can be overridden explicitly for diagnosis.

The existing single SSH `connectionRef` migrates to one Expert binding. Stable
node IDs and current behavior are preserved. Quick-to-full upgrade adds a Full
binding and selects it after successful verification; it does not delete the
Quick binding silently.

### 6.3 Atomic onboarding commit

Onboarding may need to write connection state, access bindings, and inventory.
Treat the commit as one application transaction with optimistic revisions.
Either all records become active or none do. If the existing repositories
cannot provide a safe cross-repository transaction, add a journaled onboarding
commit with deterministic reconciliation before shipping.

Do not repeat the Phase 3 adoption atomicity gap. Process interruption at every
write boundary must recover to the previous state or complete the exact
reviewed commit.

## 7. Quick Connect Implementation

### 7.1 Fixed public RPC surface

`PublicRpcProbeTransport` supports only fixed bounded methods required by the
partial inspection adapter:

- `chain.get_chain_id`;
- `chain.get_head_info`;
- `p2p.get_gossip_status` when exposed; and
- the current versioned Teleno status method when the endpoint supports it.

Optional methods must be added as typed probe identifiers with contract tests.
The transport never accepts a method name, path, headers, body, or command from
the caller.

### 7.2 Partial inspection adapter

Implement `PublicKoinosRpcInspectionAdapter` against the existing runtime
inspection contract. It returns:

- runtime flavor when versioned evidence proves it, otherwise unknown;
- chain identity and detected network when recognized;
- head height, block identity, LIB, age, freshness and progress when available;
- public JSON-RPC availability and selected P2P gossip evidence;
- components, supervisor, layout, storage, private API bindings, local producer
  configuration and local governance configuration as explicitly unavailable.

Do not label a node legacy multiservice merely because it speaks Koinos RPC.
Do not infer producer state or management authority from a public endpoint.

### 7.3 Endpoint policy

Public RPC onboarding is a network boundary and receives a dedicated threat
model:

- allow `https` by default;
- allow loopback `http` only for explicit local-development mode;
- reject user information, fragments, non-HTTP schemes, Unix sockets, and
  embedded credentials;
- do not follow redirects unless the exact reviewed destination policy permits
  one same-origin redirect;
- bound DNS resolution, connect time, total time, response bytes, JSON depth,
  and concurrent probes;
- block cloud metadata and link-local destinations;
- pin the resolved destination for the request to prevent DNS rebinding;
- in local Electron, require explicit review before contacting a private-range
  address;
- in a future controller, enforce tenant egress allowlists and authorization;
- sanitize TLS, DNS, proxy, and response errors before returning them.

Private endpoints are valid product targets, so they are reviewed and policy
controlled rather than globally forbidden.

### 7.4 Quick Connect exit

Quick Connect is complete when an operator can enter a compatible endpoint,
review chain/network identity and limitations, persist one limited node, close
and reopen the application, and receive the same partial snapshot without SSH,
agent installation, endpoint disclosure, or runtime mutation.

## 8. Full Connect Agent

### 8.1 Ownership and repository boundary

Define a versioned `KoinosNodeAgentProtocol` in a UI-neutral package. The
reference legacy agent is a separately deployable Node Manager component, not
part of the renderer and not a general shell agent.

Creating a new agent repository or changing a runtime repository requires
explicit authorization before implementation. Teleno may later implement the
same protocol natively or through its versioned status surface; those changes
belong in `koinos/teleno`.

### 8.2 MVP network shape

The MVP uses direct operator-to-agent HTTPS on an operator-reachable private,
VPN, or explicitly protected address. It does not introduce a hosted relay.

The agent should bind privately by default. Public exposure requires strong
authentication, agent identity pinning, firewall policy, bounded requests, and
a security review. A reverse proxy may expose the versioned route, but Node
Manager never edits that proxy automatically.

If direct reachability is unavailable, the operator can retain Quick Connect
or use Expert SSH. A controller relay is a later architecture decision.

### 8.3 Pairing protocol

Pairing is versioned and replay resistant:

1. The agent creates a long-term Ed25519 identity locally.
2. The agent creates a cryptographically random, single-use pairing secret of
   at least 128 bits with a maximum ten-minute lifetime.
3. The operator transfers the pairing payload through a QR code or explicit
   copy action. A six-digit code alone is insufficient.
4. Node Manager fetches the agent discovery document with bounded HTTPS.
5. The pairing exchange proves possession of the secret and agent private key.
6. Node Manager shows a short human-verifiable fingerprint before commitment.
7. The parties establish a scoped client credential or mutual-TLS identity.
8. Node Manager pins the agent identity and stores the credential only through
   the secret-store port.
9. The agent consumes the pairing secret and rejects replay, expiry, identity
   change, and protocol downgrade.

Pairing secrets, credentials, certificates, and raw fingerprints never appear
in logs, persisted reviews, CLI envelopes, renderer events, history, receipts,
screenshots, or support output. Public DTOs may expose only a boolean identity
presence marker and a non-reversible local digest when needed for change
detection.

### 8.4 Agent protocol surface

The initial protocol exposes only:

- version and build identity;
- agent identity and protocol compatibility;
- supported runtime flavors and capabilities;
- fixed batched read-only probe requests;
- bounded sanitized probe evidence;
- health of the agent itself; and
- credential revocation.

The request schema contains a closed probe enumeration and timeout. It contains
no command, path, environment, working directory, shell, executable, method
name, arbitrary URL, arbitrary RPC body, or free-form Docker query.

The response schema contains versioned typed facts, not stdout, stderr, raw
Docker objects, raw configuration, private endpoints, filesystem paths, peer
identities, producer addresses, credentials, or keys.

### 8.5 Legacy agent privilege boundary

The legacy agent needs enough local privilege to inspect Docker metadata,
restricted runtime configuration facts, loopback RPC, and optional storage.
Docker-socket access is effectively host-privileged even when mounted
read-only. The threat model must compare:

- a narrowly installed host service with a fixed subprocess/probe catalog;
- a dedicated rootless or proxy-mediated Docker inspection surface; and
- direct Docker socket access as a last-resort documented risk.

The agent must not expose the Docker socket, accept Docker API requests from
the network, or translate client input into Docker arguments. Compromise,
credential theft, downgrade, and malicious-runtime-output tests are release
gates.

### 8.6 Signed installation

The Full Connect wizard may show platform-specific installation instructions,
but installation remains explicit. Production artifacts require:

- versioned releases;
- immutable digest and checksum;
- signature verification policy;
- supported platform and architecture declaration;
- uninstall and credential-revocation instructions;
- observer-safe defaults; and
- no automatic producer or runtime configuration.

Do not make an unaudited convenience script the only production installation
path. A disposable environment may use a development installer only when it is
clearly labeled and never copied into release guidance.

### 8.7 Full Connect exit

Full Connect is complete when a disposable existing legacy multiservice node
can be paired without an SSH config entry, can return the full supported
inspection snapshot through the same adapters and public DTO, survives Manager
and agent restarts, rejects stale/replayed credentials, and produces exact
pre/post evidence that no runtime or chain state changed.

## 9. Application API, CLI, And GUI

### 9.1 Application API

Add a narrow versioned `NodeOnboardingApi` called directly by CLI and Electron
main:

```text
previewQuick(input) -> OnboardingReview
applyQuick(reviewId, digest) -> OnboardingResult
previewFull(input) -> AgentDiscoveryReview
pairFull(reviewId, privatePairingInput) -> OnboardingReview
applyFull(reviewId, digest) -> OnboardingResult
cancel(reviewId) -> CancelledResult
getStatus(reviewId) -> PublicOnboardingStatus
```

Private endpoint and pairing inputs remain inside Electron main/application
ports. The renderer receives only sanitized progress and review DTOs.

### 9.2 CLI proof surface

Proposed registry-driven commands:

```text
knm onboarding quick preview --id <node-id> --name <name> --rpc-endpoint-stdin
knm onboarding quick apply <review-id> --confirm <digest>

knm onboarding full preview --id <node-id> --name <name> --agent-endpoint-stdin
knm onboarding full pair <review-id> --pairing-secret-stdin
knm onboarding full apply <review-id> --confirm <digest>

knm onboarding status <review-id>
knm onboarding cancel <review-id>
```

Private endpoints and pairing secrets are forbidden in arguments, environment
variables, history and JSON input. The CLI reads endpoints through the
dedicated `--rpc-endpoint-stdin` or `--agent-endpoint-stdin` input and reads
pairing secrets from a hidden TTY prompt or `--pairing-secret-stdin`.
Automation uses a secret-manager file descriptor or opaque secret reference,
not `echo` in shell history. None of these private inputs is repeated in output
or errors.

Human and schema-versioned JSON forms expose the same sanitized review. The
interactive CLI resolves the same registry handlers and completions. Tests do
not require prompts because every flow has an explicit non-interactive form.

### 9.3 Electron bridge

Electron main owns:

- DNS, TLS, HTTP and agent clients;
- endpoint policy and resolution;
- pairing secret input;
- operating-system secret-store calls;
- review persistence and optimistic revisions;
- inspection adapter composition; and
- sanitization before every IPC event.

The preload exposes a narrow typed bridge. The renderer never imports Node.js,
opens sockets, resolves DNS, stores secrets, constructs RPC requests, invokes
SSH, inspects Docker, or parses CLI output.

### 9.4 Renderer flow

The renderer implements one calm wizard:

```text
Add Node
  -> Choose Quick or Full
  -> Enter connection
  -> Connecting / Pairing
  -> Review detected identity and capabilities
  -> Add or Upgrade
  -> Node overview
```

Required states include empty, validating, unreachable, TLS failure, identity
mismatch, incompatible protocol, limited capability, pairing expired, pairing
rejected, review stale, persistence conflict, completed, and cancelled.

The UI must explain the difference between limited and full inspection in
plain language. Status never depends on color alone. Private endpoints leave
renderer state after submission. Pairing secrets never enter renderer state.

## 10. Errors And Safety Policy

Add stable typed errors with existing envelope and exit-code semantics:

- `ONBOARDING_ENDPOINT_INVALID`;
- `ONBOARDING_ENDPOINT_BLOCKED`;
- `ONBOARDING_UNREACHABLE`;
- `ONBOARDING_TLS_FAILED`;
- `ONBOARDING_RESPONSE_MALFORMED`;
- `ONBOARDING_CHAIN_ID_MISMATCH`;
- `ONBOARDING_CAPABILITY_LIMITED` as a review warning, not failure;
- `AGENT_PROTOCOL_UNSUPPORTED`;
- `AGENT_IDENTITY_CHANGED`;
- `AGENT_PAIRING_EXPIRED`;
- `AGENT_PAIRING_REJECTED`;
- `AGENT_PAIRING_REPLAYED`;
- `AGENT_CREDENTIAL_UNAVAILABLE`;
- `ONBOARDING_REVIEW_STALE`;
- `ONBOARDING_REVISION_CONFLICT`; and
- `ONBOARDING_COMMIT_INTERRUPTED`.

Every error includes severity, retryability, safe summary and next action. No
error includes a URL, host, IP, DNS result, certificate, fingerprint, token,
secret, raw response or command output.

## 11. Test And Validation Matrix

### 11.1 Pure core tests

- onboarding state transitions and cancellation;
- review digest, expiry and invalidation;
- stable node-ID preservation during Quick-to-Full upgrade;
- access-binding selection and explicit override;
- capability and authority precedence;
- atomic multi-repository commit and interruption reconciliation;
- public DTO closure and sanitization;
- typed errors and remediation.

### 11.2 Quick Connect tests

- recognized mainnet and testnet chain identities;
- unknown chain, mismatch, stale head and advancing head;
- P2P available, unavailable and malformed;
- HTTPS success, TLS failure, timeout and oversized response;
- redirect, DNS rebinding, link-local and cloud-metadata blocking;
- explicitly reviewed private-range endpoint;
- credentials/user-info and unsupported URL schemes rejected;
- response depth and concurrency bounds;
- no components, producer or governance facts invented;
- restart persistence and endpoint redaction.

### 11.3 Agent tests

- shared protocol schema and compatibility suite;
- complete, partial and unsupported capability sets;
- successful pairing and restart persistence;
- wrong, expired, replayed and already-consumed secret;
- agent identity change and protocol downgrade;
- unavailable secret store and credential revocation;
- malformed, oversized, delayed and malicious evidence;
- closed probe enumeration and arbitrary-command rejection;
- transport cancellation and interruption;
- no raw Docker/config/path/endpoint/credential boundary crossing;
- full inspection adapter contract parity with SSH evidence.

### 11.4 CLI and Electron tests

- human and schema-versioned JSON output;
- invalid input, typed errors and stable exit codes;
- interactive registry/help/completion parity;
- private endpoint and pairing secret absent from process arguments, history,
  renderer state, IPC events, and output;
- Electron typed IPC and renderer isolation;
- wizard reducer, cancellation and recovery;
- accessibility, keyboard navigation and non-color status;
- packaged Electron execution;
- visual overflow at supported window sizes.

### 11.5 Live validation

Use separately approved disposable or existing operator-owned targets:

1. Quick Connect a public observer/seed endpoint and prove a limited snapshot.
2. Pair a reference agent on a disposable existing legacy node without an SSH
   config entry in Node Manager.
3. Compare agent and SSH snapshots for semantic parity where both are
   separately approved.
4. Capture exact sanitized pre/post component, configuration, restart and chain
   evidence.
5. Restart Node Manager and agent, then inspect again.
6. Revoke the credential and prove further agent access fails.

Never use a private production target or mainnet producer without separate
explicit approval. Absence of an approved target leaves the corresponding live
exit pending; it must not be reported as passed.

## 12. Delivery Phases

### Phase A — ADR, threat model and contracts — complete

- write the transport/onboarding ADR;
- define onboarding, access-summary, binding and protocol schemas;
- define endpoint and agent threat models;
- define the secret-store port and fake;
- freeze public DTOs and error codes;
- add pure state-machine and sanitization tests.

Exit: architecture review confirms that GUI, CLI, public RPC, agent and SSH are
peer adapters and that no secret or arbitrary-command path exists.

### Phase B — Quick Connect functional core and CLI — complete

- add private public-RPC connection records and migration;
- implement endpoint policy and fixed RPC transport;
- implement partial inspection adapter;
- implement preview/apply use cases and atomic persistence;
- add batch and interactive commands;
- add compiled CLI and restart tests.

Exit: a URL becomes one stable limited node with an accurate partial snapshot,
no SSH requirement and no private endpoint in output.

### Phase C — Quick Connect Electron wizard — complete

- add typed Electron-main bridge;
- add renderer state machine and Quick flow;
- render capability limitations and upgrade action;
- validate packaged execution, accessibility and overflow.

Exit: a non-expert can add and inspect a limited node without using the CLI.

### Phase D — Agent protocol and deterministic reference surface — complete in repository; production artifact pending

- create the protocol package and fake agent in this repository;
- leave the separately authorized reference agent repository/artifact pending;
- implement identity, discovery, pairing, credential and fixed-probe surfaces;
- implement signed package metadata and uninstall/revocation;
- complete agent security and adapter contract suites.

Exit: the in-repository protocol, fake agent, HTTPS client, and contract suite
pass deterministic pairing, protocol, privilege, replay, downgrade,
sanitization, and read-only tests. A production artifact is not claimed.

### Phase E — Full Connect core and CLI — complete deterministically

- implement direct HTTPS agent transport;
- integrate the operating-system secret store;
- add access bindings and Quick-to-Full upgrade;
- add full preview/pair/apply/status/cancel commands;
- prove semantic parity with existing inspection adapters;
- add restart, revocation and reconciliation tests.

Exit: an existing Quick node upgrades in place to Full inspection without SSH
and without creating a duplicate node.

### Phase F — Full Connect Electron wizard — complete for an installed compatible agent

- add agent discovery, installation guidance and pairing UI;
- add Electron-main-owned QR/clipboard pairing import that never enters
  renderer state;
- add identity/capability review and upgrade commit;
- add credential revocation and reconnect guidance;
- validate packaged execution and renderer isolation.

Exit: a non-expert pairs an installed agent and receives a full snapshot without
editing SSH config or seeing runtime internals.

### Phase G — Documentation and deterministic audit complete; live targets pending approval

- validate Quick and Full targets under separate approval;
- record sanitized no-mutation and restart evidence;
- run `npm run verify` and packaged Electron gates;
- update help, README, onboarding guide, architecture, strategy and changelog;
- publish a requirement and scope audit.

Exit: all automated gates pass and every live criterion is passed or explicitly
pending without overstating completion.

## 13. MVP Completion Criteria

The two-mode onboarding MVP is complete only when:

- Quick Connect requires only a compatible endpoint and returns an accurate,
  visibly limited snapshot;
- Full Connect pairs an installed agent without requiring an SSH config entry;
- a Quick node upgrades to Full without changing its stable node ID;
- SSH remains functional as an advanced fallback;
- public RPC, agent and SSH evidence normalize through shared core contracts;
- no transport accepts arbitrary commands or arbitrary RPC methods;
- pairing is replay-resistant, identity-pinned, scoped and revocable;
- raw credentials and private connection data never cross persistence, event,
  error, history, CLI, IPC, renderer, screenshot or documentation boundaries;
- onboarding persistence is atomic and interruption-recoverable;
- renderer workflows call Electron main and core directly, never the CLI;
- deterministic, CLI, interactive, compiled, Electron and packaged tests pass;
- approved live Quick and Full validations pass, or their absence remains
  explicitly pending; and
- active plans and manuals match the implemented behavior.

## 14. Applied Implementation Decisions

The following defaults are recommended by this plan:

1. **Quick transport:** fixed HTTPS JSON-RPC with explicit local/private review.
2. **Full transport:** direct authenticated HTTPS agent; no hosted relay in the
   MVP.
3. **Agent identity:** long-term Ed25519 identity with pinning.
4. **Pairing:** high-entropy single-use secret plus agent-key proof; no short
   code alone.
5. **Credential storage:** operating-system secret store behind an opaque core
   port.
6. **Node upgrade:** multiple private access bindings on one stable node.
7. **SSH:** retained as Expert Connect and test oracle, not removed.
8. **Agent ownership:** Node Manager protocol/component; Teleno-native support
   remains a separately authorized runtime-repository change.
9. **Runtime provisioning:** remains outside this onboarding MVP.
10. **Mutation authority:** absent from Quick and Full scopes in this phase.

Implementation must pause for explicit authorization before creating a new
agent repository, modifying Teleno, exposing a live agent endpoint, or testing
against private production infrastructure.
