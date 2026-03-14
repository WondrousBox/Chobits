import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import type { PiSessionToolContext } from '../tool-context';
import { createPiPushCardTool } from './push-card';
import { createPiReadSubtitleTool } from './read-subtitle';
import { createPiResourceQueryTool } from './resource-query';
import { createPiSummaryTool } from './summary';
import { createPiTranslationTool } from './translation';
import { createPiYoutubeDownloadTool } from './youtube-download';
import { createPiYoutubeSubscribeTool } from './youtube-subscribe';

type PiToolFactory = (toolContext: PiSessionToolContext) => ToolDefinition;

const PI_CUSTOM_TOOL_FACTORIES: Record<string, PiToolFactory> = {
  'push-card': createPiPushCardTool,
  'query-resources': createPiResourceQueryTool,
  'read-subtitle': createPiReadSubtitleTool,
  'summarize-content': createPiSummaryTool,
  'translate-subtitles': createPiTranslationTool,
  'youtube-download': createPiYoutubeDownloadTool,
  'youtube-subscribe': createPiYoutubeSubscribeTool
};

export function createPiCustomTools(enabledToolIds: string[], toolContext: PiSessionToolContext): ToolDefinition[] {
  const seen = new Set<string>();
  const tools: ToolDefinition[] = [];

  for (const toolId of enabledToolIds) {
    const factory = PI_CUSTOM_TOOL_FACTORIES[toolId];
    if (!factory || seen.has(toolId)) continue;

    seen.add(toolId);
    tools.push(factory(toolContext));
  }

  return tools;
}

export function listPiReadyToolIds(): string[] {
  return Object.keys(PI_CUSTOM_TOOL_FACTORIES);
}
