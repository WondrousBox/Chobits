import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { PiSessionToolContext } from '../tool-context';
import { createPiAppWindowTool } from './app-window';
import { createPiAskUserTool } from './ask-user';
import { createPiFileEditTool } from './file-edit';
import { createPiFileGlobTool } from './file-glob';
import { createPiFileGrepTool } from './file-grep';
import { createPiFileListTool } from './file-list';
import { createPiFileReadTool } from './file-read';
import { createPiFileWriteTool } from './file-write';
import { createPiShellExecTool } from './shell-exec';
import { createPiSkillSearchTool } from './skill-search';
import { createPiSkillUseTool } from './skill-use';
import { createPiToolboxLookupTool } from './toolbox-lookup';
import { createPiWebReadTool } from './web-read';
import { createPiWebSearchTool } from './web-search';

type PiToolFactory = (toolContext: PiSessionToolContext) => unknown;

const PI_CUSTOM_TOOL_FACTORIES: Record<string, PiToolFactory> = {
  'app-window': createPiAppWindowTool,
  'ask-user': createPiAskUserTool,
  'file-edit': createPiFileEditTool,
  'file-glob': createPiFileGlobTool,
  'file-grep': createPiFileGrepTool,
  'file-list': createPiFileListTool,
  'file-read': createPiFileReadTool,
  'file-write': createPiFileWriteTool,
  'shell-exec': createPiShellExecTool,
  'skill-search': createPiSkillSearchTool,
  'skill-use': createPiSkillUseTool,
  'web-read': createPiWebReadTool,
  'web-search': createPiWebSearchTool,
  'toolbox-lookup': createPiToolboxLookupTool
};

export function createPiCustomTools(enabledToolIds: string[], toolContext: PiSessionToolContext): ToolDefinition[] {
  const seen = new Set<string>();
  const tools: ToolDefinition[] = [];

  for (const toolId of enabledToolIds) {
    const factory = PI_CUSTOM_TOOL_FACTORIES[toolId];
    if (!factory || seen.has(toolId)) continue;

    seen.add(toolId);
    tools.push(factory(toolContext) as ToolDefinition);
  }

  return tools;
}

export function listPiReadyToolIds(): string[] {
  return Object.keys(PI_CUSTOM_TOOL_FACTORIES);
}
