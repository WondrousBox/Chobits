import { parseJsonMarkdown } from '../json';
import {
  formatConversationRouteMessages,
  formatConversationRouteSnapshotForPrompt,
  normalizeRouteDelta
} from './conversation-route-service';
import type { ConversationRouteChatFn, ConversationRouteDelta, ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';

export interface ExtractConversationRouteDeltaInput {
  conversationId: string;
  messages: ConversationRouteMessage[];
  snapshot?: ConversationRouteSnapshot | null;
  workspaceId?: string | null;
}

const ROUTE_DELTA_PROMPT = `你是 Conversation Route Memory 的增量提取器。你的任务是从本轮新增对话中提取会话线路事件，并给出短 snapshot patch。

只记录会影响当前会话走向的信息：
- 用户目的、话题转折、待办、任务进展、已完成事项
- 用户纠正、约束、关键线索、决策、阻碍、开放问题
- 不记录寒暄、重复确认、普通解释、没有后续价值的临时句子

输出预算与膨胀控制：
- 整个 JSON 应尽量控制在 1800 字以内；没有持久价值时输出 {"events":[],"snapshotPatch":{}}
- events 通常 0~3 个，最多 4 个；只选对后续路线最有用的变化，不要为每条消息都造事件
- title 不超过 18 个汉字，content/evidence 各不超过 80 个汉字，tags 最多 3 个
- snapshotPatch 是 patch，不是完整 snapshot；只输出本轮新增、修正或需要替换的字段
- 不要把“现有会话线路快照”原样复制进 snapshotPatch，也不要把旧 summary 继续追加成长段落
- summary 是滚动短摘要，只保留当前会话走向的一句话，不超过 90 个汉字
- activeThreads/keyConstraints/userCorrections/keyClues/decisions/blockers 每项不超过 40 个汉字，每个数组最多 3 项
- currentGoal/currentTopic/nextSuggestedFocus 每个不超过 60 个汉字；没有明确变化就省略该字段

规则：
- 每个事件必须给 seqStart/seqEnd，且必须落在新增消息范围内
- 用户纠正优先级高于旧 snapshot 和 assistant 总结
- 不要把 assistant 的推测写成用户事实
- importance/confidence 是 0~1
- 如果只是延续旧目标，优先输出更短的 snapshotPatch 或空 patch，不要重复旧事件
- 只输出 JSON，不要解释

JSON 结构：
{
  "events": [
    {
      "type": "user_goal|topic_shift|task_added|task_progress|task_done|open_question|decision|key_clue|user_correction|constraint|preference|blocker|assumption|summary_checkpoint",
      "title": "短标题",
      "content": "一句话说明",
      "seqStart": 1,
      "seqEnd": 2,
      "status": "active|resolved|superseded|abandoned",
      "importance": 0.8,
      "confidence": 0.8,
      "tags": ["可选标签"],
      "resolvesEventIds": [],
      "supersedesEventIds": []
    }
  ],
  "snapshotPatch": {
    "currentGoal": "当前目标",
    "currentTopic": "当前话题",
    "activeThreads": ["活跃线路"],
    "keyConstraints": ["约束"],
    "userCorrections": ["用户纠正"],
    "keyClues": ["关键线索"],
    "decisions": ["决策"],
    "blockers": ["阻碍"],
    "nextSuggestedFocus": "下一步建议",
    "summary": "短总结"
  }
}`;

export async function extractConversationRouteDelta(input: ExtractConversationRouteDeltaInput, chatFn?: ConversationRouteChatFn, signal?: AbortSignal): Promise<ConversationRouteDelta> {
  if (!input.messages.length) {
    return { events: [], snapshotPatch: {} };
  }

  if (!chatFn) {
    return extractConversationRouteDeltaByRules(input);
  }

  const prompt = buildConversationRouteDeltaPrompt(input);
  try {
    const response = await chatFn(prompt, signal);
    const parsed = parseJsonMarkdown(response);
    const delta = normalizeRouteDelta(parsed);
    if (delta.events.length || Object.keys(delta.snapshotPatch).length) {
      return delta;
    }
  } catch (error) {
    console.warn('[ConversationRouteExtractor] LLM extraction failed, falling back to rules:', error instanceof Error ? error.message : error);
  }

  return extractConversationRouteDeltaByRules(input);
}

export function extractConversationRouteDeltaByRules(input: ExtractConversationRouteDeltaInput): ConversationRouteDelta {
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  if (!userMessages.length) return { events: [], snapshotPatch: {} };

  const events: ConversationRouteDelta['events'] = [];
  const latestUserMessage = userMessages[userMessages.length - 1];
  const latestText = compactText(latestUserMessage.content, 260);
  const allUserText = compactText(userMessages.map((message) => message.content).join('\n'), 600);

  if (matchesAny(allUserText, ['我希望', '我想', '目标', 'goal', '目的', '需要一个', '要实现'])) {
    events.push({
      confidence: 0.62,
      content: latestText,
      importance: 0.72,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '用户目标'),
      type: 'user_goal'
    });
  }

  if (matchesAny(allUserText, ['先', '接下来', '待办', '实现', '设计', '文档', '放到', '补充', '检查', '测试'])) {
    events.push({
      confidence: 0.58,
      content: latestText,
      importance: 0.68,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '新增待办'),
      type: 'task_added'
    });
  }

  if (matchesAny(allUserText, ['完成了', '处理好了', '已经好了', '已完成', 'done', 'fixed', '通过了'])) {
    events.push({
      confidence: 0.58,
      content: latestText,
      importance: 0.66,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'resolved',
      tags: ['rule-based'],
      title: titleFromText(latestText, '完成事项'),
      type: 'task_done'
    });
  }

  if (matchesAny(allUserText, ['不是', '而是', '纠正', '我认为', '还需要', '不对', '应该'])) {
    events.push({
      confidence: 0.6,
      content: latestText,
      importance: 0.75,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '用户纠正'),
      type: 'user_correction'
    });
  }

  if (matchesAny(allUserText, ['必须', '不能', '不要', '限制', '要求', '约束', '优先', '只能'])) {
    events.push({
      confidence: 0.58,
      content: latestText,
      importance: 0.7,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '约束'),
      type: 'constraint'
    });
  }

  if (matchesAny(allUserText, ['决定', '就用', '采用', '方案', '选择', '定下来'])) {
    events.push({
      confidence: 0.56,
      content: latestText,
      importance: 0.68,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '决策'),
      type: 'decision'
    });
  }

  if (matchesAny(allUserText, ['卡住', '报错', '失败', '阻塞', '不能工作', '不生效', 'error'])) {
    events.push({
      confidence: 0.6,
      content: latestText,
      importance: 0.72,
      seqEnd: latestUserMessage.seq,
      seqStart: latestUserMessage.seq,
      status: 'active',
      tags: ['rule-based'],
      title: titleFromText(latestText, '阻碍'),
      type: 'blocker'
    });
  }

  if (events.length === 0) {
    return { events: [], snapshotPatch: {} };
  }

  return {
    events: dedupeEvents(events).slice(0, 4),
    snapshotPatch: {
      currentGoal: input.snapshot?.currentGoal || titleFromText(latestText, '继续当前对话目标'),
      keyClues: [latestText],
      nextSuggestedFocus: '围绕用户最新目标继续推进，并优先遵守用户纠正。',
      summary: compactText(latestText, 220)
    }
  };
}

function buildConversationRouteDeltaPrompt(input: ExtractConversationRouteDeltaInput): string {
  const existingSnapshot = input.snapshot ? formatConversationRouteSnapshotForPrompt(input.snapshot, 900) : '（暂无现有线路快照）';
  const newMessages = formatConversationRouteMessages(input.messages);

  return `${ROUTE_DELTA_PROMPT}

---
conversationId: ${input.conversationId}
workspaceId: ${input.workspaceId || '(none)'}

现有会话线路快照：
${existingSnapshot}

新增对话消息：
${newMessages}`;
}

function dedupeEvents(events: ConversationRouteDelta['events']): ConversationRouteDelta['events'] {
  const seen = new Set<string>();
  const out: ConversationRouteDelta['events'] = [];
  for (const event of events) {
    const key = `${event.type}:${event.seqStart}:${event.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function matchesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function titleFromText(text: string, fallback: string): string {
  const normalized = compactText(text.replace(/[#*>`]/g, ''), 48);
  return normalized || fallback;
}

function compactText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}
