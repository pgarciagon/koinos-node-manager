export const EXIT_CODES = Object.freeze({
  success: 0,
  invalidInput: 2,
  notFound: 3,
  configuration: 4,
  stalePlan: 10,
  safetyBlocked: 20,
  executionFailed: 30,
  transportUnavailable: 40
} as const)

export type ApplicationExitCode = Exclude<(typeof EXIT_CODES)[keyof typeof EXIT_CODES], 0>
