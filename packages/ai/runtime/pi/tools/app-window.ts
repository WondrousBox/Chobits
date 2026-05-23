import type { WindowKey } from '@aim-packages/window-manager';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { AppEvent, eventManager } from '@packages/event';
import { type Static, Type } from '@sinclair/typebox';

import { getAppWindowToolEntry, listAppWindowSummaries, sanitizeAppWindowPayload, searchAppWindowSummaries } from '../app-window-directory';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

type Payload = Record<string, unknown>;

const appWindowParameters = Type.Object({
  action: Type.Union([Type.Literal('list'), Type.Literal('search'), Type.Literal('open')], {
    description: 'list=列出允许 AI 打开的应用窗口, search=按打开/预览/查看等意图搜索窗口能力, open=打开指定窗口'
  }),
  query: Type.Optional(Type.String({ description: 'search 时的窗口关键词或用户动作，例如 设置、打开资源库、预览资源、查看文件、播放视频、聊天、窗口动画。' })),
  windowKey: Type.Optional(Type.String({ description: 'open 时使用的窗口 key，必须来自 list/search 返回结果。' })),
  payload: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: 'open 时传给窗口的参数。未知字段会被丢弃；每个窗口只接受白名单字段。'
    })
  )
});

type AppWindowInput = Static<typeof appWindowParameters>;

export interface AppWindowToolBindings {
  openWindow?: (windowKey: WindowKey, payload?: Payload) => Promise<unknown> | unknown;
}

async function openWindowWithManager(windowKey: WindowKey, payload?: Payload): Promise<void> {
  const { windowManager } = await import('@aim-packages/window-manager');
  await windowManager.createOrShow(windowKey, payload);
  eventManager.emit(AppEvent.APP_WINDOW_OPENED, {
    ...(payload ?? {}),
    windowKey: String(windowKey),
    source: 'ai-app-window-tool'
  });
}

function normalizeWindowKey(value?: string): string | undefined {
  const key = value?.trim();
  return key || undefined;
}

function hasPayload(input: AppWindowInput): boolean {
  return input.payload !== undefined && input.payload !== null;
}

export function createPiAppWindowTool(toolContext: PiSessionToolContext, bindings: AppWindowToolBindings = {}): ToolDefinition<typeof appWindowParameters> {
  const openWindow = bindings.openWindow || openWindowWithManager;

  return {
    name: 'appWindowTool',
    label: 'appWindowTool',
    description: '列出、搜索并打开业务窗口。只能打开白名单窗口，且会在打开前清洗 payload。',
    parameters: appWindowParameters,
    async execute(toolCallId, input) {
      const { action, query } = input;

      if (action === 'list') {
        const windows = listAppWindowSummaries();
        return createJsonToolResult({
          success: true,
          total: windows.length,
          windows
        });
      }

      if (action === 'search') {
        const results = searchAppWindowSummaries(query || '');
        return createJsonToolResult({
          success: true,
          query: query || '',
          total: results.length,
          results
        });
      }

      if (action === 'open') {
        const windowKey = normalizeWindowKey(input.windowKey);
        if (!windowKey) {
          return createJsonToolResult({
            success: false,
            error: 'open action requires windowKey. Use list or search first to find an allowed window key.'
          });
        }

        const entry = getAppWindowToolEntry(windowKey);
        if (!entry) {
          return createJsonToolResult({
            success: false,
            error: `Window "${windowKey}" is not allowlisted for AI opening.`,
            hint: 'Use appWindowTool list/search and only pass a returned windowKey.',
            allowedWindowKeys: listAppWindowSummaries().map((window) => window.key)
          });
        }

        const sanitizedPayload = sanitizeAppWindowPayload(entry, input.payload);

        try {
          const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'app-window');
          if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
            return createJsonToolResult(guardResolution.details);
          }

          await openWindow(entry.key, sanitizedPayload);
          return createJsonToolResult({
            success: true,
            windowKey: String(entry.key),
            title: entry.title,
            payload: sanitizedPayload,
            payloadAccepted: Boolean(sanitizedPayload),
            payloadDropped: hasPayload(input) && !sanitizedPayload,
            ...(guardResolution?.warning ? { warning: guardResolution.warning } : {})
          });
        } catch (error: any) {
          return createJsonToolResult({
            success: false,
            error: error?.message || `Failed to open window "${windowKey}".`,
            windowKey
          });
        }
      }

      return createJsonToolResult({
        success: false,
        error: `Unknown action: ${action}`
      });
    }
  };
}
