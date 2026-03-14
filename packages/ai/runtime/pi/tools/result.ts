import type { AgentToolResult } from '@mariozechner/pi-agent-core';

function stringifyDetails(details: unknown): string {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function createJsonToolResult<TDetails>(details: TDetails): AgentToolResult<TDetails> {
  return {
    content: [
      {
        text: stringifyDetails(details),
        type: 'text'
      }
    ],
    details
  };
}
