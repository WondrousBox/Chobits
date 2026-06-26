import type { QuestRecommendationDefinition } from './quest/types';

export type FeatureIntroCompletionSpec =
  | {
      kind: 'file-workflow-started';
      workflowIds: string[];
      actionIds?: string[];
    }
  | {
      kind: 'file-action-selected';
      actionIds: string[];
    }
  | {
      kind: 'assistant-menu-selected';
      itemId: string;
      windowKey?: string;
    }
  | {
      kind: 'app-window-opened';
      windowKey: string;
      route?: string;
    }
  | {
      kind: 'app-event';
      events: string[];
      match?: Record<string, unknown>;
    }
  | {
      kind: 'workflow-started';
      workflowIds: string[];
    };

export type FeatureIntroRoutineKind = 'file-workflow' | 'file-action' | 'assistant-menu' | 'window' | 'app-event';

export interface FeatureIntroRoutineSpec {
  kind: FeatureIntroRoutineKind;
  intro: string;
  instruction: string;
  done: string;
  windowKey?: string;
  windowPayload?: Record<string, unknown>;
  waitEvent?: string;
  waitEvents?: string[];
  waitMatch?: Record<string, unknown>;
  menuItemId?: string;
  menuWindowKey?: string;
}

export interface FeatureIntroQuestCatalogItem {
  id: string;
  title: string;
  description: string;
  area: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  rewardXp: number;
  rewardFavor: number;
  achievementId: string;
  recommendation?: QuestRecommendationDefinition;
  completion: FeatureIntroCompletionSpec;
  routine: FeatureIntroRoutineSpec;
}

function achievementFor(id: string): string {
  return `${id.replace(/\./g, '-')}-introduced`;
}

