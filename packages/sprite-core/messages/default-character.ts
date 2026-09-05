import type { AppLanguage } from '@packages/common/types/preferences';

import type { CharacterMessagesConfig, CharacterMessageTemplateEntry, CharacterProgressMessagesConfig } from '../character-service';
import type { MessageCategory } from '../types';
import { getSpriteMessagesLanguage } from './index';

export interface DefaultCharacterMessageProfile {
  name?: string;
  firstPerson?: string;
  addressUser?: string;
  speechStyle?: {
    firstPerson?: string;
    addressUser?: string;
  };
}

export type CharacterMessageSection = 'categories' | 'events' | 'routines';

export type CharacterMessageProfile = Required<Pick<DefaultCharacterMessageProfile, 'name' | 'firstPerson' | 'addressUser'>>;

export interface CharacterMessageSpec {
  field: string;
  section: CharacterMessageSection;
  key: string;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
}

export type CharacterProgressMessageKey = 'progress' | 'almost' | 'complete';

export interface CharacterProgressKindLabelSpec {
  key: string;
}

export interface CharacterProgressMessageSpec {
  key: CharacterProgressMessageKey;
}

export const CHARACTER_PROGRESS_KIND_LABEL_SPECS = [
  { key: 'download' },
  { key: 'transcribe' },
  { key: 'import' },
  { key: 'workflow' },
  { key: 'generic' }
] as const satisfies readonly CharacterProgressKindLabelSpec[];

export const CHARACTER_PROGRESS_MESSAGE_SPECS = [{ key: 'progress' }, { key: 'almost' }, { key: 'complete' }] as const satisfies readonly CharacterProgressMessageSpec[];

export type CharacterProgressKindLabelKey = (typeof CHARACTER_PROGRESS_KIND_LABEL_SPECS)[number]['key'];
export type CharacterPackEditorProgressKindLabelFields = Record<CharacterProgressKindLabelKey, string>;
export type CharacterPackEditorProgressMessageFields = Record<CharacterProgressMessageKey, string>;

export const CHARACTER_MESSAGE_SPECS = [
  {
    field: 'welcome',
    section: 'categories',
    key: 'welcome'
  },
  {
    field: 'click',
    section: 'categories',
    key: 'click'
  },
  {
    field: 'hold',
    section: 'categories',
    key: 'hold'
  },
  {
    field: 'reminder',
    section: 'categories',
    key: 'reminder'
  },
  {
    field: 'tip',
    section: 'categories',
    key: 'tip',
    maxItems: 12
  },
  {
    field: 'message',
    section: 'categories',
    key: 'message'
  },
  {
    field: 'appear',
    section: 'events',
    key: 'appear'
  },
  {
    field: 'wake',
    section: 'events',
    key: 'wake'
  },
  {
    field: 'aiThinking',
    section: 'events',
    key: 'aiThinking'
  },
  {
    field: 'aiComplete',
    section: 'events',
    key: 'aiComplete'
  },
  {
    field: 'aiError',
    section: 'events',
    key: 'aiError'
  },
  {
    field: 'downloadStart',
    section: 'events',
    key: 'downloadStart'
  },
  {
    field: 'downloadProgress',
    section: 'events',
    key: 'downloadProgress'
  },
  {
    field: 'downloadComplete',
    section: 'events',
    key: 'downloadComplete'
  },
  {
    field: 'downloadFail',
    section: 'events',
    key: 'downloadFail'
  },
  {
    field: 'pluginInstall',
    section: 'events',
    key: 'pluginInstall'
  },
  {
    field: 'pluginRemove',
    section: 'events',
    key: 'pluginRemove'
  },
  {
    field: 'dailyRestReminder',
    section: 'routines',
    key: 'daily.rest-reminder.speak'
  },
  {
    field: 'idleSleepy',
    section: 'routines',
    key: 'idle.sleepy.toast'
  },
  {
    field: 'onboardingChatStartTip',
    section: 'routines',
    key: 'onboarding.chat.start.tip',
    maxItems: 4,
    maxLength: 240
  },
  {
    field: 'onboardingChatStartDone',
    section: 'routines',
    key: 'onboarding.chat.start.done',
    maxItems: 4,
    maxLength: 220
  },
  {
    field: 'chatApiConfigGuideInvite',
    section: 'routines',
    key: 'chat.api-config-guide.invite',
    maxItems: 4,
    maxLength: 180
  },
  {
    field: 'chatApiConfigGuideTip',
    section: 'routines',
    key: 'chat.api-config-guide.tip',
    maxItems: 4,
    maxLength: 240
  },
  {
    field: 'chatApiConfigGuideDone',
    section: 'routines',
    key: 'chat.api-config-guide.done',
    maxItems: 4
  },
  {
    field: 'chatApiConfigGuideDoneMiniMax',
    section: 'routines',
    key: 'chat.api-config-guide.done.minimax',
    maxItems: 4,
    maxLength: 280
  }
] as const satisfies readonly CharacterMessageSpec[];

