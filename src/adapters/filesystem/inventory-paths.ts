import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type InventoryPathSource = 'KNM_HOME' | 'APPDATA' | 'XDG_CONFIG_HOME' | 'platform-default'

export type InventoryPaths = {
  rootDirectory: string
  configFile: string
  inventoryFile: string
  lockFile: string
  connectionStateFile: string
  connectionStateLockFile: string
  backupsDirectory: string
  quarantineDirectory: string
  source: InventoryPathSource
}

export type ResolveInventoryPathsOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
}

export function resolveInventoryPaths(options: ResolveInventoryPathsOptions = {}): InventoryPaths {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.homeDirectory ?? homedir()
  const override = nonEmpty(env.KNM_HOME)
  let rootDirectory: string
  let source: InventoryPathSource

  if (override !== undefined) {
    rootDirectory = resolve(override)
    source = 'KNM_HOME'
  } else if (platform === 'darwin') {
    rootDirectory = join(home, 'Library', 'Application Support', 'Koinos Node Manager')
    source = 'platform-default'
  } else if (platform === 'win32' && nonEmpty(env.APPDATA) !== undefined) {
    rootDirectory = join(nonEmpty(env.APPDATA) as string, 'Koinos Node Manager')
    source = 'APPDATA'
  } else if (nonEmpty(env.XDG_CONFIG_HOME) !== undefined) {
    rootDirectory = join(nonEmpty(env.XDG_CONFIG_HOME) as string, 'koinos-node-manager')
    source = 'XDG_CONFIG_HOME'
  } else {
    rootDirectory = join(home, '.config', 'koinos-node-manager')
    source = 'platform-default'
  }

  return {
    rootDirectory,
    configFile: join(rootDirectory, 'config.json'),
    inventoryFile: join(rootDirectory, 'inventory.json'),
    lockFile: join(rootDirectory, 'inventory.lock'),
    connectionStateFile: join(rootDirectory, 'connection-state.json'),
    connectionStateLockFile: join(rootDirectory, 'connection-state.lock'),
    backupsDirectory: join(rootDirectory, 'backups'),
    quarantineDirectory: join(rootDirectory, 'quarantine'),
    source
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' ? undefined : trimmed
}
