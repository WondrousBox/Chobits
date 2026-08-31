export type SpriteCapabilityStatus = 'locked' | 'unlocked' | 'active';

export type SpriteCapabilityTier = 'beginner' | 'intermediate' | 'advanced' | 'professional' | 'master';

export type SpriteCapabilityBranch = 'core' | 'perception' | 'care' | 'avatar' | 'intelligence' | (string & {});

export type SpriteCapabilitySignalMode = 'all' | 'any';

export interface SpriteCapabilityShortcut {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  key: string;
}

export interface SpriteCapabilityDefinition {
  id: string;
  name: string;
  description: string;
  branch: SpriteCapabilityBranch;
  tier: SpriteCapabilityTier;
  column: number;
  row: number;
  prerequisites: string[];
  settingsKey?: string;
  requiredFeatureFlags?: string[];
  requiredShortcut?: SpriteCapabilityShortcut;
  activationSignals?: string[];
  activationSignalMode?: SpriteCapabilitySignalMode;
}

export interface SpriteCapabilityResolutionContext {
  activeSignals?: Record<string, boolean | null | undefined>;
  featureFlags?: Record<string, boolean | null | undefined>;
}

export interface SpriteCapabilityState extends SpriteCapabilityDefinition {
  status: SpriteCapabilityStatus;
  active: boolean;
  unlocked: boolean;
  unlockReady: boolean;
  inactivePrerequisites: string[];
  missingPrerequisites: string[];
  missingFeatureFlags: string[];
}

export interface SpriteCapabilityTotals {
  total: number;
  active: number;
  unlocked: number;
  locked: number;
}

export interface SpriteCapabilitySnapshot {
  capabilities: Record<string, SpriteCapabilityState>;
  ordered: SpriteCapabilityState[];
  totals: SpriteCapabilityTotals;
}

export const SPRITE_CAPABILITY_SIGNALS = {
  dailyCareEnabled: 'dailyCare.enabled',
  recorderEnabled: 'recorder.enabled',
  screenshotEnabled: 'shortcuts.screenshot',
  asrRunning: 'asr.running'
} as const;

const DEFAULT_ACTIVATION_SIGNAL_MODE: SpriteCapabilitySignalMode = 'any';

