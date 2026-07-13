import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProbeKind, ProbeRequest, ProbeResponse, ReadOnlyProbeTransport } from '../../core/probe-transport.js'

const execFileAsync = promisify(execFile)
const MAX_OUTPUT_BYTES = 256 * 1024

function jsonRpcProbe(method: string): string {
  return `exec curl -fsS --max-time 10 --connect-timeout 2 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":"knm-inspection","method":"${method}","params":{}}' http://127.0.0.1:8080/`
}

const MULTISERVICE_COMPONENTS_PROBE = `set -eu
ids=""
for service in amqp chain mempool block_store p2p block_producer block_producer_2 jsonrpc grpc transaction_store contract_meta_store account_history rest; do
  found=$(docker ps -aq --filter "label=com.docker.compose.service=$service")
  [ -z "$found" ] || ids="$ids $found"
done
[ -n "$ids" ] || exit 64
printf 'KNM_INSPECTION_COMPONENTS_V1\\n'
docker inspect --format '{"service":{{json (index .Config.Labels "com.docker.compose.service")}},"status":{{json .State.Status}},"restartCount":{{.RestartCount}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"startedAt":{{json .State.StartedAt}},"ports":{{json .NetworkSettings.Ports}}}' $ids`

const MULTISERVICE_CONFIG_PROBE = `set -eu
container=$(docker ps -q --filter label=com.docker.compose.service=chain | head -n 1)
[ -n "$container" ] || exit 64
printf 'KNM_INSPECTION_CONFIG_V1\\n'
docker exec "$container" awk '
BEGIN { in_bp=0; in_proposals=0; producer_address=0; instance=0; percentage="" }
/^[[:space:]]*#/ { next }
/^[[:space:]]*block_producer:[[:space:]]*$/ { in_bp=1; in_proposals=0; next }
in_bp && /^[^[:space:]]/ { in_bp=0; in_proposals=0 }
in_bp && /^[[:space:]]*producer:[[:space:]]*/ { line=$0; sub(/^[^:]*:[[:space:]]*/, "", line); sub(/[[:space:]#].*$/, "", line); gsub(/"/, "", line); gsub(/\\047/, "", line); if (line != "" && line != "null") producer_address=1 }
in_bp && /^[[:space:]]*pob-production:[[:space:]]*[0-9]+/ { line=$0; sub(/^[^:]*:[[:space:]]*/, "", line); sub(/[[:space:]#].*$/, "", line); percentage=line }
in_bp && /^[[:space:]]*approve-proposals:[[:space:]]*$/ { in_proposals=1; next }
in_proposals && /^[[:space:]]*-[[:space:]]*/ { line=$0; sub(/^[[:space:]]*-[[:space:]]*/, "", line); sub(/[[:space:]#].*$/, "", line); if (line ~ /^[A-Za-z0-9_-]+$/ && length(line) >= 16 && length(line) <= 128) print "configuredProposal=" line; next }
in_proposals { in_proposals=0 }
/^[[:space:]]*instance-id:[[:space:]]*[^#[:space:]]/ { instance=1 }
END { print "producerAddressPresent=" (producer_address ? "true" : "false"); print "instancePresent=" (instance ? "true" : "false"); if (percentage != "") print "productionPercentage=" percentage }
' /koinos/config.yml`

const MULTISERVICE_RESOURCES_PROBE = `set -eu
container=$(docker ps -q --filter label=com.docker.compose.service=chain | head -n 1)
[ -n "$container" ] || exit 64
printf 'KNM_INSPECTION_RESOURCES_V1\\n'
docker exec "$container" sh -lc "df -Pk /koinos | awk 'NR==2 { printf \\\"{\\\\\\\"schemaVersion\\\\\\\":1,\\\\\\\"storage\\\\\\\":{\\\\\\\"totalBytes\\\\\\\":%.0f,\\\\\\\"usedBytes\\\\\\\":%.0f,\\\\\\\"freeBytes\\\\\\\":%.0f}}\\\\n\\\", \\\$2*1024, \\\$3*1024, \\\$4*1024 }'"`

export const ALLOWLISTED_REMOTE_PROBES: Readonly<Record<ProbeKind, string>> = Object.freeze({
  'connection.handshake': `printf 'KNM_HANDSHAKE_V1\\n'`,
  'host.inventory': `test -r "$HOME/.config/koinos-node-manager/host-inspection-v1.json" || exit 64; exec cat -- "$HOME/.config/koinos-node-manager/host-inspection-v1.json"`,
  'peers.snapshot': `test -r "$HOME/.config/koinos-node-manager/peers-inspection-v1.json" || exit 64; exec cat -- "$HOME/.config/koinos-node-manager/peers-inspection-v1.json"`,
  'node.multiservice.components': MULTISERVICE_COMPONENTS_PROBE,
  'node.multiservice.chain-head': jsonRpcProbe('chain.get_head_info'),
  'node.multiservice.chain-id': jsonRpcProbe('chain.get_chain_id'),
  'node.multiservice.chain-forks': jsonRpcProbe('chain.get_fork_heads'),
  'node.multiservice.block-store-head': jsonRpcProbe('block_store.get_highest_block'),
  'node.multiservice.p2p-status': jsonRpcProbe('p2p.get_gossip_status'),
  'node.multiservice.config': MULTISERVICE_CONFIG_PROBE,
  'node.multiservice.resources': MULTISERVICE_RESOURCES_PROBE,
  'node.teleno.status': jsonRpcProbe('node.get_status')
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
    if (typeof remoteCommand !== 'string') {
      return { outcome: 'unsupported', durationMs: elapsed(this.#now, started), payload: null }
    }
    const remoteInvocation = `sh -lc ${quotePosix(remoteCommand)}`
    const args = [
      ...(this.#sshConfigFile === undefined ? [] : ['-F', this.#sshConfigFile]),
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${connectTimeoutSeconds}`,
      '-o', 'ConnectionAttempts=1',
      '--', request.connection.hostAlias,
      remoteInvocation
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

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function elapsed(now: () => number, started: number): number {
  return Math.max(0, Math.min(30000, Math.trunc(now() - started)))
}
