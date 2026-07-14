import { copyFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir('dist/electron', { recursive: true })
await Promise.all([
  copyFile('src/electron/index.html', 'dist/electron/index.html'),
  copyFile('src/electron/styles.css', 'dist/electron/styles.css'),
  build({
    entryPoints: ['src/electron/preload.ts'],
    outfile: 'dist/electron/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'silent'
  })
])