const DEFAULT_CAPABILITY_DEFINITIONS: SpriteCapabilityDefinition[] = [
  {
    id: 'microphone',
    name: '麦克风录音',
    description: '开启麦克风采集能力，录制语音输入',
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 0,
    prerequisites: [],
    settingsKey: 'recorder',
    activationSignals: [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]
  },
  {
    id: 'systemAudio',
    name: '系统音频',
    description: '采集电脑系统音频输出',
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 1,
    prerequisites: [],
    settingsKey: 'recorder',
    activationSignals: [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]
  },
  {
    id: 'screenshot',
    name: '屏幕截图',
    description: '快速截取屏幕内容',
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 2,
    prerequisites: [],
    settingsKey: 'screenshot',
    activationSignals: [SPRITE_CAPABILITY_SIGNALS.screenshotEnabled],
    requiredShortcut: {
      ctrl: true,
      shift: true,
      key: 'A'
    }
  },
  {
    id: 'speechRecognition',
    name: '语音识别',
    description: '启动实时语音识别服务，将语音转换为文字',
    branch: 'perception',
    tier: 'beginner',
    column: 1,
    row: 0,
    prerequisites: ['microphone'],
    settingsKey: 'speechRecognition',
    activationSignals: [SPRITE_CAPABILITY_SIGNALS.asrRunning]
  },
  {
    id: 'screenRecord',
    name: '屏幕录制',
    description: '录制屏幕视频内容',
    branch: 'perception',
    tier: 'intermediate',
    column: 0,
    row: 1,
    prerequisites: ['screenshot', 'systemAudio']
  },
  {
    id: 'imageRecognition',
    name: '图片识别',
    description: 'AI 识别图片中的内容',
    branch: 'perception',
    tier: 'intermediate',
    column: 0,
    row: 2,
    prerequisites: ['screenshot']
  },
  {
    id: 'realtimeTranscribe',
    name: '实时转写',
    description: '实时将语音转换为字幕',
    branch: 'perception',
    tier: 'intermediate',
    column: 1,
    row: 0,
    prerequisites: ['speechRecognition', 'systemAudio']
  },
  {
    id: 'videoAnalysis',
    name: '视频理解',
    description: 'AI 分析视频内容，提取关键信息',
    branch: 'perception',
    tier: 'advanced',
    column: 0,
    row: 1,
    prerequisites: ['screenRecord', 'imageRecognition']
  },
  {
    id: 'meetingNotes',
    name: '会议记录',
    description: '自动记录会议内容并生成纪要',
    branch: 'perception',
    tier: 'advanced',
    column: 1,
    row: 0,
    prerequisites: ['realtimeTranscribe']
  },
  {
    id: 'dailyCare',
    name: '日常关心',
    description: '健康提醒、休息建议',
    branch: 'care',
    tier: 'beginner',
    column: 0,
    row: 3,
    prerequisites: [],
    settingsKey: 'dailyCare',
    activationSignals: [SPRITE_CAPABILITY_SIGNALS.dailyCareEnabled]
  },
  {
    id: 'scheduleReminder',
    name: '日程提醒',
    description: '会议、生日、纪念日提醒',
    branch: 'care',
    tier: 'intermediate',
    column: 0,
    row: 3,
    prerequisites: ['dailyCare'],
    settingsKey: 'dailyCare'
  },
  {
    id: 'smartReminder',
    name: '智能提醒',
    description: '根据习惯自动调整提醒时机',
    branch: 'care',
    tier: 'advanced',
    column: 0,
    row: 3,
    prerequisites: ['scheduleReminder'],
    settingsKey: 'dailyCare'
  },
  {
    id: 'spriteManage',
    name: '精灵形象',
    description: '导入/切换桌面精灵动画',
    branch: 'avatar',
    tier: 'beginner',
    column: 0,
    row: 5,
    prerequisites: [],
    settingsKey: 'sprite',
    requiredFeatureFlags: ['character:loaded']
  },
  {
    id: 'customAppearance',
    name: '外观定制',
    description: '自定义精灵外观和配色',
    branch: 'avatar',
    tier: 'intermediate',
    column: 0,
    row: 5,
    prerequisites: ['spriteManage'],
    requiredFeatureFlags: ['character:loaded', 'character:has-custom-appearance']
  },
  {
    id: 'actionChoreography',
    name: '动作编排',
    description: '自定义精灵动作序列',
    branch: 'avatar',
    tier: 'advanced',
    column: 0,
    row: 5,
    prerequisites: ['customAppearance'],
    requiredFeatureFlags: ['character:loaded', 'pack:has-custom-animations']
  },
  {
    id: 'emotionExpression',
    name: '情感表达',
    description: '根据对话内容自动展示表情',
    branch: 'avatar',
    tier: 'professional',
    column: 0,
    row: 5,
    prerequisites: ['actionChoreography']
  },
  {
    id: 'aiChat',
    name: 'AI 对话',
    description: '与 AI 助手进行自然对话',
    branch: 'intelligence',
    tier: 'beginner',
    column: 0,
    row: 7,
    prerequisites: []
  },
  {
    id: 'docUnderstanding',
    name: '文档理解',
    description: 'AI 阅读和理解文档内容',
    branch: 'intelligence',
    tier: 'intermediate',
    column: 0,
    row: 7,
    prerequisites: ['aiChat']
  },
  {
    id: 'translation',
    name: '翻译助手',
    description: '多语言实时翻译',
    branch: 'intelligence',
    tier: 'intermediate',
    column: 1,
    row: 8,
    prerequisites: ['aiChat']
  },
  {
    id: 'smartAssistant',
    name: '智能助理',
    description: '理解上下文，主动提供帮助',
    branch: 'intelligence',
    tier: 'advanced',
    column: 0,
    row: 7,
    prerequisites: ['docUnderstanding', 'translation']
  },
  {
    id: 'autoAgent',
    name: '自动代理',
    description: '自动执行复杂任务流程',
    branch: 'intelligence',
    tier: 'professional',
    column: 0,
    row: 7,
    prerequisites: ['smartAssistant']
  },
  {
    id: 'masterAssistant',
    name: '全能助手',
    description: '融合所有能力的终极形态',
    branch: 'intelligence',
    tier: 'master',
    column: 0,
    row: 7,
    prerequisites: ['autoAgent', 'emotionExpression', 'videoAnalysis', 'smartReminder']
  }
];

function isSignalActive(definition: SpriteCapabilityDefinition, activeSignals: Record<string, boolean | null | undefined>): boolean {
  const signals = definition.activationSignals ?? [];
  if (signals.length === 0) return false;

  const mode = definition.activationSignalMode ?? DEFAULT_ACTIVATION_SIGNAL_MODE;
  if (mode === 'all') {
    return signals.every((signal) => Boolean(activeSignals[signal]));
  }

  return signals.some((signal) => Boolean(activeSignals[signal]));
}

