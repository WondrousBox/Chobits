/**
 * 工具使用示例
 *
 * 展示如何在不同场景下使用各种工具
 *
 * ⚠️ 注意：这是概念性示例代码，用于说明工具的使用方式
 * 实际使用时需要根据 Mastra 的 API 调整参数结构
 * 特别是 tool.execute() 和 agent.stream() 的调用方式
 *
 * 参考真实实现：
 * - packages/ai/ipc-main.ts (IPC handlers)
 * - packages/ai/examples/resource-query-handler.ts (资源查询示例)
 * - packages/ai/examples/smart-task-handler.ts (智能任务处理)
 */

/* eslint-disable */
// @ts-nocheck
// 禁用类型检查，因为这是概念性示例

import { Agent } from '@mastra/core';
import {
    calculatorTool,
    getAllTools,
    getAITools,
    getBasicTools,
    getTool,
    getToolById,
    resourceQueryTool,
    summaryTool,
    timeTool,
    translationTool,
    weatherTool
} from '../tools';
import type { ChatService } from '../chat-service';
import type { SummaryService } from '../summary-service';
import type { TranslationService } from '../translation-service';

// 假设的数据库仓库类型
interface ResourcesRepo {
    list: (filter: any) => Promise<any[]>;
}
interface ConversationRepo {
    create: (data: any) => Promise<any>;
}
interface MessagesRepo {
    create: (data: any) => Promise<any>;
}

// ============================================================================
// 示例 1: 使用单个通用工具
// ============================================================================

export async function example1_BasicToolUsage() {
    console.log('=== 示例 1: 基本工具使用 ===\n');

    // 1. 天气查询
    const weather = await weatherTool.execute({
        context: { city: '北京', unit: 'celsius' }
    });
    console.log(`天气: ${weather.city} ${weather.temperature}°C ${weather.description}`);

    // 2. 时间查询
    const time = await timeTool.execute({
        context: { format: 'readable' }
    });
    console.log(`时间: ${time.time}`);

    // 3. 计算器
    const calc = await calculatorTool.execute({
        context: { expression: '(10 + 5) * 2' }
    });
    console.log(`计算: ${calc.expression} = ${calc.result}\n`);
}

// ============================================================================
// 示例 2: Agent 自动选择工具
// ============================================================================

export async function example2_AgentWithBasicTools() {
    console.log('=== 示例 2: Agent 自动选择工具 ===\n');

    // 创建 Agent，传入所有基础工具
    const agent = new Agent({
        name: 'helper',
        instructions: '你是一个有用的助手，可以查询天气、时间和进行计算',
        model: {
            provider: 'OPEN_AI',
            name: 'gpt-4',
            toolChoice: 'auto'
        },
        tools: getBasicTools()
    });

    // Agent 会自动理解用户意图并选择合适的工具
    const queries = ['北京今天天气怎么样？', '现在几点了？', '帮我算一下 25 * 4'];

    for (const query of queries) {
        console.log(`用户: ${query}`);
        const result = await agent.stream([{ role: 'user', content: query }]);

        // 处理流式响应
        for await (const chunk of result) {
            if (chunk.type === 'text') {
                process.stdout.write(chunk.text);
            }
        }
        console.log('\n');
    }
}

// ============================================================================
// 示例 3: 直接调用 AI 工具（推荐方式）
// ============================================================================

