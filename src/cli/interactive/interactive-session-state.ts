import type { CommandExecutionResult } from '../execution/execution-result.js'
import type { InventorySource } from '../application-context.js'
import { addInteractiveHistory } from './interactive-history.js'

export type InteractiveSessionPhase = 'idle' | 'reading' | 'executing' | 'closing' | 'closed'

export type InteractiveSessionState = {
  phase: InteractiveSessionPhase
  inventorySource: InventorySource
  history: readonly string[]
  lastResult?: Pick<CommandExecutionResult, 'code' | 'commandName'>
  consecutiveIdleInterrupts: number
}

export type InteractiveSessionEvent =
  | { type: 'read-started' }
  | { type: 'line-received'; line: string }
  | { type: 'command-started' }
  | { type: 'command-finished'; result: CommandExecutionResult }
  | { type: 'inventory-source-changed'; inventorySource: InventorySource }
  | { type: 'idle-interrupted' }
  | { type: 'closing' }
  | { type: 'closed' }

export function createInteractiveSessionState(inventorySource: InventorySource): InteractiveSessionState {
  return {
    phase: 'idle',
    inventorySource: structuredClone(inventorySource),
    history: [],
    consecutiveIdleInterrupts: 0
  }
}

export function reduceInteractiveSession(
  state: InteractiveSessionState,
  event: InteractiveSessionEvent
): InteractiveSessionState {
  if (state.phase === 'closed') throw new Error(`Interactive session is closed; event "${event.type}" is invalid.`)

  switch (event.type) {
    case 'read-started':
      return { ...state, phase: 'reading' }
    case 'line-received':
      return {
        ...state,
        phase: 'idle',
        history: addInteractiveHistory(state.history, event.line),
        consecutiveIdleInterrupts: 0
      }
    case 'command-started':
      return { ...state, phase: 'executing', consecutiveIdleInterrupts: 0 }
    case 'command-finished':
      return {
        ...state,
        phase: 'idle',
        lastResult: { code: event.result.code, commandName: event.result.commandName }
      }
    case 'inventory-source-changed':
      return { ...state, phase: 'idle', inventorySource: structuredClone(event.inventorySource), consecutiveIdleInterrupts: 0 }
    case 'idle-interrupted':
      return { ...state, phase: 'idle', consecutiveIdleInterrupts: state.consecutiveIdleInterrupts + 1 }
    case 'closing':
      return { ...state, phase: 'closing' }
    case 'closed':
      return { ...state, phase: 'closed' }
  }
}
