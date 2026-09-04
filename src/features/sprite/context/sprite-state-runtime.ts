import type { SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot, SpriteWalkState } from '@packages/sprite-core/types';

import type { SpriteStateContextValue } from './sprite-state-context';
import { DEFAULT_SPRITE_CONFIG, mergePlayCommandIntoSpriteConfig, resolveInitialSpriteConfig, resolveWalkState } from './sprite-state-sync';

const INITIAL_STATE_RETRY_DELAYS_MS = [0, 250, 500, 1000, 2000, 5000, 10000] as const;
const READY_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 5000, 10000] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
    characterState: null,
    currentAnimation: null,
    walkDirection: null,
    isWalking: false,
    isDragging: false,
    spriteConfig: DEFAULT_SPRITE_CONFIG,
    ready: false
  };
}

export function applyInitialSpriteState(value: SpriteStateContextValue, initial: SpriteInitialState): SpriteStateContextValue {
  return {
    ...value,
    spriteState: initial.state ?? 'idle',
    subState: initial.subState ?? null,
    characterState: initial.characterState ?? null,
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
    characterState: data.characterState || value.characterState
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
    let lastError: unknown;

    for (let attemptIndex = 0; attemptIndex < INITIAL_STATE_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = INITIAL_STATE_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        await delay(delayMs);
      }
      if (this.disposed) return;

      try {
        const initial = await this.bridge.getInitialState();
        if (this.disposed) return;

        this.commit((current) => applyInitialSpriteState(current, initial));
        await this.notifyReady();
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (this.disposed) return;
    this.onError?.(lastError);
    this.commit((current) => ({
      ...current,
      ready: true
    }));
    await this.notifyReady();
  }

  private async notifyReady(): Promise<void> {
    let lastError: unknown;

    for (let attemptIndex = 0; attemptIndex < READY_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const delayMs = READY_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs > 0) {
        await delay(delayMs);
      }
      if (this.disposed) return;

      try {
        await this.bridge.ready();
        return;
      } catch (error) {
        lastError = error;
      }
    }

    this.onError?.(lastError);
  }

  private commit(updater: (value: SpriteStateContextValue) => SpriteStateContextValue): void {
    if (this.disposed) return;
    this.value = updater(this.value);
    this.onChange(this.value);
  }
}
