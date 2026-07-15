# Existing Node Onboarding Guide

- Status: Quick Connect, Full Connect client integration, Expert Connect, and
  Electron onboarding are implemented
- Live status: Quick and Full onboarding live validation is pending separate
  target approval
- External status: no signed reference-agent artifact is published by this
  repository

The desktop uses outcome-led labels: **Basic inspection** is the Quick Connect
contract, and **Complete inspection** is the Full Connect contract. CLI
commands, structured output, persistence, and access overrides continue to use
the stable `quick` and `full` identifiers.

This guide adds an existing Koinos runtime to Koinos Node Manager. It does not
provision a blank host, install a runtime, activate a producer, or change the
node.

## Choose A Mode

| Desktop label (CLI name) | Operator input | Available evidence | Intended use |
| --- | --- | --- | --- |
| Basic inspection (`quick`) | Koinos node address | Chain, head freshness, and supported public P2P/API facts | Simplest first connection |
| Complete inspection (`full`) | Compatible read-only agent pairing payload | Complete snapshot supported by the runtime | Routine complete inspection without SSH |
| Expert Connect (`expert`) | Exact SSH config alias | Complete legacy fixed-probe inspection | Existing and advanced deployments |

Automatic inspection selects a verified Full binding, then Expert, then
Quick. Use `nodes inspect <node-id> --access quick|full|expert` only when
diagnosing a particular path.

## Quick Connect

The endpoint is private input. Do not place it in a command argument. Pipe one
line to the dedicated standard-input option:

```bash
printf '%s\n' '<KOINOS_JSON_RPC_ENDPOINT>' | npm run cli -- \
  onboarding quick preview \
  --id existing-observer \
  --name "Existing Observer" \
  --rpc-endpoint-stdin \
  --output json
```

For a reviewed private-range HTTPS destination, add `--allow-private`.
Loopback HTTP is disabled by default and exists only for explicit local
development with `--allow-loopback-http` and `KNM_ALLOW_LOOPBACK_HTTP=1`.

Review the returned node identity, limitations, review ID, expiry, and digest.
Then apply the exact review:

```bash
npm run cli -- onboarding quick apply \
  <ONBOARDING_REVIEW_ID> \
  --confirm <REVIEW_DIGEST>

npm run cli -- nodes inspect existing-observer --access quick
```

Quick output intentionally reports components, host resources, local producer
configuration, and local governance configuration as unavailable. Endpoint
reachability never implies runtime flavor or management authority.

## Full Connect

Full Connect requires a compatible implementation of
`KoinosNodeAgentProtocol 1.0.0`. This repository contains the protocol,
deterministic fake, HTTPS client, and contract suite, but it does not publish or
install a production agent artifact. Install only a separately approved and
signature-verified artifact. Do not use an unreviewed `curl | sh` command.

The agent creates a single-use payload containing an endpoint, opaque session
ID, identity fingerprint, expiry, and secret. The secret expires within ten
minutes. Keep the endpoint and secret out of shell history.

Pass the endpoint through private input while the opaque session ID and public
identity digest bind the review:

```bash
printf '%s\n' '<PRIVATE_AGENT_ENDPOINT>' | npm run cli -- \
  onboarding full preview \
  --id existing-observer \
  --agent-endpoint-stdin \
  --pairing-session <OPAQUE_PAIRING_SESSION> \
  --identity-digest <AGENT_IDENTITY_SHA256> \
  --allow-private \
  --output json
```

Enter the secret only through the hidden interactive prompt or the dedicated
one-line input channel:

```bash
printf '%s\n' '<SINGLE_USE_PAIRING_SECRET>' | npm run cli -- \
  onboarding full pair \
  <PAIRING_REVIEW_ID> \
  --pairing-secret-stdin \
  --output json
```

The pair step verifies the agent protocol, signed build statement, pinned
Ed25519 identity, transcript signature, single inspect scope, and supported
runtime adapter. It stores the resulting credential in the operating-system
secret store and persists only an opaque reference. Review and apply the new
digest:

```bash
npm run cli -- onboarding full apply \
  <FULL_REVIEW_ID> \
  --confirm <FULL_REVIEW_DIGEST>

npm run cli -- nodes inspect existing-observer
```

When the node already has Quick Connect, Full Connect adds a stronger binding
to the same stable node ID. It does not create another inventory node and does
not silently delete the Quick fallback.

Revoke Full inspection explicitly:

```bash
npm run cli -- onboarding full revoke \
  existing-observer \
  --confirm existing-observer
```

Revocation invalidates the credential at the agent, removes it from the local
secret store, and disables the Full binding. It does not change the node
runtime. A configured Quick or Expert binding remains available.

## Electron Workflow

Build and open the desktop onboarding surface:

```bash
npm install
npm run desktop
```

The desktop calls Quick Connect **Basic inspection** and Full Connect
**Complete inspection**. Basic validates the entered node address through
Electron main. A public approved address does not show a private-network
confirmation. If the privileged endpoint policy returns its typed
review-required error, the desktop reveals an explicit destination
confirmation and focuses it; the renderer does not classify URLs, DNS, or IP
addresses. Complete imports the pairing payload from the clipboard through an
explicit button. Electron main clears the clipboard, keeps the secret only in
memory until pairing, and returns a sanitized review. The renderer never opens
a socket, invokes the CLI, accesses SSH or Docker, or receives the agent
endpoint, pairing secret, or credential.

After a reviewed Quick or Full apply succeeds, the application opens Node
Detail for the same stable node ID. A still-fresh onboarding inspection is
reused; otherwise Electron main performs one bounded read-only inspection.
Returning to **Nodes** shows the persisted record. Quick-to-Full upgrade opens
the same node instead of creating a duplicate.

Onboarding mode tabs and Node Detail section tabs follow desktop keyboard
conventions: Left/Right arrows wrap, Home/End move to the first/last tab, and
Tab leaves the tablist after one selected tab stop. Unavailable Components and
Governance sections remain selectable and are labelled **Limited** so their
typed reasons can be inspected.

## Recovery And Diagnostics

```bash
npm run cli -- onboarding status <ONBOARDING_REVIEW_ID>
npm run cli -- onboarding cancel <ONBOARDING_REVIEW_ID>
npm run cli -- onboarding reconcile
npm run cli -- doctor
npm run cli -- doctor --check-connections
```

`doctor` checks schema compatibility, access references, credential references,
the private onboarding journal, and recoverability without contacting a node.
Only `--check-connections` performs bounded remote probes.

Onboarding applies connection state, access bindings, and inventory through a
private journal. If the process stops at a write boundary, `onboarding
reconcile` completes the exact digest-reviewed commit or returns a typed
conflict. It never applies different metadata.

## Expert Connect Compatibility

Existing exact-alias SSH records continue to work as Expert Connect without
conversion or behavior loss. A legacy inventory `connectionRef` is interpreted
as an Expert binding when no multi-binding profile exists. See
`LOCAL_CLI_AND_SEED_INSPECTION.md` for SSH setup and legacy multiservice
inspection.
