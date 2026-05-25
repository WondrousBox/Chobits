import type { WindowKey } from '@aim-packages/window-manager';

type Payload = Record<string, unknown>;

export interface AppWindowPayloadField {
  description: string;
  name: string;
  required?: boolean;
  type: string;
}

export interface AppWindowToolEntry {
  aliases: string[];
  description: string;
  key: WindowKey;
  payloadFields?: AppWindowPayloadField[];
  sanitizePayload?: (payload: unknown) => Payload | undefined;
  title: string;
}

export interface AppWindowSummary {
  aliases: string[];
  description: string;
  key: string;
  payloadFields: AppWindowPayloadField[];
  title: string;
}

const SETTINGS_CATEGORIES = new Set(['preferences', 'workspace', 'ai', 'user-profile', 'prompt', 'glossary', 'plugins', 'shortcuts', 'proxy']);
const WINDOW_ANIMATION_PRESET_IDS = new Set(['fly-in', 'fade-in', 'zoom-in', 'fly-out', 'fade-out', 'zoom-out', 'pulse', 'shake']);
const CHAT_AGENT_IDS = new Set(['assistant', 'chat', 'coder', 'assistant-skills']);
const CJK_SEARCH_TERMS = [
  '打开物品栏',
  '打开背包',
  '打开资源库',
  '预览资源',
  '打开资源',
  '查看资源',
  '播放资源',
  '打开文件',
  '预览文件',
  '查看文件',
  '打开图片',
  '打开视频',
  '打开音频',
  '播放视频',
  '播放音频',
  '物品栏',
  '背包',
  '资源库',
  '设置',
  '资源',
  '预览',
  '查看',
  '播放',
  '打开',
  '文件',
  '视频',
  '图片',
  '音频',
  '聊天',
  '助手',
  '插件',
  '窗口',
  '动画'
].sort((a, b) => b.length - a.length);

function isRecord(value: unknown): value is Payload {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(source: Payload, key: string, options: { maxLength?: number; trim?: boolean } = {}): string | undefined {
  const value = source[key];
  if (typeof value !== 'string') return undefined;
  const text = options.trim === false ? value : value.trim();
  if (!text) return undefined;
  return text.slice(0, options.maxLength ?? 500);
}

function readBoolean(source: Payload, key: string): boolean | undefined {
  return typeof source[key] === 'boolean' ? (source[key] as boolean) : undefined;
}

function pickString(source: Payload, target: Payload, key: string, options?: { maxLength?: number; trim?: boolean }): void {
  const value = readString(source, key, options);
  if (value !== undefined) target[key] = value;
}

function pickBoolean(source: Payload, target: Payload, key: string): void {
  const value = readBoolean(source, key);
  if (value !== undefined) target[key] = value;
}

function emptyToUndefined(payload: Payload): Payload | undefined {
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function sanitizeSettingsPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const next: Payload = {};
  const category = readString(payload, 'category', { maxLength: 64 });
  if (category && SETTINGS_CATEGORIES.has(category)) next.category = category;
  pickString(payload, next, 'aiProviderId', { maxLength: 120 });
  pickString(payload, next, 'aiPresetId', { maxLength: 160 });
  return emptyToUndefined(next);
}

function sanitizeAiProviderConfigPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const next: Payload = {};
  pickString(payload, next, 'providerId', { maxLength: 120 });
  pickString(payload, next, 'presetId', { maxLength: 160 });
  const fields = payload.fields;
  if (Array.isArray(fields)) {
    const safeFields = fields
      .map((field) => (typeof field === 'string' ? field.trim() : ''))
      .filter(Boolean)
      .slice(0, 20);
    if (safeFields.length > 0) next.fields = safeFields;
  }
  return emptyToUndefined(next);
}

function sanitizeAsrPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const next: Payload = {};
  const mode = readString(payload, 'mode', { maxLength: 16 });
  if (mode === 'local' || mode === 'cloud') next.mode = mode;
  const audioSource = readString(payload, 'audioSource', { maxLength: 32 });
  if (audioSource === 'microphone' || audioSource === 'system-audio') next.audioSource = audioSource;
  pickString(payload, next, 'cloudProviderId', { maxLength: 120 });
  pickString(payload, next, 'cloudProviderPresetId', { maxLength: 160 });
  pickString(payload, next, 'cloudModelId', { maxLength: 160 });
  return emptyToUndefined(next);
}

function sanitizeChatPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const next: Payload = {};
  pickString(payload, next, 'initialMessage', { maxLength: 8000, trim: false });
  pickString(payload, next, 'providerId', { maxLength: 120 });
  pickString(payload, next, 'modelId', { maxLength: 160 });
  pickString(payload, next, 'preferredPresetId', { maxLength: 160 });
  pickString(payload, next, 'presetId', { maxLength: 160 });
  const agentId = readString(payload, 'agentId', { maxLength: 80 });
  if (agentId && CHAT_AGENT_IDS.has(agentId)) next.agentId = agentId;
  pickString(payload, next, 'codingWorkspaceRoot', { maxLength: 1000 });
  pickString(payload, next, 'codingWorkspaceLabel', { maxLength: 200 });
  pickBoolean(payload, next, 'webSearchEnabled');
  pickBoolean(payload, next, 'emojiPacksEnabled');
  const emojiPacksDisplayTarget = readString(payload, 'emojiPacksDisplayTarget', { maxLength: 32 });
  if (emojiPacksDisplayTarget === 'chat' || emojiPacksDisplayTarget === 'sprite-bubble') {
    next.emojiPacksDisplayTarget = emojiPacksDisplayTarget;
  }
  pickBoolean(payload, next, 'characterPersonaEnabled');
  const overlaySide = readString(payload, 'overlaySide', { maxLength: 16 });
  if (overlaySide === 'left' || overlaySide === 'right') next.overlaySide = overlaySide;
  return emptyToUndefined(next);
}

function sanitizeWindowAnimationEditorPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const presetId = readString(payload, 'presetId', { maxLength: 64 });
  return presetId && WINDOW_ANIMATION_PRESET_IDS.has(presetId) ? { presetId } : undefined;
}

function sanitizeResourcePreviewPayload(payload: unknown): Payload | undefined {
  if (!isRecord(payload)) return undefined;
  const resourceId = readString(payload, 'resourceId', { maxLength: 160 });
  return resourceId ? { resourceId } : undefined;
}

const chatPayloadFields: AppWindowPayloadField[] = [
  { name: 'initialMessage', type: 'string', description: '打开后立即发送的初始消息' },
  { name: 'agentId', type: 'assistant | chat | coder | assistant-skills', description: '目标对话角色' },
  { name: 'providerId', type: 'string', description: 'AI 提供商 ID' },
  { name: 'modelId', type: 'string', description: '模型 ID' },
  { name: 'preferredPresetId', type: 'string', description: '首选提供商预设 ID' },
  { name: 'webSearchEnabled', type: 'boolean', description: '是否开启联网搜索' },
  { name: 'emojiPacksEnabled', type: 'boolean', description: '是否开启表情包回复' },
  { name: 'emojiPacksDisplayTarget', type: 'chat | sprite-bubble', description: '表情包展示到对话内或角色浮动气泡' }
];

