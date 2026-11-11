// Плоский конфиг ESLint 9 для монорепо nixo.
// Покрывает: JS-recommended, TS-recommended, JSDoc-правила (warn).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
    // Базовые наборы правил.
    js.configs.recommended,
    ...tseslint.configs.recommended,
    jsdoc.configs['flat/recommended'],

    // Правила, специфичные для нашего TS-кода.
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            // Разрешаем `_unused` в аргументах и переменных (префикс подчёркивания).
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

            // JSDoc обязателен на всех объявленных функциях и типах.
            // Один блок с contexts — второй блок был дубликатом и ломал ESLint.
            'jsdoc/require-jsdoc': [
                'warn',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: false,
                        ClassDeclaration: false,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                    contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
                },
            ],
            'jsdoc/require-param': 'warn',
            'jsdoc/require-returns': 'warn',

            // Типы и так в TS — не требуем JSDoc-типизации.
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off',

            // Стилистическое — не гоняемся за пустыми строками и порядком тегов.
            'jsdoc/tag-lines': 'off',
            'jsdoc/check-param-names': ['warn', { checkDestructured: false }],
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-returns-description': 'off',
            'jsdoc/check-param-names': 'off',
            'jsdoc/check-tag-names': 'off',
            'jsdoc/no-undefined-types': 'off',
        },
    },
    {
        files: ['**/*.mjs', '**/bin/**'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
    },
    prettier,
    // Игнорируем артефакты и внешние каталоги.
    {
        ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'],
    },
)
