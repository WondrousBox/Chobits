import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { PiWorkspaceFileService } from '../coding/file-service';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileWriteParameters = Type.Object({
  path: Type.String({ description: 'Path to the text file inside the selected coding workspace.' }),
  content: Type.String({ description: 'Full UTF-8 file contents to write.' }),
  overwrite: Type.Optional(Type.Boolean({ description: 'Whether existing files may be overwritten. Defaults to true.' })),
  createDirectories: Type.Optional(Type.Boolean({ description: 'Whether missing parent directories should be created. Defaults to true.' }))
});

export function createPiFileWriteTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileWriteParameters> {
  const fileService = new PiWorkspaceFileService(toolContext);

  return {
    name: 'fileWriteTool',
    label: 'fileWriteTool',
    description: 'Write a text file inside the selected coding workspace.',
    parameters: fileWriteParameters,
    async execute(toolCallId, input) {
      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'file-write');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const result = await fileService.write(input);
        return createJsonToolResult({
          success: true,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to write workspace file.'
        });
      }
    }
  };
}
