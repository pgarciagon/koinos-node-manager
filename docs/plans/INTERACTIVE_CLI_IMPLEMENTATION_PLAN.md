# Interactive CLI Implementation Plan

- Status: complete
- Last updated: 2026-07-12
- Depends on: CLI Phases 0 and 1
- Precedes: persisted inventory in CLI Phase 2
- Initial safety class: read-only queries and session-local presentation state

## Implementation Status

Phase 1.5 is implemented. Batch and interactive adapters share the extracted
command executor; `knm interactive` provides the readline prompt, pure session
state, deterministic tokenizer, slash metacommands, session-local scenarios,
sanitized bounded history, registry-driven completion, compact narrow output,
TTY enforcement, optional color, and Ctrl+C/Ctrl+D handling.

Validation includes pure and fake-terminal tests, batch parity, schema v2
checks, compiled help and non-TTY smoke, and a real PTY exercise covering Tab
completion, commands, scenario switching, history, JSON, compact 80-column
output, first/second Ctrl+C behavior, clean exit, and exit code `130`.
Terminal.app UI automation was unavailable in the execution environment and
iTerm2 was not installed; the terminal-specific evidence therefore uses a real
macOS PTY with both source and compiled executables.

CLI Phase 2 subsequently extended this adapter without changing its original
architecture. A session now starts on `[inventory:local]`, executes persisted
inventory queries and metadata mutations through the shared executor, refreshes
node-ID completion after changes, switches to read-only fixtures with
`/scenario`, and returns to local persistence with `/inventory`. The Phase 1.5
scope and evidence below remain the historical acceptance boundary; Phase 2
storage and mutation evidence is tracked in
`../validation/CLI_PHASE_2_PERSISTED_INVENTORY_AUDIT.md`.

## 1. Objective

Add a persistent, prompt-driven terminal experience to Koinos Node Manager,
similar in interaction style to modern coding CLIs, without creating a second
command implementation or weakening the existing safety model.

The operator starts one process and can execute multiple registered commands:

```text
$ knm interactive

Koinos Node Manager 0.1.0-dev.0
Mode: local persisted inventory
Type /help for interactive help.

[inventory:local] knm> nodes list
...

[inventory:local] knm> /scenario default
Scenario changed to default for this session.

[sim:default] knm> nodes show node-nas-observer --section observed
...

[sim:default] knm> /scenario stale-health
Scenario changed to stale-health for this session.

[sim:stale-health] knm> nodes list --staleness stale
...

[sim:stale-health] knm> /inventory
Switched to the local persisted inventory for this session.

[inventory:local] knm> /exit
Session ended.
```

The initial interactive shell is a deterministic command REPL, not a natural
language agent. It accepts the same command grammar as batch CLI invocations,
without the leading `knm`. Existing scripts and one-shot commands remain fully
supported.

## 2. Product Position

This work is CLI Phase 1.5. It improves operator ergonomics after the query
model is complete and before persisted inventory, SSH, discovery, or lifecycle
operations are introduced.

The interactive shell is an adapter over the same command executor and
functional core used by the batch CLI. It does not own inventory, node state,
health policy, plans, confirmations, transports, secrets, or receipts.

The first release uses an explicit command:

```text
knm interactive
knm --simulation <scenario> interactive
```

Changing bare `knm` from help to interactive mode is deferred. It may be
considered only after the explicit command is validated, and only for a real
TTY. Non-TTY invocation must never enter an input loop.

## 3. Initial Scope

Included:

- one long-lived terminal session;
- execution of every registered Phase 0 and Phase 1 command;
- top-level, resource, and command help inside the session;
- in-memory command history with arrow-key navigation;
- deterministic tokenization with quoted arguments;
- session-local simulation scenario switching;
- completion for command paths, options, scenarios, sections, and enum values;
- human output by default and explicit `--output json` per command;
- terminal-width-aware output and restrained color when supported;
- clear Ctrl+C, Ctrl+D, error, and exit behavior;
- sanitized prompt, history, errors, and command output;
- source, fake-terminal, compiled CLI, and manual TTY validation.

Excluded from Phase 1.5:

