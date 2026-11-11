import { TustenError } from '../errors'

/**
 * Подставляет значения переменных в шаблон вида `{name}`.
 *
 * Используется в `resolveModule` для случаев, когда путь задан не литералом,
 * а через переменную-плейсхолдер.
 *
 * @param template строка с `{placeholders}`.
 * @param vars карта значений.
 * @returns строка с подставленными значениями.
 * @throws {TustenError} если переменная не найдена.
 */
export function interpolate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
        if (!(key in vars)) {
            throw new TustenError(`Missing variable "${key}" for template "${template}"`)
        }
        return String(vars[key])
    })
}
