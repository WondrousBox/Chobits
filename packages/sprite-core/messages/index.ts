/**
 * 桌宠气泡消息目录入口
 *
 * 按当前语言（模块级状态，默认 zh-CN）分发消息目录：
 * - 主进程：由偏好设置的语言注入（preferences:set-config / 启动时）
 * - 渲染进程：由 src/i18n 的语言切换同步注入
 * 未调用 setter 时行为与旧的 zh-CN 目录完全一致。
 *
 * 各语言文件（./zh-CN ./ja ./en）为纯数据文件，只导出 SpriteMessagesData；
 * 查找逻辑（resolveEntry / MessagesProvider / getSpriteEventText）统一在本文件。
 */

import type { AppLanguage } from '@packages/common/types/preferences';

import type { MessageCategory, MessageProducer, MessagesProvider, SpriteEventMessageEntry, SpriteMessagesData } from '../types';
import { enData } from './en';
import { jaData } from './ja';
import { zhCNData } from './zh-CN';

let currentLanguage: AppLanguage = 'zh-CN';

export function setSpriteMessagesLanguage(language: AppLanguage): void {
  currentLanguage = language;
}

export function getSpriteMessagesLanguage(): AppLanguage {
  return currentLanguage;
}

const messagesDataByLanguage: Record<AppLanguage, SpriteMessagesData> = {
  'zh-CN': zhCNData,
  ja: jaData,
  en: enData
};

// ============================================================================
// 统一查找逻辑
// ============================================================================

const asText = (m: MessageProducer | string, ctx?: any): string => (typeof m === 'function' ? m(ctx) : m);

function resolveEntry(entry: SpriteEventMessageEntry | undefined, ctx?: any): string {
  if (!entry) return '';
  if (!(entry instanceof Array)) {
    return asText(entry, ctx);
  }
  if (entry.length) {
    const pick = entry[Math.floor(Math.random() * entry.length)];
    return asText(pick, ctx);
  }
  return '';
}

function createMessagesProvider(data: SpriteMessagesData): MessagesProvider {
  return {
    t: (category: MessageCategory, ctx?: any) => {
      return resolveEntry(data.catalog[category], ctx);
    }
  };
}

const messagesProviderByLanguage: Record<AppLanguage, MessagesProvider> = {
  'zh-CN': createMessagesProvider(zhCNData),
  ja: createMessagesProvider(jaData),
  en: createMessagesProvider(enData)
};

/**
 * 当前语言的消息目录提供者（MessageCategory → 文案）
 */
export function getSpriteMessagesProvider(): MessagesProvider {
  return messagesProviderByLanguage[currentLanguage];
}

/**
 * 当前语言的精灵事件文案查找
 * 先查 spriteEventMessages，再 fallback 到 catalog（MessageCategory 与 SpriteEventType 有重叠部分）
 */
export function getSpriteEventText(eventType: string, ctx?: any): string {
  const data = messagesDataByLanguage[currentLanguage];
  // 先查专用事件文案
  const eventEntry = data.spriteEventMessages[eventType];
  if (eventEntry !== undefined) {
    const text = resolveEntry(eventEntry, ctx);
    if (text) return text;
  }
  // fallback 到 MessageCategory 文案（交互/状态类事件名与 MessageCategory 重叠）
  const categoryEntry = data.catalog[eventType as MessageCategory];
  if (categoryEntry !== undefined) {
    return resolveEntry(categoryEntry, ctx);
  }
  return '';
}

// ============================================================================
// 调用方兜底文案（原散落在各消费方的硬编码中文 fallback 实参）
// ============================================================================

export type SpriteMessageFallbackKey =
  | 'downloadStart'
  | 'downloadProgress'
  | 'downloadComplete'
  | 'downloadFail'
  | 'pluginInstall'
  | 'pluginRemove'
  | 'dailyRestReminder'
  | 'idleSleepy'
  | 'onboardingChatStartTip'
  | 'onboardingChatStartDone'
  | 'chatApiConfigGuideInvite'
  | 'chatApiConfigGuideTipPreset'
  | 'chatApiConfigGuideTipNoPreset'
  | 'chatApiConfigGuideDone'
  | 'chatApiConfigGuideDoneMiniMax'
  | 'progressKind.download'
  | 'progressKind.transcribe'
  | 'progressKind.import'
  | 'progressKind.workflow'
  | 'progressKind.generic'
  | 'progressTemplate.progress'
  | 'progressTemplate.almost'
  | 'progressTemplate.complete';

