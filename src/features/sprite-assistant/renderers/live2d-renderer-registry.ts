import type { SpritePresentationConfig } from '@packages/sprite-core/types';
import { type ComponentType, useSyncExternalStore } from 'react';

import type { SpriteRendererProps } from '.';

type Live2DPresentation = Extract<SpritePresentationConfig, { renderer: 'live2d' }>;

export type Live2DRendererComponent = ComponentType<
  SpriteRendererProps & {
    presentation: Live2DPresentation;
  }
>;

let registeredRenderer: Live2DRendererComponent | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Live2DRendererComponent | null {
  return registeredRenderer;
}

export function registerLive2DRenderer(component: Live2DRendererComponent): () => void {
  registeredRenderer = component;
  emitChange();
  return () => {
    if (registeredRenderer !== component) return;
    registeredRenderer = null;
    emitChange();
  };
}

export function useRegisteredLive2DRenderer(): Live2DRendererComponent | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
