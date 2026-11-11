import path from 'node:path'
import type { Manifest, ManifestEntry, ModuleKind, ResolvedSettiConfig, ScanResult } from './types'

/**
 * Собирает манифест из результата сканирования.
 *
 * На Phase 1a определяем `kind` по использованию:
 * - `router.ts` → `routes`;
 * - `*.loader.ts` → `globalLoader`;
 * - `config.layouts` → `layout`;
 * - `contentConfig.workspaceConfig.template` → `component`;
 * - `contentConfig.prefetchConfig.configLoader` → `config`.
 *
 * `factory` (`dataFactoryName`) появится в Phase 1b, когда мы будем
 * вызывать `getConfig` на этапе сборки для построения полного манифеста.
 *
 * @param scan результат сканирования.
 * @param config нормализованный конфиг.
 * @param clientDir абсолютный путь до клиентского каталога.
 * @returns манифест.
 */
export function buildManifest(scan: ScanResult, config: ResolvedSettiConfig, clientDir: string): Manifest {
    const modules: Record<string, ManifestEntry> = {}

    /**
     * Добавляет запись в манифест, если её ещё нет.
     *
     * Первое вхождение задаёт `kind`; повторные вызовы игнорируются.
     *
     * @param name имя модуля.
     * @param kind вид модуля.
     */
    const add = (name: string, kind: ModuleKind) => {
        if (!modules[name]) {
            modules[name] = { kind, js: name, css: [] }
        }
    }

    // router.ts → routes.
    for (const { file } of scan.routeModules) {
        add(toModuleName(file, clientDir), 'routes')
    }

    // *.loader.ts → globalLoader.
    for (const { file } of scan.loaderModules) {
        add(toModuleName(file, clientDir), 'globalLoader')
    }

    // Layouts из конфига.
    for (const layoutPath of Object.values(config.layouts)) {
        add(stripExt(toRelativeName(layoutPath)), 'layout')
    }

    // Использования из маршрутов.
    for (const { routes } of scan.routeModules) {
        for (const route of routes) {
            add(stripExport(route.contentConfig.workspaceConfig.template), 'component')
            add(stripExport(route.contentConfig.prefetchConfig.configLoader), 'config')
        }
    }

    return {
        version: computeVersion(modules),
        modules,
    }
}

/**
 * Преобразует абсолютный путь файла в имя модуля (`HomePage/router`).
 *
 * @param absFile абсолютный путь.
 * @param clientDir корень клиентского каталога.
 * @returns имя модуля без расширения.
 */
function toModuleName(absFile: string, clientDir: string): string {
    const rel = path.relative(clientDir, absFile).replace(/\\/g, '/')
    return stripExt(rel)
}

/**
 * Нормализует относительный путь из конфига (убирает `./`).
 *
 * @param p путь.
 * @returns нормализованный путь.
 */
function toRelativeName(p: string): string {
    return p.replace(/^\.\//, '').replace(/\\/g, '/')
}

/**
 * Убирает расширение `.ts/.tsx/.js/.jsx`.
 *
 * @param p путь с расширением.
 * @returns путь без расширения.
 */
function stripExt(p: string): string {
    return p.replace(/\.(tsx?|jsx?)$/, '')
}

/**
 * Убирает `<file>:export>` из ссылки на модуль (`HomePage/view:View` → `HomePage/view`).
 *
 * @param p ссылка на модуль.
 * @returns путь без имени экспорта.
 */
function stripExport(p: string): string {
    return p.split(':')[0]
}

/**
 * Вычисляет простую версию манифеста (FNV-1a хеш по отсортированным ключам).
 *
 * @param modules карта модулей.
 * @returns короткий hex-хеш.
 */
function computeVersion(modules: Record<string, ManifestEntry>): string {
    const keys = Object.keys(modules).sort().join('|')
    let hash = 0x811c9dc5
    for (let i = 0; i < keys.length; i++) {
        hash ^= keys.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash.toString(16)
}
