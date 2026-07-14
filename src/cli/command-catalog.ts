import { CommandRegistry, type CommandDefinition } from './command-registry.js'
import {
  AUTHORITY_LEVELS,
  LOCATION_KINDS,
  MANAGEMENT_CLASSES,
  NETWORKS,
  NODE_ENVIRONMENTS,
  NODE_FLAVORS,
  NODE_FUNCTIONS,
  NODE_HEALTH_STATES,
  NODE_ORIGINS,
  OBSERVATION_FRESHNESS_STATES
} from '../domain/node.js'
import { NODE_DETAIL_SECTIONS, OUTPUT_FORMATS } from './output.js'
import { INSPECTION_SECTIONS } from '../domain/inspection.js'
import { runInteractiveCommand } from './commands/interactive.js'
import { runConnectionsAddSsh, runConnectionsList, runConnectionsRemove, runConnectionsShow, runConnectionsTest } from './commands/connections.js'
import { runDiscoverHost, runDiscoverPeers, runDiscoveriesDismiss, runDiscoveriesList, runDiscoveriesShow } from './commands/discovery.js'
import { runAdoptionApply, runAdoptionInspect, runAdoptionList, runAdoptionPlan } from './commands/adoption.js'
import { runDoctor } from './commands/doctor.js'
import { runNodesAdd, runNodesInspect, runNodesList, runNodesRemove, runNodesShow, runNodesUpdate } from './commands/nodes.js'
import { runPaths } from './commands/paths.js'
import { runSimulationScenarios } from './commands/simulation.js'
import { runVersion } from './commands/version.js'
import {
  runOnboardingCancel,
  runOnboardingFullApply,
  runOnboardingFullPair,
  runOnboardingFullPreview,
  runOnboardingFullRevoke,
  runOnboardingQuickApply,
  runOnboardingQuickPreview,
  runOnboardingReconcile,
  runOnboardingStatus
} from './commands/onboarding.js'

