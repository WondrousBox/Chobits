import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { PiWorkspaceShellService } from '../coding/shell-service';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const shellExecParameters = Type.Object({
  command: Type.Union([Type.Literal('git'), Type.Literal('tsc'), Type.Literal('vitest')], {
    description: 'Safe verification command to run inside the selected coding workspace.'
  }),
  args: Type.Optional(Type.Array(Type.String(), { description: 'Command arguments. Use explicit argv tokens only; no shell string.' })),
  cwd: Type.Optional(Type.String({ description: 'Optional working directory inside the selected coding workspace.' })),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 60000, description: 'Command timeout in milliseconds.' })),
  maxOutputBytes: Type.Optional(Type.Number({ minimum: 8192, maximum: 1048576, description: 'Maximum combined output captured before truncation.' }))
});

export function createPiShellExecTool(toolContext: PiSessionToolContext): ToolDefinition<typeof shellExecParameters> {
  const shellService = new PiWorkspaceShellService(toolContext);

  return {
    name: 'shellExecTool',
    label: 'shellExecTool',
    description: 'Run a restricted verification command inside the selected coding workspace.',
    parameters: shellExecParameters,
    async execute(_toolCallId, input) {
      try {
        const result = await shellService.run(input);
        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to run shell command.'
        });
      }
    }
  };
}
