# Koinos Node Manager

Koinos Node Manager is a planned operator application for installing,
monitoring, upgrading, backing up, and safely managing fleets of Koinos nodes.

It is intentionally separate from
[Koinos One](https://github.com/koinos/koinos-one):

- **Koinos One** runs and operates one high-performance local Teleno node on a
  desktop computer.
- **Koinos Node Manager** manages multiple local or remote nodes for operators
  responsible for infrastructure at fleet scale.
- **Teleno** is the native monolithic node runtime and remains independently
  versioned in [`koinos/teleno`](https://github.com/koinos/teleno).

## Status

This repository is in the product-definition and implementation-planning
phase. The existing remote-management MVP was developed inside Koinos One; its
technical plans and evidence have been moved here as the starting point for a
clean product extraction.

No mainnet producer mutation is authorized or implemented by this repository
at this stage.

## Documentation

- [Product and architecture boundary](docs/PRODUCT_BOUNDARY.md)
- [Node Fleet strategy](docs/strategy/NODE_FLEET_STRATEGY.md)
- [Implementation plan](docs/plans/NODE_FLEET_IMPLEMENTATION_PLAN.md)
- [Archived source plans](docs/archive/README.md)
- [UI explorations](assets/ui/)

## Intended Architecture

```text
Koinos Node Manager
  |
  +-- fleet inventory and policy
  +-- deterministic plans and receipts
  +-- health, rollout, backup, and recovery orchestration
  +-- SSH transport initially; authenticated agent/controller later if needed
  |
  +-- Teleno nodes
  +-- other compatible Koinos node flavors in the future
```

Shared code with Koinos One should be limited to versioned contracts and
libraries such as node capabilities, health schemas, artifact identity,
administrative clients, plan/receipt formats, and reusable visual tokens.
Application navigation, persisted state, secrets, and orchestration remain
product-specific.

## License

No license has been selected yet. Until one is added, all rights are reserved.
Desktop and controller application for installing and managing fleets of Koinos nodes
