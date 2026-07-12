#!/usr/bin/env node

import { runCli } from './batch-cli.js'

export { runCli } from './batch-cli.js'

const result = await runCli(process.argv.slice(2))
if (result.stdout !== undefined) console.log(result.stdout)
if (result.stderr !== undefined) console.error(result.stderr)
process.exitCode = result.code
