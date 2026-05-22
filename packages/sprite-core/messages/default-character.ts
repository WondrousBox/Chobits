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
    field: 'drag',
    section: 'categories',
    key: 'drag',
    label: '拖拽文件',
    neutral: () => ['把文件交给我吧。']
  },
  {
    field: 'fileDrop',
    section: 'categories',
    key: 'fileDrop',
    label: '收到文件',
    neutral: () => ['我收到文件了。']
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
    field: 'workflowStart',
    section: 'events',
    key: 'workflowStart',
    label: '工作流开始',
    neutral: () => ['任务开始执行。', '工作流启动了。']
  },
  {
    field: 'workflowComplete',
    section: 'events',
    key: 'workflowComplete',
    label: '工作流完成',
    neutral: () => ['任务完成了。', '工作流执行成功。']
  },
  {
    field: 'workflowFail',
    section: 'events',
    key: 'workflowFail',
    label: '工作流失败',
    neutral: () => ['任务执行失败了。', '工作流出错了。']
  },
  {
    field: 'workflowCancel',
    section: 'events',
    key: 'workflowCancel',
    label: '工作流取消',
    neutral: () => ['任务已取消。', '工作流已停止。']
  },
  {
    field: 'importStart',
    section: 'events',
    key: 'importStart',
    label: '导入开始',
    neutral: () => ['开始导入。', '正在准备导入。']
  },
  {
    field: 'importComplete',
    section: 'events',
    key: 'importComplete',
    label: '导入完成',
    placeholder: '例如：已导入 {count} 个文件。',
    neutral: () => ['已导入 {count} 个文件。', '导入完成。']
  },
  {
    field: 'importError',
    section: 'events',
    key: 'importError',
    label: '导入失败',
    neutral: () => ['导入失败了。', '导入时出了点问题。']
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
    field: 'mediaProcessStart',
    section: 'events',
    key: 'mediaProcessStart',
    label: '媒体处理开始',
    neutral: () => ['媒体处理中。']
  },
  {
    field: 'mediaProcessFail',
    section: 'events',
    key: 'mediaProcessFail',
    label: '媒体处理失败',
    neutral: () => ['媒体处理失败了。']
  },
  {
    field: 'mediaProcessComplete',
    section: 'events',
    key: 'mediaProcessComplete',
    label: '媒体处理完成',
    neutral: () => ['媒体处理完成。']
  },
  {
    field: 'rssRefresh',
    section: 'events',
    key: 'rssRefresh',
    label: 'RSS 刷新',
    neutral: () => ['正在刷新订阅。']
  },
  {
    field: 'rssNewContent',
    section: 'events',
    key: 'rssNewContent',
    label: 'RSS 新内容',
    neutral: () => ['有新内容更新。']
  },
  {
    field: 'trashDelete',
    section: 'events',
    key: 'trashDelete',
    label: '移入回收站',
    neutral: () => ['已移到回收站。']
  },
  {
    field: 'trashRestore',
    section: 'events',
    key: 'trashRestore',
    label: '回收站恢复',
    neutral: () => ['已从回收站恢复。']
  },
  {
    field: 'memoryExtractStart',
    section: 'events',
    key: 'memoryExtractStart',
    label: '记忆整理开始',
    neutral: ({ firstPerson }) => ['正在整理记忆。', `${firstPerson}回忆一下。`]
  },
  {
    field: 'memoryExtractProgress',
    section: 'events',
    key: 'memoryExtractProgress',
    label: '记忆整理进度',
    placeholder: '例如：记忆整理中，{progress}%。',
    neutral: () => ['记忆整理中，{progress}%。']
  },
  {
    field: 'memoryExtractComplete',
    section: 'events',
    key: 'memoryExtractComplete',
    label: '记忆整理完成',
    neutral: ({ firstPerson }) => ['记忆整理好了。', `${firstPerson}记住了。`]
  },
  {
    field: 'memoryExtractFail',
    section: 'events',
    key: 'memoryExtractFail',
    label: '记忆整理失败',
    neutral: () => ['记忆整理失败了。']
  },
  {
    field: 'personaUpdateStart',
    section: 'events',
    key: 'personaUpdateStart',
    label: '用户画像开始',
    neutral: () => ['正在刷新对你的印象。']
  },
  {
    field: 'personaUpdateComplete',
    section: 'events',
    key: 'personaUpdateComplete',
    label: '用户画像更新完成',
    neutral: ({ firstPerson, addressUser }) => [`${firstPerson}更了解${addressUser}了。`, '用户画像更新完成。']
  },
  {
    field: 'personaUpdateFail',
    section: 'events',
    key: 'personaUpdateFail',
    label: '用户画像失败',
    neutral: () => ['用户画像更新失败了。']
  },
  {
    field: 'personaUpdateSkipped',
    section: 'events',
    key: 'personaUpdateSkipped',
    label: '用户画像跳过',
    neutral: () => ['了解了。']
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
    field: 'fileDropPrompt',
    section: 'routines',
    key: 'file.drop.intake.prompt',
    label: '文件处理询问',
    neutral: () => ['要怎么处理这个文件？']
  },
  {
    field: 'fileDropSelected',
    section: 'routines',
    key: 'file.drop.intake.selected',
    label: '文件处理已选择',
    neutral: () => ['交给我吧。']
  },
  {
    field: 'fileDropCancelled',
    section: 'routines',
    key: 'file.drop.intake.cancelled',
    label: '文件处理取消',
    neutral: () => ['那我先不打扰。']
  },
  {
    field: 'fileDropFailed',
    section: 'routines',
    key: 'file.drop.intake.failed',
    label: '文件处理失败',
    neutral: () => ['这里好像没处理成功。']
  },
  {
    field: 'workspaceCreateInvite',
    section: 'routines',
    key: 'onboarding.workspace.create.invite',
    label: '工作空间引导提示',
    neutral: () => ['没有找到工作空间，点这里立即创建吧。']
  },
  {
    field: 'workspaceCreateIntro',
    section: 'routines',
    key: 'onboarding.workspace.create.workspace-intro',
    label: '工作空间用途介绍',
    maxItems: 4,
    maxLength: 240,
    neutral: () => ['工作空间会存放所有重要的数据。']
  },
  {
    field: 'workspaceCreateQuickstartTip',
    section: 'routines',
    key: 'onboarding.workspace.create.quickstart-tip',
    label: '工作空间快速创建提示',
    maxItems: 4,
    neutral: () => ['这里可以先用快速创建，默认目录就能开始；以后也可以再调整。']
  },
  {
    field: 'workspaceCreateDone',
    section: 'routines',
    key: 'onboarding.workspace.create.done',
    label: '工作空间创建完成',
    neutral: () => ['工作空间建好啦！我可以做更多事情啦。']
  },
  {
    field: 'workspaceCreateClosedWithoutCreate',
    section: 'routines',
    key: 'onboarding.workspace.create.closed-without-create',
    label: '工作空间关闭未创建',
    neutral: () => ['还没有创建工作空间哦。']
  },
  {
    field: 'onboardingFileDropInvite',
    section: 'routines',
    key: 'onboarding.file.drop.invite',
    label: '首次拖拽文件引导',
    neutral: () => ['可以把文件拖拽给我存起来']
  },
  {
    field: 'onboardingFileDropIntro',
    section: 'routines',
    key: 'onboarding.file.drop.intro',
    label: '首次拖拽文件说明',
    maxItems: 4,
    maxLength: 240,
    neutral: () => ['拖给我的文件会进入资源库，之后就可以拿来整理、总结或继续处理。']
  },
  {
    field: 'onboardingFileDropDone',
    section: 'routines',
    key: 'onboarding.file.drop.done',
    label: '首次拖拽文件完成',
    neutral: () => ['收到啦！第一个文件已经进资源库了。']
  },
  {
    field: 'onboardingResourceOpenLibraryInvite',
    section: 'routines',
    key: 'onboarding.resource.open-library.invite',
    label: '打开资源库引导',
    neutral: () => ['右键点我，打开菜单里的资源库。']
  },
  {
    field: 'onboardingResourceOpenLibraryMenuTip',
    section: 'routines',
    key: 'onboarding.resource.open-library.menu-tip',
    label: '打开资源库菜单提示',
    neutral: () => ['现在点菜单里的「资源库」。']
  },
  {
    field: 'onboardingResourceOpenLibraryDone',
    section: 'routines',
    key: 'onboarding.resource.open-library.done',
    label: '打开资源库完成',
    neutral: () => ['打开啦！以后导入的文件都可以在资源库里整理。']
  },
  {
    field: 'workflowWaitingBusyStart',
    section: 'routines',
    key: 'workflow.waiting.busyStart',
    label: '等待工作流忙碌',
    neutral: () => ['正在处理：{workflowName}']
  },
  {
    field: 'workflowWaitingProgress',
    section: 'routines',
    key: 'workflow.waiting.progressSpeak',
    label: '等待工作流进度',
    placeholder: '例如：我还在等 {workflowName} 完成。',
    neutral: ({ firstPerson }) => [`${firstPerson}还在等 {workflowName} 完成。`]
  },
  {
    field: 'workflowWaitingComplete',
    section: 'routines',
    key: 'workflow.waiting.complete',
    label: '等待工作流完成',
    neutral: () => ['处理完成了。']
  },
  {
    field: 'workflowWaitingFail',
    section: 'routines',
    key: 'workflow.waiting.fail',
    label: '等待工作流失败',
    neutral: () => ['处理失败了，我把状态收起来了。']
  },
  {
    field: 'workflowWaitingCancel',
    section: 'routines',
    key: 'workflow.waiting.cancel',
    label: '等待工作流取消',
    neutral: () => ['任务已经取消。']
  },
  {
    field: 'resourceImportWaitingBusyStart',
    section: 'routines',
    key: 'resource.import.waiting.busyStart',
    label: '等待资源导入忙碌',
    neutral: () => ['正在导入资源。']
  },
  {
    field: 'resourceImportWaitingComplete',
    section: 'routines',
    key: 'resource.import.waiting.complete',
    label: '等待资源导入完成',
    neutral: () => ['资源导入完成。']
  },
  {
    field: 'resourceImportWaitingError',
    section: 'routines',
    key: 'resource.import.waiting.error',
    label: '等待资源导入失败',
    neutral: () => ['资源导入失败了。']
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
      messages.routines![spec.key] = spec.neutral(normalizedProfile);
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
