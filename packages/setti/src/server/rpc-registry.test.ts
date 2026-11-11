import { describe, expect, it } from 'vitest'
import { RpcRegistry } from './rpc-registry'
import { SettiError } from '../errors'
import type { RpcObjectDefinition } from '../types'

/**
 * Фабрика объекта БЛ с дефолтами.
 *
 * @param partial обязательные поля + override.
 * @returns полный объект.
 */
function makeObject(partial: Partial<RpcObjectDefinition> & { name: string }): RpcObjectDefinition {
    return {
        methods: {
            Ping: { handler: async () => ({ ok: true }) },
        },
        ...partial,
    }
}

describe('RpcRegistry', () => {
    describe('add', () => {
        it('регистрирует объект и методы', () => {
            const reg = new RpcRegistry()
            reg.add(makeObject({ name: 'Users' }))
            expect(reg.size).toBe(1)
            expect(reg.listMethods()).toContain('Users.Ping')
        })

        it('бросает на невалидном имени объекта', () => {
            const reg = new RpcRegistry()
            expect(() => reg.add(makeObject({ name: '1bad' }))).toThrow(SettiError)
            expect(() => reg.add(makeObject({ name: 'bad-name' }))).toThrow(/Invalid RPC object name/)
        })

        it('бросает на дубле объекта', () => {
            const reg = new RpcRegistry()
            reg.add(makeObject({ name: 'Users' }))
            expect(() => reg.add(makeObject({ name: 'Users' }))).toThrow(/Duplicate RPC object "Users"/)
        })

        it('бросает на невалидном имени метода', () => {
            const reg = new RpcRegistry()
            expect(() =>
                reg.add(
                    makeObject({
                        name: 'Users',
                        methods: {
                            '1bad': { handler: async () => null },
                        },
                    }),
                ),
            ).toThrow(/Invalid RPC method name/)
        })

        it('бросает на не-функции в handler', () => {
            const reg = new RpcRegistry()
            expect(() =>
                reg.add(
                    makeObject({
                        name: 'Users',
                        methods: {
                            Ping: { handler: 'not a function' as never },
                        },
                    }),
                ),
            ).toThrow(/handler is not a function/)
        })

        it('разные объекты с одинаковым именем метода — ок', () => {
            const reg = new RpcRegistry()
            reg.add(makeObject({ name: 'Users' }))
            reg.add(makeObject({ name: 'Staff' }))
            expect(reg.size).toBe(2)
        })

        it('валидирует все методы до регистрации (атомарность)', () => {
            const reg = new RpcRegistry()
            const badObj = makeObject({
                name: 'Users',
                methods: {
                    Good: { handler: async () => null },
                    '1bad': { handler: async () => null },
                },
            })
            expect(() => reg.add(badObj)).toThrow()
            expect(reg.size).toBe(0)
            expect(reg.get('Users')).toBeUndefined()
            expect(reg.getMethod('Users.Good')).toBeUndefined()
        })
    })

    describe('get / getMethod', () => {
        it('возвращает объект по имени', () => {
            const reg = new RpcRegistry()
            const obj = makeObject({ name: 'Users' })
            reg.add(obj)
            expect(reg.get('Users')).toBe(obj)
        })

        it('возвращает undefined на неизвестный объект', () => {
            const reg = new RpcRegistry()
            expect(reg.get('Nope')).toBeUndefined()
        })

        it('возвращает метод по полному имени', () => {
            const reg = new RpcRegistry()
            reg.add(makeObject({ name: 'Users' }))
            const m = reg.getMethod('Users.Ping')
            expect(m).toBeDefined()
            expect(m?.fullName).toBe('Users.Ping')
            expect(m?.methodName).toBe('Ping')
            expect(m?.object.name).toBe('Users')
        })

        it('возвращает undefined на неизвестный метод', () => {
            const reg = new RpcRegistry()
            expect(reg.getMethod('Users.Nope')).toBeUndefined()
            expect(reg.getMethod('No.Ping')).toBeUndefined()
        })
    })

    describe('describe', () => {
        it('возвращает объекты с методами', () => {
            const reg = new RpcRegistry()
            reg.add(
                makeObject({
                    name: 'Users',
                    description: 'Пользователи',
                    methods: {
                        List: { description: 'Список', handler: async () => [] },
                        Read: { auth: true, handler: async () => null },
                    },
                }),
            )

            const desc = reg.describe()
            expect(desc.objects).toHaveLength(1)
            expect(desc.objects[0].name).toBe('Users')
            expect(desc.objects[0].description).toBe('Пользователи')
            expect(desc.objects[0].methods).toHaveLength(2)

            const list = desc.objects[0].methods.find((m) => m.name === 'List')
            expect(list?.auth).toBe('public')
            expect(list?.hasParams).toBe(false)

            const read = desc.objects[0].methods.find((m) => m.name === 'Read')
            expect(read?.auth).toBe('user')
        })

        it('описывает roles', () => {
            const reg = new RpcRegistry()
            reg.add(
                makeObject({
                    name: 'Admin',
                    methods: {
                        Secret: {
                            auth: { roles: ['admin', 'super'] },
                            handler: async () => null,
                        },
                    },
                }),
            )
            const desc = reg.describe()
            expect(desc.objects[0].methods[0].auth).toEqual({
                roles: ['admin', 'super'],
            })
        })

        it('описывает internal', () => {
            const reg = new RpcRegistry()
            reg.add(
                makeObject({
                    name: 'Users',
                    methods: {
                        Internal: { internal: true, handler: async () => null },
                    },
                }),
            )
            const desc = reg.describe()
            expect(desc.objects[0].methods[0].internal).toBe(true)
        })

        it('пустой реестр — пустой objects', () => {
            const reg = new RpcRegistry()
            expect(reg.describe().objects).toEqual([])
        })
    })

    describe('listMethods / listObjects / size', () => {
        it('listMethods возвращает все полные имена', () => {
            const reg = new RpcRegistry()
            reg.add(
                makeObject({
                    name: 'Users',
                    methods: {
                        Ping: { handler: async () => null },
                        Pong: { handler: async () => null },
                    },
                }),
            )
            reg.add(makeObject({ name: 'Staff' }))
            const methods = reg.listMethods()
            expect(methods).toContain('Users.Ping')
            expect(methods).toContain('Users.Pong')
            expect(methods).toContain('Staff.Ping')
        })

        it('listObjects возвращает все объекты', () => {
            const reg = new RpcRegistry()
            reg.add(makeObject({ name: 'A' }))
            reg.add(makeObject({ name: 'B' }))
            const objs = reg.listObjects()
            expect(objs).toHaveLength(2)
            expect(objs.map((o) => o.name).sort()).toEqual(['A', 'B'])
        })

        it('size — количество объектов', () => {
            const reg = new RpcRegistry()
            expect(reg.size).toBe(0)
            reg.add(makeObject({ name: 'A' }))
            expect(reg.size).toBe(1)
            reg.add(makeObject({ name: 'B' }))
            expect(reg.size).toBe(2)
        })
    })
})
