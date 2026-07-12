import type {
  HistorySanitizer,
  InteractiveTerminal,
  TerminalCompleter,
  TerminalReadResult
} from '../../src/cli/interactive/interactive-terminal.js'

export class FakeInteractiveTerminal implements InteractiveTerminal {
  readonly isTTY = true
  readonly colorEnabled: boolean
  readonly prompts: string[] = []
  readonly output: string[] = []
  readonly errors: string[] = []
  clearCount = 0
  closed = false
  #completer: TerminalCompleter = (line) => [[], line]
  #historySanitizer: HistorySanitizer = (line) => line
  #width: number

  constructor(
    private readonly inputs: TerminalReadResult[],
    width = 120,
    colorEnabled = false
  ) {
    this.#width = width
    this.colorEnabled = colorEnabled
  }

  get width(): number {
    return this.#width
  }

  setWidth(width: number): void {
    this.#width = width
  }

  async readLine(prompt: string): Promise<TerminalReadResult> {
    this.prompts.push(prompt)
    return this.inputs.shift() ?? { kind: 'eof' }
  }

  write(text: string): void {
    this.output.push(text)
  }

  writeError(text: string): void {
    this.errors.push(text)
  }

  clear(): void {
    this.clearCount += 1
  }

  setCompleter(completer: TerminalCompleter): void {
    this.#completer = completer
  }

  setHistorySanitizer(sanitizer: HistorySanitizer): void {
    this.#historySanitizer = sanitizer
  }

  complete(line: string): [readonly string[], string] {
    return this.#completer(line)
  }

  sanitizeHistory(line: string): string {
    return this.#historySanitizer(line)
  }

  close(): void {
    this.closed = true
  }
}

export function lines(...values: string[]): TerminalReadResult[] {
  return values.map((value) => ({ kind: 'line', value }))
}
