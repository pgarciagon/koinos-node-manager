# Node Onboarding Threat Model

- Status: active implementation control
- Date: 2026-07-14
- Scope: Quick Connect, Full Connect, and Expert Connect inspection transports

## Assets

- private endpoints, host coordinates, and SSH aliases;
- agent identity and scoped client credentials;
- inventory and access bindings;
- node, network, chain, producer, and governance evidence;
- operator trust in read-only and no-mutation claims.

Raw credentials, pairing secrets, private keys, wallet material, producer
addresses, peer identities, filesystem paths, configuration files, and process
output are prohibited from public DTOs and committed artifacts.

## Trust Boundaries

1. Operator input enters CLI privileged input or Electron main.
2. Endpoint policy resolves and approves the remote destination.
3. Public RPC or the agent returns untrusted bounded data.
4. Runtime adapters normalize evidence.
5. Core sanitization produces a public DTO.
6. CLI formatting, IPC, and renderer presentation consume only that DTO.
7. Private repositories and the operating-system secret store persist separate
   classes of data.

## Quick Connect Threats And Controls

| Threat | Required control |
| --- | --- |
| Server-side request forgery | HTTPS by default, scheme and credential rejection, metadata and link-local blocking, private-range review |
| DNS rebinding | Resolve once, validate every address, and use the approved address set for the request |
| Redirect escape | No redirect by default; at most one explicitly permitted same-origin redirect |
| Resource exhaustion | Bound DNS, connect and total time, bytes, JSON depth, and concurrent probes |
| Malformed or hostile JSON | Exact JSON-RPC envelope parsing, depth/size limits, and typed failure |
| False authority | Mark components, local configuration, producer, resources, and governance unavailable |
| Endpoint disclosure | Private persistence only; stdin or main-owned input; sanitized errors, events, output, and screenshots |

## Full Connect Threats And Controls

| Threat | Required control |
| --- | --- |
| Pairing secret guessing | At least 128 random bits and a maximum ten-minute lifetime |
| Replay | Single-use persisted consumption and transcript binding |
| Agent impersonation | Ed25519 possession proof and identity pinning |
| Downgrade | Exact supported protocol negotiation and pinned minimum version |
| Credential theft | Operating-system secret store, opaque references, scoped credentials, and revocation |
| Arbitrary execution | Closed probe enumeration with no command, path, environment, method, URL, or Docker-query fields |
| Malicious evidence | Typed schemas, bounds, sanitization, and runtime-adapter validation |
| Excess agent privilege | Fixed local probe implementation; never expose the Docker socket or translate client input to Docker arguments |
| Renderer compromise | Pairing import, secret storage, network access, and policy remain in Electron main |

## Legacy Docker Privilege

Read-only access to the Docker socket is still effectively host-privileged.
The preferred agent design is a narrowly installed service that implements a
fixed local probe catalog. A rootless or proxy-mediated inspection surface is
preferred when it can provide the required facts. Direct Docker-socket access
is a documented last resort and must never be exposed over the agent protocol.

## Persistence And Interruption

Onboarding reviews bind node identity, connection kind, evidence, revisions,
expiry, and digest. Pairing secrets are excluded. Cross-file application uses
a private journal. Startup and doctor reconcile exact pending commits before a
retry. Conflicting records block reconciliation and preserve evidence.

## Security Exit Criteria

- no arbitrary command or RPC method can cross a transport boundary;
- no sensitive value appears in public persistence, errors, events, CLI, JSON,
  IPC, renderer state, screenshots, tests, or documentation;
- pairing replay, expiry, identity change, and downgrade are rejected;
- Quick evidence never claims host or producer authority;
- Full scope remains read-only;
- approved live validation shows identical pre/post runtime and chain state.
