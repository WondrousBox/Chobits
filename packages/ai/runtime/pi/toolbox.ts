/**
 * Toolbox — 渐进式工具技能加载系统
 *
 * 从 toolbox.md 内容解析工具技能章节，构建轻量索引。
 * Agent 通过 toolboxLookupTool 按需加载相关技能的详细使用说明。
 *
 * 内容通过 Vite raw import 从 toolbox.md 加载，编辑 md 文件即可生效。
 */

// ━━ Types ━━

export interface ToolboxSkillEntry {
  /** 章节标题（去掉 ## 前缀） */
  name: string;
  /** 触发词列表（从 **触发词：** 行解析） */
  triggers: string[];
  /** 涉及工具列表（从 **涉及工具：** 行解析） */
  tools: string[];
  /** 章节完整内容（包含标题以下所有文本） */
  content: string;
  /** 在源内容中的行号范围 */
  lineStart: number;
  lineEnd: number;
}

export interface ToolboxIndex {
  /** 所有技能条目 */
  skills: ToolboxSkillEntry[];
  /** 技能概览（名称 + 触发词摘要），用于注入 system prompt */
  catalog: string;
}

// ━━ Content (loaded from toolbox.md via Vite raw import) ━━

import TOOLBOX_CONTENT from './toolbox.md?raw';
// 编辑 toolbox.md 后，运行 `node -e "console.log(require('fs').readFileSync('packages/ai/runtime/pi/toolbox.md','utf8'))"` 查看内容
// 然后更新下面的常量。未来可用 Vite raw import 自动化。

// description: '
// **关于推送资源卡片的工作流程**：
// 当用户想要查看资源、询问有没有某个资源、或者你找到了用户需要的资源时：
// 1. 先使用 resourceQueryTool 查询资源（获取 resourceId 和资源信息）
// 2. 使用 pushCardTool 推送资源卡片到聊天窗口，让用户可以直接点击查看
// 3. 推送卡片时，可以附带简短的文字说明（text 参数）

// pushCardTool 使用示例：
// - 推送数据库中的资源：pushCardTool({ type: 'video', resourceId: 'xxx', text: '这是你想要找的视频' })
// - 推送临时内容：pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })

// **关于翻译功能的工作流程**：
// 当用户需要翻译字幕时，请按照以下步骤操作：
// 1. 使用 resourceQueryTool 查找要翻译的字幕文件（获取 resourceId）
// 2. 直接使用 translationTool 执行翻译（只需传入 resourceId 和 targetLanguage）
// 3. 翻译会在后台异步进行，完成后会通知用户

// **关于总结功能的工作流程**：
// 当用户需要总结字幕或文本内容时，请按照以下步骤操作：
// 1. 使用 resourceQueryTool 查找要总结的字幕文件（获取 resourceId）
// 2. 直接使用 summaryTool 执行总结（只需传入 resourceId 和 targetLanguage）
// 3. 总结会在后台异步进行，完成后会通知用户

// **关于 YouTube 下载功能的工作流程**：
// 当用户提供 YouTube 链接并要求下载时，请按照以下步骤操作：
// 1. 识别用户消息中的 YouTube 链接（youtube.com 或 youtu.be）
// 2. 使用 youtubeDownloadTool 下载视频（传入 url 和可选的 quality、filename 等）
// 3. 下载任务启动后，告知用户下载已开始，并说明可以在下载管理器中查看进度
// 4. **友情提示**：如果返回了 channelInfo，建议用户订阅该频道："如果你喜欢这个频道，我可以帮你订阅它，这样就能自动获取最新视频了。想要订阅吗？"

// **关于 YouTube 订阅功能的工作流程**：
// 当用户要求订阅 YouTube 频道时，请按照以下步骤操作：
// 1. 使用 youtubeSubscribeTool 订阅频道（传入 channelIdOrUrl）
// 2. 可选询问用户是否需要自动下载新视频（autoDownload 参数）
// 3. 订阅成功后，告知用户订阅信息（频道名称、视频数量等）
// 4. 如果有 latestVideos，可以向用户展示最新的几个视频

