# CLI Architecture

Last updated: 2026-07-11

## First Vertical

The first executable vertical implements node listing through four independent
layers:

```text
CLI parser and output
        |
listNodes use case
        |
NodeRepository port
        |
SimulatedNodeRepository adapter
```

- `src/domain/node.ts` defines the compositional node model.
- `src/core/node-repository.ts` defines the inventory read port.
- `src/core/list-nodes.ts` contains filtering and ordering without UI or storage
  dependencies.
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

## Command Contract

```text
knm nodes list
  [--management managed|connected|external|discovered]
  [--network mainnet|testnet|custom|unknown]
  [--function observer|producer|seed|api|backup-source]
  [--health healthy|degraded|unreachable|unknown]
  [--output table|json]
```

The JSON response is a versioned envelope. Future schema-breaking changes must
increment `schemaVersion`; formatting changes to the human table do not change
that contract.

## Next Steps

1. Add a node-detail query and `knm nodes show <id>`.
2. Define typed CLI error envelopes for JSON output.
3. Add a persisted local inventory adapter.
4. Add simulation scenarios for empty, large, stale, conflicting, and unsafe
   inventories.
5. Expose the same list use case through an Electron-main typed bridge.
