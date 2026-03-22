import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { PiWorkspaceFileService } from '../coding/file-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileReadParameters = Type.Object({
  path: Type.String({ description: 'Path to the text file inside the selected coding workspace.' }),
  startLine: Type.Optional(Type.Number({ minimum: 1, description: '1-based start line for partial reads.' })),
  endLine: Type.Optional(Type.Number({ minimum: 1, description: '1-based end line for partial reads.' })),
  maxChars: Type.Optional(Type.Number({ minimum: 200, maximum: 200000, description: 'Maximum characters to return.' }))
});

export function createPiFileReadTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileReadParameters> {
  const fileService = new PiWorkspaceFileService(toolContext);

  return {
    name: 'fileReadTool',
    label: 'fileReadTool',
    description: 'Read a text file from the selected coding workspace.',
    parameters: fileReadParameters,
    async execute(_toolCallId, input) {
      try {
        const result = await fileService.read(input);
        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to read workspace file.'
        });
      }
    }
  };
}
