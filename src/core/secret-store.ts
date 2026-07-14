import { spawn } from 'node:child_process'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'

export interface SecretStore {
  put(reference: string, secret: string): Promise<void>
  get(reference: string): Promise<string | null>
  delete(reference: string): Promise<void>
  available(): Promise<boolean>
}

export class InMemorySecretStore implements SecretStore {
  readonly #values = new Map<string, string>()

  async put(reference: string, secret: string): Promise<void> {
    assertReference(reference)
    assertSecret(secret)
    this.#values.set(reference, secret)
  }

  async get(reference: string): Promise<string | null> {
    assertReference(reference)
    return this.#values.get(reference) ?? null
  }

  async delete(reference: string): Promise<void> {
    assertReference(reference)
    this.#values.delete(reference)
  }

  async available(): Promise<boolean> {
    return true
  }
}

export class OperatingSystemSecretStore implements SecretStore {
  async put(reference: string, secret: string): Promise<void> {
    assertReference(reference)
    assertSecret(secret)
    if (process.platform === 'darwin') {
      await fixedProcess('/usr/bin/security', ['add-generic-password', '-U', '-a', reference, '-s', 'Koinos Node Manager Agent', '-w'], `${secret}\n`)
      return
    }
    if (process.platform === 'linux') {
      await fixedProcess('secret-tool', ['store', '--label=Koinos Node Manager Agent', 'application', 'koinos-node-manager', 'reference', reference], secret)
      return
    }
    throw unavailableSecretStore()
  }

  async get(reference: string): Promise<string | null> {
    assertReference(reference)
    try {
      if (process.platform === 'darwin') {
        return (await fixedProcess('/usr/bin/security', ['find-generic-password', '-a', reference, '-s', 'Koinos Node Manager Agent', '-w'])).trim()
      }
      if (process.platform === 'linux') {
        return (await fixedProcess('secret-tool', ['lookup', 'application', 'koinos-node-manager', 'reference', reference])).trim() || null
      }
    } catch (error: unknown) {
      if (error instanceof ApplicationError && error.code === 'AGENT_CREDENTIAL_UNAVAILABLE') return null
      throw error
    }
    throw unavailableSecretStore()
  }

  async delete(reference: string): Promise<void> {
    assertReference(reference)
    if (process.platform === 'darwin') {
      await fixedProcess('/usr/bin/security', ['delete-generic-password', '-a', reference, '-s', 'Koinos Node Manager Agent'])
      return
    }
    if (process.platform === 'linux') {
      await fixedProcess('secret-tool', ['clear', 'application', 'koinos-node-manager', 'reference', reference])
      return
    }
    throw unavailableSecretStore()
  }

  async available(): Promise<boolean> {
    if (process.platform === 'darwin') return true
    if (process.platform !== 'linux') return false
    try {
      await fixedProcess('secret-tool', ['--version'])
      return true
    } catch {
      return false
    }
  }
}

function fixedProcess(executable: string, args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { shell: false, stdio: ['pipe', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    let bytes = 0
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes <= 16_384) chunks.push(chunk)
      else child.kill('SIGKILL')
    })
    child.on('error', () => {
      clearTimeout(timer)
      reject(unavailableSecretStore())
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && bytes <= 16_384) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(unavailableSecretStore())
    })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

function assertReference(value: string): void {
  if (/^agent-credential:[a-z0-9][a-z0-9-]{0,63}$/.test(value)) return
  throw unavailableSecretStore()
}

function assertSecret(value: string): void {
  if (value.length >= 32 && value.length <= 4096 && !/[\u0000\r\n]/.test(value)) return
  throw unavailableSecretStore()
}

function unavailableSecretStore(): ApplicationError {
  return new ApplicationError({
    code: 'AGENT_CREDENTIAL_UNAVAILABLE',
    exitCode: EXIT_CODES.configuration,
    severity: 'error',
    retryable: true,
    message: 'The operating-system credential store is unavailable for the paired agent.',
    nextAction: 'Unlock or configure the operating-system credential store, then repeat pairing.'
  })
}
