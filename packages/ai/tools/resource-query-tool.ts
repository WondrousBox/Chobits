/**
 * 资源查询工具
 *
 * 支持智能查询数据库中的资源，包括：
 * - 按类型筛选（视频、音频、字幕、图片等）
 * - 按时间范围查询（今天、最近、特定日期）
 * - 按状态和属性筛选（收藏、评分、标签等）
 * - 排序和分页
 * - 全文搜索
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { ResourcesRepo as ResourcesRepoType } from '../../../electron/main/db/repositories';

/**
 * 资源查询工具上下文接口
 */
export interface ResourceQueryToolContext {
  /** 资源数据库仓库 */
  resourcesRepo: typeof ResourcesRepoType;
}

/**
 * 资源查询输入参数
 */
const resourceQueryInputSchema = z.object({
  // 基础筛选
  type: z.enum(['image', 'video', 'audio', 'recording', 'subtitle', 'text', 'link', 'file', 'document', 'rss', 'other']).optional().describe('资源类型'),
  status: z.enum(['new', 'processing', 'ready', 'archived', 'error']).optional().describe('资源状态'),

  // 时间筛选
  timeRange: z.enum(['today', 'yesterday', 'this-week', 'this-month', 'last-7-days', 'last-30-days', 'custom']).optional().describe('时间范围'),
  startTime: z.number().optional().describe('自定义开始时间（毫秒时间戳）'),
  endTime: z.number().optional().describe('自定义结束时间（毫秒时间戳）'),

  // 属性筛选
  favorite: z.boolean().optional().describe('是否只查询收藏的资源'),
  tags: z.array(z.string()).optional().describe('按标签筛选'),
  minRating: z.number().min(0).max(5).optional().describe('最低评分'),

  // 搜索
  searchText: z.string().optional().describe('全文搜索关键词（标题、描述）'),

  // 排序和分页
  sortBy: z.enum(['newest', 'oldest', 'rating', 'title', 'size', 'duration']).optional().describe('排序方式，默认最新'),
  limit: z.number().min(1).max(100).optional().describe('返回数量限制，默认 10'),
  offset: z.number().min(0).optional().describe('偏移量，用于分页')
});

/**
 * 资源查询输出参数
 */
const resourceQueryOutputSchema = z.object({
  success: z.boolean().describe('是否成功'),
  resources: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        title: z.string().nullable(),
        description: z.string().nullable(),
        url: z.string().nullable(),
        filePath: z.string().nullable(),
        thumbnailPath: z.string().nullable(),
        tags: z.string().nullable(),
        favorite: z.number().nullable(),
        rating: z.number().nullable(),
        status: z.string().nullable(),
        sizeBytes: z.number().nullable(),
        durationMs: z.number().nullable(),
        createdAt: z.number().nullable(),
        updatedAt: z.number().nullable()
      })
    )
    .optional()
    .describe('资源列表'),
  total: z.number().optional().describe('总数量（如果需要）'),
  error: z.string().optional().describe('错误信息（如果失败）')
});

/**
 * 辅助函数：根据时间范围计算开始和结束时间
 */
function getTimeRangeBounds(timeRange: string): { startTime: number; endTime: number } {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  switch (timeRange) {
    case 'today':
      return { startTime: todayStart, endTime: now };

    case 'yesterday': {
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      const yesterdayEnd = todayStart - 1;
      return { startTime: yesterdayStart, endTime: yesterdayEnd };
    }

    case 'this-week': {
      const dayOfWeek = today.getDay();
      const weekStart = todayStart - dayOfWeek * 24 * 60 * 60 * 1000;
      return { startTime: weekStart, endTime: now };
    }

    case 'this-month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      return { startTime: monthStart, endTime: now };
    }

    case 'last-7-days':
      return { startTime: now - 7 * 24 * 60 * 60 * 1000, endTime: now };

    case 'last-30-days':
      return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now };

    default:
      return { startTime: 0, endTime: now };
  }
}

/**
 * 创建资源查询工具
 *
 * @param resourcesRepo - 资源数据库仓库实例（可选，如不传入则需要在 toolContext 中提供）
 *
 * 使用示例：
 * ```typescript
 * import { ResourcesRepo } from '@/electron/main/db';
 *
 * // 方式1：创建时绑定依赖（推荐）
 * const tool = createResourceQueryTool(ResourcesRepo);
 *
 * // 方式2：使用默认工具，在 toolContext 中提供
 * const tool = resourceQueryTool;
 *
 * // 在 Agent 中使用
 * const agent = new Agent({
 *   name: 'assistant',
 *   tools: { queryResources: tool },
 * });
 * ```
 */
