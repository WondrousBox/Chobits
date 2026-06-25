import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { resolveGuardedToolExecution } from '../skills';
import { PiWorkspaceFileService } from '../coding/file-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const fileEditParameters = Type.Object({
  path: Type.String({ description: 'Path to the text file inside the selected coding workspace.' }),
  oldText: Type.String({ minLength: 1, description: 'Exact text to replace.' }),
  newText: Type.String({ description: 'Replacement text.' }),
  replaceAll: Type.Optional(Type.Boolean({ description: 'Whether to replace every exact match.' })),
  expectedReplacements: Type.Optional(Type.Number({ minimum: 0, description: 'Expected number of matches before editing.' }))
});

export function createPiFileEditTool(toolContext: PiSessionToolContext): ToolDefinition<typeof fileEditParameters> {
  const fileService = new PiWorkspaceFileService(toolContext);

  return {
    name: 'fileEditTool',
    label: 'fileEditTool',
    description: 'Edit a text file inside the selected coding workspace by replacing exact text.',
    parameters: fileEditParameters,
    async execute(toolCallId, input) {
      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'file-edit');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const result = await fileService.edit(input);
        return createJsonToolResult({
          success: true,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to edit workspace file.'
        });
      }
    }
  };
}
