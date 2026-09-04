import { getCharacterRoutineText } from '../messages/character';
import { CHAT_API_CONFIGURED_GUIDE_GOAL, FIRST_CHAT_GUIDE_GOAL, type SpriteRoutineGuideGoalDefinition } from './guide-goals';
import type { SpritePurpose, SpriteRoutine, SpriteRoutineStep, SpriteRoutineStepInput, StartSpritePurposeRequest } from './types';

export interface SpriteRoutinePresetDefinition {
  id: string;
  title: string;
  purposeKind: string;
  defaultPriority: number;
  /**
   * Declarative goal this routine is trying to help the user achieve.
   * Runtime layers can evaluate it before continuing a user action, e.g. block chat open until an API key is configured.
   */
  goal?: SpriteRoutineGuideGoalDefinition;
  steps: SpriteRoutineStepInput[] | ((purpose: SpritePurpose) => SpriteRoutineStepInput[]);
}

function createGeneratedStepId(type: string, index: number, parentPath?: string): string {
  const localId = `${type}-${index + 1}`;
  return parentPath ? `${parentPath}.${localId}` : localId;
}

function isNonNegativeIntegerToken(token: string): boolean {
  return /^\d+$/.test(token);
}

function parsePlayAnimationStepString(input: string, index: number, parentPath?: string): SpriteRoutineStep {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const fail = (message: string): never => {
    throw new Error(`Invalid routine step shorthand "${input}": ${message}`);
  };

  if (tokens[0] !== 'playAnimation') {
    fail('only playAnimation shorthand is supported');
  }

  const trigger = tokens[1];
  if (!trigger) {
    fail('missing animation trigger');
  }

  let durationMs: number | undefined;
  let timeoutMs: number | undefined;
  let waitFor: Extract<SpriteRoutineStep, { type: 'playAnimation' }>['waitFor'];
  let silent: boolean | undefined;

  for (const token of tokens.slice(2)) {
    if (isNonNegativeIntegerToken(token)) {
      const numericValue = Number(token);
      if (durationMs == null) {
        durationMs = numericValue;
        continue;
      }
      if (timeoutMs == null) {
        timeoutMs = numericValue;
        continue;
      }
      fail('playAnimation accepts at most two numeric values');
    }

    if (token === 'duration' || token === 'complete' || token === 'none') {
      if (waitFor != null) {
        fail('waitFor can only be specified once');
      }
      waitFor = token;
      continue;
    }

    if (token === 'silent') {
      if (silent === true) {
        fail('silent can only be specified once');
      }
      silent = true;
      continue;
    }

    fail(`unsupported token "${token}"`);
  }

  if (timeoutMs != null && waitFor !== 'complete') {
    fail('the second numeric value maps to timeoutMs and requires waitFor complete');
  }

  return {
    id: createGeneratedStepId('playAnimation', index, parentPath),
    type: 'playAnimation',
    trigger,
    ...(durationMs != null ? { durationMs } : {}),
    ...(timeoutMs != null ? { timeoutMs } : {}),
    ...(waitFor != null ? { waitFor } : {}),
    ...(silent === true ? { silent: true } : {})
  };
}

function normalizeRoutineStepInput(input: SpriteRoutineStepInput, index: number, parentPath?: string): SpriteRoutineStep {
  if (typeof input === 'number') {
    return {
      id: createGeneratedStepId('wait', index, parentPath),
      type: 'wait',
      durationMs: input
    };
  }

  if (typeof input === 'string') {
    return parsePlayAnimationStepString(input, index, parentPath);
  }

  if (Array.isArray(input)) {
    const id = createGeneratedStepId('sequence', index, parentPath);
    return {
      id,
      type: 'sequence',
      body: input.map((child, childIndex) => normalizeRoutineStepInput(child, childIndex, id))
    };
  }

  const id = input.id?.trim() || createGeneratedStepId(input.type, index, parentPath);
  const step = { ...input, id } as SpriteRoutineStep;

  if (step.type === 'loopUntil') {
    return {
      ...step,
      body: step.body.map((child, childIndex) => normalizeRoutineStepInput(child as SpriteRoutineStepInput, childIndex, id))
    };
  }

  if (step.type === 'parallel') {
    return {
      ...step,
      body: step.body.map((child, childIndex) => normalizeRoutineStepInput(child as SpriteRoutineStepInput, childIndex, id))
    };
  }

  if (step.type === 'sequence') {
    return {
      ...step,
      body: step.body.map((child, childIndex) => normalizeRoutineStepInput(child as SpriteRoutineStepInput, childIndex, id))
    };
  }

  if (step.type === 'branch') {
    return {
      ...step,
      cases: Object.fromEntries(
        Object.entries(step.cases).map(([caseKey, steps]) => [caseKey, steps.map((child, childIndex) => normalizeRoutineStepInput(child as SpriteRoutineStepInput, childIndex, `${id}.${caseKey}`))])
      ),
      default: step.default?.map((child, childIndex) => normalizeRoutineStepInput(child as SpriteRoutineStepInput, childIndex, `${id}.default`))
    };
  }

  return step;
}