export async function example3_DirectAIToolCall(
    resourcesRepo: ResourcesRepo,
    translationService: typeof TranslationService,
    summaryService: typeof SummaryService,
    chatFn: typeof ChatService.chatStream
) {
    console.log('=== 示例 3: 直接调用 AI 工具 ===\n');

    // 1. 查询资源
    const resources = await resourceQueryTool.execute({
        context: {
            type: 'video',
            timeRange: 'today',
            limit: 5
        },
        toolContext: {
            resourcesRepo
        }
    });
    console.log(`找到 ${resources.total} 个今天的视频`);

    // 2. 翻译字幕（如果有字幕资源）
    const translation = await translationTool.execute({
        context: {
            segments: [
                { id: '1', text: 'Hello world', start: 0, end: 2000 },
                { id: '2', text: 'How are you?', start: 2000, end: 4000 }
            ],
            targetLanguage: 'zh-CN',
            sourceLanguage: 'en'
        },
        toolContext: {
            translationService,
            chatFn,
            requestId: 'req-example-3',
            conversationId: 'conv-example-3'
            // conversationRepo, messagesRepo 可选
        } as any
    });
    console.log('翻译完成:', translation);

    // 3. 总结内容
    const summary = await summaryTool.execute({
        context: {
            content: '这是一段很长的内容...',
            targetLanguage: 'zh-CN',
            options: { maxLength: 200 }
        },
        toolContext: {
            summaryService,
            chatFn,
            requestId: 'req-example-3-summary',
            conversationId: 'conv-example-3-summary'
        } as any
    });
    console.log('总结:', summary);
}

// ============================================================================
// 示例 4: Agent 使用 AI 工具（带 toolContext）
// ============================================================================

export async function example4_AgentWithAITools(resourcesRepo: ResourcesRepo) {
    console.log('=== 示例 4: Agent 使用 AI 工具 ===\n');

    // 创建专门用于资源查询的 Agent
    const agent = new Agent({
        name: 'resource-assistant',
        instructions: '你是资源管理助手，可以帮助用户查询和管理资源',
        model: {
            provider: 'OPEN_AI',
            name: 'gpt-4',
            toolChoice: 'auto'
        },
        tools: { resourceQueryTool }
    });

    // Agent 会解析自然语言查询
    const queries = ['找今天的视频', '查最新的 3 个字幕文件', '有哪些收藏的音频？'];

    for (const query of queries) {
        console.log(`\n用户: ${query}`);

        // 传入 toolContext
        const result = await agent.stream([{ role: 'user', content: query }], {
            toolContext: {
                resourcesRepo
            }
        });

        for await (const chunk of result) {
            if (chunk.type === 'text') {
                process.stdout.write(chunk.text);
            }
        }
        console.log();
    }
}

// ============================================================================
// 示例 5: 混合使用多种工具
// ============================================================================

export async function example5_MixedTools(resourcesRepo: ResourcesRepo) {
    console.log('=== 示例 5: 混合使用多种工具 ===\n');

    // 创建功能全面的 Agent
    const agent = new Agent({
        name: 'super-assistant',
        instructions: `你是一个功能全面的助手，可以：
      - 查询天气和时间
      - 进行数学计算
      - 查询和管理资源`,
        model: {
            provider: 'OPEN_AI',
            name: 'gpt-4',
            toolChoice: 'auto'
        },
        // 使用所有工具
        tools: {
            ...getBasicTools(),
            resourceQueryTool
        }
    });

    // 复杂的用户请求
    const query = '北京现在天气怎么样？顺便帮我找一下今天创建的视频有几个';

    console.log(`用户: ${query}\n`);

    const result = await agent.stream([{ role: 'user', content: query }], {
        toolContext: {
            resourcesRepo
        }
    });

    for await (const chunk of result) {
        if (chunk.type === 'text') {
            process.stdout.write(chunk.text);
        } else if (chunk.type === 'tool-call') {
            console.log(`\n[工具调用: ${chunk.toolName}]`);
        } else if (chunk.type === 'tool-result') {
            console.log(`[工具结果: ${JSON.stringify(chunk.result).slice(0, 100)}...]`);
        }
    }
    console.log();
}

// ============================================================================
// 示例 6: 动态工具选择
// ============================================================================

