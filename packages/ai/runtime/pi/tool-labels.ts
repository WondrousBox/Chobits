/**
 * Tool Label System — 工具调用展示文案
 *
 * 提供默认的工具调用标签，并支持角色人格自定义覆盖。
 * 标签支持 `{paramKey}` 占位符，运行时会从工具入参中替换。
 *
 * 例：`"翻了翻工具箱，搜索「{query}」……"` + args `{ query: "翻译" }`
 *   → `"翻了翻工具箱，搜索「翻译」……"`
 */

// ━━ Types ━━

/** 单条工具标签模板 */
export interface ToolLabelTemplate {
  /** 工具调用中的展示文案（支持 {param} 占位符） */
  calling: string;
  /** 工具调用完成时的展示文案（支持 {param} 占位符） */
  done: string;
}

/**
 * 条件标签：根据入参值匹配不同的文案模板。
 * 按数组顺序匹配，第一个满足条件的胜出，都不满足则用默认标签。
 */
export interface ConditionalToolLabel {
  /** 入参条件：{ paramKey: value } 全部匹配才命中 */
  when: Record<string, string>;
  calling: string;
  done: string;
}

/** 完整的工具标签定义（可在 character.json 中使用） */
export interface ToolLabelDefinition {
  /** 默认标签 */
  default: ToolLabelTemplate;
  /** 条件标签（可选） */
  conditions?: ConditionalToolLabel[];
}

// ━━ Default Labels ━━

const DEFAULT_TOOL_LABELS: Record<string, ToolLabelDefinition> = {
  toolboxTool: {
    default: { calling: '查阅工具箱', done: '查阅工具箱完成' },
    conditions: [
      { when: { action: 'search' }, calling: '搜索工具箱：{query}', done: '搜索工具箱完成' },
      { when: { action: 'list' }, calling: '列出技能', done: '列出技能完成' },
      { when: { action: 'get' }, calling: '获取技能详情：{query}', done: '获取技能详情完成' },
      { when: { action: 'activate' }, calling: '激活工具', done: '工具已激活' },
      { when: { action: 'deactivate' }, calling: '停用工具', done: '工具已停用' }
    ]
  },
  resourceQueryTool: {
    default: { calling: '查询资源', done: '查询资源完成' }
  },
  pushCardTool: {
    default: { calling: '推送卡片', done: '推送卡片完成' }
  },
  translationTool: {
    default: { calling: '翻译字幕', done: '翻译字幕完成' }
  },
  summaryTool: {
    default: { calling: '总结内容', done: '总结内容完成' }
  },
  readSubtitleTool: {
    default: { calling: '读取字幕', done: '读取字幕完成' }
  },
  youtubeDownloadTool: {
    default: { calling: '下载视频：{url}', done: '下载视频任务已创建' }
  },
  youtubeSubscribeTool: {
    default: { calling: '订阅频道', done: '订阅频道完成' }
  },
  memorySearchTool: {
    default: { calling: '搜索记忆：{query}', done: '搜索记忆完成' }
  },
  memoryGetTool: {
    default: { calling: '获取记忆', done: '获取记忆完成' }
  },
  memoryTopicsTool: {
    default: { calling: '浏览记忆主题', done: '浏览记忆主题完成' }
  },
  memorySaveTool: {
    default: { calling: '保存记忆：{topic}', done: '记忆已保存' }
  },
  memoryDiaryTool: {
    default: { calling: '记录日志', done: '日志已记录' }
  },
  workflowRunTool: {
    default: { calling: '执行工作流', done: '工作流完成' },
    conditions: [
      { when: { action: 'search' }, calling: '查找工作流：{query}', done: '查找工作流完成' },
      { when: { action: 'list' }, calling: '列出工作流', done: '列出工作流完成' },
      { when: { action: 'run' }, calling: '运行工作流：{workflowId}', done: '工作流运行完成' }
    ]
  },
  askUserTool: {
    default: { calling: '等待用户选择', done: '用户已选择' }
  },
  webSearchTool: {
    default: { calling: '搜索：{query}', done: '搜索完成' }
  },
  webReadTool: {
    default: { calling: '读取网页', done: '读取网页完成' }
  },
  fileReadTool: {
    default: { calling: '读取文件：{path}', done: '读取文件完成' }
  },
  fileEditTool: {
    default: { calling: '编辑文件：{path}', done: '编辑文件完成' }
  },
  fileWriteTool: {
    default: { calling: '写入文件：{path}', done: '写入文件完成' }
  },
  fileGlobTool: {
    default: { calling: '查找文件：{pattern}', done: '查找文件完成' }
  },
  fileGrepTool: {
    default: { calling: '搜索代码：{pattern}', done: '搜索代码完成' }
  },
  fileListTool: {
    default: { calling: '列出目录：{path}', done: '列出目录完成' }
  },
  shellExecTool: {
    default: { calling: '执行命令：{command}', done: '命令执行完成' }
  }
};

