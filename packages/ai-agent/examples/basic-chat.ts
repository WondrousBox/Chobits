/**
 * 基础聊天示例
 *
 * 演示如何使用 AI Agent 进行简单对话
 */

import { ConsoleLogger, DefaultAgentRuntime, LogLevel, OpenAIAdapter, RegistryToolProvider } from '../src';

async function main() {
  // 1. 创建日志器
  const logger = new ConsoleLogger({
    level: LogLevel.DEBUG,
    timestamp: true
  });

  // 2. 创建工具提供者
  const tools = new RegistryToolProvider();

  logger.info(`Registered ${tools.size} tools`);

  // 3. 创建 LLM 适配器
  const llm = new OpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-mini'
  });

  // 4. 创建运行时
  const runtime = new DefaultAgentRuntime();

  // 5. 准备上下文
  const context = {
    sessionId: crypto.randomUUID(),
    llm,
    tools,
    logger,
    options: {
      maxIterations: 5,
      timeout: 30000,
      temperature: 0.7
    }
  };

  // 6. 执行对话
  console.log('\n用户: 现在几点？然后帮我计算 123 + 456\n');
  console.log('助手: ');

  for await (const event of runtime.run(
    {
      messages: [
        {
          role: 'user',
          content: '现在几点？然后帮我计算 123 + 456'
        }
      ],
      systemPrompt: '你是一个有帮助的助手，可以使用工具来帮助用户。'
    },
    context
  )) {
    switch (event.type) {
      case 'delta':
        process.stdout.write(event.text);
        break;

      case 'tool_call':
        console.log(`\n[调用工具: ${event.call.name}]`);
        console.log(`参数: ${JSON.stringify(event.call.params)}`);
        break;

      case 'tool_result':
        console.log(`[工具结果: ${event.result.success ? '成功' : '失败'}]`);
        if (event.result.data) {
          console.log(`数据: ${JSON.stringify(event.result.data)}`);
        }
        break;

      case 'error':
        console.error(`\n错误: ${event.error.message}`);
        break;

      case 'done':
        console.log(`\n\n✓ 完成 (成功: ${event.success})`);
        break;
    }
  }
}

// 运行示例
main().catch(console.error);