const SPRITE_MESSAGE_FALLBACKS: Record<AppLanguage, Record<SpriteMessageFallbackKey, string>> = {
  'zh-CN': {
    downloadStart: '下载中...',
    downloadProgress: '下载中...',
    downloadComplete: '下载完成！',
    downloadFail: '下载失败',
    pluginInstall: '插件安装完成！',
    pluginRemove: '插件已移除',
    dailyRestReminder: '差不多该休息一下了。',
    idleSleepy: '有点困了呢...',
    onboardingChatStartTip: '鼠标双击我，就能打开聊天窗口。',
    onboardingChatStartDone: '打开啦！',
    chatApiConfigGuideInvite: '需要先配置 API Key',
    chatApiConfigGuideTipPreset: '填好 API Key 就可以和我对话了',
    chatApiConfigGuideTipNoPreset: '先新增一个模型预设并填入 API Key，就可以开始聊天。',
    chatApiConfigGuideDone: '配置保存好了，现在可以开始聊天。',
    chatApiConfigGuideDoneMiniMax: 'MiniMax 还可以制作音乐，以后可以和我说哦',
    'progressKind.download': '下载',
    'progressKind.transcribe': '转写',
    'progressKind.import': '导入',
    'progressKind.workflow': '处理',
    'progressKind.generic': '任务',
    'progressTemplate.progress': '{kind}进度 {progress}%。',
    'progressTemplate.almost': '{kind}快完成了。',
    'progressTemplate.complete': '{kind}完成了。'
  },
  ja: {
    downloadStart: 'ダウンロード中…',
    downloadProgress: 'ダウンロード中…',
    downloadComplete: 'ダウンロード完了！',
    downloadFail: 'ダウンロードに失敗しました',
    pluginInstall: 'プラグインのインストールが完了しました！',
    pluginRemove: 'プラグインを削除しました',
    dailyRestReminder: 'そろそろ休憩しましょう。',
    idleSleepy: 'ちょっと眠くなってきた…',
    onboardingChatStartTip: 'ダブルクリックでチャットウィンドウを開けます。',
    onboardingChatStartDone: '開きました！',
    chatApiConfigGuideInvite: '先に API Key を設定する必要があります',
    chatApiConfigGuideTipPreset: 'API Key を入力すれば、私とおしゃべりできます',
    chatApiConfigGuideTipNoPreset: 'まずモデルプリセットを追加して API Key を入力すれば、チャットを始められます。',
    chatApiConfigGuideDone: '設定を保存しました。チャットを始められます。',
    chatApiConfigGuideDoneMiniMax: 'MiniMax では音楽も作れます。あとで話しかけてくださいね',
    'progressKind.download': 'ダウンロード',
    'progressKind.transcribe': '文字起こし',
    'progressKind.import': 'インポート',
    'progressKind.workflow': '処理',
    'progressKind.generic': 'タスク',
    'progressTemplate.progress': '{kind}の進捗 {progress}%。',
    'progressTemplate.almost': '{kind}はもうすぐ完了です。',
    'progressTemplate.complete': '{kind}が完了しました。'
  },
  en: {
    downloadStart: 'Downloading...',
    downloadProgress: 'Downloading...',
    downloadComplete: 'Download complete!',
    downloadFail: 'Download failed',
    pluginInstall: 'Plugin installed!',
    pluginRemove: 'Plugin removed',
    dailyRestReminder: 'Time for a short break.',
    idleSleepy: "I'm getting sleepy...",
    onboardingChatStartTip: 'Double-click me to open the chat window.',
    onboardingChatStartDone: "It's open!",
    chatApiConfigGuideInvite: 'You need to configure an API Key first',
    chatApiConfigGuideTipPreset: 'Enter your API Key and you can chat with me',
    chatApiConfigGuideTipNoPreset: 'Add a model preset and enter an API Key to start chatting.',
    chatApiConfigGuideDone: 'Settings saved. You can start chatting now.',
    chatApiConfigGuideDoneMiniMax: 'MiniMax can also make music — feel free to ask me later',
    'progressKind.download': 'Download',
    'progressKind.transcribe': 'Transcription',
    'progressKind.import': 'Import',
    'progressKind.workflow': 'Processing',
    'progressKind.generic': 'Task',
    'progressTemplate.progress': '{kind} is at {progress}%.',
    'progressTemplate.almost': '{kind} is almost done.',
    'progressTemplate.complete': '{kind} is done.'
  }
};

/**
 * 当前语言的调用方兜底文案（角色包与中立生成都缺失时的最后兜底）
 */
export function getSpriteMessageFallback(key: SpriteMessageFallbackKey): string {
  return SPRITE_MESSAGE_FALLBACKS[currentLanguage][key];
}
