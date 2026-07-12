import { CliInputError } from '../cli-input-error.js'

export const MAX_INTERACTIVE_INPUT_LENGTH = 8192
const MAX_INTERACTIVE_ARGUMENTS = 256

export function tokenizeInteractiveInput(input: string): readonly string[] {
  if (input.length > MAX_INTERACTIVE_INPUT_LENGTH) {
    throw new CliInputError(`Interactive input exceeds the ${MAX_INTERACTIVE_INPUT_LENGTH}-character limit.`)
  }

  const tokens: string[] = []
  let current = ''
  let quote: 'single' | 'double' | undefined
  let tokenStarted = false

  const finishToken = (): void => {
    if (!tokenStarted) return
    tokens.push(current)
    current = ''
    tokenStarted = false
    if (tokens.length > MAX_INTERACTIVE_ARGUMENTS) {
      throw new CliInputError(`Interactive input exceeds the ${MAX_INTERACTIVE_ARGUMENTS}-argument limit.`)
    }
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === undefined) continue

    if (quote !== undefined) {
      const quoteCharacter = quote === 'single' ? "'" : '"'
      if (character === quoteCharacter) {
        quote = undefined
        tokenStarted = true
        continue
      }
      if (character === '\\') {
        const next = input[index + 1]
        if (next === quoteCharacter || next === '\\') {
          current += next
          tokenStarted = true
          index += 1
          continue
        }
      }
      current += character
      tokenStarted = true
      continue
    }

    if (/\s/.test(character)) {
      finishToken()
      continue
    }
    if (character === "'") {
      quote = 'single'
      tokenStarted = true
      continue
    }
    if (character === '"') {
      quote = 'double'
      tokenStarted = true
      continue
    }
    if ('|&;<>`'.includes(character) || (character === '$' && input[index + 1] === '(')) {
      throw new CliInputError(
        `Unsupported shell syntax near "${character}${character === '$' ? '(' : ''}". Interactive input accepts Koinos Node Manager commands only.`
      )
    }
    current += character
    tokenStarted = true
  }

  if (quote !== undefined) throw new CliInputError(`Unterminated ${quote}-quoted value.`)
  finishToken()
  return tokens
}
