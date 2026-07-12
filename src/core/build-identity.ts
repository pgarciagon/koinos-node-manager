import { generatedBuildIdentity } from '../generated/build-identity.js'

export type BuildIdentity = {
  productName: string
  productVersion: string
  interfaceName: string
  interfaceVersion: string
  coreVersion: string
  gitCommit: string
  releaseChannel: string
  buildTimestamp: string
  sourceState: 'clean' | 'dirty'
}

export function getBuildIdentity(): BuildIdentity {
  return { ...generatedBuildIdentity }
}
