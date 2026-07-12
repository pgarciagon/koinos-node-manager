import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { SshAliasResolver } from '../../core/probe-transport.js'

export type SshConfigAliasResolverOptions = {
  configFile?: string
  homeDirectory?: string
  maxIncludeDepth?: number
  maxFiles?: number
}

export class SshConfigAliasResolver implements SshAliasResolver {
  readonly #configFile: string
  readonly #home: string
  readonly #maxDepth: number
  readonly #maxFiles: number

  constructor(options: SshConfigAliasResolverOptions = {}) {
    this.#home = options.homeDirectory ?? homedir()
    this.#configFile = options.configFile ?? process.env.KNM_SSH_CONFIG ?? join(this.#home, '.ssh', 'config')
    this.#maxDepth = options.maxIncludeDepth ?? 5
    this.#maxFiles = options.maxFiles ?? 64
  }

  get configFile(): string {
    return this.#configFile
  }

  async hasExactAlias(alias: string): Promise<boolean> {
    const aliases = new Set<string>()
    await this.#readConfig(this.#configFile, aliases, new Set(), 0)
    return aliases.has(alias)
  }

  async #readConfig(path: string, aliases: Set<string>, visited: Set<string>, depth: number): Promise<void> {
    const normalized = resolve(path)
    if (visited.has(normalized) || visited.size >= this.#maxFiles || depth > this.#maxDepth) return
    visited.add(normalized)
    const content = await readFile(normalized, 'utf8').catch(() => undefined)
    if (content === undefined) return
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, '').trim()
      if (line === '') continue
      const [keyword, ...values] = line.split(/\s+/)
      if (keyword?.toLowerCase() === 'host') {
        for (const value of values) {
          if (!value.startsWith('!') && !value.includes('*') && !value.includes('?')) aliases.add(value)
        }
      }
      if (keyword?.toLowerCase() === 'include') {
        for (const value of values) {
          const pattern = resolveInclude(value, dirname(normalized), this.#home)
          for (const included of await expandSimpleGlob(pattern)) {
            await this.#readConfig(included, aliases, visited, depth + 1)
          }
        }
      }
    }
  }
}

function resolveInclude(value: string, base: string, home: string): string {
  const expanded = value === '~' ? home : value.startsWith('~/') ? join(home, value.slice(2)) : value
  return isAbsolute(expanded) ? expanded : resolve(base, expanded)
}

async function expandSimpleGlob(pattern: string): Promise<readonly string[]> {
  if (!pattern.includes('*') && !pattern.includes('?')) return [pattern]
  const directory = dirname(pattern)
  const name = pattern.slice(directory.length + 1)
  if (name.includes('/') || name.includes('\\')) return []
  const regex = new RegExp(`^${escapeRegex(name).replaceAll('\\*', '.*').replaceAll('\\?', '.')}$`)
  return readdir(directory).then((entries) => entries.filter((entry) => regex.test(entry)).sort().map((entry) => join(directory, entry))).catch(() => [])
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
