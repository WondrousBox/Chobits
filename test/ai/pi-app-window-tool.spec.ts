import { describe, expect, it, vi } from 'vitest';

vi.mock('@aim-packages/window-manager', () => ({
  windowManager: {
    createOrShow: vi.fn(),
    get: vi.fn()
  }
}));

vi.mock('../../electron/main/handlers/window-events', () => ({
  attachAppWindowClosedReporter: vi.fn(),
  emitAppWindowOpened: vi.fn(),
  rememberWindowPayload: vi.fn()
}));

import { INITIAL_ACTIVE_SESSION_TOOL_IDS, listPiToolDescriptors, resolvePiToolId } from '../../packages/ai/runtime/pi/tool-registry';
import { searchToolbox } from '../../packages/ai/runtime/pi/toolbox';
import { createPiAppWindowTool } from '../../packages/ai/runtime/pi/tools/app-window';

function createToolContext(): any {
  return {
    chatRepo: {},
    conversationId: 'conversation-1',
    pushCardToWindows: vi.fn(),
    reportProgress: vi.fn(),
    resolved: {
      model: {
        providerId: 'minimax',
        presetId: 'preset-minimax'
      },
      request: {
        extras: {
          workspaceId: 'workspace-1'
        }
      }
    },
    resourcesRepo: {},
    targetWindowId: 42
  } as any;
}

describe('appWindowTool', () => {
  it('is registered and discoverable through toolbox search', () => {
    expect(resolvePiToolId('appWindowTool')).toBe('app-window');
    expect(listPiToolDescriptors().some((tool) => tool.id === 'app-window')).toBe(true);
    expect(INITIAL_ACTIVE_SESSION_TOOL_IDS).not.toContain('app-window');

    const results = searchToolbox('打开设置');
    expect(results.some((skill) => skill.name === '应用窗口' && skill.tools.includes('appWindowTool'))).toBe(true);

    const previewResults = searchToolbox('预览资源');
    expect(previewResults.some((skill) => skill.tools.includes('appWindowTool'))).toBe(true);
    expect(previewResults.some((skill) => skill.name === '资源查询与推送' && skill.tools.includes('resourceQueryTool') && skill.tools.includes('appWindowTool'))).toBe(true);
  });

  it('lists allowlisted app windows with payload field summaries', async () => {
    const openWindow = vi.fn();
    const tool = createPiAppWindowTool(createToolContext(), { openWindow });

    const result = await tool.execute('call-app-window-list', { action: 'list' });
    const details = result.details as any;

    expect(details.success).toBe(true);
    expect(details.total).toBeGreaterThan(0);
    expect(details.windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'settings', title: '设置' }),
        expect.objectContaining({ key: 'resources', title: '资源库' }),
        expect.objectContaining({ key: 'assistantMini', title: '迷你助手输入框' })
      ])
    );
    expect(details.windows.find((window: any) => window.key === 'settings').payloadFields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'category' })]));
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('searches app windows by title, alias, and description', async () => {
    const tool = createPiAppWindowTool(createToolContext(), { openWindow: vi.fn() });

    const result = await tool.execute('call-app-window-search', { action: 'search', query: 'AI 设置' });
    const details = result.details as any;

    expect(details.success).toBe(true);
    expect(details.results).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'settings' })]));

    const previewResult = await tool.execute('call-app-window-search-preview', { action: 'search', query: '打开这个视频资源' });
    const previewDetails = previewResult.details as any;
    expect(previewDetails.success).toBe(true);
    expect(previewDetails.results).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'resourcePreview' })]));
  });

  it('opens an allowlisted window with sanitized payload', async () => {
    const openWindow = vi.fn(async () => undefined);
    const tool = createPiAppWindowTool(createToolContext(), { openWindow });

    const result = await tool.execute('call-app-window-open', {
      action: 'open',
      payload: {
        aiProviderId: 'openai',
        category: 'ai',
        tab: 'provider',
        unknown: true
      },
      windowKey: 'settings'
    });
    const details = result.details as any;

    expect(openWindow).toHaveBeenCalledWith('settings', {
      aiProviderId: 'openai',
      category: 'ai',
      tab: 'provider'
    });
    expect(details).toMatchObject({
      payload: {
        aiProviderId: 'openai',
        category: 'ai',
        tab: 'provider'
      },
      payloadAccepted: true,
      success: true,
      windowKey: 'settings'
    });
  });

  it('drops invalid payload fields before opening', async () => {
    const openWindow = vi.fn(async () => undefined);
    const tool = createPiAppWindowTool(createToolContext(), { openWindow });

    const result = await tool.execute('call-app-window-open-invalid-payload', {
      action: 'open',
      payload: {
        category: 'internal-debug',
        unknown: true
      },
      windowKey: 'settings'
    });
    const details = result.details as any;

    expect(openWindow).toHaveBeenCalledWith('settings', undefined);
    expect(details).toMatchObject({
      payloadAccepted: false,
      payloadDropped: true,
      success: true,
      windowKey: 'settings'
    });
  });

  it('rejects internal or unlisted windows', async () => {
    const openWindow = vi.fn(async () => undefined);
    const tool = createPiAppWindowTool(createToolContext(), { openWindow });

    const result = await tool.execute('call-app-window-denied', {
      action: 'open',
      windowKey: 'spriteEffect'
    });
    const details = result.details as any;

    expect(openWindow).not.toHaveBeenCalled();
    expect(details.success).toBe(false);
    expect(details.error).toContain('not allowlisted');
    expect(details.allowedWindowKeys).toContain('settings');
    expect(details.allowedWindowKeys).not.toContain('spriteEffect');
  });
});
