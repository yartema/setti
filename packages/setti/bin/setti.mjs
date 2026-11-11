#!/usr/bin/env node
// Тонкий wrapper над dist/cli.js.
// jiti внутри cli.js загружает setti.config.ts пользователя.

import('../dist/cli.js').catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