export type CharacterPackEditorMessageField = (typeof CHARACTER_MESSAGE_SPECS)[number]['field'];
export type CharacterPackEditorMessageFields = Record<CharacterPackEditorMessageField, string[]> & {
  progressKindLabels: CharacterPackEditorProgressKindLabelFields;
  progress: CharacterPackEditorProgressMessageFields;
};

// ============================================================================
// 中立文案（按 field/kind 聚合三语，Record<AppLanguage, ...> 全量类型，
// 编译器强制三语齐全；buildDefaultCharacterMessages 按当前语言取列）
// ============================================================================

export type CharacterMessageNeutralFactory = (profile: CharacterMessageProfile) => CharacterMessageTemplateEntry;

export const CHARACTER_MESSAGE_NEUTRAL: Record<CharacterPackEditorMessageField, Record<AppLanguage, CharacterMessageNeutralFactory>> = {
  welcome: {
    'zh-CN': ({ name, firstPerson, addressUser }) => [`${name}上线了。`, `${addressUser}回来啦，今天想先处理什么？`, `${firstPerson}在这里。`],
    ja: ({ name, firstPerson, addressUser }) => [`${name}がオンラインになりました。`, `おかえりなさい、${addressUser}。今日はまず何をしましょうか？`, `${firstPerson}はここにいます。`],
    en: ({ name, addressUser }) => [`${name} is online.`, `Welcome back, ${addressUser}. What would you like to start with today?`, "I'm here."]
  },
  click: {
    'zh-CN': ({ firstPerson }) => [`${firstPerson}在。`, '收到。', '要做什么？'],
    ja: ({ firstPerson }) => [`${firstPerson}がいます。`, '承知しました。', '何をしましょうか？'],
    en: () => ["I'm here.", 'Got it.', 'What would you like to do?']
  },
  hold: {
    'zh-CN': () => ['嗯哼。', '好呀。', '挪一下。', '在呢。', '来啦。', '放这里？', '听你的。', '嗯。'],
    ja: () => ['ふむ。', 'いいですよ。', '少し動かしましょう。', 'いますよ。', '来ました。', 'ここに置きますか？', '言う通りにします。', 'うん。'],
    en: () => ['Mm-hm.', 'Sure.', 'Moving a bit.', "I'm here.", 'Coming.', 'Put it here?', 'As you say.', 'Mm.']
  },
  reminder: {
    'zh-CN': () => ['记得休息一下，喝口水。', '坐久了，起来活动一下吧。'],
    ja: () => ['休憩して、水分を取ってくださいね。', '長時間座っています。少し体を動かしましょう。'],
    en: () => ['Remember to take a break and drink some water.', "You've been sitting for a while. Time to stretch."]
  },
  tip: {
    'zh-CN': () => ['右键可以打开菜单。', '需要我的时候点一下我就好。'],
    ja: () => ['右クリックでメニューを開けます。', '必要なときはクリックしてくださいね。'],
    en: () => ['Right-click to open the menu.', 'Just click me whenever you need me.']
  },
  message: {
    'zh-CN': () => ['有新消息。', '收到消息。'],
    ja: () => ['新しいメッセージがあります。', 'メッセージを受け取りました。'],
    en: () => ['You have a new message.', 'Message received.']
  },
  appear: {
    'zh-CN': ({ firstPerson }) => [`${firstPerson}来了。`, '已经就位。'],
    ja: ({ firstPerson }) => [`${firstPerson}が来ました。`, '準備完了です。'],
    en: () => ["I'm here.", 'All set.']
  },
  wake: {
    'zh-CN': () => ['早安。', '醒了，今天也开始吧。'],
    ja: () => ['おはようございます。', '起きました。今日も始めましょう。'],
    en: () => ['Good morning.', "I'm up. Let's start the day."]
  },
  aiThinking: {
    'zh-CN': ({ firstPerson }) => [`${firstPerson}想一下。`, '正在思考。'],
    ja: ({ firstPerson }) => [`${firstPerson}が考えます。`, '考え中です。'],
    en: () => ['Let me think.', 'Thinking...']
  },
  aiComplete: {
    'zh-CN': () => ['回答好了。', '搞定了。'],
    ja: () => ['答えができました。', 'できました。'],
    en: () => ["Here's the answer.", 'Done.']
  },
  aiError: {
    'zh-CN': () => ['思考时出了点问题。', '刚才没有处理成功。'],
    ja: () => ['考えているときに問題が起きました。', 'さっきの処理はうまくいきませんでした。'],
    en: () => ['Something went wrong while I was thinking.', "That didn't go through just now."]
  },
  downloadStart: {
    'zh-CN': () => ['开始下载。'],
    ja: () => ['ダウンロードを開始します。'],
    en: () => ['Starting download.']
  },
  downloadProgress: {
    'zh-CN': () => ['下载中。'],
    ja: () => ['ダウンロード中です。'],
    en: () => ['Downloading.']
  },
  downloadComplete: {
    'zh-CN': () => ['下载完成了。'],
    ja: () => ['ダウンロードが完了しました。'],
    en: () => ['Download complete.']
  },
  downloadFail: {
    'zh-CN': () => ['下载失败了。'],
    ja: () => ['ダウンロードに失敗しました。'],
    en: () => ['Download failed.']
  },
  pluginInstall: {
    'zh-CN': () => ['插件安装完成。'],
    ja: () => ['プラグインのインストールが完了しました。'],
    en: () => ['Plugin installed.']
  },
  pluginRemove: {
    'zh-CN': () => ['插件已移除。'],
    ja: () => ['プラグインを削除しました。'],
    en: () => ['Plugin removed.']
  },
  dailyRestReminder: {
    'zh-CN': () => ['差不多该休息一下了。'],
    ja: () => ['そろそろ休憩しましょう。'],
    en: () => ['Time for a short break.']
  },
  idleSleepy: {
    'zh-CN': () => ['有点困了呢...'],
    ja: () => ['ちょっと眠くなってきました…'],
    en: () => ['Getting a bit sleepy...']
  },
  onboardingChatStartTip: {
    'zh-CN': () => ['鼠标双击我，就能打开聊天窗口。'],
    ja: ({ firstPerson }) => [`${firstPerson}をダブルクリックすると、チャットウィンドウが開きます。`],
    en: () => ['Double-click me to open the chat window.']
  },
  onboardingChatStartDone: {
    'zh-CN': () => ['打开啦！'],
    ja: () => ['開きました！'],
    en: () => ["It's open!"]
  },
  chatApiConfigGuideInvite: {
    'zh-CN': () => ['需要先配置 API Key'],
    ja: () => ['先に API Key を設定する必要があります'],
    en: () => ['You need to configure an API Key first']
  },
  chatApiConfigGuideTip: {
    'zh-CN': () => ['填好 API Key 就可以和我对话了'],
    ja: () => ['API Key を入力すれば、おしゃべりできます'],
    en: () => ['Enter your API Key and we can start chatting']
  },
  chatApiConfigGuideDone: {
    'zh-CN': () => ['配置保存好了，现在可以开始聊天。'],
    ja: () => ['設定を保存しました。チャットを始められます。'],
    en: () => ['Settings saved. You can start chatting now.']
  },
  chatApiConfigGuideDoneMiniMax: {
    'zh-CN': () => ['MiniMax 还可以制作音乐，以后可以和我说哦'],
    ja: () => ['MiniMax では音楽も作れます。あとで話しかけてくださいね'],
    en: () => ['MiniMax can also make music — feel free to ask me about it later']
  }
};

