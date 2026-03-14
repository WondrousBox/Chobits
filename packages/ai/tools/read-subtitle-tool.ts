/**
 * 读取字幕文件工具
 *
 * 用于从资源数据库中读取字幕文件，解析内容并转换为字幕片段格式。
 * 这是翻译工具的前置步骤。
 */

import { parser } from '@aim-packages/subtitle';
import * as fs from 'fs/promises';
import { z } from 'zod';

import { ResourcesRepo as ResourcesRepoType } from '../../common/db';
import { createTool } from './tool-definition';

/**
 * 字幕片段格式（用于翻译）
 */
export interface SubtitleSegment {
  /** 段落文本 */
  text: string;
  /** 段落索引 */
  index: number;
}

/**
 * 创建读取字幕工具
 *
 * @param boundResourcesRepo - 绑定的 ResourcesRepo 实例
 * @returns 工具实例
 *
 * @example
 * ```typescript
 * // 创建绑定了 ResourcesRepo 的工具
 * const readSubtitleTool = createReadSubtitleTool(ResourcesRepo);
 *
 * // Agent 会在需要时自动调用
 * const agent = new Agent({
 *   tools: { readSubtitleTool }
 * });
 * ```
 */
export const createReadSubtitleTool = (boundResourcesRepo?: typeof ResourcesRepoType): ReturnType<typeof createTool> =>
  createTool({
    /**
     * 工具唯一标识
     */
    id: 'read-subtitle',

    /**
     * 工具描述 - Agent 根据此描述决定何时使用此工具
     */
    description: `读取字幕文件的基本信息并预览内容。

使用场景：
- 确认字幕文件是否存在且可读
- 查看字幕的基本信息（片段数量、格式、语言）
- 预览字幕前几条内容

此工具会：
1. 根据资源 ID 从数据库获取资源信息
2. 验证文件是否为字幕文件（.srt, .vtt, .ass, .ssa）
3. 返回字幕片段数量和前 3 条预览

**重要**：翻译和总结工具只需要 resourceId，会自动加载完整字幕内容。
你不需要先调用此工具再调用翻译/总结工具，可以直接调用它们。`,

    /**
     * 输入参数定义
     */
    inputSchema: z.object({
      /**
       * 资源 ID - 从 resourceQueryTool 查询结果中获取
       */
      resourceId: z.string().describe('要读取的字幕文件的资源 ID（从 resourceQueryTool 查询结果中获取）')
    }),

    /**
     * 输出结果定义（精简版，减少 token 消耗）
     * 注意：不再返回完整的 segments 数组，而是返回预览和数量
     * 翻译/总结工具会通过 resourceId 自行加载完整内容
     */
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
      resourceId: z.string().optional(),
      fileName: z.string().optional(),
      segmentCount: z.number().optional().describe('字幕片段总数'),
      preview: z
        .array(
          z.object({
            text: z.string(),
            index: z.number()
          })
        )
        .optional()
        .describe('前 3 个字幕片段预览'),
      metadata: z
        .object({
          format: z.string(),
          sourceLanguage: z.string()
        })
        .optional()
    }),

    /**
     * 工具执行逻辑
     */
    execute: async ({ context }) => {
      const { resourceId } = context;

      // 获取绑定的 ResourcesRepo
      const resourcesRepo = boundResourcesRepo;
      if (!resourcesRepo) {
        return {
          success: false,
          error: 'ResourcesRepo 未配置。请使用 createReadSubtitleTool(ResourcesRepo) 创建工具。'
        };
      }

      try {
        // 1. 从数据库获取资源信息
        const resource = await resourcesRepo.getById(resourceId);
        if (!resource || !resource.filePath) {
          return {
            success: false,
            error: `资源 ${resourceId} 不存在或没有文件路径`
          };
        }

        // 2. 验证文件类型
        const lower = resource.filePath.toLowerCase();
        const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
        if (!isSubtitleFile) {
          return {
            success: false,
            error: `资源 ${resourceId} 不是字幕文件（支持的格式：.srt, .vtt, .ass, .ssa）`
          };
        }

        // 3. 读取文件内容
        let fileContent: string;
        try {
          fileContent = await fs.readFile(resource.filePath, 'utf8');
        } catch (error: any) {
          return {
            success: false,
            error: `读取文件失败: ${error?.message || '未知错误'}`
          };
        }

        // 4. 解析字幕文件
        let parsedResult: any;
        try {
          parsedResult = await parser.parseSubtitle(fileContent);
        } catch (error: any) {
          return {
            success: false,
            error: `解析字幕文件失败: ${error?.message || '未知错误'}`
          };
        }

        if (!parsedResult?.segments || parsedResult.segments.length === 0) {
          return {
            success: false,
            error: `字幕文件中没有找到任何字幕片段: ${resource.filePath}`
          };
        }

        // 5. 转换为翻译工具所需的格式
        const segments: SubtitleSegment[] = parsedResult.segments.map((seg: any, idx: number) => ({
          text: seg.text,
          index: idx
        }));

        // 安全地获取元数据
        let metadataObj: any = {};
        try {
          if (resource.metadata) {
            metadataObj = typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : resource.metadata;
          }
        } catch {
          metadataObj = {};
        }

        return {
          success: true,
          resourceId,
          fileName: resource.title || resource.filePath.split(/[/\\]/).pop(),
          segmentCount: segments.length,
          // 只返回前 3 个片段作为预览，减少 token 消耗
          preview: segments.slice(0, 3),
          // 提供精简的元数据
          metadata: {
            format: lower.endsWith('.srt') ? 'SRT' : lower.endsWith('.vtt') ? 'VTT' : lower.endsWith('.ass') ? 'ASS' : 'SSA',
            sourceLanguage: metadataObj?.sourceLanguage || metadataObj?.language || 'unknown'
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: `读取字幕文件时发生错误: ${error?.message || '未知错误'}`
        };
      }
    }
  });

/**
 * 默认导出（使用未绑定的版本，需要在使用时绑定 ResourcesRepo）
 */
export const readSubtitleTool = createReadSubtitleTool();
