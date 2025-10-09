import type { SpriteAnimation } from '@/types/sprite'

export class SpriteRegistry {
  private idToAnimation: Map<string, SpriteAnimation> = new Map()

  register(...anims: SpriteAnimation[]) {
    anims.forEach(a => this.idToAnimation.set(a.meta.id, a))
  }

  unregister(id: string) {
    this.idToAnimation.delete(id)
  }

  get(id: string): SpriteAnimation | undefined {
    return this.idToAnimation.get(id)
  }

  list(): SpriteAnimation[] {
    return Array.from(this.idToAnimation.values())
  }
}

export const spriteRegistry = new SpriteRegistry()