function createRestReminderSteps(): SpriteRoutineStepInput[] {
  return [
    { id: 'attention', type: 'playAnimation', trigger: 'wave', durationMs: 1200, waitFor: 'duration', silent: true },
    { id: 'speak', type: 'speak', text: getCharacterRoutineText('daily.rest-reminder.speak', undefined, '差不多该休息一下了。'), bubbleDuration: 3600 },
    { id: 'pause', type: 'wait', durationMs: 800 },
    { id: 'tired', type: 'playAnimation', trigger: 'tired', durationMs: 1800, waitFor: 'duration', silent: true }
  ];
}

function createIdlePresenceSteps(): SpriteRoutineStepInput[] {
  return [];
}

function getPurposeContextString(purpose: SpritePurpose, key: string): string | undefined {
  const value = purpose.context?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getDailyCareReminderTrigger(purpose: SpritePurpose): string {
  const routineKind = getPurposeContextString(purpose, 'routineKind');
  const severity = getPurposeContextString(purpose, 'severity');
  if (severity === 'urgent' || severity === 'warning' || routineKind === 'nightGuard') {
    return 'tired';
  }
  if (routineKind === 'vision') {
    return 'thinking';
  }
  return 'wave';
}

function createDailyCareReminderSteps(purpose: SpritePurpose): SpriteRoutineStepInput[] {
  const message = getPurposeContextString(purpose, 'message') ?? purpose.reason;
  const routineId = getPurposeContextString(purpose, 'routineId') ?? purpose.kind;
  return [
    { id: 'care-attention', type: 'playAnimation', trigger: getDailyCareReminderTrigger(purpose), durationMs: 1200, waitFor: 'duration', silent: true },
    { id: 'care-speak', type: 'speak', text: message, bubbleDuration: 3200, cooldownKey: `daily.care.${routineId}`, cooldownMs: 10 * 60 * 1000 },
    { id: 'care-settle', type: 'wait', durationMs: 300 }
  ];
}

const FIRST_CHAT_WAIT_MS = 30 * 60 * 1000;
const FIRST_CHAT_HELP_COOLDOWN_MS = 60_000;
const CHAT_API_CONFIG_NOTICE_ID = 'chat.api-config-guide.invite';
const CHAT_API_CONFIG_OPEN_SETTINGS_ACTION = 'open-ai-provider-settings';
const CHAT_API_CONFIG_GUIDE_WAIT_MS = 30 * 60 * 1000;
const CHAT_API_CONFIG_COMPLETION_ACTIONS = [
  'provider-secrets-updated',
  'provider-api-keys-updated',
  'provider-api-key-added',
  'provider-api-key-updated',
  'provider-api-key-default-updated',
  'preset-secrets-updated'
];

function getChatApiConfigDoneText(providerId: string): string {
  if (providerId === 'minimax') {
    return getCharacterRoutineText('chat.api-config-guide.done.minimax', { providerId }, 'MiniMax 还可以制作音乐，以后可以和我说哦');
  }
  return getCharacterRoutineText('chat.api-config-guide.done', { providerId }, '配置保存好了，现在可以开始聊天。');
}

function isPurposeContextFlagEnabled(purpose: SpritePurpose, key: string): boolean {
  return purpose.context?.[key] === true;
}

function shouldLockChatApiConfigGuideProvider(purpose: SpritePurpose): boolean {
  const trigger = getPurposeContextString(purpose, 'trigger');
  return trigger === 'chat-send' || isPurposeContextFlagEnabled(purpose, 'strictProviderMatch');
}

/**
 * 新手引导 — 引导用户完成第一次普通聊天。
 */
function createFirstChatRoutineSteps(): SpriteRoutineStepInput[] {
  return [
    { id: 'first-chat-wave', type: 'playAnimation', trigger: 'wave', durationMs: 900, waitFor: 'duration', silent: true },
    {
      id: 'first-chat-wait-double-click',
      type: 'loopUntil',
      source: 'sprite-event-bus',
      untilEvent: 'interact:double-click',
      maxDurationMs: FIRST_CHAT_WAIT_MS,
      assignTo: 'firstChatDoubleClick',
      ignoreHistory: true,
      body: [
        {
          id: 'first-chat-help',
          type: 'speak',
          text: getCharacterRoutineText('onboarding.chat.start.tip', undefined, '鼠标双击我，就能打开聊天窗口。'),
          bubbleDuration: 4800,
          cooldownKey: 'onboarding.chat.start.tip',
          cooldownMs: FIRST_CHAT_HELP_COOLDOWN_MS
        },
        { id: 'first-chat-wait-double-click-pause', type: 'wait', durationMs: 1000 }
      ]
    },
    {
      id: 'first-chat-wait-window-open',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['APP_WINDOW_OPENED'],
      match: { windowKey: ['chatPanel', 'chatMini', 'chat'] },
      maxDurationMs: 10_000,
      assignTo: 'firstChatWindowOpened',
      ignoreHistory: false,
      body: [{ id: 'first-chat-wait-window-pause', type: 'wait', durationMs: 300 }]
    },
    { id: 'first-chat-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
    3000,
    {
      id: 'first-chat-done',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.chat.start.done', undefined, '打开啦！'),
      bubbleDuration: 3800
    },
    { id: 'first-chat-return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
  ];
}

function createChatApiConfigGuideSteps(purpose: SpritePurpose): SpriteRoutineStepInput[] {
  const providerId = getPurposeContextString(purpose, 'providerId') ?? 'openai';
  const presetId = getPurposeContextString(purpose, 'presetId');
  const rawFields = purpose.context?.fields;
  const fields = Array.isArray(rawFields) ? rawFields.filter((field): field is string => typeof field === 'string' && field.trim().length > 0) : ['apiKey'];
  const hasPreset = typeof presetId === 'string' && presetId.trim().length > 0;
  const targetWindow = hasPreset ? 'aiProviderConfig' : 'settings';
  const closeMatch = { windowKey: targetWindow };
  const openSettingsDirectly = isPurposeContextFlagEnabled(purpose, 'openSettingsDirectly');
  const configUpdatedMatch = shouldLockChatApiConfigGuideProvider(purpose) ? { providerId, action: CHAT_API_CONFIG_COMPLETION_ACTIONS } : { action: CHAT_API_CONFIG_COMPLETION_ACTIONS };
  const targetPayload = hasPreset
    ? {
        providerId,
        presetId,
        fields
      }
    : {
        category: 'ai',
        tab: 'provider',
        aiProviderId: providerId
      };
  const openSettingsSteps: SpriteRoutineStepInput[] = [];
  if (!openSettingsDirectly) {
    openSettingsSteps.push({ id: 'chat-api-config-clear-invite', type: 'clearMessage', messageId: CHAT_API_CONFIG_NOTICE_ID, messageType: 'notice' });
  }
  openSettingsSteps.push(
    {
      id: 'chat-api-config-open-settings',
      type: 'openWindow',
      window: targetWindow,
      payload: targetPayload,
      timeoutMs: 10000
    },
    {
      id: 'chat-api-config-walk-to-settings',
      type: 'walkTo',
      target: { window: targetWindow, placement: 'right', offset: 16 },
      speed: 120,
      timeoutMs: 10000
    },
    {
      id: 'chat-api-config-tip',
      type: 'speak',
      text: getCharacterRoutineText('chat.api-config-guide.tip', { providerId }, hasPreset ? '填好 API Key 就可以和我对话了' : '先新增一个模型预设并填入 API Key，就可以开始聊天。'),
      bubbleDuration: 5200
    },
    {
      id: 'chat-api-config-wait-result',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['AI_PROVIDER_CONFIG_UPDATED', 'APP_WINDOW_CLOSED'],
      eventMatches: {
        AI_PROVIDER_CONFIG_UPDATED: configUpdatedMatch,
        APP_WINDOW_CLOSED: closeMatch
      },
      maxDurationMs: CHAT_API_CONFIG_GUIDE_WAIT_MS,
      assignTo: 'chatApiConfigResult',
      ignoreHistory: true,
      body: []
    },
    {
      id: 'chat-api-config-done-branch',
      type: 'branch',
      by: 'chatApiConfigResult.event.event',
      cases: {
        AI_PROVIDER_CONFIG_UPDATED: [
          {
            id: 'chat-api-config-done-provider-branch',
            type: 'branch',
            by: 'chatApiConfigResult.event.payload.providerId',
            cases: {
              minimax: [
                {
                  id: 'chat-api-config-done',
                  type: 'speak',
                  text: getChatApiConfigDoneText('minimax'),
                  bubbleDuration: 4200
                }
              ]
            },
            default: [
              {
                id: 'chat-api-config-done',
                type: 'speak',
                text: getChatApiConfigDoneText(providerId),
                bubbleDuration: 4200
              }
            ]
          }
        ]
      },
      default: []
    }
  );
  if (openSettingsDirectly) {
    return [...openSettingsSteps, { id: 'chat-api-config-return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }];
  }
  return [
    {
      id: 'chat-api-config-invite',
      type: 'showNotice',
      messageId: CHAT_API_CONFIG_NOTICE_ID,
      content: getCharacterRoutineText('chat.api-config-guide.invite', { providerId }, '需要先配置 API Key'),
      level: 'info',
      persistent: true,
      buttons: [{ id: 'open-ai-provider-settings', label: '去配置', variant: 'default', purposeAction: CHAT_API_CONFIG_OPEN_SETTINGS_ACTION }],
      speak: true
    },
    {
      id: 'chat-api-config-wait-invite-action',
      type: 'loopUntil',
      source: 'purpose-event',
      untilEvent: ['bubble:action', 'bubble:dismissed'],
      match: { messageId: CHAT_API_CONFIG_NOTICE_ID },
      maxDurationMs: CHAT_API_CONFIG_GUIDE_WAIT_MS,
      assignTo: 'chatApiConfigBubbleEvent',
      ignoreHistory: true,
      body: [{ id: 'chat-api-config-wait-invite-pause', type: 'wait', durationMs: 1000 }]
    },
    {
      id: 'chat-api-config-handle-invite-action',
      type: 'branch',
      by: 'chatApiConfigBubbleEvent.event.event',
      cases: {
        'bubble:action': [
          {
            id: 'chat-api-config-open-after-click',
            type: 'branch',
            by: 'chatApiConfigBubbleEvent.event.payload.purposeAction',
            cases: {
              [CHAT_API_CONFIG_OPEN_SETTINGS_ACTION]: openSettingsSteps
            },
            default: []
          }
        ],
        'bubble:dismissed': [{ id: 'chat-api-config-dismissed-settle', type: 'wait', durationMs: 300 }]
      },
      default: []
    },
    { id: 'chat-api-config-return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
  ];
}

export const DEFAULT_SPRITE_ROUTINE_PRESETS: SpriteRoutinePresetDefinition[] = [
  {
    id: 'idle.presence',
    title: '安静陪伴',
    purposeKind: 'idle.presence',
    defaultPriority: 10,
    steps: createIdlePresenceSteps
  },
  {
    id: 'daily.rest-reminder',
    title: '休息提醒',
    purposeKind: 'daily.rest-reminder',
    defaultPriority: 60,
    steps: createRestReminderSteps
  },
  {
    id: 'daily.care.reminder',
    title: '日常关怀提醒',
    purposeKind: 'daily.care.reminder',
    defaultPriority: 55,
    steps: createDailyCareReminderSteps
  },
  {
    id: 'chat.api-config-guide',
    title: '聊天 API 配置引导',
    purposeKind: 'chat.api-config-guide',
    defaultPriority: 66,
    goal: CHAT_API_CONFIGURED_GUIDE_GOAL,
    steps: createChatApiConfigGuideSteps
  },
  {
    id: 'onboarding.chat.start',
    title: '新手引导：开始聊天',
    purposeKind: 'onboarding.chat.start',
    defaultPriority: 68,
    goal: FIRST_CHAT_GUIDE_GOAL,
    steps: createFirstChatRoutineSteps
  }
];

export class SpriteRoutinePresetRegistry {
  private presets = new Map<string, SpriteRoutinePresetDefinition>();

  constructor(presets: SpriteRoutinePresetDefinition[] = DEFAULT_SPRITE_ROUTINE_PRESETS) {
    this.registerAll(presets);
  }

  register(preset: SpriteRoutinePresetDefinition): void {
    this.presets.set(preset.id, preset);
  }

  registerAll(presets: SpriteRoutinePresetDefinition[]): void {
    for (const preset of presets) {
      this.register(preset);
    }
  }

  get(id: string): SpriteRoutinePresetDefinition | undefined {
    return this.presets.get(id);
  }

  findForRequest(request: StartSpritePurposeRequest): SpriteRoutinePresetDefinition | undefined {
    if (request.presetId) {
      return this.get(request.presetId);
    }
    return Array.from(this.presets.values()).find((preset) => preset.purposeKind === request.kind);
  }

  createRoutine(purpose: SpritePurpose, preset: SpriteRoutinePresetDefinition, now = Date.now()): SpriteRoutine {
    const stepInputs = typeof preset.steps === 'function' ? preset.steps(purpose) : preset.steps;
    return {
      id: `routine-${purpose.id}`,
      purposeId: purpose.id,
      presetId: preset.id,
      priority: purpose.priority,
      source: 'preset',
      status: 'queued',
      steps: stepInputs.map((step, index) => normalizeRoutineStepInput(step, index)),
      cursor: 0,
      createdAt: now
    };
  }

  list(): SpriteRoutinePresetDefinition[] {
    return Array.from(this.presets.values());
  }
}
