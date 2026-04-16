import type { PiToolDescriptor } from './contracts';

type ToolSeed = Omit<PiToolDescriptor, 'id'>;

const DEFAULT_TOOL_METADATA: Record<string, ToolSeed> = {
  'ask-user': {
    category: 'ui-side-effect',
    description: '向用户展示交互式选项卡，等待用户做出选择',
    compatName: 'askUserTool',
    name: 'askUserTool',
    status: 'ready-for-pi-runtime'
  },
  'file-edit': {
    category: 'file',
    description: 'Edit a text file inside the selected coding workspace by replacing exact text.',
    compatName: 'fileEditTool',
    name: 'fileEditTool',
    status: 'ready-for-pi-runtime'
  },
  'file-glob': {
    category: 'file',
    description: 'Find files or directories inside the selected coding workspace using a glob pattern.',
    compatName: 'fileGlobTool',
    name: 'fileGlobTool',
    status: 'ready-for-pi-runtime'
  },
  'file-grep': {
    category: 'file',
    description: 'Search inside workspace files for matching text.',
    compatName: 'fileGrepTool',
    name: 'fileGrepTool',
    status: 'ready-for-pi-runtime'
  },
  'file-list': {
    category: 'file',
    description: 'List files and directories inside the selected coding workspace.',
    compatName: 'fileListTool',
    name: 'fileListTool',
    status: 'ready-for-pi-runtime'
  },
  'file-read': {
    category: 'file',
    description: 'Read a text file from the selected coding workspace.',
    compatName: 'fileReadTool',
    name: 'fileReadTool',
    status: 'ready-for-pi-runtime'
  },
  'file-write': {
    category: 'file',
    description: 'Write a text file inside the selected coding workspace.',
    compatName: 'fileWriteTool',
    name: 'fileWriteTool',
    status: 'ready-for-pi-runtime'
  },
  'shell-exec': {
    category: 'shell',
    description: 'Run a restricted verification command inside the selected coding workspace.',
    compatName: 'shellExecTool',
    name: 'shellExecTool',
    status: 'ready-for-pi-runtime'
  },
  'skill-search': {
    category: 'meta',
    description: '搜索当前 session 中可用的 skills，并查看它们的 metadata',
    compatName: 'skillSearchTool',
    name: 'skillSearchTool',
    status: 'ready-for-pi-runtime'
  },
  'skill-use': {
    category: 'meta',
    description: '加载并使用一个 skill，返回正文、约束，并在需要时激活相关工具',
    compatName: 'skillUseTool',
    name: 'skillUseTool',
    status: 'ready-for-pi-runtime'
  },
  'push-card': {
    category: 'ui-side-effect',
    description: '在聊天中推送资源卡片',
    compatName: 'pushCardTool',
    name: 'pushCardTool',
    status: 'ready-for-pi-runtime'
  },
  'query-resources': {
    category: 'query',
    description: '智能查询资源库中的内容',
    compatName: 'resourceQueryTool',
    name: 'resourceQueryTool',
    status: 'ready-for-pi-runtime'
  },
  'read-subtitle': {
    category: 'content',
    description: '读取字幕文件内容',
    compatName: 'readSubtitleTool',
    name: 'readSubtitleTool',
    status: 'ready-for-pi-runtime'
  },
  'summarize-content': {
    category: 'background-task',
    description: '总结字幕和文本内容',
    compatName: 'summaryTool',
    name: 'summaryTool',
    status: 'ready-for-pi-runtime'
  },
  'translate-subtitles': {
    category: 'background-task',
    description: '翻译字幕内容',
    compatName: 'translationTool',
    name: 'translationTool',
    status: 'ready-for-pi-runtime'
  },
  'youtube-download': {
    category: 'integration',
    description: '下载 YouTube 视频',
    compatName: 'youtubeDownloadTool',
    name: 'youtubeDownloadTool',
    status: 'ready-for-pi-runtime'
  },
  'youtube-subscribe': {
    category: 'integration',
    description: '订阅 YouTube 频道',
    compatName: 'youtubeSubscribeTool',
    name: 'youtubeSubscribeTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-search': {
    category: 'query',
    description: '搜索长期记忆，回忆过去对话中的要点、决策和偏好',
    compatName: 'memorySearchTool',
    name: 'memorySearchTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-get': {
    category: 'content',
    description: '读取记忆 note 的具体段落内容',
    compatName: 'memoryGetTool',
    name: 'memoryGetTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-topics': {
    category: 'query',
    description: '浏览记忆主题图谱，查看主题层级和关联',
    compatName: 'memoryTopicsTool',
    name: 'memoryTopicsTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-save': {
    category: 'content',
    description: '将重要信息保存到长期记忆（用户要求记住或对话中出现重要内容时自主保存）',
    compatName: 'memorySaveTool',
    name: 'memorySaveTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-diary': {
    category: 'content',
    description: '写入 AI 助手日志，记录对话中的观察、经验和处理策略。该日志不会进入长期记忆检索或自动召回',
    compatName: 'memoryDiaryTool',
    name: 'memoryDiaryTool',
    status: 'ready-for-pi-runtime'
  },
  'memory-refresh-critical': {
    category: 'content',
    description: '立即刷新 MEMORY.md 关键记忆索引，使新保存的重要记忆在后续对话中自动注入',
    compatName: 'memoryRefreshCriticalTool',
    name: 'memoryRefreshCriticalTool',
    status: 'ready-for-pi-runtime'
  },
  'persona-update': {
    category: 'content',
    description: '主动更新用户画像，将对话中发现的用户偏好、目标、活动等立即写入 USER_PERSONA.md',
    compatName: 'personaUpdateTool',
    name: 'personaUpdateTool',
    status: 'ready-for-pi-runtime'
  },
  'toolbox-lookup': {
    category: 'meta',
    description: '万能工具箱：搜索技能、了解工具用法、执行工具',
    compatName: 'toolboxTool',
    name: 'toolboxTool',
    status: 'ready-for-pi-runtime'
  },
  'web-search': {
    category: 'integration',
    description: '搜索互联网获取最新信息',
    compatName: 'webSearchTool',
    name: 'webSearchTool',
    status: 'ready-for-pi-runtime'
  },
  'web-read': {
    category: 'integration',
    description: '读取指定网页的内容',
    compatName: 'webReadTool',
    name: 'webReadTool',
    status: 'ready-for-pi-runtime'
  },
  'workflow-run': {
    category: 'background-task',
    description: '查找和执行工作流，可完成视频转写、音频提取、OCR、关键帧提取、AI图片生成等任务',
    compatName: 'workflowRunTool',
    name: 'workflowRunTool',
    status: 'ready-for-pi-runtime'
  }
};

const TOOL_NAME_TO_ID = buildToolNameToIdMap();
export const DEFAULT_SKILL_TOOL_IDS = ['skill-search', 'skill-use'];

export const DEFAULT_CODER_TOOL_IDS = ['file-list', 'file-read', 'file-glob', 'file-grep', 'file-write', 'file-edit', 'shell-exec', 'ask-user'];

/** All tools available to the assistant profile (registered into session registry) */
export const DEFAULT_SESSION_TOOL_IDS = [
  'query-resources',
  'read-subtitle',
  'translate-subtitles',
  'summarize-content',
  'push-card',
  'youtube-download',
  'youtube-subscribe',
  'memory-search',
  'memory-get',
  'memory-topics',
  'memory-save',
  'memory-refresh-critical',
  'persona-update',
  'toolbox-lookup',
  'workflow-run',
  'web-search',
  'web-read',
  'ask-user',
  'skill-search',
  'skill-use'
];

/** Initially active tools for assistant profile (others activated on-demand via toolbox) */
export const INITIAL_ACTIVE_SESSION_TOOL_IDS = ['toolbox-lookup', 'ask-user'];

function createToolDescriptor(toolId: string): PiToolDescriptor | undefined {
  const meta = DEFAULT_TOOL_METADATA[toolId];
  if (!meta) return undefined;

  return {
    id: toolId,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    status: meta.status,
    compatName: meta.compatName
  };
}

function buildToolNameToIdMap(): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const [toolId, meta] of Object.entries(DEFAULT_TOOL_METADATA)) {
    mapping.set(normalizeToolLookupValue(toolId), toolId);
    mapping.set(normalizeToolLookupValue(meta.name), toolId);
    if (meta.compatName) {
      mapping.set(normalizeToolLookupValue(meta.compatName), toolId);
    }
  }

  return mapping;
}

function normalizeToolLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

export function resolvePiToolId(toolNameOrId?: string): string | undefined {
  if (!toolNameOrId?.trim()) return undefined;
  return TOOL_NAME_TO_ID.get(normalizeToolLookupValue(toolNameOrId));
}

export function listPiToolDescriptors(): PiToolDescriptor[] {
  return Object.keys(DEFAULT_TOOL_METADATA)
    .map((toolId) => createToolDescriptor(toolId))
    .filter((tool): tool is PiToolDescriptor => Boolean(tool));
}

export function getPiToolDescriptor(toolId: string): PiToolDescriptor | undefined {
  return createToolDescriptor(toolId);
}

export function normalizePiToolIds(toolIds?: string[]): string[] {
  if (!toolIds?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const toolId of toolIds) {
    if (!toolId) continue;
    const resolvedToolId = resolvePiToolId(toolId);
    if (!resolvedToolId) continue;
    if (seen.has(resolvedToolId)) continue;
    seen.add(resolvedToolId);
    normalized.push(resolvedToolId);
  }

  return normalized;
}

export function resolvePiToolDescriptors(toolIds?: string[]): PiToolDescriptor[] {
  return normalizePiToolIds(toolIds)
    .map((toolId) => getPiToolDescriptor(toolId))
    .filter((tool): tool is PiToolDescriptor => Boolean(tool));
}