export async function example6_DynamicToolSelection() {
    console.log('=== 示例 6: 动态工具选择 ===\n');

    // 根据名称获取工具
    const weather = getTool('weatherTool');
    if (weather) {
        const result = await weather.execute({
            context: { city: '上海' }
        });
        console.log('通过名称获取:', result);
    }

    // 根据 ID 获取工具
    const calculator = getToolById('calculator');
    if (calculator) {
        const result = await calculator.execute({
            context: { expression: '100 / 5' }
        });
        console.log('通过 ID 获取:', result);
    }

    // 获取所有工具
    const allTools = getAllTools();
    console.log('所有工具:', Object.keys(allTools));

    // 只获取基础工具
    const basicTools = getBasicTools();
    console.log('基础工具:', Object.keys(basicTools));

    // 只获取 AI 工具
    const aiTools = getAITools();
    console.log('AI 工具:', Object.keys(aiTools));
}

// ============================================================================
// 示例 7: 错误处理
// ============================================================================

export async function example7_ErrorHandling() {
    console.log('=== 示例 7: 错误处理 ===\n');

    try {
        // 无效的城市名
        const result = await weatherTool.execute({
            context: { city: '' }
        });
        console.log(result);
    } catch (error) {
        console.error('天气查询失败:', error instanceof Error ? error.message : error);
    }

    try {
        // 无效的数学表达式
        const result = await calculatorTool.execute({
            context: { expression: '2 + abc' }
        });
        console.log(result);
    } catch (error) {
        console.error('计算失败:', error instanceof Error ? error.message : error);
    }

    // 资源查询的错误处理（通过返回值）
    const result = await resourceQueryTool.execute({
        context: { type: 'invalid-type' as any },
        toolContext: { resourcesRepo: null as any }
    });

    if (!result.success) {
        console.error('资源查询失败:', result.error);
    }
}

// ============================================================================
// 示例 8: 在 IPC Handler 中使用
// ============================================================================

export function example8_IPCIntegration(
    ipcMain: any,
    resourcesRepo: ResourcesRepo,
    translationService: typeof TranslationService,
    summaryService: typeof SummaryService
) {
    console.log('=== 示例 8: IPC 集成 ===\n');

    // 1. 基础工具 - 直接调用
    ipcMain.handle('ai:getWeather', async (_: any, city: string) => {
        return await weatherTool.execute({
            context: { city }
        });
    });

    // 2. AI 工具 - 直接调用（推荐）
    ipcMain.handle('ai:queryResources', async (_: any, params: any) => {
        return await resourceQueryTool.execute({
            context: params,
            toolContext: { resourcesRepo }
        });
    });

    // 3. AI 工具 - 自然语言查询
    ipcMain.handle('ai:naturalResourceQuery', async (_: any, params: any) => {
        const { providerId, model, query } = params;

        // 创建 Agent
        const agent = new Agent({
            name: 'resource-query',
            instructions: '解析用户的资源查询需求，调用 resourceQueryTool 获取结果，然后用自然语言总结',
            model: { provider: providerId, name: model, toolChoice: 'auto' },
            tools: { resourceQueryTool }
        });

        // 流式响应
        const result = await agent.stream([{ role: 'user', content: query }], {
            toolContext: { resourcesRepo }
        });

        // 收集所有响应
        let response = '';
        for await (const chunk of result) {
            if (chunk.type === 'text') {
                response += chunk.text;
            }
        }

        return { response };
    });

    console.log('IPC handlers 注册完成');
}

// ============================================================================
// 运行所有示例（注意：需要提供实际的依赖）
// ============================================================================

export async function runAllExamples(
    resourcesRepo: ResourcesRepo,
    translationService: typeof TranslationService,
    summaryService: typeof SummaryService,
    chatFn: typeof ChatService.chatStream
) {
    try {
        await example1_BasicToolUsage();
        // await example2_AgentWithBasicTools(); // 需要 API key
        await example3_DirectAIToolCall(resourcesRepo, translationService, summaryService, chatFn);
        // await example4_AgentWithAITools(resourcesRepo); // 需要 API key
        // await example5_MixedTools(resourcesRepo); // 需要 API key
        await example6_DynamicToolSelection();
        await example7_ErrorHandling();
    } catch (error) {
        console.error('示例执行失败:', error);
    }
}
