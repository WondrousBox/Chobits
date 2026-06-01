import { windowManager } from '@aim-packages/window-manager';
import type { BrowserWindow } from 'electron';

import { ChatService } from '../../../packages/ai/chat-service';
import { resolveUsablePreset } from '../../../packages/ai/preset-service';
import { getProviderDefinitionDefaultModel } from '../../../packages/ai/providers/service';
import type { ChatResponse } from '../../../packages/ai/types';
import { SpriteManager } from '../../../packages/sprite-core/manager';
import type { MessageButton } from '../../../packages/sprite-core/types';
import { rememberWindowPayload } from '../handlers/window-events';
import { detectEnglishText } from './english-text-detector';
import { ProtectedClipboardSelectionReader } from './protected-clipboard-selection-reader';
import type { SelectedTextLearningConfig, SelectedTextLearningResult, SelectedTextLearningRunResult } from './types';

type LearningServiceDeps = {
  getConfig: () => SelectedTextLearningConfig;
  getMainWindow: () => BrowserWindow | null;
};

const EMPTY_RESULT: SelectedTextLearningResult = {
  explanation: '',
  keyWords: [],
  original: '',
  phrases: [],
  translation: ''
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty AI response');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('AI response is not JSON');
  }
}

function asString(value: unknown, maxLength = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeLearningResult(value: unknown, original: string): SelectedTextLearningResult {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const keyWords = Array.isArray(source.keyWords)
    ? source.keyWords
        .map((item) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const word = asString(record.word, 80);
          const meaning = asString(record.meaning, 200);
          if (!word || !meaning) return null;
          return {
            word,
            meaning,
            ...(asString(record.note, 240) ? { note: asString(record.note, 240) } : {})
          };
        })
        .filter((item): item is SelectedTextLearningResult['keyWords'][number] => Boolean(item))
        .slice(0, 6)
    : [];

  const phrases = Array.isArray(source.phrases)
    ? source.phrases
        .map((item) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const phrase = asString(record.phrase, 120);
          const meaning = asString(record.meaning, 240);
          if (!phrase || !meaning) return null;
          return { phrase, meaning };
        })
        .filter((item): item is SelectedTextLearningResult['phrases'][number] => Boolean(item))
        .slice(0, 4)
    : [];

  const usageTips = Array.isArray(source.usageTips)
    ? source.usageTips
        .map((item) => asString(item, 240))
        .filter(Boolean)
        .slice(0, 4)
    : undefined;

  return {
    explanation: asString(source.explanation, 1200),
    keyWords,
    original: asString(source.original, 3000) || original,
    phrases,
    translation: asString(source.translation, 1000),
    ...(usageTips?.length ? { usageTips } : {})
  };
}

function buildAiPrompt(text: string): string {
  return [
    '你是一个英语学习助手。请分析用户选中的英文文本，输出严格 JSON，不要输出 Markdown。',
    'JSON 结构必须是：',
    '{ "original": string, "translation": string, "explanation": string, "keyWords": [{ "word": string, "meaning": string, "note"?: string }], "phrases": [{ "phrase": string, "meaning": string }], "usageTips": string[] }',
    '要求：中文解释；重点词汇不超过 6 个；短语不超过 4 个；优先解释当前语境，不要泛泛而谈。',
    '',
    '选中文本：',
    text
  ].join('\n');
}

function buildSummary(result: SelectedTextLearningResult): string {
  const parts: string[] = [];
  if (result.translation) parts.push(`译：${result.translation}`);
  if (result.keyWords.length) {
    parts.push(`词：${result.keyWords.map((item) => `${item.word}=${item.meaning}`).join('；')}`);
  }
  if (result.explanation) parts.push(result.explanation);
  return parts.join('\n').slice(0, 420);
}