// ━━ Template Rendering ━━

/**
 * 渲染标签模板，将 `{key}` 替换为入参中对应的值。
 * 未匹配的占位符会被移除（避免展示原始 `{key}`）。
 */
function renderTemplate(template: string, args: Record<string, any>): string {
  return template
    .replace(/\{(\w+)\}/g, (_match, key) => {
      const val = args[key];
      if (val === undefined || val === null) return '';
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      // 截断过长的值
      return str.length > 60 ? str.slice(0, 57) + '…' : str;
    })
    .replace(/：\s*$/, '')
    .trim(); // 清理尾部残留的冒号
}

/**
 * 匹配条件标签：检查 args 是否满足 when 条件。
 */
function matchCondition(condition: ConditionalToolLabel, args: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(condition.when)) {
    if (String(args[key]) !== value) return false;
  }
  return true;
}

// ━━ Public API ━━

/** 角色覆盖标签缓存 */
let characterOverrides: Record<string, ToolLabelDefinition> | null = null;

/**
 * 设置角色自定义的工具标签（从 character.json 的 toolLabels 字段加载）。
 * 合并策略：角色标签优先，缺省使用默认标签。
 */
export function setCharacterToolLabels(overrides: Record<string, ToolLabelDefinition> | undefined): void {
  characterOverrides = overrides ?? null;
}

/**
 * 获取工具调用的展示标签。
 *
 * @param toolName 工具名称（如 `toolboxTool`）
 * @param args 工具入参（用于条件匹配和占位符替换）
 * @param phase 阶段：`calling` = 调用中，`done` = 已完成
 * @param useCharacterOverrides 是否启用角色覆盖标签（仅当角色人格注入开启时为 true）
 */
export function resolveToolLabel(toolName: string, args: Record<string, any> | undefined, phase: 'calling' | 'done', useCharacterOverrides = false): string {
  const safeArgs = args ?? {};

  // 仅在角色人格注入开启时使用角色覆盖标签
  const def = (useCharacterOverrides ? characterOverrides?.[toolName] : undefined) ?? DEFAULT_TOOL_LABELS[toolName];

  if (!def) {
    // 没有定义标签的工具，使用工具名
    return phase === 'calling' ? `${toolName}…` : `${toolName} 完成`;
  }

  // 先检查条件标签
  if (def.conditions) {
    for (const cond of def.conditions) {
      if (matchCondition(cond, safeArgs)) {
        return renderTemplate(cond[phase], safeArgs);
      }
    }
  }

  // 使用默认标签
  return renderTemplate(def.default[phase], safeArgs);
}

/** 获取所有默认标签定义（供文档或调试使用） */
export function getDefaultToolLabels(): Readonly<Record<string, ToolLabelDefinition>> {
  return DEFAULT_TOOL_LABELS;
}
