import { validateToolArguments } from '@earendil-works/pi-ai/compat';
import { describe, expect, it, vi } from 'vitest';

import { createPiResourceQueryTool } from '../packages/ai/runtime/pi/tools/resource-query';

function createToolContext(resources: Record<string, any>[] = []): any {
  return {
    resourcesRepo: {
      list: vi.fn(async () => resources)
    }
  } as any;
}

describe('resourceQueryTool', () => {
  it('exposes query semantics in the injected tool schema', () => {
    const tool = createPiResourceQueryTool(createToolContext());
    const parameters = tool.parameters as any;

    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.required).toBeUndefined();
    expect(parameters.properties.type.description).toContain('应省略 type');
    expect(parameters.properties.timeRange.description).toContain('最新');
    expect(parameters.properties.sortBy.description).toContain('newest');
    expect(parameters.properties.limit.description).toContain('最新的一个');
    expect(parameters.properties.searchText.description).toContain('不要把');
    expect(tool.description).toContain('{ sortBy: "newest", limit: 1 }');
    expect(tool.description).toContain('没有 action 或 query 参数');
  });

  it('rejects toolbox search arguments instead of silently running a default query', () => {
    const tool = createPiResourceQueryTool(createToolContext());

    expect(() =>
      validateToolArguments(
        tool as any,
        {
          arguments: {
            action: 'search',
            query: '资源查询 最近文件'
          },
          id: 'call-resource-query-invalid',
          name: 'resourceQueryTool'
        } as any
      )
    ).toThrow(/Validation failed for tool "resourceQueryTool"/);
  });

  it('queries the latest resource across all types when the user did not specify a type', async () => {
    const resources = [
      { createdAt: 100, durationMs: null, id: 'older', status: 'ready', title: 'Older', type: 'file' },
      { createdAt: 300, durationMs: null, id: 'newest', status: 'ready', title: 'Newest', type: 'file' },
      { createdAt: 200, durationMs: null, id: 'middle', status: 'ready', title: 'Middle', type: 'file' }
    ];
    const toolContext = createToolContext(resources);
    const tool = createPiResourceQueryTool(toolContext);
    const input = validateToolArguments(
      tool as any,
      {
        arguments: { limit: 1, sortBy: 'newest' },
        id: 'call-resource-query-latest',
        name: 'resourceQueryTool'
      } as any
    );

    const result = await tool.execute('call-resource-query-latest', input);

    expect(toolContext.resourcesRepo.list).toHaveBeenCalledWith({ deletedAt: 0 }, 2, 0);
    expect(result.details).toMatchObject({
      resources: [{ id: 'newest', title: 'Newest', type: 'file' }],
      success: true,
      total: 3
    });
  });
});
