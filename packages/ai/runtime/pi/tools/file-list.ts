import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { PiWorkspaceFileService } from '../coding/file-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileListParameters = Type.Object({
  path: Type.Optional(Type.String({ description: 'Path inside the selected coding workspace. Defaults to the workspace root.' })),
  recursive: Type.Optional(Type.Boolean({ description: 'Whether to walk subdirectories recursively.' })),
  maxDepth: Type.Optional(Type.Number({ minimum: 0, maximum: 8, description: 'Maximum recursive depth. Defaults to 3 when recursive is true.' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500, description: 'Maximum number of entries to return.' })),
  includeHidden: Type.Optional(Type.Boolean({ description: 'Whether to include dotfiles and dot-directories.' })),
  includeIgnored: Type.Optional(Type.Boolean({ description: 'Whether to recurse into large directories like node_modules and .git.' }))
});

export function createPiFileListTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileListParameters> {
  const fileService = new PiWorkspaceFileService(toolContext);

  return {
    name: 'fileListTool',
    label: 'fileListTool',
    description: 'List files and directories inside the selected coding workspace.',
    parameters: fileListParameters,
    async execute(_toolCallId, input) {
      try {
        const result = await fileService.list(input);
        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to list workspace files.'
        });
      }
    }
  };
}
