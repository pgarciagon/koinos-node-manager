import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveInventoryPaths } from '../src/adapters/filesystem/inventory-paths.js'

describe('inventory path resolution', () => {
  it('uses KNM_HOME as the portable and test isolation boundary', () => {
    const paths = resolveInventoryPaths({
      env: { KNM_HOME: '/portable/knm' },
      platform: 'linux',
      homeDirectory: '/home/operator'
    })
    assert.equal(paths.rootDirectory, '/portable/knm')
    assert.equal(paths.inventoryFile, '/portable/knm/inventory.json')
    assert.equal(paths.connectionStateFile, '/portable/knm/connection-state.json')
    assert.equal(paths.connectionStateLockFile, '/portable/knm/connection-state.lock')
    assert.equal(paths.source, 'KNM_HOME')
  })

  it('uses stable platform conventions without depending on the current machine', () => {
    assert.equal(resolveInventoryPaths({
      env: {}, platform: 'darwin', homeDirectory: '/Users/operator'
    }).rootDirectory, '/Users/operator/Library/Application Support/Koinos Node Manager')
    assert.equal(resolveInventoryPaths({
      env: { XDG_CONFIG_HOME: '/config' }, platform: 'linux', homeDirectory: '/home/operator'
    }).rootDirectory, '/config/koinos-node-manager')
    assert.equal(resolveInventoryPaths({
      env: {}, platform: 'linux', homeDirectory: '/home/operator'
    }).rootDirectory, '/home/operator/.config/koinos-node-manager')
  })
})
