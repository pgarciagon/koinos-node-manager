import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function cli(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('npm', ['run', '--silent', 'cli', '--', ...args])
  return stdout
}

describe('CLI help and version', () => {
  it('renders top-level help from the command registry', async () => {
    const stdout = await cli(['--help'])
    assert.match(stdout, /version\s+Show product/)
    assert.match(stdout, /interactive\s+Start a prompt-driven/)
    assert.match(stdout, /paths\s+Show sanitized local/)
    assert.match(stdout, /doctor\s+Check local runtime/)
    assert.match(stdout, /nodes\s+Inspect and manage/)
    assert.match(stdout, /connections\s+Manage private opaque/)
    assert.match(stdout, /discoveries\s+Inspect and dismiss/)
    assert.match(stdout, /simulation\s+Inspect deterministic/)
  })

  it('documents interactive options without requiring a TTY', async () => {
    const stdout = await cli(['interactive', '--help'])
    assert.match(stdout, /knm \[--simulation <scenario>\] interactive/)
    assert.match(stdout, /--no-color/)
  })

  it('fails immediately with a typed error when interactive mode has no TTY', async () => {
    await assert.rejects(
      execFileAsync('npm', ['run', '--silent', 'cli', '--', 'interactive']),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        assert.equal(result.code, 2)
        assert.match(result.stderr, /INTERACTIVE_TTY_REQUIRED/)
        return true
      }
    )
  })

  it('renders resource-specific and command-specific help', async () => {
    assert.match(await cli(['nodes', '--help']), /nodes show/)
    const commandHelp = await cli(['nodes', 'list', '--help'])
    assert.match(commandHelp, /--management <class>/)
    assert.match(commandHelp, /--origin <origin>/)
    assert.match(commandHelp, /--flavor <flavor>/)
    assert.match(commandHelp, /--location <kind>/)
    assert.match(commandHelp, /--authority <level>/)
    assert.match(commandHelp, /--staleness <state>/)
    assert.match(commandHelp, /--output <format>/)
    assert.match(await cli(['nodes', 'show', '--help']), /--section <name>/)
    assert.match(await cli(['nodes', 'add', '--help']), /--connection-ref <reference>/)
    assert.match(await cli(['nodes', 'update', '--help']), /--clear-connection-ref/)
    assert.match(await cli(['nodes', 'remove', '--help']), /--confirm <node-id>/)
    assert.match(await cli(['doctor', '--help']), /--recover-inventory/)
    assert.match(await cli(['doctor', '--help']), /--recover-connection-state/)
    assert.match(await cli(['doctor', '--help']), /--check-connections/)
    assert.match(await cli(['connections', '--help']), /connections add ssh/)
    assert.match(await cli(['connections', 'add', '--help']), /connections add ssh/)
    assert.match(await cli(['nodes', 'adoption', '--help']), /nodes adoption apply/)
    assert.match(await cli(['nodes', 'adoption', 'plan', '--help']), /--discovery <id>/)
  })

  it('reports a complete human-readable build identity', async () => {
    const stdout = await cli(['version'])
    assert.match(stdout, /Koinos Node Manager 0\.1\.0-dev\.0/)
    assert.match(stdout, /Interface:\s+cli v1/)
    assert.match(stdout, /Commit:\s+[0-9a-f]{40}/)
    assert.match(stdout, /Channel:\s+development/)
    assert.match(stdout, /Built:\s+\d{4}-\d{2}-\d{2}T/)
  })

  it('reports the build identity through a versioned JSON envelope', async () => {
    const result = JSON.parse(await cli(['version', '--output', 'json'])) as {
      schemaVersion: number
      command: string
      data: { build: { productVersion: string; interfaceVersion: string; coreVersion: string } }
    }
    assert.equal(result.schemaVersion, 2)
    assert.equal(result.command, 'version')
    assert.equal(result.data.build.productVersion, '0.1.0-dev.0')
    assert.equal(result.data.build.interfaceVersion, '1')
    assert.equal(result.data.build.coreVersion, '0.1.0-dev.0')
  })

  it('returns stable structured output for an invalid registered path', async () => {
    await assert.rejects(
      execFileAsync('npm', [
        'run', '--silent', 'cli', '--', 'nodes', 'missing', '--output', 'json'
      ]),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        const envelope = JSON.parse(result.stderr) as {
          command: string
          errors: Array<{ code: string }>
        }
        assert.equal(result.code, 2)
        assert.equal(envelope.command, 'nodes.missing')
        assert.equal(envelope.errors[0]?.code, 'INVALID_CLI_INPUT')
        return true
      }
    )
  })

  it('does not repeat unknown-command arguments in structured errors', async () => {
    await assert.rejects(
      execFileAsync('npm', [
        'run', '--silent', 'cli', '--', 'unknown', '--token', 'raw-secret', '--output', 'json'
      ]),
      (error: unknown) => {
        const result = error as { code: number; stderr: string }
        const envelope = JSON.parse(result.stderr) as { command: string; errors: Array<{ message: string }> }
        assert.equal(envelope.command, 'unknown')
        assert.doesNotMatch(result.stderr, /raw-secret/)
        assert.equal(envelope.errors[0]?.message, 'Unknown command "unknown".')
        return true
      }
    )
  })
})