export const CHARACTER_PROGRESS_KIND_LABEL: Record<CharacterProgressKindLabelKey, Record<AppLanguage, string>> = {
  download: { 'zh-CN': '下载', ja: 'ダウンロード', en: 'Download' },
  transcribe: { 'zh-CN': '转写', ja: '文字起こし', en: 'Transcription' },
  import: { 'zh-CN': '导入', ja: 'インポート', en: 'Import' },
  workflow: { 'zh-CN': '处理', ja: '処理', en: 'Processing' },
  generic: { 'zh-CN': '任务', ja: 'タスク', en: 'Task' }
};

export const CHARACTER_PROGRESS_MESSAGE: Record<CharacterProgressMessageKey, Record<AppLanguage, string>> = {
  progress: { 'zh-CN': '{kind}进度 {progress}%。', ja: '{kind}の進捗 {progress}%。', en: '{kind} is at {progress}%.' },
  almost: { 'zh-CN': '{kind}快完成了。', ja: '{kind}はもうすぐ完了です。', en: '{kind} is almost done.' },
  complete: { 'zh-CN': '{kind}完成了。', ja: '{kind}が完了しました。', en: '{kind} is done.' }
};

export function getCharacterMessageTemplateLines(entry: CharacterMessageTemplateEntry | undefined): string[] {
  if (Array.isArray(entry)) {
    return entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return typeof entry === 'string' && entry.trim() ? [entry] : [];
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getProgressTemplateText(value: string | undefined, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeDefaultCharacterMessageProfile(profile?: DefaultCharacterMessageProfile | null): CharacterMessageProfile {
  const firstPerson = normalizeText(profile?.firstPerson ?? profile?.speechStyle?.firstPerson, '我');
  const addressUser = normalizeText(profile?.addressUser ?? profile?.speechStyle?.addressUser, '你');
  const name = normalizeText(profile?.name, firstPerson);
  return { name, firstPerson, addressUser };
}

export function buildDefaultCharacterMessages(profile?: DefaultCharacterMessageProfile | null): CharacterMessagesConfig {
  const normalizedProfile = normalizeDefaultCharacterMessageProfile(profile);
  const language = getSpriteMessagesLanguage();
  const progress: CharacterProgressMessagesConfig = {
    kindLabels: {}
  };

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    progress.kindLabels![spec.key] = CHARACTER_PROGRESS_KIND_LABEL[spec.key][language];
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    progress[spec.key] = CHARACTER_PROGRESS_MESSAGE[spec.key][language];
  }

  const messages: CharacterMessagesConfig = {
    categories: {},
    events: {},
    routines: {},
    progress
  };

  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const neutral = CHARACTER_MESSAGE_NEUTRAL[spec.field][language];
    if (spec.section === 'categories') {
      messages.categories![spec.key as MessageCategory] = neutral(normalizedProfile);
    } else if (spec.section === 'events') {
      messages.events![spec.key] = neutral(normalizedProfile);
    } else {
      messages.routines![spec.key] = neutral(normalizedProfile);
    }
  }

  return messages;
}

export function createCharacterMessageEditorFields(messages: CharacterMessagesConfig | undefined, fallback: CharacterMessagesConfig): CharacterPackEditorMessageFields {
  const fields = {
    progressKindLabels: {} as CharacterPackEditorProgressKindLabelFields,
    progress: {} as CharacterPackEditorProgressMessageFields
  } as CharacterPackEditorMessageFields;

  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const section = messages?.[spec.section] as Record<string, CharacterMessageTemplateEntry | undefined> | undefined;
    const fallbackSection = fallback[spec.section] as Record<string, CharacterMessageTemplateEntry | undefined> | undefined;
    const explicitLines = getCharacterMessageTemplateLines(section?.[spec.key]);
    fields[spec.field] = explicitLines.length > 0 ? explicitLines : getCharacterMessageTemplateLines(fallbackSection?.[spec.key]);
  }

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    fields.progressKindLabels[spec.key] = getProgressTemplateText(messages?.progress?.kindLabels?.[spec.key], getProgressTemplateText(fallback.progress?.kindLabels?.[spec.key]));
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    fields.progress[spec.key] = getProgressTemplateText(messages?.progress?.[spec.key], getProgressTemplateText(fallback.progress?.[spec.key]));
  }

  return fields;
}

export function buildDefaultCharacterMessageEditorFields(profile?: DefaultCharacterMessageProfile | null): CharacterPackEditorMessageFields {
  return createCharacterMessageEditorFields(undefined, buildDefaultCharacterMessages(profile));
}