// **重要提示**：
// - 当用户询问资源或想要查看资源时，务必使用 pushCardTool 推送资源卡片
// - 翻译和总结工具只需要 resourceId，会自动加载字幕内容，无需先调用 readSubtitleTool
// - readSubtitleTool 主要用于预览字幕内容，翻译/总结前不是必须调用的
// - YouTube 下载和订阅工具可以直接调用，不需要先查询资源
// - 下载任务是异步的，立即返回不代表下载完成
// - 订阅后的视频可以在资源库的"订阅"标签中查看
// - 如果用户没有指定目标语言，可以询问用户想要翻译/总结成什么语言

// 请根据用户的需求自主选择合适的工具来完成任务。
// 如果不需要使用工具，直接回答用户的问题即可。
// 回答时请使用中文，保持友好和专业。

// ## 长期记忆

// 你有访问用户长期记忆的能力。可用以下工具：
// - **memorySearchTool**: 搜索过去的对话要点、决策和偏好
// - **memoryGetTool**: 读取记忆的具体段落内容
// - **memoryTopicsTool**: 浏览记忆主题图谱
// - **memorySaveTool**: 将重要信息保存到长期记忆

// ### 记忆检索指南：
// 1. 当用户提到"之前"、"上次"、"记得"、"我们聊过"、"你还记得吗"等词语时，**必须主动调用 memorySearchTool 搜索记忆**，不要直接说没有记忆
// 2. 当用户询问聊天历史、之前的对话内容时，使用 memorySearchTool 搜索，如果没有具体关键词，可以用 memoryTopicsTool 浏览所有主题
// 3. 当用户的问题涉及偏好、决定、待办时，搜索记忆以保持一致性
// 4. 先用 memorySearchTool 获取摘要，需要详情时再用 memoryGetTool 读取
// 5. 不要凭空编造记忆内容，如果搜索后确实没有找到相关记忆，诚实告知

// ### 自主保存记忆指南：
// 你需要**主动判断对话中是否出现了值得长期记住的内容**，并自动调用 memorySaveTool 保存。不要等用户说"帮我记住"才保存。

// **应当自动保存的内容**（满足任一即可）：
// - 用户明确表达的**个人偏好**（如喜好、习惯、工作方式、技术栈偏好等）
// - 用户做出的**重要决策或结论**（如项目方案选型、架构决定、设计原则等）
// - 用户分享的**关键个人信息**（如项目背景、团队情况、工作职责等）
// - 对话中产生的**重要待办事项或计划**（如下一步要做什么、里程碑等）
// - 用户明确提出的**需求或目标**（如产品需求、功能期望、长期计划等）
// - 经过深入讨论后达成的**技术方案或解决方案**
// - 用户说"记住"、"帮我记一下"、"保存这个"时（显式请求）

// **不应自动保存的内容**：
// - 临时性的闲聊、问候、简单问答
// - 通用知识问答（用户没有分享个人信息）
// - 纯粹的工具操作指令（如"帮我翻译这个字幕"）
// - 已经在之前的记忆中保存过的重复内容

// **保存时的注意事项**：
// - 保存时选择一个简洁准确的主题标签（topic），方便日后检索
// - 内容要提炼核心要点，不要逐字记录对话原文
// - 设置合理的 importance（一般偏好 0.6，重要决策 0.8，关键规划 0.9）
// - 提取足够的 keywords 以便检索（至少 3 个）
// - 保存后简短告知用户"我已经记住了这个信息"，不需要长篇说明

// **重要**：在回答"我们聊过什么"这类问题前，一定要先调用工具搜索，不能直接假设没有记忆。`,

// ━━ Parser ━━

