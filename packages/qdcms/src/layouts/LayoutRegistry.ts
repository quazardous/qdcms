import { reactive } from 'vue'
import type { Component } from 'vue'
import type { LayoutDefinition } from '../types'

/**
 * Holds named layouts. A layout is a Vue component that exposes named regions
 * via `<Region name="..." />` — plus an optional list of declared region names
 * for dev-time validation.
 */
export class LayoutRegistry {
  private layouts = reactive(new Map<string, LayoutDefinition>())

  /**
   * Register a layout. Accepts either a full {@link LayoutDefinition} or a
   * Component (with optional `regions` array).
   *
   * Discriminator: if `regions` (3rd arg) is provided OR the second arg has
   * both `component` and `regions` keys, we use the corresponding form.
   */
  register(
    name: string,
    defOrComponent: LayoutDefinition | Component,
    regions?: string[]
  ): this {
    let def: LayoutDefinition
    if (regions !== undefined) {
      def = { component: defOrComponent as Component, regions }
    } else if (isLayoutDefinition(defOrComponent)) {
      def = defOrComponent
    } else {
      def = { component: defOrComponent as Component, regions: [] }
    }
    this.layouts.set(name, def)
    return this
  }

  get(name: string): LayoutDefinition | undefined {
    return this.layouts.get(name)
  }

  has(name: string): boolean {
    return this.layouts.has(name)
  }

  names(): string[] {
    return Array.from(this.layouts.keys())
  }

  /**
   * Returns true if the layout declares the region. Returns true also when the
   * layout has no declared regions (no validation possible — opt-in).
   */
  exposesRegion(layoutName: string, region: string): boolean {
    const def = this.layouts.get(layoutName)
    if (!def) return false
    if (def.regions.length === 0) return true
    return def.regions.includes(region)
  }
}

function isLayoutDefinition(x: unknown): x is LayoutDefinition {
  return (
    typeof x === 'object' &&
    x !== null &&
    'component' in x &&
    'regions' in x &&
    Array.isArray((x as LayoutDefinition).regions)
  )
}