export const FEATURE_INTRO_QUEST_CATALOG: FeatureIntroQuestCatalogItem[] = [
  {
    id: 'feature.file-video-transcription',
    title: '认识文件转写流程',
    description: '把视频或音频拖给桌面助手，存入资源库后选择转写工作流，认识文件、资源库和工作流的完整链路。',
    area: '文件 / 资源库 / 工作流',
    priority: 'P0',
    rewardXp: 12,
    rewardFavor: 1,
    achievementId: 'feature-file-transcription-introduced',
    recommendation: {
      questId: 'feature.resource-library-preview',
      delayMs: 2500,
      prompt: '转写流程已经跑起来了。要不要接着看看资源在库里怎么预览？',
      confirmLabel: '继续'
    },
    completion: {
      kind: 'file-workflow-started',
      workflowIds: ['sample:transcribe'],
      actionIds: ['video-stt', 'audio-stt']
    },
    routine: {
      kind: 'file-workflow',
      intro: '把视频或音频拖给我，我会先放进资源库，再让你选择转写等处理方式。',
      instruction: '菜单弹出来后，视频请选择「视频转写」，音频请选择「识别文字（转写）」。',
      done: '转写工作流已经开始啦。之后我会继续陪你等处理结果。',
      waitEvent: 'FILE_ACTION_WORKFLOW_STARTED',
      waitMatch: { workflowId: 'sample:transcribe' }
    }
  },
  {
    id: 'feature.resource-library-preview',
    title: '认识资源库预览',
    description: '打开资源库并预览一个资源，了解文件进入资源库后如何查看、播放和继续处理。',
    area: '资源库',
    priority: 'P0',
    rewardXp: 12,
    rewardFavor: 1,
    achievementId: achievementFor('feature.resource-library-preview'),
    completion: {
      kind: 'app-event',
      events: ['RESOURCE_PREVIEW_OPENED']
    },
    routine: {
      kind: 'window',
      intro: '资源库会收纳你导入和下载的文件。先打开资源库，挑一个资源预览一下。',
      instruction: '在资源库里点开一个文件，我会在预览窗口里继续展示内容和处理面板。',
      done: '预览窗口打开啦。资源进库以后，就可以在这里播放、阅读、翻译、总结或继续编排。',
      windowKey: 'resources',
      waitEvent: 'RESOURCE_PREVIEW_OPENED'
    }
  },
  {
    id: 'feature.chat-with-resource',
    title: '认识带资源聊天',
    description: '把资源卡片交给助手提问或总结，了解聊天如何围绕资源内容继续处理。',
    area: '聊天 / 资源卡片',
    priority: 'P0',
    rewardXp: 12,
    rewardFavor: 1,
    achievementId: achievementFor('feature.chat-with-resource'),
    completion: {
      kind: 'app-event',
      events: ['SPRITE_AI_COMPLETE'],
      match: { hasResourceContext: true }
    },
    routine: {
      kind: 'window',
      intro: '聊天不只是问答，也可以围绕资源卡片继续做总结、追问和整理。',
      instruction: '打开聊天窗口后，选择带资源卡片的对话，或者让助手查询资源后继续提问。',
      done: '这次回答已经带上资源上下文了。以后你可以把文件交给我，再继续围绕它聊天。',
      windowKey: 'chat',
      waitEvent: 'SPRITE_AI_COMPLETE',
      waitMatch: { hasResourceContext: true }
    }
  },
  {
    id: 'feature.video-keyframes',
    title: '认识视频关键帧',
    description: '拖拽视频并选择提取关键帧，了解视频资源如何被工作流拆解成可浏览的画面线索。',
    area: '工作流 / 视频',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.video-keyframes'),
    completion: {
      kind: 'file-workflow-started',
      workflowIds: ['sample:video-keyframes'],
      actionIds: ['video-keyframes']
    },
    routine: {
      kind: 'file-workflow',
      intro: '把一个视频拖给我，可以让工作流提取关键帧，快速看到视频里的画面变化。',
      instruction: '文件菜单弹出后，选择「提取关键帧」。',
      done: '关键帧工作流开始了。它会把视频里的代表画面提取出来，方便你快速扫内容。',
      waitEvent: 'FILE_ACTION_WORKFLOW_STARTED',
      waitMatch: { workflowId: 'sample:video-keyframes' }
    }
  },
  {
    id: 'feature.media-transcode',
    title: '认识媒体转码',
    description: '拖拽视频或音频并选择转码、压缩或提取音频，了解媒体工作流的基础处理能力。',
    area: '工作流 / 媒体',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.media-transcode'),
    completion: {
      kind: 'file-workflow-started',
      workflowIds: ['sample:transcode'],
      actionIds: ['video-transcode', 'audio-transcode']
    },
    routine: {
      kind: 'file-workflow',
      intro: '媒体文件也能继续处理。视频可以提取音频，音频可以转码或压缩。',
      instruction: '拖入视频或音频后，在菜单里选择「转码/压缩」。',
      done: '媒体转码工作流已经开始。处理完成后，结果会继续回到资源库里。',
      waitEvent: 'FILE_ACTION_WORKFLOW_STARTED'
    }
  },
  {
    id: 'feature.image-understand',
    title: '认识图片理解',
    description: '拖拽图片并启动图片理解工作流，让助手提取图片内容、描述和标签。',
    area: '图片 / AI',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.image-understand'),
    completion: {
      kind: 'file-workflow-started',
      workflowIds: ['sample:image-understand'],
      actionIds: ['image-analyze']
    },
    routine: {
      kind: 'file-workflow',
      intro: '图片也可以进入资源库，再交给 AI 理解内容、生成描述和标签。',
      instruction: '拖入图片后，在菜单里选择「图像理解」。',
      done: '图片理解工作流开始了。等它完成后，资源描述和标签会更有用。',
      waitEvent: 'FILE_ACTION_WORKFLOW_STARTED',
      waitMatch: { workflowId: 'sample:image-understand' }
    }
  },
  {
    id: 'feature.ocr',
    title: '认识图片 OCR',
    description: '拖拽图片并使用 OCR 基础能力，把图片中的文字提取成可检索内容。',
    area: '图片 / OCR',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.ocr'),
    completion: {
      kind: 'app-event',
      events: ['FILE_ACTION_OCR_COMPLETED'],
      match: { actionId: 'image-ocr' }
    },
    routine: {
      kind: 'file-action',
      intro: '如果图片里有文字，可以用 OCR 把它识别出来，后续就能搜索和整理。',
      instruction: '拖入图片后，在菜单里选择「文字识别（OCR）」。',
      done: 'OCR 识别完成了。图片里的文字已经保存成关联文本，也会写回图片资源方便检索。',
      waitEvent: 'FILE_ACTION_OCR_COMPLETED',
      waitMatch: { actionId: 'image-ocr' }
    }
  },
  {
    id: 'feature.subtitle-translate',
    title: '认识字幕翻译',
    description: '拖拽字幕文件并选择翻译字幕，了解字幕资源的 AI 翻译入口。',
    area: '字幕',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.subtitle-translate'),
    completion: {
      kind: 'file-action-selected',
      actionIds: ['subtitle-translate']
    },
    routine: {
      kind: 'file-action',
      intro: '字幕文件可以直接翻译，适合给视频学习、整理双语资料。',
      instruction: '拖入 srt、vtt 或 ass 字幕后，在菜单里选择「翻译字幕」。',
      done: '字幕翻译入口已经打开。配置好模型后，就能把字幕翻成目标语言。',
      waitEvent: 'FILE_ACTION_SELECTED',
      waitMatch: { actionId: 'subtitle-translate' }
    }
  },
  {
    id: 'feature.subtitle-summary',
    title: '认识字幕总结',
    description: '拖拽字幕文件并选择总结字幕，了解如何从字幕内容生成摘要。',
    area: '字幕',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.subtitle-summary'),
    completion: {
      kind: 'file-action-selected',
      actionIds: ['subtitle-summarize']
    },
    routine: {
      kind: 'file-action',
      intro: '字幕本身就是很好的文本素材，可以直接拿来总结重点。',
      instruction: '拖入字幕文件后，在菜单里选择「总结字幕」。',
      done: '字幕总结入口已经打开。以后长视频可以先读摘要，再决定要不要细看。',
      waitEvent: 'FILE_ACTION_SELECTED',
      waitMatch: { actionId: 'subtitle-summarize' }
    }
  },
  {
    id: 'feature.subtitle-read',
    title: '认识字幕朗读',
    description: '拖拽字幕文件并选择读给我听，了解字幕和 TTS 的衔接方式。',
    area: '字幕 / TTS',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.subtitle-read'),
    completion: {
      kind: 'file-action-selected',
      actionIds: ['subtitle-read']
    },
    routine: {
      kind: 'file-action',
      intro: '字幕也可以朗读出来，适合复听台词、学习语言或快速过材料。',
      instruction: '拖入字幕文件后，在菜单里选择「读给我听」。',
      done: '字幕朗读入口已经打开。之后可以在 TTS 配置里调整声音。',
      waitEvent: 'FILE_ACTION_SELECTED',
      waitMatch: { actionId: 'subtitle-read' }
    }
  },
  {
    id: 'feature.inventory',
    title: '认识背包',
    description: '从助手右键菜单打开背包，用游戏化网格浏览资源库内容。',
    area: '背包 / 游戏化资源',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.inventory'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'inventory',
      windowKey: 'inventory'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '背包是资源库的游戏化入口，适合像整理物品一样浏览你的资源。',
      instruction: '右键点我，在菜单里选择「背包」。',
      done: '背包打开啦。之后你可以用更轻松的方式翻看资源。',
      menuItemId: 'inventory',
      menuWindowKey: 'inventory'
    }
  },
  {
    id: 'feature.quest-list',
    title: '认识任务列表',
    description: '从助手右键菜单打开任务列表，查看新手任务、功能自述和奖励进度。',
    area: '任务系统',
    priority: 'P1',
    rewardXp: 10,
    rewardFavor: 1,
    achievementId: achievementFor('feature.quest-list'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'quests',
      windowKey: 'questList'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '任务列表会记录新手引导、功能介绍和奖励进度。',
      instruction: '右键点我，在菜单里选择「任务」。',
      done: '任务列表打开啦。之后你可以从这里继续探索功能。',
      menuItemId: 'quests',
      menuWindowKey: 'questList'
    }
  },
  {
    id: 'feature.workflow-gallery',
    title: '认识工作流库',
    description: '打开资源库里的工作流页面，查看预设工作流并理解资源处理可编排。',
    area: '工作流',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.workflow-gallery'),
    completion: {
      kind: 'app-window-opened',
      windowKey: 'resources',
      route: 'workflows'
    },
    routine: {
      kind: 'window',
      intro: '工作流把资源处理拆成可编排的步骤，预设库里有转写、OCR、转码等模板。',
      instruction: '我会打开资源库里的工作流页，你可以先浏览有哪些预设。',
      done: '工作流页面打开啦。以后复杂处理可以从预设开始改。',
      windowKey: 'resources',
      windowPayload: { route: 'workflows' },
      waitEvent: 'APP_WINDOW_OPENED',
      waitMatch: { windowKey: 'resources', route: 'workflows' }
    }
  },
  {
    id: 'feature.youtube-download',
    title: '认识 YouTube 下载',
    description: '通过下载能力把 YouTube 链接保存为资源，后续继续转写、总结或整理。',
    area: '下载',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.youtube-download'),
    completion: {
      kind: 'app-event',
      events: ['SPRITE_DOWNLOAD_START']
    },
    routine: {
      kind: 'app-event',
      intro: '我可以把 YouTube 链接下载进资源库，再继续做转写、总结或剪辑准备。',
      instruction: '把 YouTube 链接交给助手并开始下载，下载启动时这个任务就完成。',
      done: '下载已经开始。下载完成后，资源会进入后续处理链路。',
      windowKey: 'chat',
      waitEvent: 'SPRITE_DOWNLOAD_START'
    }
  },
  {
    id: 'feature.youtube-subscribe',
    title: '认识 YouTube 订阅',
    description: '刷新或订阅 YouTube 频道内容，了解 RSS 订阅如何把新内容带进资源库。',
    area: 'RSS / 订阅',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.youtube-subscribe'),
    completion: {
      kind: 'app-event',
      events: ['SPRITE_RSS_REFRESH']
    },
    routine: {
      kind: 'app-event',
      intro: '订阅功能可以持续关注频道，有新内容时再进入资源库处理。',
      instruction: '在资源库的订阅内容里刷新一次 RSS 或频道订阅。',
      done: '订阅刷新开始啦。以后新内容可以从这里进入你的资料流。',
      windowKey: 'resources',
      waitEvent: 'SPRITE_RSS_REFRESH'
    }
  },
  {
    id: 'feature.asr-microphone',
    title: '认识麦克风识别',
    description: '从助手右键菜单打开麦克风识别，把现场语音转成文本。',
    area: 'ASR',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.asr-microphone'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'mic-recording',
      windowKey: 'asr'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '麦克风识别可以把你说的话实时转成文字。',
      instruction: '右键点我，在语音服务里选择「麦克风识别」。',
      done: '麦克风识别窗口打开啦。之后可以直接用语音输入或记录内容。',
      menuItemId: 'mic-recording',
      menuWindowKey: 'asr'
    }
  },
  {
    id: 'feature.system-audio-asr',
    title: '认识电脑声音识别',
    description: '从助手右键菜单打开电脑声音识别，把系统音频转成文本。',
    area: 'ASR',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.system-audio-asr'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'system-audio-recording',
      windowKey: 'asr'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '电脑声音识别可以把系统播放的声音转成文本，适合会议、课程和视频资料。',
      instruction: '右键点我，在语音服务里选择「电脑声音识别」。',
      done: '电脑声音识别窗口打开啦。之后可以把系统音频直接变成文字。',
      menuItemId: 'system-audio-recording',
      menuWindowKey: 'asr'
    }
  },
  {
    id: 'feature.tts-config',
    title: '认识 TTS 配置',
    description: '从助手右键菜单打开 TTS 测试，了解语音合成和朗读声音配置。',
    area: 'TTS',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.tts-config'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'tts-config',
      windowKey: 'ttsConfig'
    },
    routine: {
      kind: 'assistant-menu',
      intro: 'TTS 配置可以测试朗读效果，调整我说话或读字幕时使用的声音。',
      instruction: '右键点我，在语音服务里选择「TTS 测试」。',
      done: 'TTS 测试窗口打开啦。声音配置以后会影响朗读体验。',
      menuItemId: 'tts-config',
      menuWindowKey: 'ttsConfig'
    }
  },
  {
    id: 'feature.memory-graph',
    title: '认识记忆图谱',
    description: '从助手右键菜单打开记忆图谱，了解长期记忆如何按主题组织。',
    area: '记忆',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.memory-graph'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'memory-graph',
      windowKey: 'memoryGraph'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '记忆图谱会把长期记忆按主题组织起来，方便以后检索和回顾。',
      instruction: '右键点我，在菜单里选择「记忆图谱」。',
      done: '记忆图谱打开啦。这里会展示我长期记住的信息如何连接。',
      menuItemId: 'memory-graph',
      menuWindowKey: 'memoryGraph'
    }
  },
  {
    id: 'feature.memory-save-search',
    title: '认识记忆保存与检索',
    description: '让助手保存一条重要信息，之后可在记忆系统中检索和查看。',
    area: '记忆',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.memory-save-search'),
    completion: {
      kind: 'app-event',
      events: ['MEMORY_SAVED', 'MEMORY_EXTRACTION_COMPLETED']
    },
    routine: {
      kind: 'app-event',
      intro: '重要信息可以保存进长期记忆，之后再通过记忆搜索或图谱找回来。',
      instruction: '在聊天里明确告诉我「记住这件事」，或者等自动记忆整理完成。',
      done: '记忆已经写入或整理完成。之后你可以在记忆图谱里继续查看。',
      windowKey: 'chat',
      waitEvents: ['MEMORY_SAVED', 'MEMORY_EXTRACTION_COMPLETED']
    }
  },
  {
    id: 'feature.plugin-manager',
    title: '认识插件管理器',
    description: '打开插件管理器，查看已安装插件、插件资源和可扩展能力。',
    area: '插件',
    priority: 'P2',
    rewardXp: 8,
    rewardFavor: 1,
    achievementId: achievementFor('feature.plugin-manager'),
    completion: {
      kind: 'app-window-opened',
      windowKey: 'pluginManager'
    },
    routine: {
      kind: 'window',
      intro: '插件管理器负责扩展能力，比如工作流引擎、模型资源和额外工具。',
      instruction: '我会打开插件管理器，你可以先看看当前安装了哪些插件。',
      done: '插件管理器打开啦。以后新增能力也会从这里管理。',
      windowKey: 'pluginManager',
      waitEvent: 'APP_WINDOW_OPENED',
      waitMatch: { windowKey: 'pluginManager' }
    }
  },
  {
    id: 'feature.window-animation-editor',
    title: '认识窗口动画编辑器',
    description: '打开窗口动画编辑器，了解窗口出现、移动和退出动画如何配置。',
    area: '个性化',
    priority: 'P3',
    rewardXp: 6,
    rewardFavor: 1,
    achievementId: achievementFor('feature.window-animation-editor'),
    completion: {
      kind: 'app-window-opened',
      windowKey: 'windowAnimationEditor'
    },
    routine: {
      kind: 'window',
      intro: '窗口动画编辑器可以调整应用窗口出现、移动和退出的动效。',
      instruction: '我会打开动画编辑器，你可以先试试看预设动画。',
      done: '窗口动画编辑器打开啦。这里属于更个性化的桌面体验设置。',
      windowKey: 'windowAnimationEditor',
      waitEvent: 'APP_WINDOW_OPENED',
      waitMatch: { windowKey: 'windowAnimationEditor' }
    }
  },
  {
    id: 'feature.character-pack-editor',
    title: '认识角色包编辑器',
    description: '打开角色包编辑器，了解角色文案、动画和能力标签如何配置。',
    area: '角色包',
    priority: 'P3',
    rewardXp: 6,
    rewardFavor: 1,
    achievementId: achievementFor('feature.character-pack-editor'),
    completion: {
      kind: 'app-window-opened',
      windowKey: 'characterPackEditor'
    },
    routine: {
      kind: 'window',
      intro: '角色包编辑器可以调整角色文案、动画、声音提示和能力标签。',
      instruction: '我会打开角色包编辑器，你可以先看看当前角色包有哪些配置。',
      done: '角色包编辑器打开啦。以后想换角色风格，可以从这里开始。',
      windowKey: 'characterPackEditor',
      waitEvent: 'APP_WINDOW_OPENED',
      waitMatch: { windowKey: 'characterPackEditor' }
    }
  },
  {
    id: 'feature.skill-tree',
    title: '认识技能树',
    description: '从助手右键菜单打开技能树，了解能力解锁和游戏化成长结构。',
    area: '游戏化',
    priority: 'P3',
    rewardXp: 6,
    rewardFavor: 1,
    achievementId: achievementFor('feature.skill-tree'),
    completion: {
      kind: 'assistant-menu-selected',
      itemId: 'skill-tree',
      windowKey: 'skillTree'
    },
    routine: {
      kind: 'assistant-menu',
      intro: '技能树会展示桌面助手能力的解锁关系，是游戏化成长的一部分。',
      instruction: '右键点我，在菜单里选择「技能树」。',
      done: '技能树打开啦。以后能力解锁会在这里更直观。',
      menuItemId: 'skill-tree',
      menuWindowKey: 'skillTree'
    }
  }
];
