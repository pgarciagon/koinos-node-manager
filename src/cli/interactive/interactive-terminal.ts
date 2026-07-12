export type TerminalReadResult =
  | { kind: 'line'; value: string }
  | { kind: 'interrupt' }
  | { kind: 'eof' }

export type TerminalCompleter = (line: string) => [readonly string[], string]
export type HistorySanitizer = (line: string) => string

export interface InteractiveTerminal {
  readonly isTTY: boolean
  readonly width: number
  readonly colorEnabled: boolean
  readLine(prompt: string): Promise<TerminalReadResult>
  write(text: string): void
  writeError(text: string): void
  clear(): void
  setCompleter(completer: TerminalCompleter): void
  setHistorySanitizer(sanitizer: HistorySanitizer): void
  close(): void
}
