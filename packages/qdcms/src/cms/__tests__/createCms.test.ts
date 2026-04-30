import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createCms } from '../createCms'
import { ApiPageComposer, DefaultPageComposer } from '../../composer/PageComposer'
import type { ComposedPage } from '../../types'

const Stub = (name: string) =>
  defineComponent({ name, render: () => h('div', { 'data-block': name }) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createCms — registries + sugar', () => {
  it('registers blocks, layouts, placements via sugar API', () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('hero', { component: Stub('hero') })
    cms.place('hero', { region: 'main' })
    expect(cms.blocks.has('hero')).toBe(true)
    expect(cms.layouts.has('default')).toBe(true)
    expect(cms.placements.all().length).toBe(1)
  })
})

describe('createCms — sync composition', () => {
  it('composedPage reflects current placements + stack', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('hero', { component: Stub('hero') })
    cms.place('hero', {
      region: 'main',
      when: { stack: { top: { name: 'home' } } },
    })

    cms.setStack([{ type: 'page', name: 'home' }])
    await nextTick()

    expect(cms.composedPage.value).not.toBeNull()
    expect(cms.composedPage.value!.regions.main).toHaveLength(1)
    expect(cms.composedPage.value!.regions.main[0].block).toBe('hero')
  })

  it('placement excluded when stack does not match', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('hero', { component: Stub('hero') })
    cms.place('hero', {
      region: 'main',
      when: { stack: { top: { name: 'home' } } },
    })

    cms.setStack([{ type: 'collection', name: 'events' }])
    await nextTick()

    expect(cms.composedPage.value!.regions.main).toBeUndefined()
  })

  it('blocks sorted by weight ascending', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('a', { component: Stub('a') })
    cms.block('b', { component: Stub('b') })
    cms.block('c', { component: Stub('c') })
    cms.place('a', { region: 'main', weight: 100 })
    cms.place('b', { region: 'main', weight: -10 })
    cms.place('c', { region: 'main', weight: 50 })

    await nextTick()
    const order = cms.composedPage.value!.regions.main.map((b) => b.block)
    expect(order).toEqual(['b', 'c', 'a'])
  })
})

describe('createCms — props resolver', () => {
  it('static props are passed through', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('hero', { component: Stub('hero') })
    cms.place('hero', { region: 'main', props: { title: 'Hi' } })
    await nextTick()
    expect(cms.composedPage.value!.regions.main[0].props).toEqual({ title: 'Hi' })
  })

  it('callable props receive the live context', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('hero', { component: Stub('hero') })
    cms.place('hero', {
      region: 'main',
      props: (ctx) => ({ slug: ctx.stack[ctx.stack.length - 1]?.id ?? null }),
    })

    cms.setStack([{ type: 'item', name: 'event', id: 'spring' }])
    await nextTick()
    expect(cms.composedPage.value!.regions.main[0].props).toEqual({ slug: 'spring' })

    cms.setStack([{ type: 'item', name: 'event', id: 'summer' }])
    await nextTick()
    expect(cms.composedPage.value!.regions.main[0].props).toEqual({ slug: 'summer' })
  })
})

describe('createCms — async composer', () => {
  it('supports async composer (ApiPageComposer)', async () => {
    const fetcher = vi.fn(async (): Promise<ComposedPage> => {
      return { layout: 'default', regions: { main: [] } }
    })
    const cms = createCms({ composer: () => new ApiPageComposer(fetcher) })
    cms.layout('default', Stub('layout'), ['main'])

    // first immediate compose
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))

    expect(fetcher).toHaveBeenCalled()
    expect(cms.composedPage.value).not.toBeNull()
    expect(cms.composedPage.value!.layout).toBe('default')
    expect(cms.composing.value).toBe(false)
  })

  it('discards stale async results when context changes mid-flight', async () => {
    let resolveCount = 0
    const fetcher = (): Promise<ComposedPage> =>
      new Promise((resolve) => {
        const myCount = ++resolveCount
        // Slower for first call, faster for subsequent — simulates A→B→C race
        const delay = myCount === 1 ? 30 : 5
        setTimeout(
          () =>
            resolve({
              layout: 'default',
              regions: { main: [{ id: `r${myCount}`, block: 'x', component: Stub('x'), props: {}, weight: 0 }] },
            }),
          delay
        )
      })

    const cms = createCms({ composer: () => new ApiPageComposer(fetcher) })
    cms.layout('default', Stub('layout'), ['main'])

    // Trigger a navigation while the first compose is still in flight
    await nextTick()
    cms.setStack([{ type: 'page', name: 'b' }])

    // Wait for both to settle
    await new Promise((r) => setTimeout(r, 60))

    // The latest navigation should win
    const main = cms.composedPage.value!.regions.main
    expect(main[0].id).toBe('r2')
  })
})

describe('createCms — composer replacement', () => {
  it('setComposer triggers a recompose', async () => {
    const cms = createCms()
    cms.layout('default', Stub('layout'), ['main'])
    cms.block('a', { component: Stub('a') })
    cms.place('a', { region: 'main' })
    await nextTick()
    expect(cms.composedPage.value!.layout).toBe('default')

    cms.setComposer(
      new DefaultPageComposer(cms.blocks, cms.placements, {
        resolveLayout: () => 'custom',
      })
    )
    await nextTick()
    expect(cms.composedPage.value!.layout).toBe('custom')
  })
})
