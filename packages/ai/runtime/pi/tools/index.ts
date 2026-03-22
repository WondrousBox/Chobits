import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import type { PiSessionToolContext } from '../tool-context';
import { createPiFileEditTool } from './file-edit';
import { createPiFileGlobTool } from './file-glob';
import { createPiFileGrepTool } from './file-grep';
import { createPiFileListTool } from './file-list';
import { createPiFileReadTool } from './file-read';
import { createPiFileWriteTool } from './file-write';
import { createPiPushCardTool } from './push-card';
import { createPiReadSubtitleTool } from './read-subtitle';
import { createPiResourceQueryTool } from './resource-query';
import { createPiShellExecTool } from './shell-exec';
import { createPiSummaryTool } from './summary';
import { createPiTranslationTool } from './translation';
import { createPiYoutubeDownloadTool } from './youtube-download';
import { createPiYoutubeSubscribeTool } from './youtube-subscribe';

type PiToolFactory = (toolContext: PiSessionToolContext) => ToolDefinition<any>;

const PI_CUSTOM_TOOL_FACTORIES: Record<string, PiToolFactory> = {
  'file-edit': createPiFileEditTool,
  'file-glob': createPiFileGlobTool,
  'file-grep': createPiFileGrepTool,
  'file-list': createPiFileListTool,
  'file-read': createPiFileReadTool,
  'file-write': createPiFileWriteTool,
  'push-card': createPiPushCardTool,
  'query-resources': createPiResourceQueryTool,
  'read-subtitle': createPiReadSubtitleTool,
  'shell-exec': createPiShellExecTool,
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
