import { describe, expect, it, vi } from 'vitest';

import { installMiniDom } from '../utils/minidom';

vi.mock('../../src/pages/SettingsPage/components/PreferencesSettings', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'Preferences Stub')
  };
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsPage payload handling', () => {
  it('focuses the AI provider settings when an existing settings window receives a payload', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: SettingsPage } = await import('../../src/pages/SettingsPage/SettingsPage');

    const env = installMiniDom();
    (env.window as any).innerWidth = 1200;
    (env.window as any).matchMedia = vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn()
    }));

    const ipcListeners = new Map<string, any>();
    (env.window as any).ipcRenderer = {
      on: vi.fn((event: string, listener: any) => {
        ipcListeners.set(event, listener);
      }),
      off: vi.fn((event: string, listener: any) => {
        if (ipcListeners.get(event) === listener) ipcListeners.delete(event);
      })
    };
    (env.window as any).YUA = {
      ai: {
        getProviders: vi.fn(async () => [
          { id: 'openai', label: 'OpenAI', configured: false, capabilities: { chat: true }, schema: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] } }
        ]),
        listModels: vi.fn(async () => []),
        listPresets: vi.fn(async () => [{ id: 'preset-openai', providerId: 'openai', name: 'OpenAI' }]),
        getPresetSecrets: vi.fn(async () => ({}))
      },
      window: {
        'window:payload:get': vi.fn(async () => ({ category: 'preferences' }))
      }
    };

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<SettingsPage hideTitleBar />);
      await flushPromises();
    });

    expect(env.container.textContent).toContain('偏好设置');

    await act(async () => {
      ipcListeners.get('on:window:open:ready')?.(null, { category: 'ai', tab: 'provider', aiProviderId: 'openai', aiPresetId: 'preset-openai', fields: ['apiKey'] });
      await flushPromises();
    });

    expect(env.container.textContent).toContain('对话设置');
    expect(env.container.textContent).toContain('OpenAI');
    expect(env.container.textContent).toContain('编辑预设 · OpenAI');
    expect((env.window as any).YUA.ai.listPresets).toHaveBeenCalledWith('openai');
    expect((env.window as any).YUA.ai.getPresetSecrets).toHaveBeenCalledWith('preset-openai');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});
