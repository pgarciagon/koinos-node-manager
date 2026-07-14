import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  ELECTRON_CHANNELS,
  ELECTRON_INSPECTION_BRIDGE_VERSION,
  ELECTRON_NODE_CHANNELS,
  ELECTRON_NODE_READ_BRIDGE_VERSION
} from '../src/electron/bridge.js'
import { errorCategory, reduceOnboardingView } from '../src/electron/onboarding-view-model.js'

describe('Electron onboarding boundary', () => {
  it('freezes a narrow versioned IPC channel catalog', () => {
    assert.equal(ELECTRON_INSPECTION_BRIDGE_VERSION, '1.0.0')
    assert.equal(Object.isFrozen(ELECTRON_CHANNELS), true)
    assert.deepEqual(Object.keys(ELECTRON_CHANNELS).sort(), [
      'apply', 'cancel', 'pairFullImported', 'previewFullFromClipboard', 'previewQuick', 'reconcile', 'revokeFull', 'status'
    ])
    assert.equal(ELECTRON_NODE_READ_BRIDGE_VERSION, '1.0.0')
    assert.equal(Object.isFrozen(ELECTRON_NODE_CHANNELS), true)
    assert.deepEqual(ELECTRON_NODE_CHANNELS, {
      list: 'knm:nodes:list',
      inspect: 'knm:nodes:inspect'
    })
  })

  it('keeps networking, clipboard secrets, process execution, and CLI parsing outside the renderer', async () => {
    const renderer = await source('src/electron/renderer.ts')
    const preload = await source('src/electron/preload.ts')
    const main = await source('src/electron/main.ts')
    assert.doesNotMatch(renderer, /\bfetch\s*\(|XMLHttpRequest|WebSocket|child_process|execFile|spawn\s*\(|ssh\s|docker\s|process\.argv/)
    assert.doesNotMatch(renderer, /clipboard|pairingSecret|credentialRef|identityPublicKey/)
    assert.doesNotMatch(renderer, /innerHTML|outerHTML|insertAdjacentHTML|setInterval|setTimeout/)
    assert.doesNotMatch(preload, /clipboard|child_process|execFile|spawn\s*\(/)
    assert.match(main, /clipboard\.readText\(\)/)
    assert.match(main, /clipboard\.clear\(\)/)
    assert.match(main, /nodeIntegration:\s*false/)
    assert.match(main, /contextIsolation:\s*true/)
    assert.match(main, /sandbox:\s*true/)
    assert.match(preload, /exposeInMainWorld\('knmNodes'/)
    assert.match(main, /createNodeInspectionApi/)
    assert.match(main, /createNodeDirectoryApi/)
    assert.match(main, /const directory = await nodes\.directory\.list\(\)/)
    assert.match(main, /const inspection = await nodes\.inspection\.inspect/)
  })

  it('maps all important recovery and security failures to explicit view states', () => {
    assert.equal(errorCategory('AGENT_UNREACHABLE'), 'agent-unavailable')
    assert.equal(errorCategory('AGENT_PROTOCOL_INCOMPATIBLE'), 'incompatible-protocol')
    assert.equal(errorCategory('AGENT_PAIRING_EXPIRED'), 'pairing-expired')
    assert.equal(errorCategory('AGENT_PAIRING_REJECTED'), 'pairing-rejected')
    assert.equal(errorCategory('AGENT_PAIRING_REPLAYED'), 'replay-detected')
    assert.equal(errorCategory('AGENT_IDENTITY_CHANGED'), 'identity-changed')
    assert.equal(errorCategory('AGENT_CREDENTIAL_UNAVAILABLE'), 'credential-unavailable')
    assert.equal(errorCategory('ONBOARDING_REVIEW_STALE'), 'stale-review')
    assert.equal(errorCategory('CONNECTION_STATE_REVISION_CONFLICT'), 'persistence-conflict')
    assert.equal(errorCategory('ONBOARDING_COMMIT_INTERRUPTED'), 'interruption')
    const error = { code: 'AGENT_PAIRING_REPLAYED', severity: 'unsafe' as const, retryable: false, message: 'Pairing rejected.', nextAction: 'Create a fresh session.' }
    const state = reduceOnboardingView({ status: 'idle', mode: 'full' }, { type: 'failed', error })
    assert.deepEqual(state, { status: 'error', mode: 'full', category: 'replay-detected', error })
  })

  it('provides keyboard semantics, non-color status text, CSP isolation, and responsive overflow guardrails', async () => {
    const html = await source('src/electron/index.html')
    const css = await source('src/electron/styles.css')
    assert.match(html, /role="tablist"/)
    assert.match(html, /role="tab"/)
    assert.match(html, /role="status" aria-live="polite"/)
    assert.match(html, /connect-src 'none'/)
    assert.doesNotMatch(html, /fixture-bridge|generate-electron-ui-fixtures/)
    assert.equal((html.match(/<label/g) ?? []).length >= 7, true)
    assert.match(css, /\* \{ box-sizing: border-box; \}/)
    assert.match(css, /min-width: 0/)
    assert.match(css, /@media \(max-width: 620px\)/)
    assert.match(css, /overflow-wrap: anywhere/)
  })

  it('keeps deterministic browser fixtures out of the packaged application', async () => {
    const manifest = await source('package.json')
    assert.match(manifest, /ignore=\^\/scripts\/generate-electron-ui-fixtures\\\\\.mjs\$/)
  })
})

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}
