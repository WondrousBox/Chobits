/**
 * 自定义工具示例
 *
 * 演示如何创建和注册自定义工具
 */

import { ConsoleLogger, createTool, DefaultAgentRuntime, LogLevel, OpenAIAdapter, RegistryToolProvider, Tool } from '../src';

// 1. 使用 createTool 创建工具
const CalculatorTool = createTool<{ expression: string }, { result: number; expression: string }>({
  name: 'calculator',
  description: '计算数学表达式',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式（如 "2 + 3 * 4"）'
      }
    },
    required: ['expression']
  },
  async execute(params) {
    // 简单的安全计算（仅支持基本运算）
    const safeExpr = params.expression.replace(/[^0-9+\-*/().\s]/g, '');
    const result = Function(`"use strict"; return (${safeExpr})`)();
    return {
      result,
      expression: params.expression
    };
  }
});

// 2. 直接实现 Tool 接口
const SearchTool: Tool = {
  name: 'search',
  description: '搜索互联网获取信息',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询'
      },
      maxResults: {
        type: 'integer',
        description: '最大结果数量（默认 5）',
        minimum: 1,
        maximum: 20
      }
    },
    required: ['query']
  },
  async execute(params: unknown) {
    const { query, maxResults = 5 } = params as { query: string; maxResults?: number };

    // 模拟搜索结果
    const results = [
      { title: `关于 "${query}" 的百科介绍`, url: 'https://example.com/wiki' },
      { title: `${query} - 最新新闻`, url: 'https://example.com/news' },
      { title: `${query} 教程`, url: 'https://example.com/tutorial' }
    ];

    return {
      query,
      results: results.slice(0, maxResults),
      totalResults: results.length
    };
  }
};

// 3. 带验证的工具
const TranslateTool = createTool<{ text: string; from?: string; to: string }, { original: string; translated: string; from: string; to: string }>({
  name: 'translate',
  description: '翻译文本',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '要翻译的文本'
      },
      from: {
        type: 'string',
        description: '源语言（如 "zh", "en"，默认自动检测）'
      },
      to: {
        type: 'string',
        description: '目标语言（如 "zh", "en"）'
      }
    },
    required: ['text', 'to']
  },
  async execute(params) {
    const { text, from = 'auto', to } = params;

    // 模拟翻译
    const translations: Record<string, Record<string, string>> = {
      Hello: { zh: '你好' },
      你好: { en: 'Hello' },
      'Good morning': { zh: '早上好' },
      早上好: { en: 'Good morning' }
    };

    const translated = translations[text]?.[to] || `[翻译后的 "${text}"]`;

    return {
      original: text,
      translated,
      from,
      to
    };
  },
  validate(params) {
    const p = params as { text?: string; to?: string };
    if (!p.text || p.text.trim() === '') {
      return { valid: false, error: '文本不能为空' };
    }
    if (!p.to) {
      return { valid: false, error: '必须指定目标语言' };
    }
    return { valid: true };
  }
});

async function main() {
  const logger = new ConsoleLogger({ level: LogLevel.DEBUG });

  // 创建工具提供者并注册工具
  const tools = new RegistryToolProvider();
  tools.register(CalculatorTool);
  tools.register(SearchTool);
  tools.register(TranslateTool);

  logger.info(`注册了 ${tools.size} 个工具: ${tools.names().join(', ')}`);

  // 创建 LLM
  const llm = new OpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-mini'
  });

  // 创建运行时
  const runtime = new DefaultAgentRuntime();

  // 执行对话
  console.log('\n用户: 帮我算一下 (25 + 15) * 2，然后把"早上好"翻译成英文\n');
  console.log('助手: ');

  for await (const event of runtime.run(
    {
      messages: [
        {
          role: 'user',
          content: '帮我算一下 (25 + 15) * 2，然后把"早上好"翻译成英文'
        }
      ]
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
        console.log(`\n[工具调用: ${event.call.name}(${JSON.stringify(event.call.params)})]`);
        break;
      case 'tool_result':
        console.log(`[结果: ${JSON.stringify(event.result.data)}]`);
        break;
      case 'done':
        console.log('\n\n✓ 完成');
        break;
    }
  }
}

main().catch(console.error);
