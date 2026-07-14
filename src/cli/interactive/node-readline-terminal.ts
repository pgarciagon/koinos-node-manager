import { createInterface, type Interface } from 'node:readline/promises'
import type {
  HistorySanitizer,
  InteractiveTerminal,
  TerminalCompleter,
  TerminalReadResult
} from './interactive-terminal.js'

export type NodeReadlineTerminalOptions = {
  input: NodeJS.ReadStream
  output: NodeJS.WriteStream
  error: NodeJS.WriteStream
  noColor?: boolean
}

export class NodeReadlineTerminal implements InteractiveTerminal {
  readonly #input: NodeJS.ReadStream
  readonly #output: NodeJS.WriteStream
  readonly #error: NodeJS.WriteStream
  readonly #readline: Interface
  #completer: TerminalCompleter = (line) => [[], line]
  #historySanitizer: HistorySanitizer = (line) => line
  #closed = false

  constructor(options: NodeReadlineTerminalOptions) {
    this.#input = options.input
    this.#output = options.output
    this.#error = options.error
    this.colorEnabled = this.isTTY && options.noColor !== true && process.env.NO_COLOR === undefined
    this.#readline = createInterface({
      input: this.#input,
      output: this.#output,
      terminal: this.isTTY,
      historySize: 100,
      removeHistoryDuplicates: true,
      completer: (line: string) => {
        const [values, partial] = this.#completer(line)
        return [[...values], partial] as [string[], string]
      }
    })
    this.#readline.on('history', (history: string[]) => {
      if (history[0] !== undefined) history[0] = this.#historySanitizer(history[0])
    })
    this.#readline.on('close', () => {
      this.#closed = true
    })
  }

  get isTTY(): boolean {
    return this.#input.isTTY === true && this.#output.isTTY === true
  }

  get width(): number {
    return this.#output.columns ?? 80
  }

  readonly colorEnabled: boolean

  async readLine(prompt: string): Promise<TerminalReadResult> {
    if (this.#closed) return { kind: 'eof' }
    const controller = new AbortController()
    let closedDuringRead = false
    const onInterrupt = (): void => controller.abort()
    const onClose = (): void => {
      closedDuringRead = true
      controller.abort()
    }
    this.#readline.once('SIGINT', onInterrupt)
    this.#readline.once('close', onClose)
    try {
      const value = await this.#readline.question(prompt, { signal: controller.signal })
      return { kind: 'line', value }
    } catch (error: unknown) {
      if (closedDuringRead) return { kind: 'eof' }
      if (controller.signal.aborted) return { kind: 'interrupt' }
      if (this.#closed || isReadlineClosedError(error)) return { kind: 'eof' }
      throw error
    } finally {
      this.#readline.off('SIGINT', onInterrupt)
      this.#readline.off('close', onClose)
    }
  }

  async readPrivateLine(prompt: string, hidden: boolean): Promise<TerminalReadResult> {
    if (this.#closed) return { kind: 'eof' }
    const internal = this.#readline as unknown as {
      history?: string[]
      _writeToOutput?: (value: string) => void
    }
    const originalWrite = internal._writeToOutput
    if (hidden && originalWrite !== undefined) {
      internal._writeToOutput = (value: string) => {
        if (value.includes(prompt) || value === '\r\n' || value === '\n') originalWrite.call(this.#readline, value)
        else originalWrite.call(this.#readline, '*')
      }
    }
    try {
      const value = await this.#readline.question(prompt)
      if (internal.history?.[0] === value) internal.history.shift()
      return { kind: 'line', value }
    } catch (error: unknown) {
      if (this.#closed || isReadlineClosedError(error)) return { kind: 'eof' }
      throw error
    } finally {
      if (hidden && originalWrite !== undefined) internal._writeToOutput = originalWrite
    }
  }

  write(text: string): void {
    this.#output.write(withNewline(text))
  }

  writeError(text: string): void {
    this.#error.write(withNewline(text))
  }

  clear(): void {
    this.#output.write('\u001b[2J\u001b[H')
  }

  setCompleter(completer: TerminalCompleter): void {
    this.#completer = completer
  }

  setHistorySanitizer(sanitizer: HistorySanitizer): void {
    this.#historySanitizer = sanitizer
  }

  close(): void {
    if (!this.#closed) this.#readline.close()
    this.#closed = true
  }
}

function withNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ERR_USE_AFTER_CLOSE'
}