- natural-language or LLM command interpretation;
- shell execution, pipes, redirection, substitution, or arbitrary scripts;
- persistent history, preferences, inventory, or configuration;
- SSH, discovery, adoption, health polling, logs, or real node access;
- an active-node context or implicit mutation target;
- inventory or managed-node mutations;
- background work after the terminal session exits;
- a full-screen React/Ink terminal application;
- mainnet signing, producer activation, wallet operations, or transactions.

## 4. Interaction Contract

### 4.1 Product commands

Inside the prompt, the operator enters the normal command path without `knm`:

```text
version
nodes list
nodes list --network mainnet --staleness fresh
nodes show node-home-observer
nodes show node-home-observer --section verified --output json
simulation scenarios
```

The interactive adapter passes the resulting argument vector to the shared
command executor. It must not invoke a subprocess, capture CLI stdout, parse a
rendered table, or reimplement command options.

### 4.2 Interactive metacommands

Metacommands begin with `/` and belong only to the terminal adapter:

```text
/help                   Show interactive concepts and metacommands
/commands               Show registered product commands
/status                 Show mode, source, build, and last result
/scenario <scenario>    Switch this session to a read-only simulation scenario
/inventory              Return this session to the local persisted inventory
/history                Show sanitized in-memory history
/clear                  Clear the visible terminal when supported
/exit                   End the session successfully
/quit                   Alias for /exit
```

`/inventory` was added by CLI Phase 2 when persisted inventory became the
default execution source; the original Phase 1.5 set was simulation-only.
Metacommands never mutate node inventory or managed nodes. `/scenario` and
`/inventory` change only the session's execution source for subsequent
commands and do not persist a preference.

### 4.3 Input grammar

The tokenizer supports:

- whitespace-separated arguments;
- single-quoted and double-quoted values;
- escaped quote and backslash characters inside matching quotes;
- empty quoted values when a command explicitly accepts them.

The tokenizer rejects unterminated quotes and input above a documented length
limit. It is not a shell parser. The following forms are unsupported and must
produce a typed error rather than execute or reinterpret anything:

```text
|  ||  &&  ;  >  >>  <  $()  backticks
```

Environment-variable expansion, glob expansion, command substitution, and
filesystem redirection never occur in the interactive layer.

### 4.4 Prompt and visible state

The prompt always shows the current execution source:

```text
[inventory:local] knm>
[sim:default] knm>
```

Status must not depend on color alone. A plain-text label remains visible when
color is disabled or unavailable. The prompt does not display raw paths,
hostnames, connection references, identities, keys, addresses, or tokens.

There is no global active node. Every node-specific command continues to name
its node explicitly. A previous `nodes show` command cannot redirect a later
operation.

### 4.5 Control keys and lifecycle

- Enter on an empty line does nothing.
- Up and Down navigate sanitized history for the current process.
- Tab requests deterministic completion without executing input.
- Ctrl+C clears a non-empty input line and returns a fresh prompt.
- Ctrl+C while a command is running requests adapter-level cancellation only
  when that command declares cancellation support.
- A second Ctrl+C after an idle prompt exits with code `130`.
- Ctrl+D on an empty prompt exits successfully.
- EOF or terminal closure stops the session without background work.

Phase 1.5 commands are short read-only queries. Long-running progress,
cancellation, and resume semantics remain future integrations with the durable
execution model; the shell must not invent them early.

## 5. Technical Architecture

```text
Node readline terminal adapter
            |
InteractiveSession state machine
            |
shared CommandExecutor
            |
typed CommandRegistry and CommandRuntime
            |
application use cases and functional core
            |
simulation adapter now; persisted and remote adapters later
```

### 5.1 Shared command executor

Extract process-independent command execution from `src/cli/main.ts` into a
reusable service. Both adapters call it:

```text
BatchCliAdapter ---------+
                         +--> CommandExecutor --> CommandRegistry
InteractiveCliAdapter ---+
```

The executor accepts an argument vector plus explicit execution context and
returns a typed result:

```text
CommandExecutionRequest
  args / simulationScenario / outputPreference / cancellationSignal?

CommandExecutionResult
  commandName / exitCode / stdout? / stderr? / structuredError?
```