function parseTriggersLine(line: string): string[] {
  // "**触发词：** 查找资源、找视频、找音频" → ["查找资源", "找视频", "找音频"]
  const match = line.match(/\*\*触发词[：:]\*\*\s*(.+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,，;；]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseToolsLine(line: string): string[] {
  // "**涉及工具：** resourceQueryTool, pushCardTool" → ["resourceQueryTool", "pushCardTool"]
  const match = line.match(/\*\*涉及工具[：:]\*\*\s*(.+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,，;；]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseToolboxMarkdown(markdown: string): ToolboxSkillEntry[] {
  const lines = markdown.split('\n');
  const skills: ToolboxSkillEntry[] = [];
  let current: { name: string; lineStart: number; contentLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)$/);

    if (headingMatch) {
      // 结束上一个章节
      if (current) {
        skills.push(buildEntry(current, i - 1));
      }
      current = { name: headingMatch[1].trim(), lineStart: i + 1, contentLines: [] };
    } else if (current) {
      current.contentLines.push(line);
    }
  }

  // 最后一个章节
  if (current) {
    skills.push(buildEntry(current, lines.length));
  }

  return skills;
}

function buildEntry(raw: { name: string; lineStart: number; contentLines: string[] }, lineEnd: number): ToolboxSkillEntry {
  const content = raw.contentLines.join('\n').trim();
  let triggers: string[] = [];
  let tools: string[] = [];

  for (const line of raw.contentLines) {
    if (!triggers.length) {
      const t = parseTriggersLine(line);
      if (t.length) triggers = t;
    }
    if (!tools.length) {
      const t = parseToolsLine(line);
      if (t.length) tools = t;
    }
    if (triggers.length && tools.length) break;
  }

  return {
    name: raw.name,
    triggers,
    tools,
    content,
    lineStart: raw.lineStart,
    lineEnd
  };
}

// ━━ Index ━━

let cachedIndex: ToolboxIndex | null = null;

export function loadToolboxIndex(): ToolboxIndex {
  if (cachedIndex) return cachedIndex;

  const skills = parseToolboxMarkdown(TOOLBOX_CONTENT);

  const catalogLines = skills.map((s) => {
    const triggerHint = s.triggers.length > 0 ? `（${s.triggers.slice(0, 4).join('、')}）` : '';
    return `- **${s.name}**${triggerHint}`;
  });

  cachedIndex = {
    skills,
    catalog: catalogLines.join('\n')
  };
  return cachedIndex;
}

/** 清除缓存（开发时热更新用） */
export function resetToolboxCache(): void {
  cachedIndex = null;
}

// ━━ Search ━━

/**
 * 根据查询匹配相关技能。
 * 匹配策略：触发词包含检索 > 名称包含检索 > 工具名匹配
 */
export function searchToolbox(query: string, maxResults = 3): ToolboxSkillEntry[] {
  const index = loadToolboxIndex();
  if (!index.skills.length) return [];

  const q = query.toLowerCase();

  // 评分
  const scored = index.skills.map((skill) => {
    let score = 0;

    // 触发词匹配（权重最高）
    for (const trigger of skill.triggers) {
      if (q.includes(trigger.toLowerCase())) {
        score += 10;
      } else if (trigger.toLowerCase().includes(q)) {
        score += 5;
      }
    }

    // 名称匹配
    if (q.includes(skill.name.toLowerCase()) || skill.name.toLowerCase().includes(q)) {
      score += 8;
    }

    // 工具名匹配
    for (const tool of skill.tools) {
      if (q.includes(tool.toLowerCase())) {
        score += 6;
      }
    }

    // 查询词在内容中出现
    const queryTokens = q.split(/[\s,，、;；]+/).filter((t) => t.length > 1);
    for (const token of queryTokens) {
      if (skill.content.toLowerCase().includes(token)) {
        score += 2;
      }
      for (const trigger of skill.triggers) {
        if (trigger.toLowerCase().includes(token)) {
          score += 3;
        }
      }
    }

    return { skill, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.skill);
}

/** 列出所有技能名称（供 agent 浏览） */
export function listToolboxSkills(): Array<{ name: string; triggers: string[]; tools: string[] }> {
  const index = loadToolboxIndex();
  return index.skills.map((s) => ({
    name: s.name,
    triggers: s.triggers,
    tools: s.tools
  }));
}

/** 按名称精确获取技能详情 */
export function getToolboxSkill(name: string): ToolboxSkillEntry | undefined {
  const index = loadToolboxIndex();
  return index.skills.find((s) => s.name === name || s.name.toLowerCase() === name.toLowerCase());
}
