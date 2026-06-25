import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const resourceQueryParameters = Type.Object({
  type: Type.Optional(
    Type.Union([
      Type.Literal('image'),
      Type.Literal('video'),
      Type.Literal('audio'),
      Type.Literal('recording'),
      Type.Literal('subtitle'),
      Type.Literal('text'),
      Type.Literal('link'),
      Type.Literal('file'),
      Type.Literal('document'),
      Type.Literal('rss'),
      Type.Literal('other')
    ])
  ),
  status: Type.Optional(Type.Union([Type.Literal('new'), Type.Literal('processing'), Type.Literal('ready'), Type.Literal('archived'), Type.Literal('error')])),
  timeRange: Type.Optional(
    Type.Union([
      Type.Literal('today'),
      Type.Literal('yesterday'),
      Type.Literal('this-week'),
      Type.Literal('this-month'),
      Type.Literal('last-7-days'),
      Type.Literal('last-30-days'),
      Type.Literal('custom')
    ])
  ),
  startTime: Type.Optional(Type.Number({ description: '自定义开始时间（毫秒时间戳）' })),
  endTime: Type.Optional(Type.Number({ description: '自定义结束时间（毫秒时间戳）' })),
  favorite: Type.Optional(Type.Boolean({ description: '是否只查询收藏资源' })),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: '按标签筛选' })),
  minRating: Type.Optional(Type.Number({ minimum: 0, maximum: 5, description: '最低评分' })),
  searchText: Type.Optional(Type.String({ description: '全文搜索关键词（标题、描述）' })),
  sortBy: Type.Optional(Type.Union([Type.Literal('newest'), Type.Literal('oldest'), Type.Literal('rating'), Type.Literal('title'), Type.Literal('size'), Type.Literal('duration')])),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: '返回数量限制，默认 10' })),
  offset: Type.Optional(Type.Number({ minimum: 0, description: '分页偏移量' }))
});

type ResourceRecord = Awaited<ReturnType<PiSessionToolContext['resourcesRepo']['list']>>[number];
type ResourceQueryOutputResource = {
  durationSec: number | null;
  id: string;
  status: string | null;
  title: string | null;
  type: string;
};

function getTimeRangeBounds(timeRange: string): { endTime: number; startTime: number } {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  switch (timeRange) {
    case 'today':
      return { startTime: todayStart, endTime: now };
    case 'yesterday': {
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      return { startTime: yesterdayStart, endTime: todayStart - 1 };
    }
    case 'this-week': {
      const weekStart = todayStart - today.getDay() * 24 * 60 * 60 * 1000;
      return { startTime: weekStart, endTime: now };
    }
    case 'this-month':
      return {
        startTime: new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
        endTime: now
      };
    case 'last-7-days':
      return { startTime: now - 7 * 24 * 60 * 60 * 1000, endTime: now };
    case 'last-30-days':
      return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now };
    default:
      return { startTime: 0, endTime: now };
  }
}

function parseResourceTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function formatResource(resource: ResourceRecord): ResourceQueryOutputResource {
  return {
    id: resource.id,
    type: resource.type,
    title: resource.title ?? null,
    durationSec: typeof resource.durationMs === 'number' ? Math.round(resource.durationMs / 1000) : null,
    status: resource.status ?? null
  };
}

export function createPiResourceQueryTool(toolContext: PiSessionToolContext): ToolDefinition<typeof resourceQueryParameters> {
  return {
    name: 'resourceQueryTool',
    label: 'resourceQueryTool',
    description: `查询数据库中的资源。支持按类型、时间范围、标签、评分、收藏、关键词和排序查询，返回精简资源列表，适合后续继续调用 pushCardTool 或其他处理工具。`,
    parameters: resourceQueryParameters,
    async execute(_toolCallId, input) {
      const { endTime: customEndTime, favorite, limit = 10, minRating, offset = 0, searchText, sortBy = 'newest', startTime: customStartTime, status, tags, timeRange, type } = input;

      try {
        const filter: Record<string, unknown> = {
          deletedAt: 0
        };

        if (type) filter.type = type;
        if (status) filter.status = status;
        if (favorite !== undefined) filter.favorite = favorite ? 1 : 0;

        let startTime = customStartTime;
        let endTime = customEndTime;

        if (timeRange && timeRange !== 'custom') {
          const bounds = getTimeRangeBounds(timeRange);
          startTime = bounds.startTime;
          endTime = bounds.endTime;
        }

        let resources = await toolContext.resourcesRepo.list(filter as any, Math.min(limit * 2, 200), offset);

        if (startTime !== undefined || endTime !== undefined) {
          resources = resources.filter((resource) => {
            const timestamp = resource.createdAt || 0;
            if (startTime !== undefined && timestamp < startTime) return false;
            if (endTime !== undefined && timestamp > endTime) return false;
            return true;
          });
        }

        if (tags?.length) {
          resources = resources.filter((resource) => {
            const resourceTags = parseResourceTags(resource.tags);
            return tags.some((tag) => resourceTags.includes(tag));
          });
        }

        if (minRating !== undefined) {
          resources = resources.filter((resource) => typeof resource.rating === 'number' && resource.rating >= minRating);
        }

        if (searchText) {
          const query = searchText.toLowerCase();
          resources = resources.filter((resource) => {
            const titleMatch = resource.title?.toLowerCase().includes(query);
            const descriptionMatch = resource.description?.toLowerCase().includes(query);
            return Boolean(titleMatch || descriptionMatch);
          });
        }

        switch (sortBy) {
          case 'oldest':
            resources.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
            break;
          case 'rating':
            resources.sort((left, right) => (right.rating || 0) - (left.rating || 0));
            break;
          case 'title':
            resources.sort((left, right) => (left.title || '').localeCompare(right.title || ''));
            break;
          case 'size':
            resources.sort((left, right) => (right.sizeBytes || 0) - (left.sizeBytes || 0));
            break;
          case 'duration':
            resources.sort((left, right) => (right.durationMs || 0) - (left.durationMs || 0));
            break;
          case 'newest':
          default:
            resources.sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
            break;
        }

        const visibleResources = resources.slice(0, limit).map(formatResource);

        return createJsonToolResult({
          success: true,
          resources: visibleResources,
          total: resources.length
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || '查询资源失败'
        });
      }
    }
  };
}