function cloneDefinition(definition: SpriteCapabilityDefinition): SpriteCapabilityDefinition {
  return {
    ...definition,
    prerequisites: [...definition.prerequisites],
    requiredFeatureFlags: definition.requiredFeatureFlags ? [...definition.requiredFeatureFlags] : undefined,
    requiredShortcut: definition.requiredShortcut ? { ...definition.requiredShortcut } : undefined,
    activationSignals: definition.activationSignals ? [...definition.activationSignals] : undefined
  };
}

export class CapabilityRegistry {
  private definitions: SpriteCapabilityDefinition[];
  private definitionMap: Map<string, SpriteCapabilityDefinition>;

  constructor(definitions: SpriteCapabilityDefinition[] = DEFAULT_CAPABILITY_DEFINITIONS) {
    this.definitions = definitions.map((definition) => cloneDefinition(definition));
    this.definitionMap = new Map(this.definitions.map((definition) => [definition.id, definition]));
  }

  getDefinitions(): SpriteCapabilityDefinition[] {
    return this.definitions.map((definition) => cloneDefinition(definition));
  }

  getDefinition(id: string): SpriteCapabilityDefinition | undefined {
    const definition = this.definitionMap.get(id);
    return definition ? cloneDefinition(definition) : undefined;
  }

  resolveSnapshot(context: SpriteCapabilityResolutionContext = {}): SpriteCapabilitySnapshot {
    const activeSignals = context.activeSignals ?? {};
    const featureFlags = context.featureFlags ?? {};
    const activeCapabilityIds = new Set<string>();
    const resolvedStates = new Map<string, SpriteCapabilityState>();

    for (const definition of this.definitions) {
      if (isSignalActive(definition, activeSignals)) {
        activeCapabilityIds.add(definition.id);
      }
    }

    const resolveState = (definitionId: string, ancestry = new Set<string>()): SpriteCapabilityState => {
      const cached = resolvedStates.get(definitionId);
      if (cached) return cached;

      const definition = this.definitionMap.get(definitionId);
      if (!definition) {
        throw new Error(`Unknown sprite capability definition: ${definitionId}`);
      }

      const nextAncestry = new Set(ancestry);
      nextAncestry.add(definitionId);

      const inactivePrerequisites: string[] = [];
      const missingPrerequisites = definition.prerequisites.filter((prerequisiteId) => {
        if (activeCapabilityIds.has(prerequisiteId)) return false;

        const prerequisiteDefinition = this.definitionMap.get(prerequisiteId);
        if (!prerequisiteDefinition) return true;
        if (nextAncestry.has(prerequisiteId)) return true;

        if ((prerequisiteDefinition.activationSignals?.length ?? 0) > 0) {
          const prerequisiteState = resolveState(prerequisiteId, nextAncestry);
          if (prerequisiteState.unlockReady) {
            inactivePrerequisites.push(prerequisiteId);
            return false;
          }
          return true;
        }

        return !resolveState(prerequisiteId, nextAncestry).unlockReady;
      });
      const missingFeatureFlags = (definition.requiredFeatureFlags ?? []).filter((flag) => !featureFlags[flag]);
      const unlockReady = inactivePrerequisites.length === 0 && missingPrerequisites.length === 0 && missingFeatureFlags.length === 0;
      const active = unlockReady && activeCapabilityIds.has(definition.id);
      const status: SpriteCapabilityStatus = active ? 'active' : unlockReady ? 'unlocked' : 'locked';

      const state = {
        ...cloneDefinition(definition),
        status,
        active,
        unlocked: status !== 'locked',
        unlockReady,
        inactivePrerequisites,
        missingPrerequisites,
        missingFeatureFlags
      } satisfies SpriteCapabilityState;
      resolvedStates.set(definitionId, state);
      return state;
    };

    const ordered = this.definitions.map((definition) => resolveState(definition.id));

    const capabilities = Object.fromEntries(ordered.map((capability) => [capability.id, capability])) as Record<string, SpriteCapabilityState>;
    const totals = ordered.reduce<SpriteCapabilityTotals>(
      (acc, capability) => {
        acc.total += 1;
        if (capability.status === 'active') acc.active += 1;
        if (capability.status === 'locked') acc.locked += 1;
        if (capability.status !== 'locked') acc.unlocked += 1;
        return acc;
      },
      { total: 0, active: 0, unlocked: 0, locked: 0 }
    );

    return {
      capabilities,
      ordered,
      totals
    };
  }
}

export const DEFAULT_SPRITE_CAPABILITY_DEFINITIONS = DEFAULT_CAPABILITY_DEFINITIONS.map((definition) => cloneDefinition(definition));

export const DEFAULT_SPRITE_CAPABILITY_REGISTRY = new CapabilityRegistry(DEFAULT_SPRITE_CAPABILITY_DEFINITIONS);
