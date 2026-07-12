import type { CommandDefinition, CommandRegistry } from '../command-registry.js'
import type { TerminalCompleter } from './interactive-terminal.js'

const META_COMMANDS = ['/help', '/commands', '/status', '/inventory', '/scenario', '/history', '/clear', '/exit', '/quit'] as const

export type InteractiveCompletionOptions = {
  registry: CommandRegistry
  scenarioIds: readonly string[]
  nodeIds: () => readonly string[]
  connectionIds?: () => readonly string[]
  discoveryIds?: () => readonly string[]
  adoptionIds?: () => readonly string[]
  excludedCommandNames?: readonly string[]
}

export function createInteractiveCompleter(options: InteractiveCompletionOptions): TerminalCompleter {
  return (line) => completeInteractiveLine(line, options)
}

export function completeInteractiveLine(
  line: string,
  options: InteractiveCompletionOptions
): [readonly string[], string] {
  const endsWithWhitespace = /\s$/.test(line)
  const words = line.trimStart() === '' ? [] : line.trimStart().split(/\s+/)
  const current = endsWithWhitespace ? '' : (words.at(-1) ?? '')
  const completedWords = endsWithWhitespace ? words : words.slice(0, -1)

  if (line.trimStart().startsWith('/')) {
    if (completedWords[0] === '/scenario') return matches(options.scenarioIds, current)
    return matches(META_COMMANDS, current)
  }

  const excluded = new Set(options.excludedCommandNames ?? [])
  const definitions = options.registry.definitions().filter((definition) => !excluded.has(definition.commandName))
  if (completedWords.length === 0) {
    const roots = unique(definitions.flatMap((definition) => {
      const root = definition.path[0]
      return root === undefined ? [] : [root]
    }))
    return matches(roots, current)
  }

  if (completedWords.every((word) => !word.startsWith('--'))) {
    const nextSegments = unique(definitions.flatMap((definition) => {
      if (definition.path.length <= completedWords.length) return []
      const matchesPrefix = completedWords.every((word, index) => definition.path[index] === word)
      const segment = definition.path[completedWords.length]
      return matchesPrefix && segment !== undefined ? [segment] : []
    }))
    if (nextSegments.length > 0) return matches(nextSegments, current)
  }

  const commandTokens = endsWithWhitespace ? words : [...completedWords, current]
  const resolved = options.registry.resolve(commandTokens)
  if (resolved === undefined) return [[], current]
  const definition = resolved.definition
  const commandArgumentWords = commandTokens.slice(definition.path.length)
  const previous = endsWithWhitespace ? commandArgumentWords.at(-1) : commandArgumentWords.at(-2)
  if (previous?.startsWith('--')) {
    const option = findOption(definition, previous)
    if (option?.values !== undefined) return matches(option.values, current)
    if (option?.completionSource !== undefined) return matches(valuesForSource(option.completionSource, options), current)
  }
  if (current.startsWith('--') || (endsWithWhitespace && previous?.startsWith('--') !== true)) {
    const optionNames = definition.options.map((option) => option.syntax.split(' ')[0] ?? option.syntax)
    const optionMatches = optionNames.filter((option) => option.startsWith(current))
    if (optionMatches.length > 0 || current.startsWith('--')) return [optionMatches, current]
  }
  if (definition.completion?.positionalSources?.includes('node-id') === true) {
    return matches(options.nodeIds(), current)
  }
  const positionalSource = definition.completion?.positionalSources?.[0]
  if (positionalSource !== undefined) return matches(valuesForSource(positionalSource, options), current)
  return [[], current]
}

function valuesForSource(source: 'node-id' | 'connection-id' | 'discovery-id' | 'adoption-id', options: InteractiveCompletionOptions): readonly string[] {
  if (source === 'node-id') return options.nodeIds()
  if (source === 'connection-id') return options.connectionIds?.() ?? []
  if (source === 'discovery-id') return options.discoveryIds?.() ?? []
  return options.adoptionIds?.() ?? []
}

function findOption(definition: CommandDefinition, name: string) {
  return definition.options.find((option) => (option.syntax.split(' ')[0] ?? option.syntax) === name)
}

function matches(values: readonly string[], current: string): [readonly string[], string] {
  return [values.filter((value) => value.startsWith(current)), current]
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