function buildOverlayMessage(result: SelectedTextLearningResult): string {
  const lines: string[] = [
    '划词学习结果',
    '',
    `原文：${result.original}`
  ];
  if (result.translation) lines.push('', `翻译：${result.translation}`);
  if (result.explanation) lines.push('', `解释：${result.explanation}`);
  if (result.keyWords.length) {
    lines.push('', '重点词汇：');
    for (const item of result.keyWords) {
      lines.push(`- ${item.word}: ${item.meaning}${item.note ? `（${item.note}）` : ''}`);
    }
  }
  if (result.phrases.length) {
    lines.push('', '短语：');
    for (const item of result.phrases) {
      lines.push(`- ${item.phrase}: ${item.meaning}`);
    }
  }
  if (result.usageTips?.length) {
    lines.push('', '用法提示：');
    for (const item of result.usageTips) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join('\n');
}

export class SelectedTextLearningService {
  private readonly reader = new ProtectedClipboardSelectionReader();
  private readonly chatService: ChatService;
  private lastText = '';
  private lastTextAt = 0;
  private running = false;
  private latestExplanation: SelectedTextLearningResult = EMPTY_RESULT;

  constructor(private readonly deps: LearningServiceDeps) {
    this.chatService = new ChatService(deps.getMainWindow() ?? undefined);
  }

  async testReadSelection(): Promise<SelectedTextLearningRunResult> {
    const config = this.deps.getConfig();
    const read = await this.reader.readSelection({ restoreClipboard: config.restoreClipboard });
    const detection = detectEnglishText(read.text, { maxLength: config.maxTextLength });
    return { detection, ok: Boolean(read.text), read, skipped: !detection.ok };
  }

  isRunning(): boolean {
    return this.running;
  }

  async runFromSelection(trigger: 'hotkey' | 'manual' = 'manual'): Promise<SelectedTextLearningRunResult> {
    if (this.running) return { error: 'busy', ok: false, skipped: true };
    this.running = true;
    try {
      const config = this.deps.getConfig();
      const read = await this.reader.readSelection({ restoreClipboard: config.restoreClipboard });
      if (!read.text) {
        if (trigger === 'manual') this.showNotice('没有读到选中文本。', 'warning');
        return { ok: false, read, skipped: true };
      }

      const detection = detectEnglishText(read.text, { maxLength: config.maxTextLength });
      if (!detection.ok || !detection.normalizedText) {
        if (trigger === 'manual') this.showNotice('选中文本看起来不是英文。', 'warning');
        return { detection, ok: false, read, skipped: true };
      }

      if (this.isDuplicate(detection.normalizedText, config.dedupeWindowMs)) {
        return { detection, ok: false, read, skipped: true };
      }

      this.lastText = detection.normalizedText;
      this.lastTextAt = Date.now();
      await this.handleEnglishText(detection.normalizedText, config);
      return { detection, explanation: this.latestExplanation, ok: true, read };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showNotice(`选中文本解析失败：${message}`, 'error');
      return { error: message, ok: false };
    } finally {
      this.running = false;
    }
  }

  private async handleEnglishText(text: string, config: SelectedTextLearningConfig): Promise<void> {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    if (config.autoSpeak) {
      void sprite?.speak(text, { bubbleDuration: Math.min(8000, Math.max(3000, text.length * 90)) }).catch((error) => {
        console.warn('[selected-text] speak failed:', error);
      });
    } else {
      this.showNotice(text, 'info');
    }

    this.showBusy('正在解析选中文本...');
    try {
      const explanation = await this.explainWithAi(text, config);
      this.latestExplanation = explanation;
      this.showExplanation(explanation, config);
    } finally {
      this.clearBusy();
    }
  }

  private async explainWithAi(text: string, config: SelectedTextLearningConfig): Promise<SelectedTextLearningResult> {
    const resolvedPreset = await resolveUsablePreset(config.providerId, config.preferredPresetId);
    if (!resolvedPreset?.id) {
      throw new Error('当前 AI 提供商没有可用预设');
    }
    const modelId = config.modelId || getProviderDefinitionDefaultModel(resolvedPreset.providerId, 'chat', '');
    const response: ChatResponse = await this.chatService.chatEphemeral(this.deps.getMainWindow() ?? undefined, {
      agentId: 'assistant',
      extras: {
        enabledTools: [],
        ...(modelId ? { model: modelId } : {})
      },
      maxTokens: 1200,
      messages: [{ role: 'user', content: buildAiPrompt(text) }],
      providerId: resolvedPreset.providerId,
      providerPresetId: resolvedPreset.id,
      temperature: 0.2
    });
    const parsed = extractJsonObject(response.message.content);
    return normalizeLearningResult(parsed, text);
  }

  private showExplanation(result: SelectedTextLearningResult, config: SelectedTextLearningConfig): void {
    const buttons: MessageButton[] = [];
    if (config.showOverlay) {
      buttons.push({ action: 'selected-text:open-overlay', id: 'open-overlay', label: '查看解释', variant: 'default' });
    }
    buttons.push({ action: 'dismiss', id: 'dismiss', label: '关闭', variant: 'secondary' });

    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    sprite?.showNotice(buildSummary(result) || '解释已生成。', {
      buttons,
      duration: config.showOverlay ? undefined : 9000,
      id: 'selected-text-learning:result',
      level: 'success',
      persistent: config.showOverlay,
      speak: false
    });

    if (config.showOverlay) {
      void this.openOverlay(result);
    }
  }

  async openLatestOverlay(): Promise<boolean> {
    if (!this.latestExplanation.original) return false;
    await this.openOverlay(this.latestExplanation);
    return true;
  }

  private async openOverlay(result: SelectedTextLearningResult): Promise<void> {
    const config = this.deps.getConfig();
    const preset = await resolveUsablePreset(config.providerId, config.preferredPresetId);
    const payload = {
      agentId: 'assistant',
      initialMessages: [{ content: buildOverlayMessage(result), role: 'assistant' }],
      overlaySide: 'right',
      providerId: preset?.providerId || config.providerId,
      ...(preset?.id ? { preferredPresetId: preset.id } : {}),
      ...(config.modelId ? { modelId: config.modelId } : {})
    };
    rememberWindowPayload('chatOverlay', payload);
    await windowManager.createOrShow('chatOverlay' as any, payload);
  }

  private isDuplicate(text: string, windowMs: number): boolean {
    return text === this.lastText && Date.now() - this.lastTextAt < windowMs;
  }

  private showNotice(content: string, level: 'error' | 'info' | 'success' | 'warning' = 'info'): void {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    sprite?.showNotice(content, {
      duration: 3500,
      level,
      speak: false
    });
  }

  private showBusy(content: string): void {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    sprite?.showBusy(content);
  }

  private clearBusy(): void {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    sprite?.clearBusy();
  }
}
