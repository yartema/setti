import { TustenError } from '../../errors'
import { getLocale } from './locale'

/**
 * Подмножество ICU MessageFormat для `template()`:
 *   - `{name}` — подстановка значения;
 *   - `{n, plural, one {# файл} few {# файла} other {# файлов}}` — множественное число,
 *     `#` внутри формы выводит число, `=N {…}` — точное совпадение (`=0`);
 *   - экранирование `\{`, `\}`, `\#`, `\\` (в JSON словаря — `\\{` и т.д.).
 *
 * Вложенный plural/select и апострофы не поддерживаются — это осознанное ограничение MVP.
 */

/** Категории plural из CLDR (набор зависит от языка; `other` есть всегда). */
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/** Параметры шаблона: значение подставляется через `String(value)`. */
export type TemplateParams = Record<string, unknown>

/** Узел разобранного шаблона. */
type Node = TextNode | HashNode | ArgNode | PluralNode

/** Литеральный текст. */
interface TextNode {
    kind: 'text'
    value: string
}

/** `#` внутри формы plural. */
interface HashNode {
    kind: 'hash'
}

/** Подстановка `{name}`. */
interface ArgNode {
    kind: 'arg'
    name: string
    /** Исходный текст плейсхолдера: выводится, если параметра нет. */
    raw: string
}

/** Выбор формы по числу: `{name, plural, …}`. */
interface PluralNode {
    kind: 'plural'
    name: string
    /** Исходный текст плейсхолдера: выводится, если параметр не число. */
    raw: string
    /** Точные совпадения (`=0`). Проверяются раньше категорий. */
    exact: Map<number, Node[]>
    categories: Map<PluralCategory, Node[]>
}

const PLURAL_CATEGORIES: ReadonlySet<string> = new Set<PluralCategory>(['zero', 'one', 'two', 'few', 'many', 'other'])
/** Символы, которые можно экранировать обратной косой. Прочие `\` — обычный текст (например, пути Windows). */
const ESCAPABLE: ReadonlySet<string> = new Set(['{', '}', '#', '\\'])
const WHITESPACE = new Set([' ', '\t', '\n', '\r'])

/**
 * Рекурсивный разбор шаблона. Ошибки синтаксиса — `TustenError`:
 * битый шаблон — дефект перевода, его лучше увидеть, чем показать мусор.
 */
class Parser {
    private pos = 0

    /**
     * @param src исходная строка шаблона.
     */
    constructor(private readonly src: string) {}

    /**
     * @returns дерево узлов верхнего уровня.
     * @throws {TustenError} при синтаксической ошибке.
     */
    parse(): Node[] {
        return this.parseSequence(false)
    }

    /**
     * Читает последовательность до конца строки или (внутри формы plural) до `}`.
     * Закрывающую `}` не съедает — это делает вызывающий код.
     *
     * @param inCase `true`, если разбираем тело формы plural.
     * @returns узлы последовательности.
     */
    private parseSequence(inCase: boolean): Node[] {
        const nodes: Node[] = []
        let text = ''
        const flush = (): void => {
            if (text) {
                nodes.push({ kind: 'text', value: text })
                text = ''
            }
        }

        while (this.pos < this.src.length) {
            const ch = this.src[this.pos]

            if (ch === '\\' && ESCAPABLE.has(this.src[this.pos + 1])) {
                text += this.src[this.pos + 1]
                this.pos += 2
                continue
            }
            if (ch === '}') {
                if (inCase) {
                    flush()
                    return nodes
                }
                throw this.error('unmatched "}" (escape it as "\\}")')
            }
            if (ch === '{') {
                flush()
                nodes.push(this.parseBrace(inCase))
                continue
            }
            if (ch === '#' && inCase) {
                flush()
                nodes.push({ kind: 'hash' })
                this.pos++
                continue
            }
            text += ch
            this.pos++
        }

        if (inCase) throw this.error('unclosed plural form, expected "}"')
        flush()
        return nodes
    }