export const APP_WINDOW_TOOL_DIRECTORY: AppWindowToolEntry[] = [
  {
    key: 'settings',
    title: '设置',
    description: '打开应用设置页，可跳转到偏好、工作空间、AI、用户画像、提示词、术语、插件、快捷键、代理等分类。',
    aliases: ['设置', '偏好设置', 'AI 设置', '插件设置', '快捷键', '代理设置', 'settings'],
    payloadFields: [
      { name: 'category', type: 'preferences | workspace | ai | user-profile | prompt | glossary | plugins | shortcuts | proxy', description: '设置分类' },
      { name: 'aiProviderId', type: 'string', description: '打开 AI 设置时聚焦的提供商 ID' },
      { name: 'aiPresetId', type: 'string', description: '打开 AI 设置时展开的提供商预设 ID' }
    ],
    sanitizePayload: sanitizeSettingsPayload
  },
  {
    key: 'resources',
    title: '资源库',
    description: '打开资源管理窗口。适用于用户想浏览、查找、管理资源库时。',
    aliases: ['资源', '资源库', '文件库', '打开资源库', '浏览资源', '管理资源', 'resources']
  },
  {
    key: 'inventory',
    title: '背包',
    description: '打开游戏化物品栏窗口，以纯网格方式浏览和管理资源库内容。',
    aliases: ['背包', '物品栏', '道具栏', '打开背包', '打开物品栏', 'inventory']
  },
  {
    key: 'chat',
    title: '聊天窗口',
    description: '打开独立聊天窗口，可带一条初始消息。',
    aliases: ['聊天', '对话', 'chat'],
    payloadFields: chatPayloadFields,
    sanitizePayload: sanitizeChatPayload
  },
  {
    key: 'chatOverlay',
    title: '侧边聊天浮层',
    description: '打开侧边聊天浮层，可带一条初始消息。',
    aliases: ['侧边聊天', '浮层聊天', 'overlay chat'],
    payloadFields: [...chatPayloadFields, { name: 'overlaySide', type: 'left | right', description: '浮层出现侧' }],
    sanitizePayload: sanitizeChatPayload
  },
  {
    key: 'assistant',
    title: '助手窗口',
    description: '打开完整助手输入窗口。',
    aliases: ['助手', 'assistant'],
    payloadFields: chatPayloadFields,
    sanitizePayload: sanitizeChatPayload
  },
  {
    key: 'assistantMini',
    title: '迷你助手输入框',
    description: '打开角色底部的迷你对话输入框。',
    aliases: ['迷你助手', '迷你输入框', 'assistant mini'],
    payloadFields: chatPayloadFields,
    sanitizePayload: sanitizeChatPayload
  },
  {
    key: 'pluginManager',
    title: '插件管理器',
    description: '打开插件管理窗口。',
    aliases: ['插件管理器', '插件管理', 'plugin manager']
  },
  {
    key: 'pluginDownload',
    title: '插件下载',
    description: '打开插件下载窗口。',
    aliases: ['插件下载', '下载插件', 'plugin download']
  },
  {
    key: 'workspaceWizard',
    title: '工作空间向导',
    description: '打开工作空间创建和选择向导。',
    aliases: ['工作空间向导', '创建工作空间', 'workspace wizard']
  },
  {
    key: 'questList',
    title: '任务列表',
    description: '打开新手引导、奖励和任务进度窗口。',
    aliases: ['任务', '任务列表', '新手任务', '新手引导任务', 'quest list']
  },
  {
    key: 'resourcePreview',
    title: '资源预览',
    description: '打开单个资源的预览窗口。适用于用户明确要求打开、查看、预览、播放某个具体资源时，可传 resourceId。',
    aliases: ['资源预览', '预览资源', '打开资源', '查看资源', '播放资源', '打开文件', '查看文件', '预览文件', '打开图片', '打开视频', '打开音频', 'resource preview'],
    payloadFields: [{ name: 'resourceId', type: 'string', description: '要预览的资源 ID' }],
    sanitizePayload: sanitizeResourcePreviewPayload
  },
  {
    key: 'tagger',
    title: '标签工具',
    description: '打开资源标签/分类工具。',
    aliases: ['标签', '打标签', '分类', 'tagger']
  },
  {
    key: 'aiProviderConfig',
    title: 'AI 提供商秘钥配置',
    description: '打开指定提供商或预设的秘钥配置窗口。',
    aliases: ['API Key', '秘钥配置', '模型配置', 'provider config'],
    payloadFields: [
      { name: 'providerId', type: 'string', description: '提供商 ID' },
      { name: 'presetId', type: 'string', description: '预设 ID' },
      { name: 'fields', type: 'string[]', description: '只展示的秘钥字段' }
    ],
    sanitizePayload: sanitizeAiProviderConfigPayload
  },
  {
    key: 'asrConfig',
    title: '语音识别配置',
    description: '打开 ASR 配置窗口。',
    aliases: ['语音识别配置', 'ASR 设置', 'asr config']
  },
  {
    key: 'asr',
    title: '语音识别',
    description: '打开语音识别/录音窗口。',
    aliases: ['语音识别', '录音', '转写', 'asr'],
    payloadFields: [
      { name: 'mode', type: 'local | cloud', description: '识别模式' },
      { name: 'audioSource', type: 'microphone | system-audio', description: '音频来源' },
      { name: 'cloudProviderId', type: 'string', description: '云端提供商 ID' },
      { name: 'cloudProviderPresetId', type: 'string', description: '云端预设 ID' },
      { name: 'cloudModelId', type: 'string', description: '云端模型 ID' }
    ],
    sanitizePayload: sanitizeAsrPayload
  },
  {
    key: 'ttsConfig',
    title: '语音合成配置',
    description: '打开 TTS 配置窗口。',
    aliases: ['语音合成配置', 'TTS 设置', 'tts config']
  },
  {
    key: 'tts',
    title: '语音合成',
    description: '打开 TTS 语音合成窗口。',
    aliases: ['语音合成', '朗读', 'tts']
  },
  {
    key: 'webRecorder',
    title: '网页录制',
    description: '打开网页录制悬浮工具。',
    aliases: ['网页录制', '录屏', 'web recorder']
  },
  {
    key: 'memoryGraph',
    title: '记忆图谱',
    description: '打开长期记忆图谱窗口。',
    aliases: ['记忆图谱', '记忆', 'memory graph']
  },
  {
    key: 'characterPackEditor',
    title: '角色包编辑器',
    description: '打开角色包编辑窗口。',
    aliases: ['角色包编辑', '角色编辑器', 'character editor']
  },
  {
    key: 'windowAnimationEditor',
    title: '窗口动画编辑器',
    description: '打开窗口动画编辑器，可载入指定预设。',
    aliases: ['窗口动画', '动画编辑器', 'window animation'],
    payloadFields: [{ name: 'presetId', type: 'fly-in | fade-in | zoom-in | fly-out | fade-out | zoom-out | pulse | shake', description: '预设动画 ID' }],
    sanitizePayload: sanitizeWindowAnimationEditorPayload
  }
];