The executor owns command resolution, help resolution, application-context
creation, typed error mapping, and output selection. Process stdout, stderr,
exit codes, readline, and terminal control remain adapter responsibilities.

Batch behavior must remain byte-for-byte compatible unless a documented output
change is intentionally approved.

### 5.2 Interactive session core

Create a deterministic session state machine independent of Node streams:

```text
InteractiveSessionState
  phase: idle | reading | executing | closing | closed
  inventorySource: local | simulation:<scenario>
  history[]
  lastResult?
  consecutiveIdleInterrupts
```

The Phase 1.5 design carried a single `mode: simulation-read-only` and a
`scenario` field; CLI Phase 2 generalized both into the `inventorySource`
discriminated union above, which is what
`src/cli/interactive/interactive-session-state.ts` implements.

Session events include input received, completion requested, command started,
command completed, cancellation requested, scenario changed, terminal resized,
and session closed. Reducers must not write to stdout, read stdin, access the
filesystem, construct commands, or call application use cases.

### 5.3 Terminal port

Define a narrow `InteractiveTerminal` contract for:

- reading a line;
- writing ordinary, error, and status text;
- reporting width and color capability;
- clearing the screen;
- receiving resize and control-key events;
- closing cleanly.

Implement the first adapter with Node.js `readline/promises` and small ANSI
helpers. Do not add a full-screen TUI framework in the first implementation.
This keeps dependencies small and makes prompt behavior testable through fake
streams. A richer renderer may replace the adapter later without changing the
session engine or command executor.

### 5.4 Completion

Completion derives from command-registry metadata rather than a second static
command list. Extend command option metadata with optional completion sources:

- fixed enum values;
- registered resource and command paths;
- simulation scenario IDs;
- node IDs from the current read-only repository;
- node-detail section names.

Completion may inspect read-only inventory but must not contact remote nodes or
trigger a command. Suggestions containing private operational data require the
same display sanitization as normal output.

### 5.5 History

Phase 1.5 history exists only in memory and is discarded on exit. Before a line
enters history, metadata for the resolved command determines whether arguments
must be omitted or redacted. Unknown commands are stored only after generic
secret-pattern redaction.

Persistent history is deferred to Phase 2 configuration and storage work. It
must later be opt-in or explicitly documented, permission-restricted, bounded,
and independently clearable.

## 6. Safety Invariants

1. Interactive mode never bypasses the typed command registry.
2. The shell never evaluates input as shell syntax or JavaScript.
3. The current scenario and read-only mode are visible on every prompt.
4. Session state never creates an implicit active node or mutation target.
5. Simulation changes are explicit, session-local, and immediately visible.
6. History and completion pass through sanitization before display or storage.
7. Ctrl+C never turns an ambiguous operation into an automatic retry.
8. Terminal closure never leaves Phase 1.5 background work running.
9. Structured errors and stable exit codes remain identical to batch mode.
10. Future mutations still require immutable plans and exact confirmation;
    being inside an interactive session grants no additional authority.
11. Non-TTY execution never waits for interactive input.
12. Mainnet producer and wallet mutation remain unavailable.

## 7. Implementation Workstreams

### A. Shared execution boundary

1. Freeze current batch CLI behavior with dispatcher contract tests.
2. Extract global argument parsing and command execution from process I/O.
3. Introduce `CommandExecutionRequest` and `CommandExecutionResult`.
4. Inject application-context creation rather than constructing it in the
   terminal adapter.
5. Keep help, JSON envelopes, exit codes, and sanitization centralized.
6. Prove batch and direct executor results are equivalent.

Exit: batch commands use the extracted executor with no output or exit-code
regression, and the executor can run repeatedly in one process.

### B. Session engine and tokenizer

1. Implement the pure tokenizer and unsupported-shell-operator checks.
2. Implement the session reducer and explicit lifecycle states.
3. Implement a separate metacommand registry.
4. Add session-local scenario switching and application-context invalidation.
5. Add sanitized bounded in-memory history.
6. Define cancellation events without adding unsupported command cancellation.

Exit: a fake terminal can drive multiple commands, errors, scenario changes,
history navigation, Ctrl+C, EOF, and exit deterministically.

