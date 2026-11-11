import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as devalueParse } from 'devalue'
import { serializeState, stringifyState } from './serialize'
import type { SerializedState } from './serialize'

/** Временный корень — создаётся в `beforeAll`, удаляется в `afterAll`. */
let tmpRoot: string
let clientDir: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'setti-serialize-'))
    clientDir = join(tmpRoot, 'client')

    // Создать файлы, которые будут искать тесты.
    const files = ['HomePage/Factories/usersList.ts', 'User/loaders/userInfo.ts', 'A.ts', 'B.ts']
    for (const rel of files) {
        const abs = join(clientDir, rel)
        await mkdir(join(abs, '..'), { recursive: true })
        await writeFile(abs, 'export const x = 1')
    }
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

describe('serializeState', () => {
    it('пустая карта — version 1, slices {}', async () => {
        const result = await serializeState(new Map(), tmpRoot, clientDir)
        expect(result).toEqual({ version: 1, slices: {} })
    })

    it('сериализует простой слайс', async () => {
        const slices = new Map([
            [
                'users',
                {
                    dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
                    state: [{ id: 1 }],
                    scope: 'page' as const,
                },
            ],
        ])
        const result = await serializeState(slices, tmpRoot, clientDir)
        expect(result.slices.users).toEqual({
            modulePath: '/client/HomePage/Factories/usersList.ts',
            exportName: 'UserListLoader',
            state: [{ id: 1 }],
            scope: 'page',
        })
    })

    it('глобальный слайс — scope: global', async () => {
        const slices = new Map([
            [
                'userInfo',
                {
                    dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
                    state: { id: 1 },
                    scope: 'global' as const,
                },
            ],
        ])
        const result = await serializeState(slices, tmpRoot, clientDir)
        expect(result.slices.userInfo.scope).toBe('global')
    })

    it('несколько слайсов', async () => {
        const slices = new Map([
            ['a', { dataFactoryName: 'A:LoaderA', state: 1, scope: 'page' as const }],
            ['b', { dataFactoryName: 'B:LoaderB', state: 2, scope: 'global' as const }],
        ])
        const result = await serializeState(slices, tmpRoot, clientDir)
        expect(Object.keys(result.slices).sort()).toEqual(['a', 'b'])
    })
})

describe('stringifyState — devalue roundtrip', () => {
    /**
     * Roundtrip: `stringifyState` → `devalue.parse` → сравнить с исходным.
     *
     * Не зависит от внутреннего формата devalue (`\u003C`, `-1`, `-3` и т.д.).
     *
     * @param state исходное состояние.
     * @returns восстановленное состояние.
     */
    function roundtrip(state: SerializedState): SerializedState {
        return devalueParse(stringifyState(state)) as SerializedState
    }

    it('plain object', () => {
        const state: SerializedState = { version: 1, slices: {} }
        expect(roundtrip(state)).toEqual(state)
    })

    it('экранирует < (внутри строки)', () => {
        const state: SerializedState = {
            version: 1,
            slices: {
                x: { modulePath: '<script>', exportName: 'y', state: null, scope: 'page' },
            },
        }
        const str = stringifyState(state)
        // devalue кодирует `<` как `\u003C` (заглавная C)
        expect(str).not.toContain('<')
        expect(str.toLowerCase()).toContain('\\u003c')
        // И roundtrip восстанавливает оригинал
        expect(roundtrip(state)).toEqual(state)
    })

    it('Map roundtrip', () => {
        const state: SerializedState = {
            version: 1,
            slices: {
                u: { modulePath: '/u', exportName: 'U', state: new Map([['a', 1]]), scope: 'page' },
            },
        }
        const parsed = roundtrip(state)
        expect(parsed.slices.u.state).toBeInstanceOf(Map)
        expect((parsed.slices.u.state as Map<string, number>).get('a')).toBe(1)
    })

    it('Date roundtrip', () => {
        const date = new Date('2024-01-01T00:00:00.000Z')
        const state: SerializedState = {
            version: 1,
            slices: { d: { modulePath: '/d', exportName: 'D', state: date, scope: 'page' } },
        }
        const parsed = roundtrip(state)
        expect(parsed.slices.d.state).toBeInstanceOf(Date)
        expect((parsed.slices.d.state as Date).getTime()).toBe(date.getTime())
    })

    it('undefined roundtrip', () => {
        const state: SerializedState = {
            version: 1,
            slices: { u: { modulePath: '/u', exportName: 'U', state: undefined, scope: 'page' } },
        }
        expect(roundtrip(state).slices.u.state).toBeUndefined()
    })

    it('BigInt roundtrip', () => {
        const state: SerializedState = {
            version: 1,
            slices: { b: { modulePath: '/b', exportName: 'B', state: 123n, scope: 'page' } },
        }
        expect(roundtrip(state).slices.b.state).toBe(123n)
    })

    it('NaN и Infinity roundtrip', () => {
        const state: SerializedState = {
            version: 1,
            slices: {
                n: { modulePath: '/n', exportName: 'N', state: NaN, scope: 'page' },
                i: { modulePath: '/i', exportName: 'I', state: Infinity, scope: 'page' },
            },
        }
        const parsed = roundtrip(state)
        expect(Number.isNaN(parsed.slices.n.state)).toBe(true)
        expect(parsed.slices.i.state).toBe(Infinity)
    })

    it('Set roundtrip', () => {
        const state: SerializedState = {
            version: 1,
            slices: {
                s: { modulePath: '/s', exportName: 'S', state: new Set([1, 2]), scope: 'page' },
            },
        }
        const parsed = roundtrip(state)
        expect(parsed.slices.s.state).toBeInstanceOf(Set)
        expect([...(parsed.slices.s.state as Set<number>)]).toEqual([1, 2])
    })

    it('циклическая ссылка', () => {
        const cyclic: Record<string, unknown> = { name: 'x' }
        cyclic.self = cyclic
        const state: SerializedState = {
            version: 1,
            slices: { c: { modulePath: '/c', exportName: 'C', state: cyclic, scope: 'page' } },
        }
        const parsed = roundtrip(state)
        const c = parsed.slices.c.state as Record<string, unknown>
        expect(c.name).toBe('x')
        expect(c.self).toBe(c)
    })
})

describe('stringifyState — ошибки', () => {
    it('бросает на функции в state', () => {
        const state: SerializedState = {
            version: 1,
            slices: {
                f: { modulePath: '/f', exportName: 'F', state: { fn: () => 1 }, scope: 'page' },
            },
        }
        expect(() => stringifyState(state)).toThrow(/Cannot stringify|Failed to serialize/)
    })
})
