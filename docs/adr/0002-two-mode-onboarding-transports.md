# ADR 0002: Two-Mode Read-Only Node Onboarding

- Status: accepted for implementation
- Date: 2026-07-14
- Decision owners: Koinos Node Manager
- Related plan: `../plans/NODE_ONBOARDING_MVP_IMPLEMENTATION_PLAN.md`

## Context

The implemented inspection MVP reaches existing nodes through exact SSH
aliases. That is an appropriate expert and migration path, but it is not a
simple first-run experience for a non-expert graphical application. Public
Koinos JSON-RPC can provide useful chain evidence without host access, while a
small authenticated agent can expose the existing closed read-only probe
catalog without retaining SSH as the routine transport.

The functional core, CLI, Electron main, and a future controller must use the
same evidence and safety semantics. The renderer must not acquire networking,
credential, command-execution, or runtime-interpretation authority.

## Decision

Node Manager exposes two primary onboarding modes:

1. **Quick Connect** uses a reviewed Koinos JSON-RPC endpoint and fixed bounded
   probes. It produces an explicitly partial inspection snapshot.
2. **Full Connect** pairs a versioned authenticated read-only agent. It uses a
   pinned Ed25519 identity, a single-use short-lived pairing secret, a scoped
   revocable credential, and a closed typed probe catalog.

Existing exact-alias SSH becomes **Expert Connect**. It remains supported and
does not lose capabilities.

All transports normalize through `RuntimeInspectionAdapter` and
`NodeInspectionSnapshot`. Transport selection uses a private `NodeAccessProfile`
with deterministic priority: Full, Expert, then Quick. Quick-to-Full upgrade
adds a binding to the same stable node ID.

Onboarding follows preview, review, digest-bound confirmation, atomic or
journaled commit, and verification. Private endpoints may be stored only in
private connection state. Agent credentials are stored only through an opaque
operating-system secret-store reference. Pairing secrets are never persisted.

Electron main owns network clients, endpoint policy, pairing import, secret
storage, persistence, and sanitization. The renderer consumes versioned public
DTOs and never parses CLI output.

## Protocol Boundary

Public RPC accepts only fixed methods selected by the transport. The agent
protocol accepts only enumerated probes and bounded timeouts. Neither protocol
contains command text, executables, paths, environments, arbitrary URLs,
arbitrary RPC methods, arbitrary Docker queries, or raw process output.

Full Connect grants `paired-inspect` authority only. It does not grant
configuration, lifecycle, producer, wallet, signing, or transaction authority.

## Persistence Decision

Connection state schema 2 stores the connection union, access profiles, and
onboarding reviews. Reviews bind inventory and connection-state revisions and
expire. A private onboarding journal makes cross-repository commits
recoverable. Reconciliation completes an exact reviewed operation or reports a
typed conflict; it never silently applies different metadata.

## Consequences

- A non-expert can start with a URL and see honest limitations.
- Full inspection can operate without a user-authored SSH configuration.
- SSH stays available for existing nodes and diagnosis.
- The agent is a security-sensitive component and requires protocol,
  privilege, replay, downgrade, and artifact review before live deployment.
- Direct agent reachability is required in this MVP; a hosted relay remains
  outside scope.
- Creating a separate agent repository or modifying Teleno requires separate
  authorization.

## Rejected Alternatives

- **SSH as the only onboarding path:** too complex for the normal GUI journey.
- **Infer full facts from public RPC:** creates false authority and evidence.
- **General-purpose remote shell agent:** violates the product safety model.
- **Renderer-owned networking or credentials:** crosses the privilege boundary.
- **Automatic hidden agent installation:** mutates the host without a separate
  reviewed operation.
- **Hosted relay in the MVP:** adds accounts, tenancy, availability, and a much
  larger security perimeter.
