import { describe, it, expect } from 'vitest'
import {
  matchStackLevel,
  matchStack,
  matchRoute,
  matchConditions,
} from '../matchers'
import type { CmsContext, ContentStackLevel } from '../../types'

const lvl = (
  type: string,
  name: string,
  id: string | null = null
): ContentStackLevel => ({ type, name, id })

const ctx = (overrides: Partial<CmsContext> = {}): CmsContext => ({
  stack: [],
  route: '/',
  params: {},
  query: {},
  auth: { isAuthenticated: false, roles: [] },
  ...overrides,
})

describe('matchStackLevel', () => {
  const target = lvl('item', 'event', 'spring')

  it('returns true when all defined fields match', () => {
    expect(matchStackLevel({ type: 'item' }, target)).toBe(true)
    expect(matchStackLevel({ name: 'event' }, target)).toBe(true)
    expect(matchStackLevel({ id: 'spring' }, target)).toBe(true)
    expect(matchStackLevel({ type: 'item', name: 'event' }, target)).toBe(true)
  })

  it('returns false when any defined field mismatches', () => {
    expect(matchStackLevel({ type: 'page' }, target)).toBe(false)
    expect(matchStackLevel({ name: 'court' }, target)).toBe(false)
    expect(matchStackLevel({ id: 'summer' }, target)).toBe(false)
  })

  it('empty template matches anything', () => {
    expect(matchStackLevel({}, target)).toBe(true)
  })
})

describe('matchStack', () => {
  const stack = [lvl('collection', 'events'), lvl('item', 'event', 'spring')]

  describe('empty', () => {
    it('matches an empty stack with empty:true', () => {
      expect(matchStack({ empty: true }, [])).toBe(true)
      expect(matchStack({ empty: true }, stack)).toBe(false)
    })
    it('matches a non-empty stack with empty:false', () => {
      expect(matchStack({ empty: false }, stack)).toBe(true)
      expect(matchStack({ empty: false }, [])).toBe(false)
    })
  })

  describe('depth', () => {
    it('matches exact depth', () => {
      expect(matchStack({ depth: 2 }, stack)).toBe(true)
      expect(matchStack({ depth: 1 }, stack)).toBe(false)
    })
    it('matches min/max range', () => {
      expect(matchStack({ depth: { min: 2 } }, stack)).toBe(true)
      expect(matchStack({ depth: { min: 3 } }, stack)).toBe(false)
      expect(matchStack({ depth: { max: 2 } }, stack)).toBe(true)
      expect(matchStack({ depth: { max: 1 } }, stack)).toBe(false)
      expect(matchStack({ depth: { min: 1, max: 3 } }, stack)).toBe(true)
    })
  })

  describe('top', () => {
    it('matches against the deepest level', () => {
      expect(matchStack({ top: { type: 'item' } }, stack)).toBe(true)
      expect(matchStack({ top: { name: 'event' } }, stack)).toBe(true)
      expect(matchStack({ top: { name: 'events' } }, stack)).toBe(false)
    })
    it('returns false on empty stack', () => {
      expect(matchStack({ top: { type: 'item' } }, [])).toBe(false)
    })
  })

  describe('contains', () => {
    it('matches if any level in the stack matches', () => {
      expect(matchStack({ contains: { name: 'events' } }, stack)).toBe(true)
      expect(matchStack({ contains: { name: 'event' } }, stack)).toBe(true)
      expect(matchStack({ contains: { name: 'court' } }, stack)).toBe(false)
    })
    it('returns false on empty stack', () => {
      expect(matchStack({ contains: { name: 'foo' } }, [])).toBe(false)
    })
  })

  describe('combinations (AND)', () => {
    it('all conditions must pass', () => {
      expect(
        matchStack(
          { contains: { name: 'events' }, depth: { min: 2 } },
          stack
        )
      ).toBe(true)
      expect(
        matchStack(
          { contains: { name: 'events' }, depth: { min: 3 } },
          stack
        )
      ).toBe(false)
    })
  })
})

describe('matchRoute', () => {
  it('exact string', () => {
    expect(matchRoute('/events', '/events')).toBe(true)
    expect(matchRoute('/events', '/other')).toBe(false)
  })

  it('glob with *', () => {
    expect(matchRoute('/events/*', '/events/123')).toBe(true)
    expect(matchRoute('/events/*', '/events')).toBe(false)
    expect(matchRoute('/admin/*', '/admin/users/42')).toBe(true)
  })

  it('RegExp', () => {
    expect(matchRoute(/^\/events\/\d+$/, '/events/42')).toBe(true)
    expect(matchRoute(/^\/events\/\d+$/, '/events/abc')).toBe(false)
  })

  it('array (OR)', () => {
    expect(matchRoute(['/a', '/b', '/c'], '/b')).toBe(true)
    expect(matchRoute(['/a', '/b'], '/c')).toBe(false)
  })

  it('function', () => {
    expect(matchRoute((r) => r.length > 5, '/abcdef')).toBe(true)
    expect(matchRoute((r) => r.length > 5, '/abc')).toBe(false)
  })
})

describe('matchConditions (combined dimensions)', () => {
  it('returns true when conditions is undefined', () => {
    expect(matchConditions(undefined, ctx())).toBe(true)
  })

  it('AND semantics across dimensions', () => {
    const conditions = {
      stack: { top: { name: 'events' } },
      auth: true,
    }
    expect(
      matchConditions(
        conditions,
        ctx({
          stack: [lvl('collection', 'events')],
          auth: { isAuthenticated: true, roles: [] },
        })
      )
    ).toBe(true)
    expect(
      matchConditions(
        conditions,
        ctx({
          stack: [lvl('collection', 'events')],
          auth: { isAuthenticated: false, roles: [] },
        })
      )
    ).toBe(false)
  })

  it('roles single', () => {
    const c = ctx({ auth: { isAuthenticated: true, roles: ['ROLE_USER'] } })
    expect(matchConditions({ roles: 'ROLE_USER' }, c)).toBe(true)
    expect(matchConditions({ roles: 'ROLE_ADMIN' }, c)).toBe(false)
  })

  it('roles array (OR)', () => {
    const c = ctx({ auth: { isAuthenticated: true, roles: ['ROLE_USER'] } })
    expect(matchConditions({ roles: ['ROLE_ADMIN', 'ROLE_USER'] }, c)).toBe(true)
    expect(matchConditions({ roles: ['ROLE_ADMIN'] }, c)).toBe(false)
  })

  it('roles function', () => {
    const c = ctx({ auth: { isAuthenticated: true, roles: ['A', 'B'] } })
    expect(
      matchConditions({ roles: (r) => r.includes('A') && r.includes('B') }, c)
    ).toBe(true)
  })

  it('tenant filter', () => {
    expect(matchConditions({ tenant: 'foo' }, ctx({ tenant: 'foo' }))).toBe(true)
    expect(matchConditions({ tenant: 'foo' }, ctx({ tenant: 'bar' }))).toBe(false)
    expect(matchConditions({ tenant: ['a', 'b'] }, ctx({ tenant: 'b' }))).toBe(true)
  })

  it('locale filter', () => {
    expect(matchConditions({ locale: 'fr' }, ctx({ locale: 'fr' }))).toBe(true)
    expect(matchConditions({ locale: 'fr' }, ctx({ locale: 'en' }))).toBe(false)
  })

  it('predicate runs last', () => {
    expect(matchConditions({ predicate: () => true }, ctx())).toBe(true)
    expect(matchConditions({ predicate: () => false }, ctx())).toBe(false)
  })
})
