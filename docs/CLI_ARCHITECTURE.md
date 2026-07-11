# CLI Architecture

Last updated: 2026-07-11

## Executable Verticals

The implemented query verticals expose node listing and detail through four
independent layers:

```text
CLI parser and output
        |
listNodes / getNode use cases
        |
NodeRepository port
        |
SimulatedNodeRepository adapter
```

- `src/domain/node.ts` defines the compositional node model.
- `src/core/node-repository.ts` defines the inventory read port.
- `src/core/list-nodes.ts` contains filtering and ordering without UI or storage
  dependencies.
- `src/core/get-node.ts` resolves stable node IDs and returns typed not-found
  errors.
- `src/adapters/simulation/` contains deterministic example nodes.
- `src/cli/` parses arguments and renders table or JSON output.

Electron main will call the same core use case directly. It must not parse the
human CLI table or use the CLI process as its primary integration mechanism.

## Simulated Inventory

The fixtures intentionally cover different combinations rather than one rigid
node type:

- a provisioned, fully managed local Teleno observer;
- an adopted, fully managed remote legacy producer and seed;
- a connected NAS adoption candidate with limited authority;
- an imported external public API;
- an imported external public seed;
- an unknown peer discovered through P2P observation.

All addresses and identities are sanitized placeholders.

## Command Contracts

```text
knm nodes list
  [--management managed|connected|external|discovered]
  [--network mainnet|testnet|custom|unknown]
  [--function observer|producer|seed|api|backup-source]
  [--health healthy|degraded|unreachable|unknown]
  [--output table|json]
```

```text
knm nodes show <node-id>
  [--output table|json]

knm simulation scenarios
  [--output table|json]

knm --simulation <scenario> nodes list|show ...
```

The JSON response is a versioned envelope. Future schema-breaking changes must
increment `schemaVersion`; formatting changes to the human table do not change
that contract.

Available scenarios are `default`, `empty`, `mixed-health`, and `stale-health`.
Selection is explicit per invocation and does not alter persistent state.

## Next Steps

1. Add build identity and resource-specific help.
2. Add a persisted local inventory adapter.
3. Add large, conflicting, unsafe, and interrupted simulation scenarios.
4. Implement inventory `add`, `update`, and inventory-only `remove` use cases.
5. Expose the same query use cases through an Electron-main typed bridge.
