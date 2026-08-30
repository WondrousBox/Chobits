import { describe, expect, it, vi } from 'vitest';

import { installSameTurnDynamicToolActivation } from '../../packages/ai/runtime/pi/dynamic-tool-activation';
import { createPiPushCardTool } from '../../packages/ai/runtime/pi/tools/push-card';

describe('Pi session dynamic tool activation', () => {
  it('replaces the running context snapshot with newly active tool schemas before the next model request', async () => {
    const toolboxTool = { description: 'toolbox', name: 'toolboxTool', parameters: {} };
    const pushCardTool = createPiPushCardTool({ pushCardToWindows: vi.fn() } as any);
    const toolsByName = new Map([
      [toolboxTool.name, toolboxTool],
      [pushCardTool.name, pushCardTool]
    ]);
    const originalPrepareNextTurn = vi.fn(async () => ({ model: { id: 'next-model' } }));
    const agent = {
      prepareNextTurn: originalPrepareNextTurn,
      state: {
        messages: [{ content: 'tool result', role: 'toolResult' }],
        systemPrompt: 'toolbox prompt',
        tools: [toolboxTool]
      }
    };
    const session = {
      agent,
      getActiveToolNames: () => agent.state.tools.map((tool) => tool.name),
      setActiveToolsByName: (names: string[]) => {
        agent.state.tools = names.map((name) => toolsByName.get(name)).filter(Boolean) as any[];
        agent.state.systemPrompt = `active: ${names.join(', ')}`;
      }
    } as any;

    installSameTurnDynamicToolActivation(session);
    const promptStartSnapshot = agent.state.tools.slice();

    session.setActiveToolsByName(['toolboxTool', 'pushCardTool']);

    expect(promptStartSnapshot.map((tool) => tool.name)).toEqual(['toolboxTool']);

    const update = await agent.prepareNextTurn();
    const injectedPushCardTool = update.context.tools.find((tool: any) => tool.name === 'pushCardTool');

    expect(originalPrepareNextTurn).toHaveBeenCalledOnce();
    expect(update.model).toEqual({ id: 'next-model' });
    expect(update.context.systemPrompt).toBe('active: toolboxTool, pushCardTool');
    expect(injectedPushCardTool.description).toContain('Push a resource card');
    expect(injectedPushCardTool.parameters.properties.resourceId.description).toContain('Resource ID');
  });
});
