import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    }
  };
}

describe('selectChatDefaultsForProvider', () => {
  let env: ReturnType<typeof installMiniDom>;
  let previousLocalStorage: Storage | undefined;

  beforeEach(() => {
    previousLocalStorage = (globalThis as any).localStorage;
    env = installMiniDom();
    const localStorage = createLocalStorage();
    (env.window as any).localStorage = localStorage;
    (globalThis as any).localStorage = localStorage;
  });

  afterEach(() => {
    env.cleanup();
    if (previousLocalStorage) {
      (globalThis as any).localStorage = previousLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
    vi.resetModules();
  });

  it('selects the first chat-capable model from the configured provider preset', async () => {
    const getProviders = vi.fn(async () => []);
    const listModels = vi.fn(async () => [
      { id: 'music-2.6', type: 'text2music' },
      { id: 'MiniMax-M2.7', type: 'chat' },
      { id: 'MiniMax-M2.7-highspeed', type: 'chat' }
    ]);
    (env.window as any).YUA = { ai: { getProviders, listModels } };

    const { selectChatDefaultsForProvider } = await import('../src/lib/chat-selection-defaults');
    const result = await selectChatDefaultsForProvider({
      providerId: 'minimax',
      presetId: 'preset-minimax',
      provider: { id: 'minimax', defaultModels: { chat: 'MiniMax-M2.7-highspeed' } }
    });

    expect(result).toEqual({ providerId: 'minimax', presetId: 'preset-minimax', modelId: 'MiniMax-M2.7' });
    expect(listModels).toHaveBeenCalledWith('minimax', 'preset-minimax');
    expect(localStorage.getItem('chat.sel.providerId')).toBe('minimax');
    expect(localStorage.getItem('chat.sel.presetId')).toBe('preset-minimax');
    expect(localStorage.getItem('chat.sel.modelId')).toBe('MiniMax-M2.7');
  });

  it('falls back to provider default chat model when no model list is available', async () => {
    const getProviders = vi.fn(async () => [{ id: 'openai', defaultModels: { chat: 'gpt-4o-mini' } }]);
    const listModels = vi.fn(async () => []);
    (env.window as any).YUA = { ai: { getProviders, listModels } };

    const { selectChatDefaultsForProvider } = await import('../src/lib/chat-selection-defaults');
    const result = await selectChatDefaultsForProvider({ providerId: 'openai' });

    expect(result).toEqual({ providerId: 'openai', modelId: 'gpt-4o-mini' });
    expect(localStorage.getItem('chat.sel.providerId')).toBe('openai');
    expect(localStorage.getItem('chat.sel.presetId')).toBeNull();
    expect(localStorage.getItem('chat.sel.modelId')).toBe('gpt-4o-mini');
  });
});
