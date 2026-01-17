/**
 * Mastra Agent 定义
 *
 * 这里定义了所有 Agent，使用 Mastra 的 Agent 类
 * Agent 会自主决策何时使用工具
 */

import { Agent } from '@mastra/core/agent';

import { allTools } from '../tools';

// ============================================================================
// 基础助手 Agent
// ============================================================================

export const assistantAgent = new Agent({
  name: 'assistant',
  instructions: `你是一个智能助手，可以帮助用户完成各种任务。

你的能力包括：
- 回答问题和提供信息
- 查询天气信息
- 获取当前时间
- 执行数学计算

请根据用户的需求自主选择合适的工具来完成任务。
如果不需要使用工具，直接回答用户的问题即可。
回答时请使用中文，保持友好和专业。`,
  model: 'openai/gpt-4',
  tools: allTools
});

// ============================================================================
// RAG Agent（检索增强生成）
// ============================================================================

export const ragAgent = new Agent({
  name: 'rag',
  instructions: `你是一个严谨的知识助手，专门基于检索到的上下文信息回答问题。

工作原则：
1. 优先使用提供的"检索上下文"信息回答问题
2. 如果上下文信息不足以回答问题，请明确说明
3. 不要编造或猜测未在上下文中提及的信息
4. 引用信息时，尽量指明来源

回答时请使用中文，保持准确和客观。`,
  model: 'openai/gpt-4',
  tools: allTools
});

// ============================================================================
// 标签/总结 Agent
// ============================================================================

export const taggerAgent = new Agent({
  name: 'tagger',
  instructions: `你是一个资深文本归纳与主题提取助手。

目标：从给定文本中提炼出主题/话题标签。

要求：
- 标签应尽量短小、泛化，避免冗长描述
- 控制在一个单词或短语内
- 最多返回 5 个中文标签
- 按相关性降序排列
- 仅返回 JSON 数组格式，例如：["标签1","标签2","标签3"]
- 不要包含任何解释性文字`,
  model: 'openai/gpt-4',
  tools: {}
});

// ============================================================================
// 翻译 Agent
// ============================================================================

export const translatorAgent = new Agent({
  name: 'translator',
  instructions: `你是一个专业的翻译助手，专门负责字幕和文本的翻译工作。

翻译原则：
1. 保持原文的语气和风格
2. 确保翻译流畅自然，符合目标语言的表达习惯
3. 专有名词和术语保持一致性
4. 如有术语表，严格按照术语表翻译
5. 注意上下文的连贯性

输出格式：
- 按照要求的格式输出翻译结果
- 不要添加额外的解释或注释`,
  model: 'openai/gpt-4',
  tools: {}
});

// ============================================================================
// 导出所有 Agent
// ============================================================================

export const agents = {
  assistant: assistantAgent,
  rag: ragAgent,
  tagger: taggerAgent,
  translator: translatorAgent
};

/**
 * 获取 Agent
 */
export function getAgent(id: string): Agent | undefined {
  return (agents as Record<string, Agent>)[id];
}

/**
 * 列出所有 Agent
 */
export function listAgents(): Array<{ id: string; name: string; description?: string }> {
  return Object.entries(agents).map(([id, agent]) => ({
    id,
    name: agent.name,
    description: (agent as any).instructions?.slice(0, 100)
  }));
}
