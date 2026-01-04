type SpriteEventName = 'idle' | 'drag:start' | 'drag:end' | 'walk:start' | 'walk:end' | 'run:start' | 'run:end' | 'click' | 'drop' | 'fileDragOver' | 'fileDrop' | 'hold:start' | 'hold:end';

export interface SpriteEventPayload {
  // reserved for future metadata (e.g., speed for run/walk)
  [key: string]: any;
}

export type SpriteEvent = { type: SpriteEventName; payload?: SpriteEventPayload };
export type SpriteEventListener = (e: SpriteEvent) => void;

const listeners = new Set<SpriteEventListener>();

export function dispatchSpriteEvent(type: SpriteEventName, payload?: SpriteEventPayload): void {
  const evt: SpriteEvent = { type, payload };
  for (const l of Array.from(listeners)) {
    l(evt);
  }
}

export function subscribeSpriteEvents(listener: SpriteEventListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type { SpriteEventName };