### C. Terminal adapter and prompt renderer

1. Implement `NodeReadlineTerminal` with injected input and output streams.
2. Detect TTY, width, color support, and `NO_COLOR`/`--no-color`.
3. Render startup identity, visible mode, prompt, results, and concise errors.
4. Add resize handling without corrupting the current input line.
5. Add completion from registry metadata and current simulation inventory.
6. Keep the interface line-oriented rather than full-screen.

Exit: the prompt remains readable at 80, 120, and 160 columns; plain mode is
complete; resize and error output do not duplicate or lose input.

### D. Query workflow integration

1. Register `knm interactive` and its help.
2. Run `version`, `nodes list`, `nodes show`, and `simulation scenarios` inside
   one process through the shared executor.
3. Verify table and schema v2 JSON output inside the shell.
4. Verify default, empty, mixed-health, and stale-health scenarios.
5. Make `/commands` and completion reflect registry changes automatically.
6. Confirm no command depends on a previously viewed node.

Exit: every Phase 0 and Phase 1 command produces the same result in batch and
interactive modes for the same explicit arguments and scenario.

### E. Validation, documentation, and packaging

1. Add unit, session, fake-terminal, CLI integration, and compiled smoke tests.
2. Add a manual TTY matrix for macOS Terminal and iTerm2; add Linux terminals
   when CI or a disposable target is available.
3. Test UTF-8, narrow width, no color, resize, EOF, Ctrl+C, invalid quoting,
   unsupported operators, large input, and repeated errors.
4. Test history and completion redaction with hostile external strings.
5. Update help, README, architecture, changelog, and CLI plan status.
6. Run `npm run verify` and a compiled interactive manual smoke before marking
   Phase 1.5 complete.

Exit: source and compiled gates pass, terminal behavior is manually verified,
and documentation describes implemented behavior without claiming persistent
inventory or real-node access.

## 8. File Boundaries (as built)

```text
src/cli/execution/
  command-executor.ts
  execution-result.ts

src/cli/commands/
  interactive.ts            command registration and TTY guard

src/cli/interactive/
  interactive-session.ts    session loop and inline metacommand handling
  interactive-session-state.ts
  interactive-tokenizer.ts
  interactive-completion.ts
  interactive-history.ts
  interactive-terminal.ts
  node-readline-terminal.ts
  interactive-renderer.ts

tests/
  command-executor.test.ts
  interactive-tokenizer.test.ts
  interactive-session.test.ts
  interactive-session-state.test.ts
  interactive-completion.test.ts
  interactive-history.test.ts
  interactive-renderer.test.ts
  interactive-persisted-inventory.test.ts
  node-readline-terminal.test.ts
  helpers/fake-interactive-terminal.ts
```

Two names diverged from the original proposal: command registration lives in
`src/cli/commands/interactive.ts` rather than a dedicated
`interactive-command.ts`, and metacommands are handled inside
`interactive-session.ts` rather than a separate
`interactive-meta-commands.ts`. Sanitization coverage lives in
`interactive-history.test.ts` and `output-sanitization.test.ts` instead of a
single `interactive-sanitization.test.ts`. The dependency direction remains
terminal adapter -> session engine -> shared executor -> functional core.

## 9. Test Matrix

### Pure unit tests

- tokenizer quoting, escaping, empty values, length limits, and rejection;
- session reducer transitions and impossible-state rejection;
- scenario switching and context invalidation;
- command and option completion;
- bounded history and sanitization;
- Ctrl+C, EOF, closing, and cancellation state;
- prompt status content without color dependence.

### Contract tests

- batch and interactive adapters invoke the same command definition;
- same arguments and scenario produce the same rendered command result;
- typed errors retain code, severity, retryability, next action, and exit code;
- schema v2 JSON is not wrapped in a second interactive schema;
- command help and completion derive from registry metadata;
- no command inherits a node ID from session history.

### Fake-terminal integration

