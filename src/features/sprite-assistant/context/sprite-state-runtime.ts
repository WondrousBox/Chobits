import type { SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot, SpriteWalkState } from '@packages/sprite-core/types';

import type { SpriteStateContextValue } from './sprite-state-context';
import { DEFAULT_SPRITE_CONFIG, mergePlayCommandIntoSpriteConfig, resolveInitialSpriteConfig, resolveWalkState } from './sprite-state-sync';

export interface SpriteStateRuntimeBridge {
  getInitialState(): Promise<SpriteInitialState>;
  ready(): Promise<void>;
  onState(cb: (data: SpriteStateSnapshot) => void): () => void;
  onPlay(cb: (data: SpritePlayCommand) => void): () => void;
  onWalk(cb: (data: SpriteWalkState) => void): () => void;
  onConfig(cb: (data: SpriteConfig) => void): () => void;
}

export function createDefaultSpriteStateContextValue(): SpriteStateContextValue {
  return {
    spriteState: 'idle',
    subState: null,
    personaState: null,
    currentAnimation: null,
    walkDirection: null,
    isWalking: false,
    spriteConfig: DEFAULT_SPRITE_CONFIG,
    ready: false
  };
}

export function applyInitialSpriteState(value: SpriteStateContextValue, initial: SpriteInitialState): SpriteStateContextValue {
  return {
    ...value,
    spriteState: initial.state ?? 'idle',
    subState: initial.subState ?? null,
    personaState: initial.personaState ?? null,
    currentAnimation: initial.currentAnimation ?? null,
    spriteConfig: resolveInitialSpriteConfig(initial),
    ready: true
  };
}

export function applySpriteStateSnapshot(value: SpriteStateContextValue, data: SpriteStateSnapshot): SpriteStateContextValue {
  return {
    ...value,
    spriteState: data.state || value.spriteState,
    subState: data.subState !== undefined ? data.subState : value.subState,
    personaState: data.personaSnapshot || value.personaState
  };
}

export function applySpritePlayCommand(value: SpriteStateContextValue, data: SpritePlayCommand): SpriteStateContextValue {
  return {
    ...value,
    currentAnimation: data,
    spriteConfig: mergePlayCommandIntoSpriteConfig(value.spriteConfig, data)
  };
}

export function applySpriteWalkState(value: SpriteStateContextValue, data: SpriteWalkState): SpriteStateContextValue {
  const next = resolveWalkState(data);
  return {
    ...value,
    isWalking: next.isWalking,
    walkDirection: next.walkDirection
  };
}

export function applySpriteConfig(value: SpriteStateContextValue, data: SpriteConfig): SpriteStateContextValue {
  return {
    ...value,
    spriteConfig: resolveInitialSpriteConfig({
      config: { ...value.spriteConfig, ...data },
      currentAnimation: value.currentAnimation
    })
  };
}

export class SpriteStateRuntimeController {
  private value = createDefaultSpriteStateContextValue();
  private cleanupFns: Array<() => void> = [];
  private disposed = false;

  constructor(
    private readonly bridge: SpriteStateRuntimeBridge,
    private readonly onChange: (value: SpriteStateContextValue) => void,
    private readonly onError?: (error: unknown) => void
  ) {}

  getSnapshot(): SpriteStateContextValue {
    return this.value;
  }

  start(): void {
    this.cleanupFns.push(
      this.bridge.onState((data) => {
        this.commit((current) => applySpriteStateSnapshot(current, data));
      })
    );

    this.cleanupFns.push(
      this.bridge.onPlay((data) => {
        this.commit((current) => applySpritePlayCommand(current, data));
      })
    );

    this.cleanupFns.push(
      this.bridge.onWalk((data) => {
        this.commit((current) => applySpriteWalkState(current, data));
      })
    );

    this.cleanupFns.push(
      this.bridge.onConfig((data) => {
        this.commit((current) => applySpriteConfig(current, data));
      })
    );

    void this.initialize();
  }

  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanupFns.splice(0)) {
      cleanup();
    }
  }

  private async initialize(): Promise<void> {
    try {
      const initial = await this.bridge.getInitialState();
      if (this.disposed) return;

      this.commit((current) => applyInitialSpriteState(current, initial));
      await this.bridge.ready();
    } catch (error) {
      if (this.disposed) return;
      this.onError?.(error);
      this.commit((current) => ({
        ...current,
        ready: true
      }));
    }
  }

  private commit(updater: (value: SpriteStateContextValue) => SpriteStateContextValue): void {
    if (this.disposed) return;
    this.value = updater(this.value);
    this.onChange(this.value);
  }
}
