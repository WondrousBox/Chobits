import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { PiWorkspaceSearchService } from '../coding/search-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileGlobParameters = Type.Object({
  pattern: Type.String({ description: 'Glob pattern such as src/**/*.ts or **/*.test.ts.' }),
  basePath: Type.Optional(Type.String({ description: 'Base directory inside the selected coding workspace. Defaults to the workspace root.' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500, description: 'Maximum number of matches to return.' })),
  maxDepth: Type.Optional(Type.Number({ minimum: 0, maximum: 8, description: 'Maximum directory depth to scan.' })),
  includeHidden: Type.Optional(Type.Boolean({ description: 'Whether to include dotfiles and dot-directories.' })),
  includeIgnored: Type.Optional(Type.Boolean({ description: 'Whether to include large generated directories like node_modules and dist.' }))
});

export function createPiFileGlobTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileGlobParameters> {
  const searchService = new PiWorkspaceSearchService(toolContext);

  return {
    name: 'fileGlobTool',
    label: 'fileGlobTool',
    description: 'Find files or directories inside the selected coding workspace using a glob pattern.',
    parameters: fileGlobParameters,
    async execute(_toolCallId, input) {
      try {
        const result = await searchService.glob(input);
        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to glob workspace files.'
        });
      }
    }
  };
}
