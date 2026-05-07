import type { AgentToolResult } from '@mariozechner/pi-agent-core';

function stringifyDetails(details: unknown): string {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function createJsonToolResult<TDetails>(details: TDetails, options?: { content?: unknown }): AgentToolResult<TDetails> {
  const content = options && 'content' in options ? options.content : details;
  return {
    content: [
      {
        text: typeof content === 'string' ? content : stringifyDetails(content),
        type: 'text'
      }
    ],
    details
  };
}
