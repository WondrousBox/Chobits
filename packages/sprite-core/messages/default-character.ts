import type { CharacterMessagesConfig, CharacterMessageTemplateEntry, CharacterProgressMessagesConfig } from '../character-service';
import type { MessageCategory } from '../types';

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
  label: string;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
  neutral: (profile: CharacterMessageProfile) => CharacterMessageTemplateEntry;
}

export type CharacterProgressMessageKey = 'progress' | 'almost' | 'complete';

export interface CharacterProgressKindLabelSpec {
  key: string;
  label: string;
  neutral: () => string;
}

export interface CharacterProgressMessageSpec {
  key: CharacterProgressMessageKey;
  label: string;
  neutral: () => string;
}

export const CHARACTER_PROGRESS_KIND_LABEL_SPECS = [
  { key: 'download', label: '下载', neutral: () => '下载' },
  { key: 'transcribe', label: '转写', neutral: () => '转写' },
  { key: 'import', label: '导入', neutral: () => '导入' },
  { key: 'workflow', label: '工作流/处理', neutral: () => '处理' },
  { key: 'generic', label: '通用任务', neutral: () => '任务' }
] as const satisfies readonly CharacterProgressKindLabelSpec[];

export const CHARACTER_PROGRESS_MESSAGE_SPECS = [
  { key: 'progress', label: '进度播报', neutral: () => '{kind}进度 {progress}%。' },
  { key: 'almost', label: '即将完成', neutral: () => '{kind}快完成了。' },
  { key: 'complete', label: '完成播报', neutral: () => '{kind}完成了。' }
] as const satisfies readonly CharacterProgressMessageSpec[];

export type CharacterProgressKindLabelKey = (typeof CHARACTER_PROGRESS_KIND_LABEL_SPECS)[number]['key'];
export type CharacterPackEditorProgressKindLabelFields = Record<CharacterProgressKindLabelKey, string>;
export type CharacterPackEditorProgressMessageFields = Record<CharacterProgressMessageKey, string>;

