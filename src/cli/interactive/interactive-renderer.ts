import type { BuildIdentity } from '../../core/build-identity.js'
import type { InteractiveSessionState } from './interactive-session-state.js'
import type { InventorySource } from '../application-context.js'

const purple = '\u001b[35m'
const dim = '\u001b[2m'
const reset = '\u001b[0m'

export function renderInteractiveStartup(identity: BuildIdentity, source: InventorySource): string {
  return [
    `${identity.productName} ${identity.productVersion}`,
    `Mode: ${source.kind === 'local' ? 'local persisted inventory' : 'read-only simulation'}`,
    ...(source.kind === 'simulation' ? [`Scenario: ${source.scenario}`] : []),
    'Type /help for interactive help.',
    ''
  ].join('\n')
}

export function renderInteractivePrompt(state: InteractiveSessionState, colorEnabled: boolean): string {
  const source = sourceLabel(state.inventorySource)
  const prompt = `[${source}] knm> `
  return colorEnabled ? `${dim}[${source}]${reset} ${purple}knm>${reset} ` : prompt
}

export function renderInteractiveHelp(): string {
  return [
    'Interactive commands use the normal CLI grammar without the leading "knm".',
    '',
    'Metacommands:',
    '  /help                   Show this help',
    '  /commands               Show registered product commands',
    '  /status                 Show session source, build, and last result',
    '  /inventory              Switch to the local persisted inventory',
    '  /scenario <scenario>    Change simulation scenario for this session',
    '  /history                Show sanitized in-memory history',
    '  /clear                  Clear the terminal',
    '  /exit, /quit            End the session',
    '',
    'Shell operators, redirection, substitution, and implicit active-node context are unsupported.'
  ].join('\n')
}

function sourceLabel(source: InventorySource): string {
  return source.kind === 'local' ? 'inventory:local' : `sim:${source.scenario}`
}

export function wrapInteractiveOutput(text: string, width: number): string {
  if (width < 20) return text
  return text.split('\n').flatMap((line) => wrapLine(line, width)).join('\n')
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const result: string[] = []
  const indentation = (line.match(/^\s*/)?.[0] ?? '').slice(0, Math.floor(width / 2))
  let remaining = line
  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(' ', width)
    if (splitAt <= 0) splitAt = width
    result.push(remaining.slice(0, splitAt))
    remaining = `${indentation}${remaining.slice(splitAt).trimStart()}`
  }
  result.push(remaining)
  return result
}
