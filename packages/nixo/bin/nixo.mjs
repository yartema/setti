#!/usr/bin/env node
// Обёртка над TS-CLI. Используем jiti, чтобы запускать TypeScript
// без отдельной сборки в dev-фазе.
//
// ВАЖНО: jsx: true — jiti 2.x переключает JSX на automatic runtime
// (jsx из react/jsx-runtime). Без него любой .tsx, загруженный через
// jiti (например, NixoProvider.tsx), компилируется в React.createElement
// и падает с "React is not defined".
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url, { interopDefault: true })
await jiti.import('../src/cli.ts')
