import type { ElectronNodeInspection } from './bridge.js'
import type { PublicApplicationError } from '../core/public-error.js'
import type { PublicNodeDirectory } from '../domain/node-directory.js'

export type DirectoryViewState =
  | { status: 'loading' }
  | { status: 'empty'; directory: PublicNodeDirectory }
  | { status: 'ready'; directory: PublicNodeDirectory }
  | { status: 'error'; error: PublicApplicationError }

export type DirectoryViewEvent =
  | { type: 'load' }
  | { type: 'loaded'; directory: PublicNodeDirectory }
  | { type: 'failed'; error: PublicApplicationError }

export function reduceDirectoryView(
  _state: DirectoryViewState,
  event: DirectoryViewEvent
): DirectoryViewState {
  if (event.type === 'load') return { status: 'loading' }
  if (event.type === 'failed') return { status: 'error', error: event.error }
  return event.directory.total === 0
    ? { status: 'empty', directory: event.directory }
    : { status: 'ready', directory: event.directory }
}

export type DetailViewState =
  | { status: 'idle' }
  | { status: 'loading'; nodeId: string }
  | { status: 'ready'; value: ElectronNodeInspection }
  | { status: 'refreshing'; value: ElectronNodeInspection }
  | { status: 'error'; nodeId: string; error: PublicApplicationError; previous?: ElectronNodeInspection }

export type DetailViewEvent =
  | { type: 'load'; nodeId: string }
  | { type: 'loaded'; value: ElectronNodeInspection }
  | { type: 'refresh' }
  | { type: 'failed'; nodeId: string; error: PublicApplicationError }
  | { type: 'reset' }

export function reduceDetailView(state: DetailViewState, event: DetailViewEvent): DetailViewState {
  if (event.type === 'reset') return { status: 'idle' }
  if (event.type === 'load') return { status: 'loading', nodeId: event.nodeId }
  if (event.type === 'loaded') return { status: 'ready', value: event.value }
  if (event.type === 'refresh') {
    if (state.status !== 'ready' && state.status !== 'error') return state
    const value = state.status === 'ready' ? state.value : state.previous
    return value === undefined ? state : { status: 'refreshing', value }
  }
  const previous = state.status === 'ready' || state.status === 'refreshing'
    ? state.value
    : state.status === 'error'
      ? state.previous
      : undefined
  return previous === undefined
    ? { status: 'error', nodeId: event.nodeId, error: event.error }
    : { status: 'error', nodeId: event.nodeId, error: event.error, previous }
}
