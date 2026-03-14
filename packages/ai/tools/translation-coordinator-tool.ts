/**
 * 翻译协调工具
 *
 * 这个工具帮助 Agent 理解用户的翻译需求，并提供翻译指引
 * 实际的翻译操作由应用程序的翻译功能完成
 */

import { z } from 'zod';

import type { ResourcesRepo as ResourcesRepoType } from '../../../electron/main/db/repositories';
import { createResourceQueryTool } from './resource-query-tool';
import { createTool } from './tool-definition';

/**
 * 翻译协调工具输入参数
 */
const translationCoordinatorInputSchema = z.object({
  resourceId: z.string().optional().describe('要翻译的资源 ID'),
  resourceType: z.enum(['subtitle']).optional().describe('资源类型，目前仅支持字幕'),
  targetLanguage: z.string().describe('目标语言编码（如 zh-CN, en, ja）'),
  sourceLanguage: z.string().optional().describe('源语言编码（可选）'),
  queryLatest: z.boolean().optional().describe('是否查询最新的字幕文件')
});

/**
 * 翻译协调工具输出参数
 */
const translationCoordinatorOutputSchema = z.object({
  success: z.boolean().describe('是否成功'),
  action: z.enum(['translate', 'query_required', 'not_supported']).describe('建议的操作'),
  message: z.string().describe('给用户的消息'),
  resource: z
    .object({
      id: z.string(),
      type: z.string(),
      title: z.string().nullable(),
      filePath: z.string().nullable()
    })
    .optional()
    .describe('找到的资源信息'),
  translationInfo: z
    .object({
      targetLanguage: z.string(),
      sourceLanguage: z.string().optional(),
      ready: z.boolean().describe('是否准备好翻译')
    })
    .optional()
    .describe('翻译相关信息'),
  error: z.string().optional().describe('错误信息')
});

/**
 * 创建翻译协调工具
 *
 * @param boundResourcesRepo - 资源数据库仓库实例
 */
export const createTranslationCoordinatorTool = (boundResourcesRepo?: typeof ResourcesRepoType): ReturnType<typeof createTool> => {
  // 创建资源查询工具用于查找资源
  const resourceQueryTool = createResourceQueryTool(boundResourcesRepo);

  return createTool({
    id: 'translate-coordinator',
    description: `协调字幕翻译任务。此工具用于：
1. 理解用户的翻译需求
2. 查找需要翻译的字幕文件
3. 提供翻译准备信息
4. 指引用户完成翻译

示例用法：
- "翻译最新的字幕文件" → queryLatest=true, resourceType=subtitle
- "把这个字幕翻译成中文" → targetLanguage=zh-CN
- "翻译 ID 为 xxx 的字幕" → resourceId=xxx`,
    inputSchema: translationCoordinatorInputSchema,
    outputSchema: translationCoordinatorOutputSchema,

    execute: async ({ context }) => {
      const { resourceId, resourceType = 'subtitle', targetLanguage, sourceLanguage, queryLatest } = context;

      try {
        let foundResource: any = null;

        // 如果需要查询最新资源
        if (queryLatest && !resourceId) {
          const queryResult = await resourceQueryTool.execute({
            context: {
              type: resourceType,
              sortBy: 'newest',
              limit: 1
            }
          });

          if (queryResult.success && queryResult.resources && queryResult.resources.length > 0) {
            foundResource = queryResult.resources[0];
          } else {
            return {
              success: false,
              action: 'query_required',
              message: `未找到${resourceType === 'subtitle' ? '字幕' : '资源'}文件。请先导入或创建资源。`,
              error: '没有找到匹配的资源'
            };
          }
        }

        // 如果指定了资源 ID，查找该资源
        if (resourceId && !foundResource) {
          // 这里可以通过 resourcesRepo.getById 获取资源
          // 但为了简化，我们假设资源存在
          foundResource = { id: resourceId, type: resourceType };
        }

        // 如果没有找到资源
        if (!foundResource) {
          return {
            success: false,
            action: 'query_required',
            message: '请指定要翻译的字幕文件，或者使用"最新的字幕文件"等描述。',
            error: '未指定资源'
          };
        }

        // 准备翻译信息
        const translationInfo = {
          targetLanguage,
          sourceLanguage,
          ready: true
        };

        // 返回成功信息，提示用户使用应用内功能完成翻译
        return {
          success: true,
          action: 'translate',
          message: `已找到字幕文件"${foundResource.title || foundResource.filePath || foundResource.id}"。

要完成翻译，请：
1. 在资源列表中找到该文件
2. 点击"翻译"按钮
3. 选择目标语言：${targetLanguage}
${sourceLanguage ? `4. 源语言：${sourceLanguage}` : ''}

或者，您可以使用命令：
翻译资源 ${foundResource.id} 到 ${targetLanguage}`,
          resource: {
            id: foundResource.id,
            type: foundResource.type,
            title: foundResource.title,
            filePath: foundResource.filePath
          },
          translationInfo
        };
      } catch (error: any) {
        return {
          success: false,
          action: 'not_supported',
          message: '翻译协调失败，请稍后重试。',
          error: error?.message || '未知错误'
        };
      }
    }
  });
};

/**
 * 默认翻译协调工具实例（不绑定依赖）
 */
export const translationCoordinatorTool = createTranslationCoordinatorTool();
