import { parseArgs } from 'node:util'
import { getBuildIdentity, type BuildIdentity } from '../../core/build-identity.js'
import { successEnvelope } from '../envelope.js'
import { parseOutputFormat } from '../output.js'

export async function runVersion(args: readonly string[]): Promise<string> {
  const parsed = parseArgs({
    args,
    options: { output: { type: 'string', default: 'table' } },
    allowPositionals: false,
    strict: true
  })
  const output = parseOutputFormat(parsed.values.output)
  const identity = getBuildIdentity()
  return output === 'json' ? successEnvelope('version', { build: identity }) : formatBuildIdentity(identity)
}

function formatBuildIdentity(identity: BuildIdentity): string {
  return [
    `${identity.productName} ${identity.productVersion}`,
    `Interface:  ${identity.interfaceName} v${identity.interfaceVersion}`,
    `Core:       ${identity.coreVersion}`,
    `Commit:     ${identity.gitCommit} (${identity.sourceState})`,
    `Channel:    ${identity.releaseChannel}`,
    `Built:      ${identity.buildTimestamp}`
  ].join('\n')
}
