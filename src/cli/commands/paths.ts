import { homedir } from 'node:os'
import { sep } from 'node:path'
import { parseArgs } from 'node:util'
import type { ApplicationContext } from '../application-context.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runPaths(args: readonly string[], context: ApplicationContext): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  const output = parseOutputFormat(parsed.values.output)
  const paths = {
    rootDirectory: supportPath(context.paths.rootDirectory),
    configFile: supportPath(context.paths.configFile),
    inventoryFile: supportPath(context.paths.inventoryFile),
    connectionStateFile: supportPath(context.paths.connectionStateFile),
    backupsDirectory: supportPath(context.paths.backupsDirectory),
    quarantineDirectory: supportPath(context.paths.quarantineDirectory),
    source: context.paths.source
  }
  if (output === 'json') return successEnvelope('paths', { paths })
  return [
    'Koinos Node Manager paths',
    `  Root:        ${paths.rootDirectory}`,
    `  Config:      ${paths.configFile}`,
    `  Inventory:   ${paths.inventoryFile}`,
    `  Connections: ${paths.connectionStateFile}`,
    `  Backups:     ${paths.backupsDirectory}`,
    `  Quarantine:  ${paths.quarantineDirectory}`,
    `  Resolution:  ${paths.source}`,
    '',
    'Set KNM_HOME to use an isolated or portable storage root.'
  ].join('\n')
}

function supportPath(value: string): string {
  const home = homedir()
  return value === home ? '~' : value.startsWith(`${home}${sep}`) ? `~${sep}${value.slice(home.length + 1)}` : value
}
