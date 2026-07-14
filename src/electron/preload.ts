import { contextBridge, ipcRenderer } from 'electron'
import {
  ELECTRON_CHANNELS,
  ELECTRON_INSPECTION_BRIDGE_VERSION,
  ELECTRON_NODE_CHANNELS,
  ELECTRON_NODE_READ_BRIDGE_VERSION,
  type ElectronNodeReadBridge,
  type ElectronOnboardingBridge
} from './bridge.js'
import type { PreviewQuickInput } from '../core/onboarding.js'

const bridge: ElectronOnboardingBridge = Object.freeze({
  version: ELECTRON_INSPECTION_BRIDGE_VERSION,
  previewQuick: (input: PreviewQuickInput) => ipcRenderer.invoke(ELECTRON_CHANNELS.previewQuick, input),
  previewFullFromClipboard: (input: { nodeId: string; displayName?: string; allowPrivate: boolean; allowLoopbackHttp: boolean }) => ipcRenderer.invoke(ELECTRON_CHANNELS.previewFullFromClipboard, input),
  pairFullImported: (reviewId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.pairFullImported, reviewId),
  revokeFull: (nodeId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.revokeFull, nodeId),
  apply: (reviewId: string, digest: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.apply, reviewId, digest),
  status: (reviewId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.status, reviewId),
  cancel: (reviewId: string) => ipcRenderer.invoke(ELECTRON_CHANNELS.cancel, reviewId),
  reconcile: () => ipcRenderer.invoke(ELECTRON_CHANNELS.reconcile)
})

contextBridge.exposeInMainWorld('knmOnboarding', bridge)

const nodeBridge: ElectronNodeReadBridge = Object.freeze({
  version: ELECTRON_NODE_READ_BRIDGE_VERSION,
  list: () => ipcRenderer.invoke(ELECTRON_NODE_CHANNELS.list),
  inspect: (nodeId: string) => ipcRenderer.invoke(ELECTRON_NODE_CHANNELS.inspect, nodeId)
})

contextBridge.exposeInMainWorld('knmNodes', nodeBridge)
