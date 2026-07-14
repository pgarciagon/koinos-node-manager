import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
const platformDirectory = process.platform === 'darwin'
  ? `Koinos Node Manager-${process.platform}-${process.arch}`
  : `Koinos Node Manager-${process.platform}-${process.arch}`
const executable = process.platform === 'darwin'
  ? join('.artifacts', 'electron', platformDirectory, 'Koinos Node Manager.app', 'Contents', 'MacOS', 'Koinos Node Manager')
  : process.platform === 'win32'
    ? join('.artifacts', 'electron', platformDirectory, 'Koinos Node Manager.exe')
    : join('.artifacts', 'electron', platformDirectory, 'Koinos Node Manager')

const { stdout } = await execFileAsync(executable, ['--smoke-test'], {
  env: { ...process.env, KNM_HOME: join(process.cwd(), '.artifacts', 'electron-smoke-home') },
  timeout: 30_000,
  maxBuffer: 64 * 1024
})
if (!stdout.includes('KNM_ELECTRON_SMOKE_OK')) throw new Error('Packaged Electron smoke marker was not emitted.')