export const createResourceQueryTool = (boundResourcesRepo?: typeof ResourcesRepoType): ReturnType<typeof createTool> =>
  createTool({
    id: 'query-resources',
    description: `查询数据库中的资源。支持：
- 按类型筛选（'image', 'video', 'audio', 'recording', 'subtitle', 'text', 'link', 'file', 'document', 'rss', 'other'等）
- 按时间范围查询（今天、最近7天、本周等）
- 按标签、收藏、评分筛选
- 全文搜索标题和描述
- 灵活的排序和分页

示例用法：
- "查找今天的视频" → type=video, timeRange=today
- "找最新的字幕文件" → type=subtitle, sortBy=newest, limit=1
- "搜索带有'教程'标签的收藏资源" → tags=['教程'], favorite=true
- "找评分最高的音频" → type=audio, sortBy=rating`,
    inputSchema: resourceQueryInputSchema,
    outputSchema: resourceQueryOutputSchema,

    execute: async ({ context }) => {
      const { type, status, timeRange, startTime: customStartTime, endTime: customEndTime, favorite, tags, minRating, searchText, sortBy = 'newest', limit = 10, offset = 0 } = context;

      // 使用绑定的 resourcesRepo
      const resourcesRepo = boundResourcesRepo;

      if (!resourcesRepo) {
        return {
          success: false,
          error: 'ResourcesRepo not provided. Please create tool with createResourceQueryTool(ResourcesRepo)'
        };
      }

      try {
        // 构建筛选条件
        const filter: any = {
          deletedAt: 0 // 只查询未删除的资源
        };

        if (type) filter.type = type;
        if (status) filter.status = status;
        if (favorite !== undefined) filter.favorite = favorite ? 1 : 0;

        // 处理时间范围
        let startTime = customStartTime;
        let endTime = customEndTime;

        if (timeRange && timeRange !== 'custom') {
          const bounds = getTimeRangeBounds(timeRange);
          startTime = bounds.startTime;
          endTime = bounds.endTime;
        }

        // 查询资源列表（使用优化后的list方法，不包含大字段）
        let resources = await resourcesRepo.list(filter, Math.min(limit * 2, 200), offset);

        // 后处理筛选（数据库层面不支持的条件）
        if (startTime !== undefined || endTime !== undefined) {
          resources = resources.filter((r: any) => {
            const timestamp = r.createdAt || 0;
            if (startTime !== undefined && timestamp < startTime) return false;
            if (endTime !== undefined && timestamp > endTime) return false;
            return true;
          });
        }

        // 标签筛选
        if (tags && tags.length > 0) {
          resources = resources.filter((r: any) => {
            if (!r.tags) return false;
            try {
              const resourceTags = JSON.parse(r.tags) as string[];
              return tags.some((tag: string) => resourceTags.includes(tag));
            } catch {
              return false;
            }
          });
        }

        // 评分筛选
        if (minRating !== undefined) {
          resources = resources.filter((r: any) => {
            return r.rating !== null && r.rating !== undefined && r.rating >= minRating;
          });
        }

        // 全文搜索
        if (searchText) {
          const searchLower = searchText.toLowerCase();
          resources = resources.filter((r: any) => {
            const titleMatch = r.title?.toLowerCase().includes(searchLower);
            const descMatch = r.description?.toLowerCase().includes(searchLower);
            return titleMatch || descMatch;
          });
        }

        // 排序
        switch (sortBy) {
          case 'newest':
            resources.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
            break;
          case 'oldest':
            resources.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
            break;
          case 'rating':
            resources.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
            break;
          case 'title':
            resources.sort((a: any, b: any) => (a.title || '').localeCompare(b.title || ''));
            break;
          case 'size':
            resources.sort((a: any, b: any) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
            break;
          case 'duration':
            resources.sort((a: any, b: any) => (b.durationMs || 0) - (a.durationMs || 0));
            break;
        }

        // 限制返回数量
        const resultResources = resources.slice(0, limit);

        // 格式化返回数据
        const formattedResources = resultResources.map((r: any) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          url: r.url,
          filePath: r.filePath,
          thumbnailPath: r.thumbnailPath,
          tags: r.tags,
          favorite: r.favorite,
          rating: r.rating,
          status: r.status,
          sizeBytes: r.sizeBytes,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }));

        return {
          success: true,
          resources: formattedResources,
          total: resources.length
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || '查询资源失败'
        };
      }
    }
  });

/**
 * 默认资源查询工具实例（不绑定依赖）
 *
 * 注意：此工具需要在使用时提供 ResourcesRepo
 * 推荐在 agents/index.ts 中使用 createResourceQueryTool(ResourcesRepo) 创建绑定版本
 */
export const resourceQueryTool = createResourceQueryTool();
