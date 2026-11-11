import { defineConfig } from 'tsup'

/**
 * Сборка setti в `dist/`.
 *
 * Три entry (client-safe, Node-only, React) + cli для bin.
 * Внешние зависимости (react, fastify, vite) — не бандлятся,
 * пользователь ставит их сам через peerDependencies.
 */
export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        'client/index': 'src/client/index.ts',
        cli: 'src/cli.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['react', 'react-dom', 'fastify', 'vite', '@vitejs/plugin-react', 'jiti', 'devalue', '@fastify/static'],
    // Shebang для dist/cli.js (хотя bin/setti.mjs — wrapper, стабильнее).
    banner: {
        js: '',
    },
})
