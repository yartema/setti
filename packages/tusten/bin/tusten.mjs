#!/usr/bin/env node
// Умный entry:
//   - В dev-монорепо (есть `src/cli.ts`) — грузим src через jiti.
//     Не нужен `pnpm --filter tusten build` при разработке framework.
//   - В published-пакете (`src/` нет, есть `dist/cli.js`) — грузим dist.
//
// ВАЖНО (Windows): `import(absPath)` падает с ERR_UNSUPPORTED_ESM_URL_SCHEME.
// Используем `pathToFileURL` для dist-импорта.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcCli = join(__dirname, '..', 'src', 'cli.ts')
const distCli = join(__dirname, '..', 'dist', 'cli.js')

if (existsSync(srcCli)) {
    // Dev: TS через jiti.
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    await jiti.import(srcCli)
} else {
    // Published: собранный JS.
    await import(pathToFileURL(distCli).href)
}
