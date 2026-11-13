// Постобработка `dist/` после `tsup`.
//
// rollup-plugin-dts не сохраняет `/// <reference path>` из исходников. Без неё `i18n!*`-импорты
// в проекте пользователя не типизированы, даже если он импортирует `@tusten/core/client`.
// Дописываем директиву в `dist/client/index.d.ts`; путь относительно этого файла.
//
// Отдельный шаг, а не `onSuccess` в tsup: тот срабатывает раньше записи dts.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REF = '/// <reference path="../../types/i18n.d.ts" />\n'
const file = fileURLToPath(new URL('../dist/client/index.d.ts', import.meta.url))

const dts = readFileSync(file, 'utf8')
if (!dts.startsWith(REF)) writeFileSync(file, REF + dts)
