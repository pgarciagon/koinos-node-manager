import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { ApplicationError } from './application-error.js'
import { EXIT_CODES } from './exit-codes.js'

export type EndpointPolicyInput = {
  endpoint: string
  allowPrivate: boolean
  allowLoopbackHttp: boolean
}

export type ApprovedEndpoint = {
  url: URL
  addresses: readonly { address: string; family: 4 | 6 }[]
  policy: 'https-public' | 'https-private-reviewed' | 'http-loopback-development'
}

export type AddressResolver = (hostname: string) => Promise<readonly { address: string; family: 4 | 6 }[]>

export async function approveEndpoint(
  input: EndpointPolicyInput,
  resolver: AddressResolver = resolveAddresses
): Promise<ApprovedEndpoint> {
  const url = parseEndpoint(input.endpoint)
  const literal = isIP(stripIpv6Brackets(url.hostname))
  let addresses: readonly { address: string; family: 4 | 6 }[]
  try {
    addresses = literal === 0
      ? await boundedResolve(resolver, url.hostname)
      : [{ address: stripIpv6Brackets(url.hostname), family: literal as 4 | 6 }]
  } catch {
    throw endpointError('ONBOARDING_UNREACHABLE', true, 'The endpoint name could not be resolved safely.', 'Check the private endpoint and DNS configuration, then retry.')
  }
  if (addresses.length === 0 || addresses.length > 16) throw blockedEndpoint()
  const classes = addresses.map(({ address }) => classifyAddress(address))
  if (classes.includes('blocked')) throw blockedEndpoint()
  const allLoopback = classes.every((value) => value === 'loopback')
  const privateDestination = classes.some((value) => value === 'private' || value === 'loopback')
  if (url.protocol === 'http:') {
    if (!input.allowLoopbackHttp || !allLoopback) throw blockedEndpoint()
    return { url, addresses: structuredClone(addresses), policy: 'http-loopback-development' }
  }
  if (privateDestination && !input.allowPrivate) {
    throw endpointError(
      'ONBOARDING_ENDPOINT_PRIVATE_REVIEW_REQUIRED',
      false,
      'The endpoint resolves to a private address that requires explicit review.',
      'Review the private destination in the privileged interface, then retry with private access approved.'
    )
  }
  return {
    url,
    addresses: structuredClone(addresses),
    policy: privateDestination ? 'https-private-reviewed' : 'https-public'
  }
}

function parseEndpoint(raw: string): URL {
  if (raw.length === 0 || raw.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw)) throw invalidEndpoint()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw invalidEndpoint()
  }
  if (!['https:', 'http:'].includes(url.protocol)
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
    || url.hostname === ''
    || !['', '80', '443'].includes(url.port) && !/^\d{1,5}$/.test(url.port)
    || Number(url.port || (url.protocol === 'https:' ? 443 : 80)) > 65535) {
    throw invalidEndpoint()
  }
  return url
}

async function resolveAddresses(hostname: string): Promise<readonly { address: string; family: 4 | 6 }[]> {
  const result = await lookup(hostname, { all: true, verbatim: true })
  return result.map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }))
}

async function boundedResolve(resolver: AddressResolver, hostname: string): Promise<readonly { address: string; family: 4 | 6 }[]> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('dns-timeout')), 3_000) })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function classifyAddress(address: string): 'public' | 'private' | 'loopback' | 'blocked' {
  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized.startsWith('127.')) return 'loopback'
  if (normalized === '0.0.0.0' || normalized === '::' || normalized.startsWith('169.254.')
    || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
    || normalized.startsWith('ff')) return 'blocked'
  if (normalized.startsWith('10.') || normalized.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    || normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private'
  return isIP(normalized) === 0 ? 'blocked' : 'public'
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

function invalidEndpoint(): ApplicationError {
  return endpointError(
    'ONBOARDING_ENDPOINT_INVALID',
    false,
    'The endpoint is invalid or uses an unsupported form.',
    'Provide an HTTPS Koinos JSON-RPC endpoint without credentials, fragments, or whitespace.'
  )
}

function blockedEndpoint(): ApplicationError {
  return endpointError(
    'ONBOARDING_ENDPOINT_BLOCKED',
    false,
    'The endpoint destination is blocked by the onboarding network policy.',
    'Use an approved public HTTPS endpoint or explicitly reviewed private HTTPS destination.'
  )
}

function endpointError(code: string, retryable: boolean, message: string, nextAction: string): ApplicationError {
  return new ApplicationError({
    code,
    exitCode: code === 'ONBOARDING_ENDPOINT_INVALID' ? EXIT_CODES.invalidInput : EXIT_CODES.transportUnavailable,
    severity: 'error',
    retryable,
    message,
    nextAction
  })
}
