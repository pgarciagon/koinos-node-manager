import type { CommandDefinition, CommandRegistry } from './command-registry.js'
import { CliInputError } from './cli-input-error.js'

const groupDescriptions: Readonly<Record<string, string>> = {
  nodes: 'Inspect and manage fleet inventory nodes.',
  connections: 'Manage private opaque connection references and bounded read-only tests.',
  discover: 'Collect non-mutating host and peer evidence.',
  discoveries: 'Inspect and dismiss persisted discovery evidence.',
  simulation: 'Inspect deterministic development scenarios.'
}

const nestedGroupDescriptions: Readonly<Record<string, string>> = {
  'connections add': 'Add a typed private connection reference.',
  'nodes adoption': 'Inspect, review, and apply inventory-only adoption metadata.'
}

export function renderHelp(registry: CommandRegistry, target: readonly string[] = []): string {
  if (target.length === 0) return renderRootHelp(registry)

  const resolved = registry.resolve(target)
  if (resolved !== undefined) return renderCommandHelp(resolved.definition)

  const children = commandsUnder(registry, target)
  if (children.length > 0) return renderGroupHelp(target, children)

  throw new CliInputError(
    'No help is available for the requested command path.',
    'Run "knm --help" to inspect available commands.'
  )
}

function renderRootHelp(registry: CommandRegistry): string {
  const topLevel = registry.definitions().filter((definition) => definition.path.length === 1)
  const groups = [...new Set(
    registry.definitions()
      .filter((definition) => definition.path.length > 1)
      .map((definition) => definition.path[0])
  )]

  return [
    'Koinos Node Manager CLI',
    '',
    'Usage:',
    '  knm [global options] <command> [options]',
    '',
    'Commands:',
    ...topLevel.map(commandRow),
    '',
    'Resources:',
    ...groups.map((group) => `  ${group.padEnd(18)} ${groupDescriptions[group] ?? 'Command group.'}`),
    '',
    'Global options:',
    '  --simulation <name> Select an explicit deterministic simulation scenario.',
    '  --help              Show top-level, resource, or command help.',
    '',
    'Run "knm <resource> --help" or "knm <resource> <command> --help" for details.'
  ].join('\n')
}

function renderGroupHelp(path: readonly string[], commands: readonly CommandDefinition[]): string {
  const key = path.join(' ')
  return [
    `Koinos Node Manager ${key} commands`,
    '',
    nestedGroupDescriptions[key] ?? groupDescriptions[key] ?? 'Command group.',
    '',
    'Usage:',
    `  knm ${key} <command> [options]`,
    '',
    'Commands:',
    ...commands.map(commandRow),
    '',
    `Run "knm ${key} <command> --help" for command options.`
  ].join('\n')
}

function commandsUnder(registry: CommandRegistry, path: readonly string[]): readonly CommandDefinition[] {
  return registry.definitions().filter((definition) =>
    definition.path.length > path.length && path.every((segment, index) => definition.path[index] === segment)
  )
}

function renderCommandHelp(definition: CommandDefinition): string {
  return [
    definition.summary,
    '',
    'Usage:',
    `  ${definition.usage}`,
    '',
    'Options:',
    ...definition.options.map((option) => `  ${option.syntax.padEnd(25)} ${option.description}`),
    '  --help                    Show this command help.'
  ].join('\n')
}

function commandRow(definition: CommandDefinition): string {
  return `  ${definition.path.join(' ').padEnd(18)} ${definition.summary}`
}