- multiple commands in one process;
- empty input and repeated errors;
- default, empty, mixed-health, and stale-health scenarios;
- `/help`, `/commands`, `/status`, `/scenario`, `/history`, `/clear`, `/exit`;
- 80/120/160-column rendering and resize events;
- color, no-color, EOF, and Ctrl+C;
- raw secret, private endpoint, and operational identity redaction.

### Compiled and manual validation

- compiled `knm interactive --help` smoke;
- compiled non-TTY invocation fails immediately with a typed error;
- compiled real-TTY startup and clean exit;
- manual command execution and completion in supported terminals;
- no remaining process or background work after exit.

## 10. Delivery Sequence

### Phase I1 — Executor extraction (complete)

Deliver the reusable executor and batch-regression suite. No interactive UI is
visible yet.

### Phase I2 — Headless session engine (complete)

Deliver tokenizer, session state, metacommands, fake terminal, and deterministic
tests.

### Phase I3 — Interactive prompt (complete)

Deliver `knm interactive`, readline rendering, history, control keys, and TTY
guards.

### Phase I4 — Completion and query polish (complete)

Deliver registry-driven completion, scenario/node suggestions, width handling,
and final Phase 0/1 command parity.

### Phase I5 — Packaged validation (complete)

Deliver compiled smoke, manual TTY evidence, documentation, changelog, and the
Phase 1.5 completion audit.

Each phase should remain a reviewable change. Executor extraction should not be
combined with terminal rendering in one large refactor.

## 11. Definition Of Done

The historical Phase 1.5 delivery was complete only when:

- `knm interactive` starts only on an interactive TTY and exits cleanly;
- all Phase 0 and Phase 1 commands work repeatedly in one process;
- batch and interactive execution share one command executor and registry;
- command results, errors, exit meanings, and schema v2 output do not drift;
- prompt mode and simulation scenario are always visible;
- declared, desired, observed, and verified state remain distinguishable;
- history, completion, errors, and output meet sanitization rules;
- unsupported shell syntax is rejected without evaluation;
- no active-node or implicit mutation context exists;
- Ctrl+C, Ctrl+D, resize, narrow width, and no-color behavior are tested;
- fake-terminal tests, `npm run verify`, compiled smoke, and manual TTY checks
  pass;
- README, help, architecture, changelog, and active CLI plan match the shipped
  behavior;
- no Phase 2 persistence, SSH, discovery, adoption, or mutation is claimed or
  accidentally implemented.

## 12. Future Compatibility

Phase 2 added persisted inventory while leaving prompt history, scenario, and
presentation preferences in memory. The interactive session remains an
adapter. Later lifecycle commands may
run inside it only through the immutable plan lifecycle:

```text
inspect -> plan -> review -> confirm -> execute -> verify -> receipt
```

The prompt must continue to show the exact node, network, action, artifact, and
plan digest. A conversational interface never becomes confirmation, never
turns a previous node into an implicit target, and never authorizes mainnet
mutation.

## 13. Amendment Summary — 2026-07-12

This plan was reconciled against the implemented code on
`codex/cli-list-nodes`. Amendments:

1. **Metacommands (4.2).** Added the implemented `/inventory` metacommand,
   noted it as a CLI Phase 2 addition to the original Phase 1.5 set, and
   updated `/status` to its implemented content (mode, source, build, last
   result).
2. **Session state (5.2).** Replaced the designed `mode:
   simulation-read-only` plus `scenario` fields with the implemented
   `inventorySource` discriminated union (`local` |
   `simulation:<scenario>`) and the implemented `consecutiveIdleInterrupts`
   counter that drives double-Ctrl+C exit with code `130`. The speculative
   `cancellationState` field was dropped: Phase 1.5 commands are short
   read-only queries and no cancellation state was needed.
3. **File boundaries (8).** Converted the proposed layout to the as-built
   layout: command registration in `src/cli/commands/interactive.ts`,
   metacommands inline in `interactive-session.ts`, and the actual test file
   names, including `interactive-persisted-inventory.test.ts` and the shared
   fake terminal helper.

No behavior contract changed. The tokenizer restrictions, TTY guard, prompt
labels (`[inventory:local]`, `[sim:<scenario>]`), batch-parity executor, exit
codes, and sanitization rules described in this plan match the implementation
and its passing `npm run verify` gate.
