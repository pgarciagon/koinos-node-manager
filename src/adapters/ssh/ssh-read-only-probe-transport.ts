import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProbeKind, ProbeRequest, ProbeResponse, ReadOnlyProbeTransport } from '../../core/probe-transport.js'

const execFileAsync = promisify(execFile)
const MAX_OUTPUT_BYTES = 256 * 1024

export const ALLOWLISTED_REMOTE_PROBES: Readonly<Record<ProbeKind, string>> = Object.freeze({
  'connection.handshake': `printf 'KNM_HANDSHAKE_V1\\n'`,
  'host.inventory': `test -r "$HOME/.config/koinos-node-manager/host-inspection-v1.json" || exit 64; exec cat -- "$HOME/.config/koinos-node-manager/host-inspection-v1.json"`,
  'peers.snapshot': `test -r "$HOME/.config/koinos-node-manager/peers-inspection-v1.json" || exit 64; exec cat -- "$HOME/.config/koinos-node-manager/peers-inspection-v1.json"`
})

export type SshReadOnlyProbeTransportOptions = {
  sshExecutable?: string
  sshConfigFile?: string
  now?: () => number
}

export class SshReadOnlyProbeTransport implements ReadOnlyProbeTransport {
  readonly #sshExecutable: string
  readonly #sshConfigFile: string | undefined
  readonly #now: () => number

  constructor(options: SshReadOnlyProbeTransportOptions = {}) {
    this.#sshExecutable = options.sshExecutable ?? 'ssh'
    this.#sshConfigFile = options.sshConfigFile ?? process.env.KNM_SSH_CONFIG
    this.#now = options.now ?? Date.now
  }

  async execute(request: ProbeRequest): Promise<ProbeResponse> {
    const started = this.#now()
    const timeoutMs = Math.max(1000, Math.min(30000, Math.trunc(request.timeoutMs)))
    const connectTimeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000))
    const remoteCommand = ALLOWLISTED_REMOTE_PROBES[request.kind]
    const args = [
      ...(this.#sshConfigFile === undefined ? [] : ['-F', this.#sshConfigFile]),
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${connectTimeoutSeconds}`,
      '-o', 'ConnectionAttempts=1',
      '--', request.connection.hostAlias,
      'sh', '-lc', remoteCommand
    ]
    try {
      const result = await execFileAsync(this.#sshExecutable, args, {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true
      })
      const payload = result.stdout.trim()
      if (request.kind === 'connection.handshake' && payload !== 'KNM_HANDSHAKE_V1') {
        return { outcome: 'malformed', durationMs: elapsed(this.#now, started), payload: null }
      }
      return { outcome: 'success', durationMs: elapsed(this.#now, started), payload }
    } catch (error: unknown) {
      const result = error as { code?: unknown; killed?: boolean; signal?: unknown; stderr?: unknown }
      const stderr = typeof result.stderr === 'string' ? result.stderr : ''
      if (result.killed === true || result.signal !== undefined && result.signal !== null) {
        return { outcome: 'timeout', durationMs: elapsed(this.#now, started), payload: null }
      }
      if (result.code === 64) return { outcome: 'unsupported', durationMs: elapsed(this.#now, started), payload: null }
      if (/permission denied|authentication failed|publickey/i.test(stderr)) {
        return { outcome: 'authentication-failed', durationMs: elapsed(this.#now, started), payload: null }
      }
      return { outcome: 'unreachable', durationMs: elapsed(this.#now, started), payload: null }
    }
  }
}

function elapsed(now: () => number, started: number): number {
  return Math.max(0, Math.min(30000, Math.trunc(now() - started)))
}
