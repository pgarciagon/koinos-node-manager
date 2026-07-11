# Changelog

All notable changes to Koinos Node Manager will be documented in this file.

## [0.1.0-dev.0] - Unreleased

### Added

- CLI-first TypeScript project, compiled `knm` binary, and strict test setup.
- Compositional node model for managed, connected, external, and discovered
  nodes.
- Deterministic simulation repository with default, empty, mixed-health, and
  stale-health scenarios.
- `knm nodes list` with table/JSON output and management, network, function,
  and health filters.
- `knm nodes show <node-id>` with human and JSON detail output.
- `knm simulation scenarios` and explicit per-command `--simulation` selection.
- Typed application errors, versioned JSON error envelopes, and not-found exit
  code `3`.
- CLI architecture and full command implementation roadmap.
