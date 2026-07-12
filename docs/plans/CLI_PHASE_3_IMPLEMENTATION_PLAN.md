# CLI Phase 3 Connections, Discovery, And Adoption Plan

- Status: deterministic implementation complete; live exit criterion pending
- Last updated: 2026-07-12
- Depends on: CLI Phase 2 persisted inventory
- Live target status: unavailable; no approved disposable target is configured

## Objective

Add private connection references, bounded read-only probes, discovery evidence,
and inventory-only adoption without exposing arbitrary shell access or mutating
an inspected runtime.

## Command Boundary

```text
knm connections list|show|add ssh|test|remove
knm discover host|peers
knm discoveries list|show|dismiss
knm nodes adoption inspect|plan|apply
knm nodes adoption list
```

`nodes adoption apply` is an inventory-only review application, not a generic
lifecycle plan or execution engine. It requires the exact immutable adoption
digest and rechecks discovery freshness plus inventory and connection-state
revisions before writing one node record.

## Storage

Phase 3 adds a versioned `connection-state.json` containing:

- opaque SSH-alias connection records;
- sanitized host and peer discovery evidence;
- immutable adoption reviews and separate application markers.

The store uses private permissions, optimistic revisions, an exclusive writer
lock, synchronized temporary files, atomic replacement, bounded backups,
schema migration, sanitized quarantine evidence, and explicit diagnostics. It
never stores resolved SSH hosts, users, passwords, tokens, or key paths.

## Probe Contract

Only these probe identifiers are valid:

- `connection.handshake`;
- `host.inventory`;
- `peers.snapshot`.

The SSH adapter maps each identifier to a constant remote command. Callers
cannot submit command text or arguments. The process adapter invokes `ssh`
directly without a local shell, uses `BatchMode`, bounded connection and total
timeouts, bounded output, and sanitized typed failures. SSH aliases must appear
as exact `Host` entries in the configured SSH config or one of its bounded
includes.

Host and peer probes read versioned, operator-provided inspection manifests.
Missing or unsupported manifests return typed unavailable evidence rather than
guessing runtime state.

## Inspection Manifest Contract

The read-only SSH adapter reads these operator-prepared files:

- `$HOME/.config/koinos-node-manager/host-inspection-v1.json`;
- `$HOME/.config/koinos-node-manager/peers-inspection-v1.json`.

The host manifest schema is strict. Raw service and data-directory values are
accepted only at the transport boundary and immediately converted to opaque
hash references. Endpoint addresses and identity values are converted to
presence evidence and are never persisted:

```json
{
  "schemaVersion": 1,
  "flavor": { "id": "teleno-monolith", "version": "<RUNTIME_VERSION>" },
  "network": { "name": "testnet", "chainId": "<TESTNET_CHAIN_ID>" },
  "environment": "linux",
  "supervisor": { "kind": "systemd", "serviceName": "<SERVICE_NAME>" },
  "runtime": { "kind": "native", "version": "<RUNTIME_VERSION>" },
  "instance": {
    "baseDir": "<NODE_DATA_DIR>",
    "ports": { "p2p": 8888, "jsonrpc": 8080 }
  },
  "artifact": { "version": "<ARTIFACT_VERSION>", "digest": "<SHA256_HEX>" },
  "functions": {
    "observer": "enabled",
    "producer": "disabled",
    "seed": "enabled",
    "api": "enabled",
    "backup-source": "disabled"
  },
  "endpoints": [
    { "kind": "p2p", "scope": "public", "address": "<PUBLIC_P2P_ENDPOINT>" }
  ],
  "identity": {
    "peerId": "<PEER_ID>",
    "runtimeInstanceId": "<RUNTIME_INSTANCE_ID>",
    "producerAddress": null
  },
  "capabilities": {
    "inspect": true,
    "configure": true,
    "startStop": true,
    "upgrade": true,
    "backup": true,
    "restore": true,
    "logs": true
  }
}
```

Peer manifests contain a bounded `peers` array. Node Manager retains network,
function evidence, endpoint scopes, and peer-ID presence only:

```json
{
  "schemaVersion": 1,
  "peers": [
    {
      "network": { "name": "testnet", "chainId": "<TESTNET_CHAIN_ID>" },
      "functions": { "observer": "enabled" },
      "endpointScopes": ["public"],
      "peerId": "<PEER_ID>"
    }
  ]
}
```

Manifest production is outside Phase 3. Node Manager does not install these
files, infer missing authority, or fall back to arbitrary remote inspection.

## Adoption Safety

Reachability alone grants no management authority. Authority is calculated from
validated flavor, network, location, supervisor, instance, artifact, identity,
and explicit capability evidence. Producer and wallet authority are always
false in this phase.

Complete evidence produces a managed adopted observer-safe record. Incomplete
evidence produces a connected adopted record with limited or observe-only
authority. Inspection, planning, and application never configure, start, stop,
install, upgrade, remove, or delete anything on the inspected host.

## Validation

Required evidence includes pure validators and reducers, filesystem contracts,
migration and corruption recovery, SSH alias parsing, argv allowlisting,
timeouts and output bounds, every fake transport outcome, connection and
discovery CLI contracts, interactive parity, compiled smoke, documentation,
and a requirement audit.

All deterministic implementation, source, interactive, persistence, and
compiled-CLI gates are complete. The live exit criterion remains pending until the user supplies or separately
approves a disposable testnet target. Archived aliases and private operational
notes are not authorization.
