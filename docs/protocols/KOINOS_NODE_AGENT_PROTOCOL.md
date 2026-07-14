# Koinos Node Agent Protocol 1.0.0

- Status: client contracts, deterministic fake, and contract tests implemented
- Production agent artifact: pending external repository authorization
- Authority: read-only inspection only

## Fixed HTTPS Surface

The client uses exactly four paths:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/koinos-node-agent` | Discovery, identity, build, runtime, scope, and probe compatibility |
| `POST` | `/v1/pair` | One-time pairing transcript and key-possession proof |
| `POST` | `/v1/probes` | One enumerated read-only probe |
| `POST` | `/v1/credentials/revoke` | Revoke one scoped credential |

Redirects are rejected. HTTPS is required except explicit loopback development.
DNS is resolved and classified before each request, and the approved address is
pinned for the connection. Requests have bounded concurrency, time, body size,
response size, and JSON depth.

## Discovery

The versioned discovery document contains only:

- protocol and schema version;
- Ed25519 agent public identity and SHA-256 fingerprint;
- runtime flavor;
- the single `inspect` scope;
- the closed probe list; and
- build version, artifact digest, and an identity-signed build statement.

The build signature proves that the pinned agent identity reported the build
metadata. Production package publisher trust and signed installation artifacts
remain an external delivery gate.

## Pairing

The agent owns a high-entropy, single-use session with a lifetime no longer
than ten minutes. The client sends a fresh Ed25519 public key, nonce, and HMAC
proof over the versioned transcript. It never sends the pairing secret.

The agent consumes the session before issuing a credential and signs the full
transcript, pinned identity digest, credential ID, expiry, and `inspect` scope.
The client rejects wrong secrets, expired or consumed sessions, identity
changes, invalid signatures, malformed responses, and protocol downgrades.

The credential token is stored only in the operating-system secret store. The
private connection record stores an opaque credential reference and public
protocol metadata. Revocation requires both the credential token and its opaque
credential ID.

## Closed Probe Catalog

- `node.multiservice.components`
- `node.multiservice.chain-head`
- `node.multiservice.chain-id`
- `node.multiservice.chain-forks`
- `node.multiservice.block-store-head`
- `node.multiservice.p2p-status`
- `node.multiservice.config`
- `node.multiservice.resources`
- `node.teleno.status`

Requests contain only schema version, protocol version, request ID, one probe
enum, and bounded timeout. They contain no command, executable, working
directory, environment, filesystem path, RPC method, URL, Docker query, or
caller-authored payload.

Responses contain one typed fact union. They contain no stdout, stderr, Docker
objects, raw configuration, filesystem paths, endpoint addresses, peer
identities, producer addresses, credentials, tokens, or keys. The client
rejects unknown fields and translates accepted facts into the existing
runtime-inspection adapter contract.

## Legacy Multiservice Privilege

A production legacy agent may need local component metadata that is commonly
available through Docker. Read-only Docker socket access is effectively
host-privileged and must not be exposed remotely or passed through from client
input. Prefer a rootless or fixed proxy surface. If a reviewed deployment must
use the socket, the agent implementation must hard-code the component and field
allowlist, drop raw objects, bind privately, and run with the minimum local
privilege that satisfies the probes.

## Installation And Uninstall Contract

Node Manager does not install the agent. A future signed package must provide:

- platform-specific signed artifact metadata and offline digest verification;
- a private default bind and explicit firewall guidance;
- creation and display of a short-lived pairing payload;
- durable single-use session consumption and credential revocation;
- an uninstall operation that revokes credentials, stops the agent, and
  removes agent-owned state without touching Koinos runtime data; and
- no lifecycle, producer, wallet, signing, transaction, or general shell
  capability.

Until such an artifact is separately authorized and published, Electron states
that installation is unavailable instead of showing an unsigned command.
