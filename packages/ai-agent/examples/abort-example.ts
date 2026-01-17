/**
 * 中止执行示例
 *
 * 演示如何中止正在执行的 Agent 任务
 */

import { ConsoleLogger, createTool, DefaultAgentRuntime, LogLevel, OpenAIAdapter, RegistryToolProvider, sleep } from '../src';

// 创建一个耗时的工具
const SlowTool = createTool<{ seconds: number }, { message: string; duration: number }>({
    name: 'slow_operation',
    description: '执行一个耗时的操作',
    parameters: {
        type: 'object',
        properties: {
            seconds: {
                type: 'number',
                description: '操作耗时（秒）',
                minimum: 1,
                maximum: 60
            }
        },
        required: ['seconds']
    },
    async execute(params) {
        const seconds = params.seconds;
        console.log(`[SlowTool] 开始执行，预计耗时 ${seconds} 秒...`);

        // 模拟耗时操作
        await sleep(seconds * 1000);

        return {
            message: `操作完成！`,
            duration: seconds
        };
    }
});

async function main() {
    const logger = new ConsoleLogger({ level: LogLevel.INFO });

    const tools = new RegistryToolProvider();
    tools.register(SlowTool);

    if (!process.env.OPENAI_API_KEY) {
        console.log('需要 OPENAI_API_KEY 环境变量');
        return;
    }

    const llm = new OpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini'
    });

    const runtime = new DefaultAgentRuntime();

    console.log('\n=== 中止执行示例 ===\n');
    console.log('将在 3 秒后中止执行...\n');

    // 设置 3 秒后中止
    setTimeout(() => {
        console.log('\n[主进程] 发送中止信号...');
        runtime.abort();
    }, 3000);

    console.log('用户: 帮我执行一个 10 秒的慢操作\n');
    console.log('助手: ');

    for await (const event of runtime.run(
        {
            messages: [{ role: 'user', content: '帮我执行一个 10 秒的慢操作' }]
        },
        {
            sessionId: crypto.randomUUID(),
            llm,
            tools,
            logger,
            options: {
                timeout: 60000 // 不使用超时，手动中止
            }
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
                console.log(`[工具结果: ${JSON.stringify(event.result)}]`);
                break;
            case 'error':
                console.log(`\n[错误: ${event.error.message}]`);
                break;
            case 'done':
                console.log(`\n\n✓ 执行结束 (成功: ${event.success})`);
                if (!event.success) {
                    console.log('执行被中止了！');
                }
                break;
        }
    }
}

main().catch(console.error);