    /**
     * Разбирает `{…}`: либо подстановку `{name}`, либо `{name, plural, …}`.
     *
     * @param inCase `true`, если уже внутри формы plural (вложенный plural запрещён).
     * @returns узел аргумента или plural.
     */
    private parseBrace(inCase: boolean): Node {
        const start = this.pos
        this.pos++
        this.skipSpaces()
        const name = this.readIdent()
        if (name === null) throw this.error('expected argument name after "{"')
        this.skipSpaces()

        if (this.src[this.pos] === '}') {
            this.pos++
            return { kind: 'arg', name, raw: this.src.slice(start, this.pos) }
        }
        if (this.src[this.pos] !== ',') throw this.error(`expected "}" or "," after "${name}"`)
        this.pos++
        this.skipSpaces()

        const type = this.readIdent()
        if (type !== 'plural') {
            throw this.error(`unsupported argument type "${type ?? ''}" (only "plural" is supported)`)
        }
        this.skipSpaces()
        if (this.src[this.pos] !== ',') throw this.error('expected "," after "plural"')
        this.pos++

        if (inCase) throw this.error('nested plural is not supported')
        return this.parsePluralCases(name, start)
    }

    /**
     * Разбирает формы plural до закрывающей `}`.
     *
     * @param name имя аргумента.
     * @param start позиция открывающей `{` (для `raw`).
     * @returns узел plural.
     * @throws {TustenError} если нет формы `other`.
     */
    private parsePluralCases(name: string, start: number): PluralNode {
        const exact = new Map<number, Node[]>()
        const categories = new Map<PluralCategory, Node[]>()

        for (;;) {
            this.skipSpaces()
            if (this.pos >= this.src.length) throw this.error(`unclosed plural "${name}", expected "}"`)
            if (this.src[this.pos] === '}') {
                this.pos++
                break
            }

            const isExact = this.src[this.pos] === '='
            if (isExact) this.pos++
            const key = isExact ? this.readNumber() : this.readIdent()
            if (key === null) throw this.error('expected plural category or "=<number>"')
            if (!isExact && !PLURAL_CATEGORIES.has(key)) {
                throw this.error(`unknown plural category "${key}"`)
            }

            this.skipSpaces()
            if (this.src[this.pos] !== '{') throw this.error(`expected "{" after "${key}"`)
            this.pos++
            const body = this.parseSequence(true)
            // parseSequence остановился на `}` формы — съедаем её здесь.
            this.pos++

            if (isExact) exact.set(Number(key), body)
            else categories.set(key as PluralCategory, body)
        }

        // `other` — обязательная форма: без неё нет значения по умолчанию для любого числа.
        if (!categories.has('other')) throw this.error(`plural "${name}" must have an "other" form`)
        return { kind: 'plural', name, raw: this.src.slice(start, this.pos), exact, categories }
    }

    /**
     * @returns идентификатор или `null`, если на позиции его нет. Сдвигает позицию.
     */
    private readIdent(): string | null {
        const match = /[A-Za-z_][A-Za-z0-9_]*/y
        match.lastIndex = this.pos
        const m = match.exec(this.src)
        if (!m) return null
        this.pos += m[0].length
        return m[0]
    }

    /**
     * @returns строка из цифр или `null`. Сдвигает позицию.
     */
    private readNumber(): string | null {
        const match = /\d+/y
        match.lastIndex = this.pos
        const m = match.exec(this.src)
        if (!m) return null
        this.pos += m[0].length
        return m[0]
    }

    /** Пропускает пробельные символы (между формами plural). */
    private skipSpaces(): void {
        while (this.pos < this.src.length && WHITESPACE.has(this.src[this.pos])) this.pos++
    }

    /**
     * @param message описание ошибки.
     * @returns `TustenError` с шаблоном и позицией.
     */
    private error(message: string): TustenError {
        return new TustenError(`Invalid i18n template "${this.src}": ${message} (at ${this.pos})`)
    }
}

/** Лимит кэша разобранных шаблонов: защита от роста памяти, если шаблоны строятся из данных. */
const COMPILED_CACHE_LIMIT = 500
const compiled = new Map<string, Node[]>()

