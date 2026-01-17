/**
 * 错误处理与重试示例
 *
 * 演示如何处理错误和实现重试逻辑
 */

import { AgentError, ConsoleLogger, createTool, DefaultAgentRuntime, ErrorCategory, isRetryable, LogLevel, OpenAIAdapter, RegistryToolProvider, withRetry } from '../src';

// 创建一个可能失败的工具
const UnstableTool = createTool<{ failRate?: number }, { message: string; timestamp: string }>({
    name: 'unstable_service',
    description: '调用一个不稳定的服务（可能随机失败）',
    parameters: {
        type: 'object',
        properties: {
            failRate: {
                type: 'number',
                description: '失败概率（0-1），默认 0.5',
                minimum: 0,
                maximum: 1
            }
        }
    },
    async execute(params) {
        const failRate = params?.failRate ?? 0.5;

        // 模拟随机失败
        if (Math.random() < failRate) {
            throw new Error('服务暂时不可用，请稍后重试');
        }

        return {
            message: '服务调用成功！',
            timestamp: new Date().toISOString()
        };
    }
});

async function main() {
    const logger = new ConsoleLogger({ level: LogLevel.DEBUG });

    // 示例 1: 基础错误处理
    console.log('\n=== 示例 1: 基础错误处理 ===\n');

    try {
        // 模拟一个会失败的操作
        throw new Error('网络连接超时');
    } catch (error) {
        const agentError = AgentError.from(error);
        console.log('错误类别:', agentError.category);
        console.log('错误消息:', agentError.message);
        console.log('可恢复:', agentError.recoverable);
        console.log('恢复策略:', agentError.getRecoveryStrategy());
    }

    // 示例 2: 创建特定类型的错误
    console.log('\n=== 示例 2: 创建特定类型的错误 ===\n');

    const llmError = AgentError.llmError('API 密钥无效');
    console.log('LLM 错误:', llmError.toJSON());

    const toolError = AgentError.toolError('工具执行失败', 'my_tool');
    console.log('工具错误:', toolError.toJSON());

    const timeoutError = AgentError.timeoutError(30000);
    console.log('超时错误:', timeoutError.toJSON());

    // 示例 3: 带重试的函数执行
    console.log('\n=== 示例 3: 带重试的函数执行 ===\n');

    let attempts = 0;

    try {
        const result = await withRetry(
            async () => {
                attempts++;
                console.log(`尝试 #${attempts}...`);

                if (attempts < 3) {
                    throw new Error('模拟失败');
                }

                return { success: true };
            },
            {
                maxRetries: 5,
                backoff: 'exponential',
                initialDelayMs: 100,
                onRetry: (error, attempt) => {
                    console.log(`重试 #${attempt + 1}: ${(error as Error).message}`);
                }
            }
        );

        console.log('最终结果:', result);
    } catch (error) {
        console.log('所有重试都失败了:', (error as Error).message);
    }

    // 示例 4: 在 Agent 中处理错误
    console.log('\n=== 示例 4: 在 Agent 中处理错误 ===\n');

    const tools = new RegistryToolProvider();
    tools.register(UnstableTool);

    // 注意：这个示例需要有效的 API Key
    if (!process.env.OPENAI_API_KEY) {
        console.log('跳过 Agent 示例（需要 OPENAI_API_KEY）');
        return;
    }

    const llm = new OpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini'
    });

    const runtime = new DefaultAgentRuntime();

    console.log('用户: 帮我调用那个不稳定的服务\n');
    console.log('助手: ');

    for await (const event of runtime.run(
        {
            messages: [{ role: 'user', content: '帮我调用那个不稳定的服务，失败率设为 0.3' }]
        },
        {
            sessionId: crypto.randomUUID(),
            llm,
            tools,
            logger
        }
    )) {
        switch (event.type) {
            case 'delta':
                process.stdout.write(event.text);
                break;
            case 'tool_call':
                console.log(`\n[调用工具: ${event.call.name}]`);
                break;
            case 'tool_result':
                if (event.result.success) {
                    console.log(`[成功: ${JSON.stringify(event.result.data)}]`);
                } else {
                    console.log(`[失败: ${event.result.error}]`);
                }
                break;
            case 'error':
                console.error(`\n[Agent 错误: ${event.error.category}] ${event.error.message}`);
                if (event.error.suggestion) {
                    console.log(`建议: ${event.error.suggestion}`);
                }
                break;
            case 'done':
                console.log(`\n\n✓ 完成 (成功: ${event.success})`);
                break;
        }
    }
}

main().catch(console.error);