const commandDefinitions = [
  {
    path: ['interactive'],
    commandName: 'interactive',
    summary: 'Start a prompt-driven session over local or simulated inventory.',
    usage: 'knm [--simulation <scenario>] interactive [--no-color]',
    options: [
      { syntax: '--no-color', description: 'Disable ANSI color in the interactive prompt.' }
    ],
    run: (args, runtime) => runInteractiveCommand(args, runtime)
  },
  {
    path: ['version'],
    commandName: 'version',
    summary: 'Show product, interface, core, source, channel, and build identity.',
    usage: 'knm version [--output table|json]',
    options: [
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args) => runVersion(args)
  },
  {
    path: ['paths'],
    commandName: 'paths',
    summary: 'Show sanitized local configuration and inventory paths.',
    usage: 'knm paths [--output table|json]',
    options: [
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runPaths(args, runtime.applicationContext())
  },
  {
    path: ['doctor'],
    commandName: 'doctor',
    summary: 'Check local runtime, inventory, connection references, discovery storage, and recovery readiness.',
    usage: 'knm doctor [--recover-inventory] [--recover-connection-state] [--check-connections] [--output table|json]',
    options: [
      { syntax: '--recover-inventory', description: 'Restore the newest valid backup only when the active inventory is absent or corrupt.' },
      { syntax: '--recover-connection-state', description: 'Restore the newest valid connection-state backup only when active state is absent or corrupt.' },
      { syntax: '--check-connections', description: 'Explicitly contact configured targets with bounded read-only handshake probes.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runDoctor(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'list'],
    commandName: 'nodes.list',
    summary: 'List nodes from the selected inventory adapter.',
    usage: 'knm [--simulation <scenario>] nodes list [options]',
    options: [
      { syntax: '--management <class>', description: 'Filter by managed, connected, external, or discovered.', values: MANAGEMENT_CLASSES },
      { syntax: '--origin <origin>', description: 'Filter by provisioned, adopted, imported, or discovered.', values: NODE_ORIGINS },
      { syntax: '--flavor <flavor>', description: 'Filter by teleno-monolith, legacy-microservices, or unknown.', values: NODE_FLAVORS },
      { syntax: '--network <network>', description: 'Filter by mainnet, testnet, custom, or unknown.', values: NETWORKS },
      { syntax: '--location <kind>', description: 'Filter by local, remote, external, or unknown.', values: LOCATION_KINDS },
      { syntax: '--authority <level>', description: 'Filter by none, observe, limited, or full.', values: AUTHORITY_LEVELS },
      { syntax: '--function <function>', description: 'Filter by observer, producer, seed, api, or backup-source.', values: NODE_FUNCTIONS },
      { syntax: '--health <state>', description: 'Filter by healthy, degraded, unreachable, or unknown.', values: NODE_HEALTH_STATES },
      { syntax: '--staleness <state>', description: 'Filter by fresh, stale, or never.', values: OBSERVATION_FRESHNESS_STATES },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runNodesList(args, runtime.applicationContext(), runtime.terminalWidth)
  },
  {
    path: ['nodes', 'show'],
    commandName: 'nodes.show',
    summary: 'Show one node by its stable inventory ID.',
    usage: 'knm [--simulation <scenario>] nodes show <node-id> [--section <name>] [--output table|json]',
    options: [
      { syntax: '--section <name>', description: 'Show all, summary, declared, desired, observed, or verified state.', values: NODE_DETAIL_SECTIONS },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['node-id'] },
    run: (args, runtime) => runNodesShow(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'inspect'],
    commandName: 'nodes.inspect',
    summary: 'Collect a bounded sanitized read-only snapshot from one existing node.',
    usage: 'knm nodes inspect <node-id> [--section overview|components|chain|governance] [--access quick|full|expert] [--timeout-ms <milliseconds>] [--output table|json]',
    options: [
      { syntax: '--section <name>', description: 'Collect only overview, components, chain, or governance evidence.', values: INSPECTION_SECTIONS },
      { syntax: '--access <mode>', description: 'Override automatic access selection for diagnosis.', values: ['quick', 'full', 'expert'] },
      { syntax: '--timeout-ms <milliseconds>', description: 'Bound each fixed read-only probe to 1000-30000 milliseconds.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['node-id'] },
    run: (args, runtime) => runNodesInspect(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'add'],
    commandName: 'nodes.add',
    summary: 'Add sanitized metadata to the local inventory without contacting a node.',
    usage: 'knm nodes add --id <node-id> --name <display-name> [metadata options]',
    options: [
      { syntax: '--id <node-id>', description: 'Set the stable lowercase inventory ID.' },
      { syntax: '--name <display-name>', description: 'Set the operator-facing display name.' },
      { syntax: '--management <class>', description: 'Set managed, connected, external, or discovered.', values: MANAGEMENT_CLASSES },
      { syntax: '--origin <origin>', description: 'Set provisioned, adopted, imported, or discovered.', values: NODE_ORIGINS },
      { syntax: '--flavor <flavor>', description: 'Set the declared runtime flavor.', values: NODE_FLAVORS },
      { syntax: '--network <network>', description: 'Set the declared network.', values: NETWORKS },
      { syntax: '--location <kind>', description: 'Set local, remote, external, or unknown.', values: LOCATION_KINDS },
      { syntax: '--environment <environment>', description: 'Set mac, linux, nas, appliance, or unknown.', values: NODE_ENVIRONMENTS },
      { syntax: '--authority <level>', description: 'Set none, observe, limited, or full.', values: AUTHORITY_LEVELS },
      { syntax: '--connection-ref <reference>', description: 'Store an opaque connection reference, never credentials or key paths.' },
      { syntax: '--function <function>', description: 'Declare an enabled function; repeat for multiple functions.', values: NODE_FUNCTIONS },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runNodesAdd(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'update'],
    commandName: 'nodes.update',
    summary: 'Update local inventory metadata without changing a managed node.',
    usage: 'knm nodes update <node-id> [metadata options]',
    options: [
      { syntax: '--name <display-name>', description: 'Change the operator-facing display name.' },
      { syntax: '--management <class>', description: 'Change the management class.', values: MANAGEMENT_CLASSES },
      { syntax: '--origin <origin>', description: 'Change the inventory origin.', values: NODE_ORIGINS },
      { syntax: '--flavor <flavor>', description: 'Change the declared runtime flavor.', values: NODE_FLAVORS },
      { syntax: '--network <network>', description: 'Change the declared network.', values: NETWORKS },
      { syntax: '--location <kind>', description: 'Change the declared location kind.', values: LOCATION_KINDS },
      { syntax: '--environment <environment>', description: 'Change the declared environment.', values: NODE_ENVIRONMENTS },
      { syntax: '--authority <level>', description: 'Change the inventory authority level.', values: AUTHORITY_LEVELS },
      { syntax: '--connection-ref <reference>', description: 'Replace the opaque connection reference.' },
      { syntax: '--clear-connection-ref', description: 'Remove the opaque connection reference.' },
      { syntax: '--function <function>', description: 'Replace declared enabled functions; repeat as needed.', values: NODE_FUNCTIONS },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['node-id'] },
    run: (args, runtime) => runNodesUpdate(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'remove'],
    commandName: 'nodes.remove',
    summary: 'Remove only a local inventory record; never stop a node or delete data.',
    usage: 'knm nodes remove <node-id> --confirm <node-id> [--output table|json]',
    options: [
      { syntax: '--confirm <node-id>', description: 'Bind confirmation to the exact inventory ID.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['node-id'] },
    run: (args, runtime) => runNodesRemove(args, runtime.applicationContext())
  },
  {
    path: ['onboarding', 'quick', 'preview'],
    commandName: 'onboarding.quick.preview',
    summary: 'Preview limited read-only onboarding through a private RPC endpoint input.',
    usage: 'knm onboarding quick preview --id <node-id> [--name <display-name>] --rpc-endpoint-stdin [--allow-private] [--allow-loopback-http] [--output table|json]',
    options: [
      { syntax: '--id <node-id>', description: 'Set the stable inventory node ID.' },
      { syntax: '--name <display-name>', description: 'Set the optional operator-facing name.' },
      { syntax: '--rpc-endpoint-stdin', description: 'Read the private endpoint from the dedicated stdin channel.' },
      { syntax: '--allow-private', description: 'Confirm review of a private-range HTTPS destination.' },
      { syntax: '--allow-loopback-http', description: 'Permit loopback HTTP only for explicit local development.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runOnboardingQuickPreview(args, runtime)
  },
  {
    path: ['onboarding', 'quick', 'apply'],
    commandName: 'onboarding.quick.apply',
    summary: 'Apply an exact digest-confirmed Quick Connect review.',
    usage: 'knm onboarding quick apply <review-id> --confirm <digest> [--output table|json]',
    options: [
      { syntax: '--confirm <digest>', description: 'Bind application to the exact reviewed digest.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['onboarding-id'] },
    run: (args, runtime) => runOnboardingQuickApply(args, runtime)
  },
  {
    path: ['onboarding', 'full', 'preview'],
    commandName: 'onboarding.full.preview',
    summary: 'Verify a read-only node agent and prepare identity-pinned pairing.',
    usage: 'knm onboarding full preview --id <node-id> [--name <display-name>] --agent-endpoint-stdin --pairing-session <opaque-id> --identity-digest <sha256> [--allow-private] [--allow-loopback-http] [--output table|json]',
    options: [
      { syntax: '--id <node-id>', description: 'Set or preserve the stable inventory node ID.' },
      { syntax: '--name <display-name>', description: 'Set the optional operator-facing name for a new node.' },
      { syntax: '--agent-endpoint-stdin', description: 'Read the private agent endpoint from the dedicated stdin channel.' },
      { syntax: '--pairing-session <opaque-id>', description: 'Bind the review to the agent-issued opaque pairing session.' },
      { syntax: '--identity-digest <sha256>', description: 'Bind the review to the trusted agent fingerprint.' },
      { syntax: '--allow-private', description: 'Confirm review of a private-range HTTPS destination.' },
      { syntax: '--allow-loopback-http', description: 'Permit loopback HTTP only for explicit local development.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runOnboardingFullPreview(args, runtime)
  },
  {
    path: ['onboarding', 'full', 'pair'],
    commandName: 'onboarding.full.pair',
    summary: 'Consume a hidden single-use secret and verify agent key possession.',
    usage: 'knm onboarding full pair <review-id> --pairing-secret-stdin [--output table|json]',
    options: [
      { syntax: '--pairing-secret-stdin', description: 'Read the single-use pairing secret through hidden or dedicated stdin input.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['onboarding-id'] },
    run: (args, runtime) => runOnboardingFullPair(args, runtime)
  },
  {
    path: ['onboarding', 'full', 'apply'],
    commandName: 'onboarding.full.apply',
    summary: 'Apply an exact digest-confirmed Full Connect review.',
    usage: 'knm onboarding full apply <review-id> --confirm <digest> [--output table|json]',
    options: [
      { syntax: '--confirm <digest>', description: 'Bind application to the exact reviewed identity and capabilities.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['onboarding-id'] },
    run: (args, runtime) => runOnboardingFullApply(args, runtime)
  },
  {
    path: ['onboarding', 'full', 'revoke'],
    commandName: 'onboarding.full.revoke',
    summary: 'Revoke and remove one node agent inspection credential.',
    usage: 'knm onboarding full revoke <node-id> --confirm <node-id> [--output table|json]',
    options: [
      { syntax: '--confirm <node-id>', description: 'Bind revocation to the exact stable node ID.' },
      { syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['node-id'] },
    run: (args, runtime) => runOnboardingFullRevoke(args, runtime)
  },
  {
    path: ['onboarding', 'status'],
    commandName: 'onboarding.status',
    summary: 'Show a sanitized persisted onboarding review.',
    usage: 'knm onboarding status <review-id> [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }],
    completion: { positionalSources: ['onboarding-id'] },
    run: (args, runtime) => runOnboardingStatus(args, runtime)
  },
  {
    path: ['onboarding', 'cancel'],
    commandName: 'onboarding.cancel',
    summary: 'Cancel an uncommitted onboarding review.',
    usage: 'knm onboarding cancel <review-id> [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }],
    completion: { positionalSources: ['onboarding-id'] },
    run: (args, runtime) => runOnboardingCancel(args, runtime)
  },
  {
    path: ['onboarding', 'reconcile'],
    commandName: 'onboarding.reconcile',
    summary: 'Complete an exact interrupted onboarding commit from its private journal.',
    usage: 'knm onboarding reconcile [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select human or versioned JSON output.', values: OUTPUT_FORMATS }],
    run: (args, runtime) => runOnboardingReconcile(args, runtime)
  },
  {
    path: ['connections', 'list'],
    commandName: 'connections.list',
    summary: 'List private opaque connection references without exposing SSH aliases.',
    usage: 'knm connections list [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    run: (args, runtime) => runConnectionsList(args, runtime.applicationContext())
  },
  {
    path: ['connections', 'show'],
    commandName: 'connections.show',
    summary: 'Show sanitized connection metadata and latest test evidence.',
    usage: 'knm connections show <connection-id> [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    completion: { positionalSources: ['connection-id'] },
    run: (args, runtime) => runConnectionsShow(args, runtime.applicationContext())
  },
  {
    path: ['connections', 'add', 'ssh'],
    commandName: 'connections.add.ssh',
    summary: 'Persist an exact SSH-config alias as a private connection reference.',
    usage: 'knm connections add ssh --id <id> --host-alias <ssh-alias> [--output table|json]',
    options: [
      { syntax: '--id <id>', description: 'Set the stable opaque connection ID.' },
      { syntax: '--host-alias <ssh-alias>', description: 'Reference an exact private SSH Host alias.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runConnectionsAddSsh(args, runtime.applicationContext())
  },
  {
    path: ['connections', 'test'],
    commandName: 'connections.test',
    summary: 'Run the predefined bounded non-mutating SSH handshake probe.',
    usage: 'knm connections test <connection-id> [--timeout-ms <milliseconds>] [--output table|json]',
    options: [
      { syntax: '--timeout-ms <milliseconds>', description: 'Bound the probe to 1000-30000 milliseconds.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['connection-id'] },
    run: (args, runtime) => runConnectionsTest(args, runtime.applicationContext())
  },
  {
    path: ['connections', 'remove'],
    commandName: 'connections.remove',
    summary: 'Remove an unreferenced local connection record without changing SSH config.',
    usage: 'knm connections remove <connection-id> --confirm <connection-id> [--output table|json]',
    options: [
      { syntax: '--confirm <connection-id>', description: 'Bind removal to the exact connection ID.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['connection-id'] },
    run: (args, runtime) => runConnectionsRemove(args, runtime.applicationContext())
  },
  {
    path: ['discover', 'host'],
    commandName: 'discover.host',
    summary: 'Collect and persist a bounded read-only host inspection manifest.',
    usage: 'knm discover host --connection <connection-id> [--timeout-ms <milliseconds>] [--output table|json]',
    options: [
      { syntax: '--connection <connection-id>', description: 'Select an opaque connection reference.', completionSource: 'connection-id' },
      { syntax: '--timeout-ms <milliseconds>', description: 'Bound the probe to 1000-30000 milliseconds.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runDiscoverHost(args, runtime.applicationContext())
  },
  {
    path: ['discover', 'peers'],
    commandName: 'discover.peers',
    summary: 'Inspect a bounded peer manifest without implicitly adding nodes.',
    usage: 'knm discover peers --from <node-id> [--save] [--timeout-ms <milliseconds>] [--output table|json]',
    options: [
      { syntax: '--from <node-id>', description: 'Select a node with a Phase 3 connection reference.', completionSource: 'node-id' },
      { syntax: '--save', description: 'Persist sanitized peer evidence; never add peers to inventory.' },
      { syntax: '--timeout-ms <milliseconds>', description: 'Bound the probe to 1000-30000 milliseconds.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runDiscoverPeers(args, runtime.applicationContext())
  },
  {
    path: ['discoveries', 'list'],
    commandName: 'discoveries.list',
    summary: 'List retained sanitized host and peer evidence.',
    usage: 'knm discoveries list [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    run: (args, runtime) => runDiscoveriesList(args, runtime.applicationContext())
  },
  {
    path: ['discoveries', 'show'],
    commandName: 'discoveries.show',
    summary: 'Show one sanitized discovery evidence record.',
    usage: 'knm discoveries show <discovery-id> [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    completion: { positionalSources: ['discovery-id'] },
    run: (args, runtime) => runDiscoveriesShow(args, runtime.applicationContext())
  },
  {
    path: ['discoveries', 'dismiss'],
    commandName: 'discoveries.dismiss',
    summary: 'Dismiss local discovery evidence without changing inventory or a host.',
    usage: 'knm discoveries dismiss <discovery-id> [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    completion: { positionalSources: ['discovery-id'] },
    run: (args, runtime) => runDiscoveriesDismiss(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'adoption', 'inspect'],
    commandName: 'nodes.adoption.inspect',
    summary: 'Collect persisted non-mutating host evidence for adoption review.',
    usage: 'knm nodes adoption inspect --connection <connection-id> [--timeout-ms <milliseconds>] [--output table|json]',
    options: [
      { syntax: '--connection <connection-id>', description: 'Select an opaque connection reference.', completionSource: 'connection-id' },
      { syntax: '--timeout-ms <milliseconds>', description: 'Bound the probe to 1000-30000 milliseconds.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runAdoptionInspect(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'adoption', 'plan'],
    commandName: 'nodes.adoption.plan',
    summary: 'Create an immutable inventory-only adoption review from fresh evidence.',
    usage: 'knm nodes adoption plan (--discovery <id>|--connection <id>) --id <node-id> --name <name> [--output table|json]',
    options: [
      { syntax: '--discovery <id>', description: 'Bind to exact fresh host discovery evidence.', completionSource: 'discovery-id' },
      { syntax: '--connection <id>', description: 'Bind to the latest fresh host discovery for a connection.', completionSource: 'connection-id' },
      { syntax: '--id <node-id>', description: 'Set the stable inventory node ID.' },
      { syntax: '--name <name>', description: 'Set the operator-facing node name.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args, runtime) => runAdoptionPlan(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'adoption', 'apply'],
    commandName: 'nodes.adoption.apply',
    summary: 'Apply one reviewed adoption to local inventory only.',
    usage: 'knm nodes adoption apply <review-id> --confirm <digest> [--output table|json]',
    options: [
      { syntax: '--confirm <digest>', description: 'Bind application to the exact immutable review digest.' },
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    completion: { positionalSources: ['adoption-id'] },
    run: (args, runtime) => runAdoptionApply(args, runtime.applicationContext())
  },
  {
    path: ['nodes', 'adoption', 'list'],
    commandName: 'nodes.adoption.list',
    summary: 'List pending and applied inventory-only adoption reviews.',
    usage: 'knm nodes adoption list [--output table|json]',
    options: [{ syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }],
    run: (args, runtime) => runAdoptionList(args, runtime.applicationContext())
  },
  {
    path: ['simulation', 'scenarios'],
    commandName: 'simulation.scenarios',
    summary: 'List deterministic simulation scenarios.',
    usage: 'knm simulation scenarios [--output table|json]',
    options: [
      { syntax: '--output <format>', description: 'Select table or versioned JSON output.', values: OUTPUT_FORMATS }
    ],
    run: (args) => runSimulationScenarios(args)
  }
] satisfies readonly CommandDefinition[]

export const cliCommandRegistry = new CommandRegistry()
for (const definition of commandDefinitions) cliCommandRegistry.register(definition)
