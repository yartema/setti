import { defineConfig } from 'vitest/config'

/**
 * Конфигурация тестов setti.
 *
 * - `environment: 'node'` — по умолчанию. Для тестов React-хуков —
 *   `// @vitest-environment jsdom` в шапке файла.
 * - `include` — только `*.test.ts` в `src/`. Тесты ко-локейтед с кодом.
 * - Coverage — `v8`, исключая типы, индексы, тесты.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/*.d.ts', 'src/cli.ts'],
            thresholds: {
                lines: 60,
                functions: 60,
                branches: 60,
                statements: 60,
            },
        },
    },
})
