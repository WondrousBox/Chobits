import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { PiWorkspaceSearchService } from '../coding/search-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileGrepParameters = Type.Object({
  pattern: Type.String({ description: 'Text or regex pattern to search for.' }),
  basePath: Type.Optional(Type.String({ description: 'Base directory inside the selected coding workspace. Defaults to the workspace root.' })),
  include: Type.Optional(Type.String({ description: 'Optional glob filter for candidate files, such as src/**/*.ts.' })),
  isRegex: Type.Optional(Type.Boolean({ description: 'Whether pattern should be treated as a regular expression.' })),
  ignoreCase: Type.Optional(Type.Boolean({ description: 'Whether to perform a case-insensitive search.' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500, description: 'Maximum number of matching lines to return.' })),
  maxDepth: Type.Optional(Type.Number({ minimum: 0, maximum: 8, description: 'Maximum directory depth to scan.' })),
  maxFileBytes: Type.Optional(Type.Number({ minimum: 1024, maximum: 5242880, description: 'Skip files larger than this size in bytes.' })),
  includeHidden: Type.Optional(Type.Boolean({ description: 'Whether to include dotfiles and dot-directories.' })),
  includeIgnored: Type.Optional(Type.Boolean({ description: 'Whether to include large generated directories like node_modules and dist.' }))
});

export function createPiFileGrepTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileGrepParameters> {
  const searchService = new PiWorkspaceSearchService(toolContext);

  return {
    name: 'fileGrepTool',
    label: 'fileGrepTool',
    description: 'Search for matching text inside files in the selected coding workspace.',
    parameters: fileGrepParameters,
    async execute(_toolCallId, input) {
      try {
        const result = await searchService.grep(input);
        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to grep workspace files.'
        });
      }
    }
  };
}
