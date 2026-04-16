import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import type { PiSessionToolContext } from '../tool-context';
import { createPiAskUserTool } from './ask-user';
import { createPiFileEditTool } from './file-edit';
import { createPiFileGlobTool } from './file-glob';
import { createPiFileGrepTool } from './file-grep';
import { createPiFileListTool } from './file-list';
import { createPiFileReadTool } from './file-read';
import { createPiFileWriteTool } from './file-write';
import { createPiMemoryDiaryTool } from './memory-diary';
import { createPiMemoryGetTool } from './memory-get';
import { createPiMemoryRefreshCriticalTool } from './memory-refresh-critical';
import { createPiMemorySaveTool } from './memory-save';
import { createPiMemorySearchTool } from './memory-search';
import { createPiMemoryTopicsTool } from './memory-topics';
import { createPiPersonaUpdateTool } from './persona-update';
import { createPiPushCardTool } from './push-card';
import { createPiReadSubtitleTool } from './read-subtitle';
import { createPiResourceQueryTool } from './resource-query';
import { createPiShellExecTool } from './shell-exec';
import { createPiSkillSearchTool } from './skill-search';
import { createPiSkillUseTool } from './skill-use';
import { createPiSummaryTool } from './summary';
import { createPiToolboxLookupTool } from './toolbox-lookup';
import { createPiTranslationTool } from './translation';
import { createPiWebReadTool } from './web-read';
import { createPiWebSearchTool } from './web-search';
import { createPiWorkflowRunTool } from './workflow-run';
import { createPiYoutubeDownloadTool } from './youtube-download';
import { createPiYoutubeSubscribeTool } from './youtube-subscribe';

type PiToolFactory = (toolContext: PiSessionToolContext) => ToolDefinition<any>;

const PI_CUSTOM_TOOL_FACTORIES: Record<string, PiToolFactory> = {
  'ask-user': createPiAskUserTool,
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
  'skill-search': createPiSkillSearchTool,
  'skill-use': createPiSkillUseTool,
  'summarize-content': createPiSummaryTool,
  'translate-subtitles': createPiTranslationTool,
  'web-read': createPiWebReadTool,
  'web-search': createPiWebSearchTool,
  'youtube-download': createPiYoutubeDownloadTool,
  'youtube-subscribe': createPiYoutubeSubscribeTool,
  'memory-search': createPiMemorySearchTool,
  'memory-get': createPiMemoryGetTool,
  'memory-save': createPiMemorySaveTool,
  'memory-topics': createPiMemoryTopicsTool,
  'memory-diary': createPiMemoryDiaryTool,
  'memory-refresh-critical': createPiMemoryRefreshCriticalTool,
  'persona-update': createPiPersonaUpdateTool,
  'toolbox-lookup': createPiToolboxLookupTool,
  'workflow-run': createPiWorkflowRunTool
};

/** compatName → toolId 映射，供 toolbox proxy execute 按名称查找 */
const COMPAT_NAME_TO_TOOL_ID: Record<string, string> = {
  askUserTool: 'ask-user',
  fileEditTool: 'file-edit',
  fileGlobTool: 'file-glob',
  fileGrepTool: 'file-grep',
  fileListTool: 'file-list',
  fileReadTool: 'file-read',
  fileWriteTool: 'file-write',
  pushCardTool: 'push-card',
  resourceQueryTool: 'query-resources',
  readSubtitleTool: 'read-subtitle',
  shellExecTool: 'shell-exec',
  skillSearchTool: 'skill-search',
  skillUseTool: 'skill-use',
  summaryTool: 'summarize-content',
  translationTool: 'translate-subtitles',
  webReadTool: 'web-read',
  webSearchTool: 'web-search',
  youtubeDownloadTool: 'youtube-download',
  youtubeSubscribeTool: 'youtube-subscribe',
  memorySearchTool: 'memory-search',
  memoryGetTool: 'memory-get',
  memorySaveTool: 'memory-save',
  memoryTopicsTool: 'memory-topics',
  memoryDiaryTool: 'memory-diary',
  memoryRefreshCriticalTool: 'memory-refresh-critical',
  personaUpdateTool: 'persona-update',
  toolboxTool: 'toolbox-lookup',
  workflowRunTool: 'workflow-run'
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

/**
 * 列出所有可用工具的名称映射（compatName → toolId），供 toolbox activate/deactivate 错误提示使用。
 */
export function listAvailableToolNames(): Array<{ toolId: string; compatName: string }> {
  return Object.entries(COMPAT_NAME_TO_TOOL_ID).map(([compatName, toolId]) => ({ toolId, compatName }));
}

export function listPiReadyToolIds(): string[] {
  return Object.keys(PI_CUSTOM_TOOL_FACTORIES);
}
