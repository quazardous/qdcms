import { reactive } from 'vue'
import type { Placement } from '../types'

/**
 * Holds placement rules. Reactive so the page recomposes on registration.
 *
 * Each registry has its own auto-id counter — no module-level shared state.
 */
export class PlacementRegistry {
  private placements = reactive<Placement[]>([])
  private nextAutoId = 1

  /**
   * Add a placement. The input object is **not mutated** — a normalized copy
   * is stored (id and weight defaults applied).
   */
  add(placement: Placement): this {
    const stored: Placement = {
      ...placement,
      id: placement.id ?? `pl-${this.nextAutoId++}`,
      weight: placement.weight ?? 0,
    }
    this.placements.push(stored)
    return this
  }

  remove(id: string): boolean {
    const idx = this.placements.findIndex((p) => p.id === id)
    if (idx === -1) return false
    this.placements.splice(idx, 1)
    return true
  }

  forBlock(blockName: string): Placement[] {
    return this.placements.filter((p) => p.block === blockName)
  }

  all(): readonly Placement[] {
    return this.placements
  }

  clear(): void {
    this.placements.splice(0)
  }
}