export function getAppWindowToolEntry(key: string): AppWindowToolEntry | undefined {
  return APP_WINDOW_TOOL_DIRECTORY.find((entry) => entry.key === key);
}

export function summarizeAppWindowEntry(entry: AppWindowToolEntry): AppWindowSummary {
  return {
    aliases: entry.aliases,
    description: entry.description,
    key: String(entry.key),
    payloadFields: entry.payloadFields || [],
    title: entry.title
  };
}

export function listAppWindowSummaries(): AppWindowSummary[] {
  return APP_WINDOW_TOOL_DIRECTORY.map(summarizeAppWindowEntry);
}

export function searchAppWindowSummaries(query: string): AppWindowSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return listAppWindowSummaries();
  const queryTokens = tokenizeAppWindowSearchQuery(normalizedQuery);
  return APP_WINDOW_TOOL_DIRECTORY.map((entry) => ({
    entry,
    score: scoreAppWindowEntry(entry, normalizedQuery, queryTokens)
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => summarizeAppWindowEntry(item.entry));
}

export function sanitizeAppWindowPayload(entry: AppWindowToolEntry, payload: unknown): Payload | undefined {
  return entry.sanitizePayload ? entry.sanitizePayload(payload) : undefined;
}

function getAppWindowSearchText(entry: AppWindowToolEntry): string {
  return [entry.key, entry.title, entry.description, ...entry.aliases, ...(entry.payloadFields || []).map((field) => `${field.name} ${field.description}`)].join(' ').toLowerCase();
}

function tokenizeAppWindowSearchQuery(query: string): string[] {
  const tokens = new Set<string>();
  const segments = query.match(/[\u4e00-\u9fff\u3400-\u4dbf]+|[a-zA-Z0-9_-]+/g) || [];

  for (const segment of segments) {
    if (/[\u4e00-\u9fff]/.test(segment)) {
      for (const term of CJK_SEARCH_TERMS) {
        if (segment.includes(term)) tokens.add(term);
      }
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.add(segment.slice(index, index + 2));
      }
    } else {
      tokens.add(segment.toLowerCase());
    }
  }

  return Array.from(tokens).filter((token) => token.length >= 2);
}

function scoreAppWindowEntry(entry: AppWindowToolEntry, normalizedQuery: string, queryTokens: string[]): number {
  const haystack = getAppWindowSearchText(entry);
  if (haystack.includes(normalizedQuery)) return 100 + normalizedQuery.length;

  let score = 0;
  for (const token of queryTokens) {
    if (String(entry.key).toLowerCase() === token) score += 20;
    if (entry.title.toLowerCase().includes(token)) score += 12;
    if (entry.aliases.some((alias) => alias.toLowerCase().includes(token))) score += 8;
    if (entry.description.toLowerCase().includes(token)) score += 4;
    if (haystack.includes(token)) score += 1;
  }
  return score;
}