/**
 * Разбирает шаблон с кэшем. Ошибки не кэшируются.
 *
 * @param src строка шаблона.
 * @returns дерево узлов.
 */
function compile(src: string): Node[] {
    let nodes = compiled.get(src)
    if (!nodes) {
        nodes = new Parser(src).parse()
        if (compiled.size >= COMPILED_CACHE_LIMIT) compiled.clear()
        compiled.set(src, nodes)
    }
    return nodes
}

const pluralRulesCache = new Map<string, Intl.PluralRules>()
const numberFormatCache = new Map<string, Intl.NumberFormat>()

/**
 * @param locale язык или `undefined` (тогда — локаль среды выполнения).
 * @returns кэшированный `Intl.PluralRules`.
 */
function pluralRulesFor(locale: string | undefined): Intl.PluralRules {
    const key = locale ?? ''
    let rules = pluralRulesCache.get(key)
    if (!rules) {
        rules = new Intl.PluralRules(locale)
        pluralRulesCache.set(key, rules)
    }
    return rules
}

/**
 * @param n число.
 * @param locale язык для разделителя разрядов.
 * @returns число, отформатированное по правилам языка (`#` в формах plural).
 */
function formatNumber(n: number, locale: string | undefined): string {
    const key = locale ?? ''
    let fmt = numberFormatCache.get(key)
    if (!fmt) {
        fmt = new Intl.NumberFormat(locale)
        numberFormatCache.set(key, fmt)
    }
    return fmt.format(n)
}

/**
 * Читает собственный параметр. `null` и `undefined` считаются отсутствием:
 * плейсхолдер остаётся как есть.
 *
 * @param params параметры.
 * @param name имя.
 * @returns значение или `undefined`.
 */
function lookup(params: TemplateParams, name: string): unknown {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return undefined
    return params[name] ?? undefined
}

/**
 * Приводит значение аргумента plural к конечному числу.
 *
 * @param value значение параметра.
 * @returns число или `undefined`, если значение не число.
 */
function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value)
        return Number.isFinite(n) ? n : undefined
    }
    return undefined
}

/**
 * Рендерит дерево узлов.
 *
 * @param nodes узлы.
 * @param params параметры шаблона.
 * @param locale язык для plural и форматирования чисел.
 * @param hash значение для `#` (внутри формы plural).
 * @returns строка.
 */
function render(nodes: Node[], params: TemplateParams, locale: string | undefined, hash?: number): string {
    let out = ''
    for (const node of nodes) {
        switch (node.kind) {
            case 'text':
                out += node.value
                break
            case 'hash':
                out += hash === undefined ? '#' : formatNumber(hash, locale)
                break
            case 'arg': {
                const value = lookup(params, node.name)
                out += value === undefined ? node.raw : String(value)
                break
            }
            case 'plural': {
                const n = toNumber(lookup(params, node.name))
                if (n === undefined) {
                    out += node.raw
                    break
                }
                // Точное совпадение важнее категории: `=0` должно побеждать `few`/`many`.
                const body =
                    node.exact.get(n) ??
                    node.categories.get(pluralRulesFor(locale).select(n) as PluralCategory) ??
                    node.categories.get('other')!
                out += render(body, params, locale, n)
                break
            }
        }
    }
    return out
}

/**
 * Подставляет параметры и выбирает формы plural.
 *
 * Строка без `{`, `}` и `\` возвращается как есть — типичный случай для
 * непереведённых ключей и почти всех строк, поэтому разбор не запускается.
 *
 * @param str строка (обычно результат `rk(...)`).
 * @param params параметры подстановки.
 * @param locale язык; по умолчанию текущий (`getLocale()`).
 * @returns строка с подстановками.
 * @throws {TustenError} если шаблон синтаксически некорректен.
 */
export function template(str: string, params: TemplateParams = {}, locale: string | undefined = getLocale()): string {
    if (!/[{}\\]/.test(str)) return str
    return render(compile(str), params, locale)
}
