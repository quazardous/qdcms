import { reactive } from 'vue'
import type { BlockDefinition } from '../types'

/**
 * Holds block definitions by name. Reactive so that PageRenderer recomputes
 * when blocks are registered/unregistered at runtime.
 */
export class BlockRegistry {
  private blocks = reactive(new Map<string, BlockDefinition>())

  register(name: string, def: BlockDefinition): this {
    if (this.blocks.has(name)) {
      console.warn(`[qdcms] block "${name}" already registered, overwriting`)
    }
    this.blocks.set(name, def)
    return this
  }

  unregister(name: string): boolean {
    return this.blocks.delete(name)
  }

  get(name: string): BlockDefinition | undefined {
    return this.blocks.get(name)
  }

  has(name: string): boolean {
    return this.blocks.has(name)
  }

  names(): string[] {
    return Array.from(this.blocks.keys())
  }

  all(): ReadonlyMap<string, BlockDefinition> {
    return this.blocks
  }
}
