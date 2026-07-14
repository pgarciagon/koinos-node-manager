import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApplicationContext, LOCAL_INVENTORY_SOURCE } from '../cli/application-context.js'
import { createNodeDirectoryApi } from '../core/node-directory-api.js'
import { createNodeInspectionApi } from '../core/node-inspection-api.js'
import { createNodeOnboardingApi } from '../core/node-onboarding-api.js'
import { toPublicApplicationError } from '../core/public-error.js'
import type { PreviewQuickInput } from '../core/onboarding.js'
import type { AgentPairingPayload } from '../domain/agent-protocol.js'
import {
  ELECTRON_CHANNELS,
  ELECTRON_NODE_CHANNELS,
  type DesktopResult,
  type ElectronNodeInspection
} from './bridge.js'
import {
  assertNodeDirectoryIpcRequest,
  invalidNodeReadRequest,
  parseNodeInspectionIpcRequest
} from './node-read-ipc.js'

const directory = fileURLToPath(new URL('.', import.meta.url))

function onboardingApi() {
  const context = createApplicationContext(LOCAL_INVENTORY_SOURCE)
  if (context.connectionStateRepository === null || context.inventoryRepository === null || context.onboardingJournalRepository === null) {
    throw new Error('Local onboarding adapters are unavailable.')
  }
  return createNodeOnboardingApi({
    connectionRepository: context.connectionStateRepository,
    inventoryRepository: context.inventoryRepository,
    journalRepository: context.onboardingJournalRepository,
    transport: context.publicRpcTransport,
    adapter: context.publicRpcAdapter,
    agentClient: context.agentClient,
    agentTransport: context.agentProbeTransport,
    secretStore: context.secretStore,
    inspectionAdapters: context.inspectionAdapters
  })
}

function nodeReadApis() {
  const context = createApplicationContext(LOCAL_INVENTORY_SOURCE)
  if (context.connectionStateRepository === null) throw new Error('Local node-read adapters are unavailable.')
  return {
    directory: createNodeDirectoryApi({
      nodeRepository: context.nodeRepository,
      connectionRepository: context.connectionStateRepository
    }),
    inspection: createNodeInspectionApi({
      nodeRepository: context.nodeRepository,
      connectionRepository: context.connectionStateRepository,
      aliasResolver: context.aliasResolver,
      probeTransport: context.probeTransport,
      publicRpcTransport: context.publicRpcTransport,
      publicRpcAdapter: context.publicRpcAdapter,
      agentProbeTransport: context.agentProbeTransport,
      adapters: context.inspectionAdapters,
      ...(context.now === undefined ? {} : { now: context.now })
    })
  }
}

function registerHandlers(): void {
  const api = onboardingApi()
  const nodes = nodeReadApis()
  const importedPairingSecrets = new Map<string, string>()
  ipcMain.handle(ELECTRON_NODE_CHANNELS.list, (_event, ...args: unknown[]) => safe(async () => {
    assertNodeDirectoryIpcRequest(args)
    return nodes.directory.list()
  }))
  ipcMain.handle(ELECTRON_NODE_CHANNELS.inspect, (_event, ...args: unknown[]) => safe(async (): Promise<ElectronNodeInspection> => {
    const nodeId = parseNodeInspectionIpcRequest(args)
    const directory = await nodes.directory.list()
    const node = directory.nodes.find((candidate) => candidate.nodeId === nodeId)
    if (node === undefined) throw invalidNodeReadRequest('The requested node is not available in the public directory.')
    const inspection = await nodes.inspection.inspect({ nodeId, sections: ['overview', 'components', 'chain', 'governance'], timeoutMs: 10_000 })
    return { node, inspection }
  }))
  ipcMain.handle(ELECTRON_CHANNELS.previewQuick, (_event, input: PreviewQuickInput) => safe(() => api.previewQuick(input)))
  ipcMain.handle(ELECTRON_CHANNELS.previewFullFromClipboard, (_event, input: { nodeId: string; displayName?: string; allowPrivate: boolean; allowLoopbackHttp: boolean }) => safe(async () => {
    const payload = readPairingPayloadFromClipboard()
    clipboard.clear()
    const review = await api.previewFull({
      nodeId: input.nodeId,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      endpoint: payload.endpoint,
      pairingSessionRef: payload.sessionId,
      expectedIdentityDigest: payload.identityDigest,
      allowPrivate: input.allowPrivate,
      allowLoopbackHttp: input.allowLoopbackHttp
    })
    importedPairingSecrets.set(review.id, payload.secret)
    return review
  }))
  ipcMain.handle(ELECTRON_CHANNELS.pairFullImported, (_event, reviewId: string) => safe(async () => {
    const secret = importedPairingSecrets.get(reviewId)
    if (secret === undefined) throw new Error('The imported pairing session is unavailable.')
    importedPairingSecrets.delete(reviewId)
    return api.pairFull(reviewId, secret)
  }))
  ipcMain.handle(ELECTRON_CHANNELS.revokeFull, (_event, nodeId: string) => safe(() => api.revokeFull(nodeId)))
  ipcMain.handle(ELECTRON_CHANNELS.apply, (_event, reviewId: string, digest: string) => safe(() => api.apply(reviewId, digest)))
  ipcMain.handle(ELECTRON_CHANNELS.status, (_event, reviewId: string) => safe(() => api.status(reviewId)))
  ipcMain.handle(ELECTRON_CHANNELS.cancel, (_event, reviewId: string) => safe(() => {
    importedPairingSecrets.delete(reviewId)
    return api.cancel(reviewId)
  }))
  ipcMain.handle(ELECTRON_CHANNELS.reconcile, () => safe(() => api.reconcile()))
}

function readPairingPayloadFromClipboard(): AgentPairingPayload {
  const raw = clipboard.readText()
  if (raw.length < 64 || raw.length > 4096 || /[\u0000\r\n]/.test(raw)) throw new Error('The clipboard pairing payload is malformed.')
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('The clipboard pairing payload is malformed.')
  const value = parsed as Record<string, unknown>
  if (Object.keys(value).some((key) => !['endpoint', 'sessionId', 'secret', 'identityDigest', 'expiresAt'].includes(key))
    || typeof value.endpoint !== 'string' || typeof value.sessionId !== 'string' || typeof value.secret !== 'string'
    || typeof value.identityDigest !== 'string' || typeof value.expiresAt !== 'string'
    || !/^[A-Za-z0-9_-]{8,128}$/.test(value.sessionId)
    || !/^[A-Za-z0-9_-]{43,128}$/.test(value.secret)
    || !/^[0-9a-f]{64}$/.test(value.identityDigest)
    || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
    throw new Error('The clipboard pairing payload is malformed or expired.')
  }
  return value as AgentPairingPayload
}

async function safe<T>(operation: () => Promise<T>): Promise<DesktopResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    return { ok: false, error: toPublicApplicationError(error) }
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f6f5fa',
    show: false,
    webPreferences: {
      preload: join(directory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  window.removeMenu()
  window.once('ready-to-show', () => window.show())
  void window.loadFile(join(directory, 'index.html'))
  return window
}

app.whenReady().then(() => {
  registerHandlers()
  if (process.argv.includes('--smoke-test')) {
    process.stdout.write('KNM_ELECTRON_SMOKE_OK\n')
    app.quit()
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch(() => {
  process.exitCode = 1
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