export const CHARACTER_MESSAGE_SPECS = [
  {
    field: 'welcome',
    section: 'categories',
    key: 'welcome',
    label: '启动欢迎',
    neutral: ({ name, firstPerson, addressUser }) => [`${name}上线了。`, `${addressUser}回来啦，今天想先处理什么？`, `${firstPerson}在这里。`]
  },
  {
    field: 'click',
    section: 'categories',
    key: 'click',
    label: '点击回应',
    neutral: ({ firstPerson }) => [`${firstPerson}在。`, '收到。', '要做什么？']
  },
  {
    field: 'hold',
    section: 'categories',
    key: 'hold',
    label: '拖动提示',
    neutral: () => ['嗯哼。', '好呀。', '挪一下。', '在呢。', '来啦。', '放这里？', '听你的。', '嗯。']
  },
  {
    field: 'reminder',
    section: 'categories',
    key: 'reminder',
    label: '休息提醒',
    neutral: () => ['记得休息一下，喝口水。', '坐久了，起来活动一下吧。']
  },
  {
    field: 'tip',
    section: 'categories',
    key: 'tip',
    label: '小提示',
    maxItems: 12,
    neutral: () => ['右键可以打开菜单。', '可以把文件拖到我这里。', '需要我的时候点一下我就好。']
  },
  {
    field: 'message',
    section: 'categories',
    key: 'message',
    label: '普通消息',
    neutral: () => ['有新消息。', '收到消息。']
  },
  {
    field: 'appear',
    section: 'events',
    key: 'appear',
    label: '登场',
    neutral: ({ firstPerson }) => [`${firstPerson}来了。`, '已经就位。']
  },
  {
    field: 'wake',
    section: 'events',
    key: 'wake',
    label: '唤醒',
    neutral: () => ['早安。', '醒了，今天也开始吧。']
  },
  {
    field: 'aiThinking',
    section: 'events',
    key: 'aiThinking',
    label: 'AI 思考中',
    neutral: ({ firstPerson }) => [`${firstPerson}想一下。`, '正在思考。']
  },
  {
    field: 'aiComplete',
    section: 'events',
    key: 'aiComplete',
    label: 'AI 回答完成',
    neutral: () => ['回答好了。', '搞定了。']
  },
  {
    field: 'aiError',
    section: 'events',
    key: 'aiError',
    label: 'AI 出错',
    neutral: () => ['思考时出了点问题。', '刚才没有处理成功。']
  },
  {
    field: 'downloadStart',
    section: 'events',
    key: 'downloadStart',
    label: '下载开始',
    neutral: () => ['开始下载。']
  },
  {
    field: 'downloadProgress',
    section: 'events',
    key: 'downloadProgress',
    label: '下载进度',
    neutral: () => ['下载中。']
  },
  {
    field: 'downloadComplete',
    section: 'events',
    key: 'downloadComplete',
    label: '下载完成',
    neutral: () => ['下载完成了。']
  },
  {
    field: 'downloadFail',
    section: 'events',
    key: 'downloadFail',
    label: '下载失败',
    neutral: () => ['下载失败了。']
  },
  {
    field: 'pluginInstall',
    section: 'events',
    key: 'pluginInstall',
    label: '插件安装',
    neutral: () => ['插件安装完成。']
  },
  {
    field: 'pluginRemove',
    section: 'events',
    key: 'pluginRemove',
    label: '插件移除',
    neutral: () => ['插件已移除。']
  },
  {
    field: 'pluginUpdate',
    section: 'events',
    key: 'pluginUpdate',
    label: '插件更新',
    neutral: () => ['插件已更新。']
  },
  {
    field: 'dailyRestReminder',
    section: 'routines',
    key: 'daily.rest-reminder.speak',
    label: '日常休息提醒',
    neutral: () => ['差不多该休息一下了。']
  },
  {
    field: 'idleSleepy',
    section: 'routines',
    key: 'idle.sleepy.toast',
    label: '闲置犯困提示',
    neutral: () => ['有点困了呢...']
  },
  {
    field: 'onboardingChatStartTip',
    section: 'routines',
    key: 'onboarding.chat.start.tip',
    label: '首次聊天引导提示',
    maxItems: 4,
    maxLength: 240,
    neutral: () => ['鼠标双击我，就能打开聊天窗口。']
  },
  {
    field: 'onboardingChatStartDone',
    section: 'routines',
    key: 'onboarding.chat.start.done',
    label: '首次聊天完成',
    maxItems: 4,
    maxLength: 220,
    neutral: () => ['打开啦！']
  },
  {
    field: 'chatApiConfigGuideInvite',
    section: 'routines',
    key: 'chat.api-config-guide.invite',
    label: '聊天 API 配置引导跳转确认',
    maxItems: 4,
    maxLength: 180,
    neutral: () => ['需要先配置 API Key']
  },
  {
    field: 'chatApiConfigGuideTip',
    section: 'routines',
    key: 'chat.api-config-guide.tip',
    label: '聊天 API 配置引导提示',
    maxItems: 4,
    maxLength: 240,
    neutral: () => ['填好 API Key 就可以和我对话了']
  },
  {
    field: 'chatApiConfigGuideDone',
    section: 'routines',
    key: 'chat.api-config-guide.done',
    label: '聊天 API 配置引导完成',
    maxItems: 4,
    neutral: () => ['配置保存好了，现在可以开始聊天。']
  },
  {
    field: 'chatApiConfigGuideDoneMiniMax',
    section: 'routines',
    key: 'chat.api-config-guide.done.minimax',
    label: '聊天 API 配置引导完成 MiniMax 彩蛋',
    maxItems: 4,
    maxLength: 280,
    neutral: () => ['MiniMax 还可以制作音乐，以后可以和我说哦']
  }
] as const satisfies readonly CharacterMessageSpec[];

export type CharacterPackEditorMessageField = (typeof CHARACTER_MESSAGE_SPECS)[number]['field'];
export type CharacterPackEditorMessageFields = Record<CharacterPackEditorMessageField, string[]> & {
  progressKindLabels: CharacterPackEditorProgressKindLabelFields;
  progress: CharacterPackEditorProgressMessageFields;
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
  const progress: CharacterProgressMessagesConfig = {
    kindLabels: {}
  };

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    progress.kindLabels![spec.key] = spec.neutral();
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    progress[spec.key] = spec.neutral();
  }

  const messages: CharacterMessagesConfig = {
    categories: {},
    events: {},
    routines: {},
    progress
  };

  for (const spec of CHARACTER_MESSAGE_SPECS) {
    if (spec.section === 'categories') {
      messages.categories![spec.key as MessageCategory] = spec.neutral(normalizedProfile);
    } else if (spec.section === 'events') {
      messages.events![spec.key] = spec.neutral(normalizedProfile);
    } else {
      messages.routines![spec.key] = spec.neutral();
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
