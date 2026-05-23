import type { ToolCallDisplay } from '../../../types';

export type PiChatDisplayToolConfig = {
  chatDisplay?: ToolCallDisplay;
};

export const PI_HIDDEN_TOOL_DISPLAY = { mode: 'hidden' } satisfies ToolCallDisplay;
export const PI_CONTENT_ONLY_TOOL_DISPLAY = { mode: 'content-only' } satisfies ToolCallDisplay;

const TOOL_CHAT_DISPLAY_FALLBACKS: Record<string, ToolCallDisplay> = {
  'emoji-send': PI_CONTENT_ONLY_TOOL_DISPLAY,
  emojiSendTool: PI_CONTENT_ONLY_TOOL_DISPLAY
};

export function readPiToolChatDisplay(tool: unknown): ToolCallDisplay | undefined {
  const display = (tool as PiChatDisplayToolConfig | undefined)?.chatDisplay;
  if (!display?.mode || display.mode === 'default') return undefined;
  return display;
}

export function getPiToolChatDisplayByName(toolName: string | undefined, tools?: unknown[]): ToolCallDisplay | undefined {
  if (!toolName) return undefined;
  const tool = tools?.find((item: any) => item?.name === toolName);
  return readPiToolChatDisplay(tool) || TOOL_CHAT_DISPLAY_FALLBACKS[toolName];
}
