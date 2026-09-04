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
  appWindowTool: {
    default: { calling: '打开应用窗口', done: '窗口已打开' },
    conditions: [
      { when: { action: 'list' }, calling: '列出应用窗口', done: '应用窗口列表完成' },
      { when: { action: 'search' }, calling: '查找窗口：{query}', done: '查找窗口完成' },
      { when: { action: 'open' }, calling: '打开窗口：{windowKey}', done: '窗口已打开' }
    ]
  },
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

/** 角色覆盖标签 resolver（pull 模型：查询时实时调用取最新值） */
let characterLabelsResolver: (() => Record<string, ToolLabelDefinition> | undefined) | null = null;

/**
 * 注册角色自定义工具标签的 resolver（标签来自 character.json 的 toolLabels 字段）。
 * 合并策略：角色标签优先，缺省使用默认标签。
 * 由 wiring 层注入一次，之后每次查询实时取最新值，无需手动刷新推送。
 */
export function registerCharacterToolLabelsResolver(resolver: (() => Record<string, ToolLabelDefinition> | undefined) | null): void {
  characterLabelsResolver = resolver;
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

  // 仅在角色人格注入开启时使用角色覆盖标签（经 resolver 实时取最新值）
  const def = (useCharacterOverrides ? characterLabelsResolver?.()?.[toolName] : undefined) ?? DEFAULT_TOOL_LABELS[toolName];

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
