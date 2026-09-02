import type { ResolvedPiRequest } from './contracts';
import { AI_PROMPT_INSPECTOR_SETTINGS } from './prompt-inspector-settings';

export type AIPromptInspectionSource = 'pi-session' | 'pi-task-chat' | 'pi-coding-session' | 'pi-forked-skill';

export interface AIPromptInspectionMessage {
  content: unknown;
  name?: string;
  role: string;
  timestamp?: number;
  toolCallId?: string;
}

export interface AIPromptInspectionTool {
  description?: string;
  name: string;
  parameters?: unknown;
}

export interface AIPromptInspectionRecord {
  source: AIPromptInspectionSource;
  transport: string;
  requestId?: string;
  conversationId?: string;
  providerId?: string;
  providerPresetId?: string;
  model?: string;
  profileId?: string;
  agentId?: string;
  systemPrompt?: string;
  messages?: AIPromptInspectionMessage[];
  prompt?: string;
  activeTools?: AIPromptInspectionTool[] | string[];
  metadata?: Record<string, unknown>;
  requestExtras?: Record<string, unknown>;
}

export interface StoredAIPromptInspectionRecord extends AIPromptInspectionRecord {
  createdAt: number;
  id: string;
}

export interface AIPromptInspectionOptions {
  enabled?: boolean;
  logger?: (text: string) => void;
}

const MAX_RECENT_INSPECTIONS = 50;
const recentInspections: StoredAIPromptInspectionRecord[] = [];

function createInspectionId(): string {
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isAIPromptInspectionEnabled(extras?: Record<string, unknown>, source?: AIPromptInspectionSource, agentId?: string): boolean {
  // 单次请求级 explicit 覆盖最优先：debugPrompt / inspectPrompt / showPrompt。
  // 这条覆盖完全绕开 allowlist，保证本地排障一次就能开。
  const explicit = extras?.debugPrompt ?? extras?.inspectPrompt ?? extras?.showPrompt;
  if (typeof explicit === 'boolean') {
    return explicit;
  }

  if (!AI_PROMPT_INSPECTOR_SETTINGS.enabled) {
    return false;
  }

  // enabled === true 时再叠加 allowlist 过滤。两个 allowlist 留空都
  // 表示"不按该维度过滤"，命中即放行；任一非空维度不命中则整条记录
  // 被视为不在观察范围内。
  const { agentIdAllowlist, sourceAllowlist } = AI_PROMPT_INSPECTOR_SETTINGS;
  if (sourceAllowlist && sourceAllowlist.length > 0) {
    if (!source || !sourceAllowlist.includes(source)) {
      return false;
    }
  }
  if (agentIdAllowlist && agentIdAllowlist.length > 0) {
    if (!agentId || !agentIdAllowlist.includes(agentId)) {
      return false;
    }
  }
  return true;
}

export function createResolvedPromptInspectionContext(
  resolved: ResolvedPiRequest
): Pick<AIPromptInspectionRecord, 'agentId' | 'conversationId' | 'model' | 'profileId' | 'providerId' | 'providerPresetId' | 'requestExtras' | 'requestId'> {
  return {
    agentId: resolved.request.agentId,
    conversationId: resolved.request.conversationId,
    model: resolved.model.modelId,
    profileId: resolved.profile.id,
    providerId: resolved.model.providerId,
    providerPresetId: resolved.model.presetId,
    requestExtras: resolved.request.extras,
    requestId: resolved.request.requestId
  };
}

export function inspectAIPrompt(record: AIPromptInspectionRecord, options: AIPromptInspectionOptions = {}): StoredAIPromptInspectionRecord | undefined {
  const enabled = options.enabled ?? isAIPromptInspectionEnabled(record.requestExtras, record.source, record.agentId);
  if (!enabled) {
    return undefined;
  }

  const stored: StoredAIPromptInspectionRecord = {
    ...record,
    createdAt: Date.now(),
    id: createInspectionId()
  };
  if (AI_PROMPT_INSPECTOR_SETTINGS.keepRecent) {
    recentInspections.push(stored);
    if (recentInspections.length > MAX_RECENT_INSPECTIONS) {
      recentInspections.splice(0, recentInspections.length - MAX_RECENT_INSPECTIONS);
    }
  }

  if (AI_PROMPT_INSPECTOR_SETTINGS.printToConsole || options.logger) {
    (options.logger ?? console.log)(formatAIPromptInspection(stored));
  }
  return stored;
}

export function listRecentAIPromptInspections(): StoredAIPromptInspectionRecord[] {
  return recentInspections.map((record) => ({ ...record }));
}

export function clearRecentAIPromptInspections(): void {
  recentInspections.length = 0;
}

function pushOptionalLine(lines: string[], label: string, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    lines.push(`${label}: ${value}`);
  }
}

export function formatAIPromptInspection(record: AIPromptInspectionRecord): string {
  const lines: string[] = [];
  lines.push('==================== AI PROMPT INSPECTION ====================');
  pushOptionalLine(lines, 'source', record.source);
  pushOptionalLine(lines, 'transport', record.transport);
  pushOptionalLine(lines, 'requestId', record.requestId);
  pushOptionalLine(lines, 'conversationId', record.conversationId);
  pushOptionalLine(lines, 'agentId', record.agentId);
  pushOptionalLine(lines, 'profileId', record.profileId);
  pushOptionalLine(lines, 'providerId', record.providerId);
  pushOptionalLine(lines, 'providerPresetId', record.providerPresetId);
  pushOptionalLine(lines, 'model', record.model);
  if (record.metadata && Object.keys(record.metadata).length > 0) {
    lines.push('metadata:');
    lines.push(safeStringify(record.metadata));
  }

  lines.push('-------------------- SYSTEM PROMPT --------------------');
  lines.push(record.systemPrompt ?? '');
  lines.push(`-------------------- MESSAGES (${record.messages?.length ?? 0}) --------------------`);
  for (const [index, message] of (record.messages ?? []).entries()) {
    lines.push(`>>> message[${index}] role=${message.role}${message.name ? ` name=${message.name}` : ''}${message.toolCallId ? ` toolCallId=${message.toolCallId}` : ''}`);
    lines.push(formatMessageContent(message.content));
    lines.push('<<<');
  }

  if (record.prompt !== undefined) {
    lines.push('-------------------- CURRENT PROMPT --------------------');
    lines.push(record.prompt);
  }

  if (record.activeTools && record.activeTools.length > 0) {
    lines.push(`-------------------- ACTIVE TOOLS (${record.activeTools.length}) --------------------`);
    for (const tool of record.activeTools) {
      lines.push(typeof tool === 'string' ? tool : tool.name || 'unknown name');
    }
  }

  lines.push('================== END AI PROMPT INSPECTION ==================');
  return lines.join('\n');
}

function formatMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => formatContentBlock(item)).join('\n');
  }

  return safeStringify(content);
}

function formatContentBlock(block: unknown): string {
  if (!block || typeof block !== 'object') {
    return safeStringify(block);
  }

  const record = block as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') {
    return record.text;
  }
  if (record.type === 'image') {
    return `[image mimeType=${String(record.mimeType ?? 'unknown')} data=${typeof record.data === 'string' ? `${record.data.length} chars` : 'unknown'}]`;
  }
  if (record.type === 'thinking' && typeof record.thinking === 'string') {
    return `[thinking]\n${record.thinking}`;
  }

  return safeStringify(record);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
