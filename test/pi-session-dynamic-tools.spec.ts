import { describe, expect, it, vi } from 'vitest';

import { installSameTurnDynamicToolActivation } from '../packages/ai/runtime/pi/dynamic-tool-activation';
import { createPiResourceQueryTool } from '../packages/ai/runtime/pi/tools/resource-query';

describe('Pi session dynamic tool activation', () => {
  it('replaces the running context snapshot with newly active tool schemas before the next model request', async () => {
    const toolboxTool = { description: 'toolbox', name: 'toolboxTool', parameters: {} };
    const resourceQueryTool = createPiResourceQueryTool({ resourcesRepo: {} } as any);
    const toolsByName = new Map([
      [toolboxTool.name, toolboxTool],
      [resourceQueryTool.name, resourceQueryTool]
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

    session.setActiveToolsByName(['toolboxTool', 'resourceQueryTool']);

    expect(promptStartSnapshot.map((tool) => tool.name)).toEqual(['toolboxTool']);

    const update = await agent.prepareNextTurn();
    const injectedResourceTool = update.context.tools.find((tool: any) => tool.name === 'resourceQueryTool');

    expect(originalPrepareNextTurn).toHaveBeenCalledOnce();
    expect(update.model).toEqual({ id: 'next-model' });
    expect(update.context.systemPrompt).toBe('active: toolboxTool, resourceQueryTool');
    expect(injectedResourceTool.description).toContain('{ sortBy: "newest", limit: 1 }');
    expect(injectedResourceTool.parameters.properties.sortBy.description).toContain('newest');
    expect(injectedResourceTool.parameters.properties.limit.description).toContain('最新的一个');
  });
});
