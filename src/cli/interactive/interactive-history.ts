const SENSITIVE_OPTION = /(--(?:password|passphrase|token|secret|private-key|wallet-key|signing-key|connection-ref|host-alias)(?:=|\s+))(?:"[^"]*"|'[^']*'|[^\s]+)/gi
const PRIVATE_KEY = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi

export const INTERACTIVE_HISTORY_LIMIT = 100

export function sanitizeInteractiveHistory(line: string): string {
  return line
    .replace(PRIVATE_KEY, '[REDACTED_PRIVATE_KEY]')
    .replace(SENSITIVE_OPTION, '$1[REDACTED]')
    .slice(0, 8192)
}

export function addInteractiveHistory(history: readonly string[], line: string): readonly string[] {
  const sanitized = sanitizeInteractiveHistory(line.trim())
  if (sanitized === '') return history
  if (history.at(-1) === sanitized) return history
  return [...history, sanitized].slice(-INTERACTIVE_HISTORY_LIMIT)
}
