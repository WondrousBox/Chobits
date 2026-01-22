/**
 * 带记忆的多轮对话示例
 *
 * 演示如何使用记忆系统进行多轮对话
 */

import { ConsoleLogger, DefaultAgentRuntime, LogLevel, Message, OpenAIAdapter, RegistryToolProvider, SimpleMemoryProvider } from '../src';

async function main() {
  // 1. 创建组件
  const logger = new ConsoleLogger({ level: LogLevel.INFO });
  const tools = new RegistryToolProvider();

  const memory = new SimpleMemoryProvider();
  const llm = new OpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-mini'
  });

  const runtime = new DefaultAgentRuntime();

  // 2. 会话 ID
  const sessionId = crypto.randomUUID();
  logger.info(`Session started: ${sessionId}`);

  // 3. 上下文
  const context = {
    sessionId,
    llm,
    tools,
    memory,
    logger
  };

  // 4. 对话历史
  const messages: Message[] = [];

  // 5. 辅助函数：执行对话
  async function chat(userInput: string): Promise<string> {
    console.log(`\n用户: ${userInput}`);
    messages.push({ role: 'user', content: userInput });

    let response = '';
    console.log('助手: ');

    for await (const event of runtime.run({ messages, systemPrompt: '你是一个友好的助手。记住用户告诉你的信息。' }, context)) {
      if (event.type === 'delta') {
        process.stdout.write(event.text);
        response += event.text;
      } else if (event.type === 'tool_call') {
        console.log(`\n[使用工具: ${event.call.name}]`);
      }
    }

    console.log('\n');
    messages.push({ role: 'assistant', content: response });

    return response;
  }

  // 6. 多轮对话
  await chat('你好！我叫小明。');
  await chat('你还记得我叫什么吗？');
  await chat('现在几点了？');
  await chat('帮我总结一下我们刚才聊了什么。');

  // 7. 清理
  memory.destroy();
  logger.info('Session ended');
}

main().catch(console.error);
