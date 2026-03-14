import type { PiToolDescriptor } from './contracts';

type ToolSeed = Omit<PiToolDescriptor, 'id'>;

const DEFAULT_TOOL_METADATA: Record<string, ToolSeed> = {
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
  }
};

export const DEFAULT_SESSION_TOOL_IDS = ['query-resources', 'read-subtitle', 'translate-subtitles', 'summarize-content', 'push-card', 'youtube-download', 'youtube-subscribe'];

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
    const descriptor = getPiToolDescriptor(toolId);
    if (!descriptor) continue;
    if (seen.has(descriptor.id)) continue;
    seen.add(descriptor.id);
    normalized.push(descriptor.id);
  }

  return normalized;
}

export function resolvePiToolDescriptors(toolIds?: string[]): PiToolDescriptor[] {
  return normalizePiToolIds(toolIds)
    .map((toolId) => getPiToolDescriptor(toolId))
    .filter((tool): tool is PiToolDescriptor => Boolean(tool));
}
