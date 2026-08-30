import { getCharacterRoutineText } from '../messages/character';
import {
  CHAT_API_CONFIGURED_GUIDE_GOAL,
  FIRST_CHAT_GUIDE_GOAL,
  FIRST_FILE_DROP_GUIDE_GOAL,
  OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
  type SpriteRoutineGuideGoalDefinition,
  WORKSPACE_EXISTS_GUIDE_GOAL
} from './guide-goals';
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

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function createFileActionsMenuPayload(purpose: SpritePurpose): Record<string, unknown> {
  const payload = getRecord(purpose.context?.fileActionsMenuPayload);
  if (payload) {
    return {
      ...payload,
      correlationId: purpose.correlationId ?? payload.correlationId
    };
  }

  return {
    files: Array.isArray(purpose.context?.files) ? purpose.context.files : [],
    resources: Array.isArray(purpose.context?.resources) ? purpose.context.resources : [],
    source: 'drop',
    correlationId: purpose.correlationId
  };
}

function createFileDropIntakeSteps(purpose: SpritePurpose, options: { waitForResourcesReady?: boolean } = {}): SpriteRoutineStepInput[] {
  const match = purpose.correlationId ? { correlationId: purpose.correlationId } : undefined;
  const ctx = {
    purposeKind: purpose.kind,
    correlationId: purpose.correlationId,
    files: purpose.context?.files,
    resources: purpose.context?.resources
  };
  const waitForResourcesReady = options.waitForResourcesReady ?? false;
  const readyStep: SpriteRoutineStepInput[] = waitForResourcesReady
    ? [
      {
        id: 'wait-file-drop-resources-ready',
        type: 'waitForEvent',
        source: 'purpose-event',
        event: 'fileDrop:resources-ready',
        match,
        timeoutMs: 2 * 60 * 1000,
        assignTo: 'fileDropReady'
      }
    ]
    : [];
  const openWindowStep: SpriteRoutineStepInput = waitForResourcesReady
    ? {
      id: 'open-file-actions-menu',
      type: 'openWindow',
      window: 'fileActionsMenu',
      payloadFrom: 'fileDropReady.payload.fileActionsMenuPayload',
      timeoutMs: 10000
    }
    : { id: 'open-file-actions-menu', type: 'openWindow', window: 'fileActionsMenu', payload: createFileActionsMenuPayload(purpose), timeoutMs: 10000 };

  return [
    { id: 'ack-drop', type: 'playAnimation', trigger: 'fileDrop', durationMs: 900, waitFor: 'duration', silent: true },
    { id: 'thinking', type: 'playAnimation', trigger: 'thinking', durationMs: 1200, waitFor: 'duration', silent: true },
    ...readyStep,
    { id: 'prompt-action', type: 'showToast', content: getCharacterRoutineText('file.drop.intake.prompt', ctx, '要怎么处理这个文件？'), category: 'question', duration: 2600 },
    openWindowStep,
    { id: 'wait-menu-result', type: 'waitForEvent', source: 'purpose-event', event: 'fileAction:resolved', match, timeoutMs: 5 * 60 * 1000, assignTo: 'menuResult' },
    {
      id: 'result-branch',
      type: 'branch',
      by: 'menuResult.payload.outcome',
      cases: {
        selected: [
          { id: 'selected-success', type: 'playAnimation', trigger: 'success', durationMs: 1200, waitFor: 'duration', silent: true },
          { id: 'selected-toast', type: 'showToast', content: getCharacterRoutineText('file.drop.intake.selected', ctx, '交给我吧。'), category: 'success', duration: 1800 }
        ],
        cancelled: [
          { id: 'cancelled-confused', type: 'playAnimation', trigger: 'confused', durationMs: 1200, waitFor: 'duration', silent: true },
          { id: 'cancelled-toast', type: 'showToast', content: getCharacterRoutineText('file.drop.intake.cancelled', ctx, '那我先不打扰你。'), category: 'cancellation', duration: 1800 }
        ],
        failed: [
          { id: 'failed-reaction', type: 'playAnimation', trigger: 'failure', durationMs: 1200, waitFor: 'duration', silent: true },
          { id: 'failed-toast', type: 'showToast', content: getCharacterRoutineText('file.drop.intake.failed', ctx, '这里好像没处理成功。'), category: 'failure', duration: 2200 }
        ]
      },
      default: [{ id: 'default-done', type: 'playAnimation', trigger: 'success', durationMs: 900, waitFor: 'duration', silent: true }]
    },
    { id: 'return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
  ];
}

function createFileDropSteps(purpose: SpritePurpose): SpriteRoutineStepInput[] {
  return createFileDropIntakeSteps(purpose, { waitForResourcesReady: true });
}

function getPurposeContextString(purpose: SpritePurpose, key: string): string | undefined {
  const value = purpose.context?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function createWorkflowWaitingSteps(purpose: SpritePurpose): SpriteRoutineStepInput[] {
  const workflowRunId = getPurposeContextString(purpose, 'workflowRunId') ?? getPurposeContextString(purpose, 'runId');
  const workflowName = getPurposeContextString(purpose, 'workflowName') ?? '工作流';
  const match = workflowRunId ? { runId: workflowRunId } : undefined;
  const ctx = {
    purposeKind: purpose.kind,
    workflowRunId,
    workflowName
  };
  return [
    { id: 'busy-start', type: 'showBusy', content: getCharacterRoutineText('workflow.waiting.busyStart', ctx, '正在处理：{workflowName}'), progress: 0 },
    {
      id: 'wait-workflow-terminal',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['SPRITE_WORKFLOW_COMPLETE', 'SPRITE_WORKFLOW_FAIL', 'SPRITE_WORKFLOW_CANCEL'],
      match,
      maxDurationMs: 30 * 60 * 1000,
      assignTo: 'workflowResult',
      body: [
        {
          id: 'wait-workflow-progress',
          type: 'waitForEvent',
          source: 'app-event',
          event: 'SPRITE_WORKFLOW_PROGRESS',
          match,
          timeoutMs: 2500,
          assignTo: 'workflowProgress',
          optional: true,
          ignoreHistory: true
        },
        {
          id: 'busy-progress',
          type: 'updateBusy',
          progressFrom: 'workflowProgress.payload.progress',
          contentFrom: 'workflowProgress.payload.message'
        },
        { id: 'waiting-thinking', type: 'playAnimation', trigger: 'thinking', durationMs: 2400, waitFor: 'duration', silent: true },
        { id: 'waiting-pause', type: 'wait', durationMs: 5000 },
        {
          id: 'waiting-speak',
          type: 'speak',
          text: getCharacterRoutineText('workflow.waiting.progressSpeak', ctx, '我还在等 {workflowName} 完成。'),
          bubbleDuration: 2400,
          cooldownKey: 'workflow.waiting.progress',
          cooldownMs: 60_000
        }
      ]
    },
    { id: 'busy-clear', type: 'clearBusy' },
    {
      id: 'workflow-result-branch',
      type: 'branch',
      by: 'workflowResult.event.event',
      cases: {
        SPRITE_WORKFLOW_COMPLETE: [
          { id: 'workflow-success', type: 'playAnimation', trigger: 'success', durationMs: 1500, waitFor: 'duration', silent: true },
          { id: 'workflow-success-toast', type: 'showToast', content: getCharacterRoutineText('workflow.waiting.complete', ctx, '处理完成了。'), category: 'success', duration: 2200 }
        ],
        SPRITE_WORKFLOW_FAIL: [
          { id: 'workflow-failure', type: 'playAnimation', trigger: 'failure', durationMs: 1500, waitFor: 'duration', silent: true },
          { id: 'workflow-failure-toast', type: 'showToast', content: getCharacterRoutineText('workflow.waiting.fail', ctx, '处理失败了，我把状态收起来了。'), category: 'failure', duration: 2600 }
        ],
        SPRITE_WORKFLOW_CANCEL: [
          { id: 'workflow-cancelled', type: 'playAnimation', trigger: 'confused', durationMs: 1200, waitFor: 'duration', silent: true },
          { id: 'workflow-cancelled-toast', type: 'showToast', content: getCharacterRoutineText('workflow.waiting.cancel', ctx, '任务已经取消。'), category: 'cancellation', duration: 2200 }
        ]
      },
      default: [{ id: 'workflow-default', type: 'playAnimation', trigger: 'success', durationMs: 1000, waitFor: 'duration', silent: true }]
    },
    { id: 'return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
  ];
}

function createResourceImportWaitingSteps(purpose: SpritePurpose): SpriteRoutineStepInput[] {
  const resourceId = getPurposeContextString(purpose, 'resourceId');
  const workspaceId = getPurposeContextString(purpose, 'workspaceId');
  const folderId = getPurposeContextString(purpose, 'folderId');
  const match: Record<string, unknown> = {};
  if (resourceId) match.resourceId = resourceId;
  if (workspaceId) match.workspaceId = workspaceId;
  if (folderId) match.folderId = folderId;
  const effectiveMatch = Object.keys(match).length > 0 ? match : undefined;
  const ctx = {
    purposeKind: purpose.kind,
    resourceId,
    workspaceId,
    folderId
  };

  return [
    { id: 'busy-start', type: 'showBusy', content: getCharacterRoutineText('resource.import.waiting.busyStart', ctx, '正在导入资源'), progress: 0 },
    {
      id: 'wait-resource-terminal',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['SPRITE_RESOURCE_IMPORT_COMPLETE', 'SPRITE_RESOURCE_IMPORT_ERROR'],
      match: effectiveMatch,
      maxDurationMs: 30 * 60 * 1000,
      assignTo: 'resourceResult',
      body: [
        {
          id: 'wait-resource-progress',
          type: 'waitForEvent',
          source: 'app-event',
          event: 'SPRITE_RESOURCE_IMPORT_PROGRESS',
          match: effectiveMatch,
          timeoutMs: 2500,
          assignTo: 'resourceProgress',
          optional: true,
          ignoreHistory: true
        },
        {
          id: 'busy-progress',
          type: 'updateBusy',
          progressFrom: 'resourceProgress.payload.progress',
          contentFrom: 'resourceProgress.payload.message'
        },
        { id: 'import-loading', type: 'playAnimation', trigger: 'loading', durationMs: 1800, waitFor: 'duration', silent: true },
        { id: 'import-pause', type: 'wait', durationMs: 3500 }
      ]
    },
    { id: 'busy-clear', type: 'clearBusy' },
    {
      id: 'resource-result-branch',
      type: 'branch',
      by: 'resourceResult.event.event',
      cases: {
        SPRITE_RESOURCE_IMPORT_COMPLETE: [
          { id: 'resource-success', type: 'playAnimation', trigger: 'success', durationMs: 1400, waitFor: 'duration', silent: true },
          { id: 'resource-success-toast', type: 'showToast', content: getCharacterRoutineText('resource.import.waiting.complete', ctx, '资源导入完成。'), category: 'success', duration: 1800 }
        ],
        SPRITE_RESOURCE_IMPORT_ERROR: [
          { id: 'resource-error', type: 'playAnimation', trigger: 'error', durationMs: 1400, waitFor: 'duration', silent: true },
          { id: 'resource-error-toast', type: 'showToast', content: getCharacterRoutineText('resource.import.waiting.error', ctx, '资源导入失败了。'), category: 'error', duration: 2200 }
        ]
      },
      default: [{ id: 'resource-default', type: 'playAnimation', trigger: 'success', durationMs: 1000, waitFor: 'duration', silent: true }]
    },
    { id: 'return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
  ];
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

const WORKSPACE_CREATE_NOTICE_ID = 'onboarding.workspace.create.invite';
const WORKSPACE_CREATE_MANDATORY_REPROMPT_DELAY_MS = 5_000;
const WORKSPACE_CREATE_NOTICE_WAIT_MS = 30 * 60 * 1000;
const WORKSPACE_CREATE_WINDOW_HELPER_COOLDOWN_MS = 5 * 60 * 1000;
const FIRST_FILE_DROP_WAIT_MS = 30 * 60 * 1000;
const FIRST_FILE_DROP_HELP_COOLDOWN_MS = 60_000;
const FIRST_FILE_DROP_PROMPT_CYCLE_MS = 6500;
const FIRST_CHAT_WAIT_MS = 30 * 60 * 1000;
const FIRST_CHAT_HELP_COOLDOWN_MS = 60_000;
const OPEN_INVENTORY_NOTICE_ID = 'onboarding.resource.open-library.invite';
const OPEN_INVENTORY_WAIT_MS = 5 * 60 * 1000;
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
  return trigger === 'chat-send' || trigger === 'sidebar-send' || isPurposeContextFlagEnabled(purpose, 'strictProviderMatch');
}

/**
 * 新手引导 — 引导用户创建工作空间。
 *
 * 流程概览：
 * 1) 挥手吸引注意；
 * 2) 展示带"立即创建"按钮的 NoticeMessage，气泡仍打开时只等待用户操作，不重复刷新；
 * 3) 用户点击按钮后清掉邀请 notice，打开/聚焦 workspaceWizard，并走到创建窗口旁，说明工作空间用途与快速创建方式；
 * 4) 用户手动关闭气泡后，短暂缓冲并继续提示；若未创建就关闭窗口，立即提醒并回到带按钮的提示态；
 * 5) 创建成功 → 清理引导气泡并庆祝。QuestEngine 监听 AppEvent 决定是否标记完成和发奖。
 */
function createWorkspaceCreateRoutineSteps(): SpriteRoutineStepInput[] {
  return [
    'playAnimation welcome silent',
    {
      id: 'speak-workspace-assistant-intro',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.workspace.create.assistant-intro', undefined, '你好，我是你的专属桌面助手。'),
      bubbleDuration: 3600,
      waitAfter: true
    },
    {
      id: 'speak-workspace-growth-promise',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.workspace.create.growth-promise', undefined, '我会陪伴你学习和工作，一起共同成长。'),
      bubbleDuration: 4200,
      waitAfter: true
    },
    {
      id: 'invite-notice',
      type: 'showNotice',
      messageId: WORKSPACE_CREATE_NOTICE_ID,
      content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '先创建工作空间吧'),
      level: 'info',
      persistent: true,
      buttons: [{ id: 'focus-wizard', label: '立即创建', variant: 'default', purposeAction: 'open-wizard' }],
      speak: true
    },
    {
      id: 'workspace-onboarding-loop',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: 'WORKSPACE_CREATED',
      maxDurationMs: WORKSPACE_CREATE_NOTICE_WAIT_MS,
      assignTo: 'workspaceCreatedEvent',
      body: [
        {
          id: 'wait-create-bubble-event',
          type: 'loopUntil',
          source: 'purpose-event',
          untilEvent: ['bubble:action', 'bubble:dismissed'],
          match: { messageId: WORKSPACE_CREATE_NOTICE_ID },
          maxDurationMs: WORKSPACE_CREATE_NOTICE_WAIT_MS,
          assignTo: 'workspaceBubbleEvent',
          ignoreHistory: true,
          body: [{ id: 'wait-create-bubble-event-pause', type: 'wait', durationMs: 1000 }]
        },
        {
          id: 'handle-bubble-event',
          type: 'branch',
          by: 'workspaceBubbleEvent.event.event',
          cases: {
            'bubble:action': [
              {
                id: 'open-wizard-after-click',
                type: 'branch',
                by: 'workspaceBubbleEvent.event.payload.purposeAction',
                cases: {
                  'open-wizard': [
                    { id: 'clear-invite-after-click', type: 'clearMessage', messageId: WORKSPACE_CREATE_NOTICE_ID, messageType: 'notice' },
                    { id: 'open-wizard', type: 'openWindow', window: 'workspaceWizard', timeoutMs: 10000 },
                    {
                      id: 'guide-near-wizard',
                      type: 'parallel',
                      body: [
                        [
                          { id: 'walk-near-wizard', type: 'walkTo', target: { window: 'workspaceWizard', placement: 'right', offset: 16 }, speed: 130, timeoutMs: 10000 },
                          'playAnimation lookLeft silent'
                        ],
                        {
                          id: 'await-wizard-result',
                          type: 'loopUntil',
                          source: 'app-event',
                          untilEvent: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED'],
                          maxDurationMs: WORKSPACE_CREATE_NOTICE_WAIT_MS,
                          ignoreHistory: true,
                          assignTo: 'workspaceWizardResult',
                          body: [
                            {
                              id: 'speak-workspace-intro',
                              type: 'speak',
                              text: getCharacterRoutineText('onboarding.workspace.create.workspace-intro', undefined, '工作空间会存放所有重要的数据。'),
                              bubbleDuration: 4000,
                              waitAfter: 5000,
                              cooldownKey: 'onboarding.workspace.create.workspace-intro',
                              cooldownMs: WORKSPACE_CREATE_WINDOW_HELPER_COOLDOWN_MS
                            },
                            {
                              id: 'speak-workspace-quickstart-tip',
                              type: 'speak',
                              text: getCharacterRoutineText('onboarding.workspace.create.quickstart-tip', undefined, '快速开始会默认创建到文档中'),
                              bubbleDuration: 4200,
                              cooldownKey: 'onboarding.workspace.create.quickstart-tip',
                              cooldownMs: WORKSPACE_CREATE_WINDOW_HELPER_COOLDOWN_MS
                            },
                            { id: 'await-wizard-result-pause', type: 'wait', durationMs: 1000 }
                          ]
                        }
                      ]
                    },
                    {
                      id: 'wizard-result-branch',
                      type: 'branch',
                      by: 'workspaceWizardResult.event.event',
                      cases: {
                        WORKSPACE_WIZARD_CLOSED: [
                          {
                            id: 'closed-without-create',
                            type: 'showNotice',
                            messageId: WORKSPACE_CREATE_NOTICE_ID,
                            content: getCharacterRoutineText('onboarding.workspace.create.closed-without-create', undefined, '还没有创建工作空间哦。'),
                            level: 'warning',
                            persistent: true,
                            buttons: [{ id: 'focus-wizard', label: '去创建', variant: 'default', purposeAction: 'open-wizard' }],
                            speak: true
                          }
                        ]
                      },
                      default: []
                    }
                  ]
                },
                default: []
              }
            ],
            'bubble:dismissed': [
              { id: 'dismissed-mandatory-reprompt-pause', type: 'wait', durationMs: WORKSPACE_CREATE_MANDATORY_REPROMPT_DELAY_MS },
              {
                id: 'invite-notice-after-dismiss',
                type: 'showNotice',
                messageId: WORKSPACE_CREATE_NOTICE_ID,
                content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '先创建工作空间吧'),
                level: 'info',
                persistent: true,
                buttons: [{ id: 'focus-wizard', label: '立即创建', variant: 'default', purposeAction: 'open-wizard' }],
                speak: true
              }
            ]
          },
          default: []
        }
      ]
    },
    {
      id: 'branch-result',
      type: 'branch',
      by: 'workspaceCreatedEvent.event.event',
      cases: {
        WORKSPACE_CREATED: [
          { id: 'clear-invite-notice', type: 'clearMessage', messageId: WORKSPACE_CREATE_NOTICE_ID, messageType: 'notice' },
          { id: 'play-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
          {
            id: 'speak-done',
            type: 'speak',
            text: getCharacterRoutineText('onboarding.workspace.create.done', undefined, '好啦！我可以做更多事情啦。'),
            bubbleDuration: 3600
          }
        ]
      },
      default: [
        {
          id: 'speak-not-yet',
          type: 'speak',
          text: getCharacterRoutineText('onboarding.workspace.create.closed-without-create', undefined, '没创建呀…要不再试一次？'),
          bubbleDuration: 2800
        }
      ]
    }
  ];
}

/**
 * 新手引导 — 引导用户把第一个文件拖到角色身上。
 *
 * 真实导入仍由 useFileDropCollector 触发统一的 file.drop routine 接管；
 * 这里负责展示任务引导、说明拖拽价值，并等待资源创建事件后给出祝贺反馈。
 */
function createOnboardingFileDropRoutineSteps(): SpriteRoutineStepInput[] {
  return [
    'playAnimation welcome 900 duration silent',
    {
      id: 'invite-file-drop-notice',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.file.drop.invite', undefined, '可以把文件拖拽给我')
    },
    3000,
    {
      id: 'wait-first-file-drop',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['RESOURCE_CREATED', 'SPRITE_RESOURCE_IMPORT_COMPLETE'],
      match: { purposeSource: 'sprite-drop' },
      maxDurationMs: FIRST_FILE_DROP_WAIT_MS,
      assignTo: 'firstFileDropResult',
      body: [
        {
          id: 'drop-wait-cycle',
          type: 'parallel',
          body: [
            { id: 'drop-ready-loop', type: 'playAnimation', trigger: 'fileDragOver', durationMs: FIRST_FILE_DROP_PROMPT_CYCLE_MS, waitFor: 'duration', silent: true },
            {
              id: 'drop-intro-speak',
              type: 'speak',
              text: getCharacterRoutineText('onboarding.file.drop.intro', undefined, '拖给我的文件会放到背包。'),
              bubbleDuration: 4200,
              cooldownKey: 'onboarding.file.drop.intro',
              cooldownMs: FIRST_FILE_DROP_HELP_COOLDOWN_MS
            },
            { id: 'drop-wait-pause', type: 'wait', durationMs: FIRST_FILE_DROP_PROMPT_CYCLE_MS }
          ]
        }
      ]
    },
    {
      id: 'first-file-drop-result',
      type: 'branch',
      by: 'firstFileDropResult.event.event',
      cases: {
        RESOURCE_CREATED: [
          { id: 'first-file-drop-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
          {
            id: 'first-file-drop-done',
            type: 'speak',
            text: getCharacterRoutineText('onboarding.file.drop.done', undefined, '收到啦！已经放到背包。'),
            bubbleDuration: 3600
          }
        ],
        SPRITE_RESOURCE_IMPORT_COMPLETE: [
          { id: 'first-file-drop-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
          {
            id: 'first-file-drop-done',
            type: 'speak',
            text: getCharacterRoutineText('onboarding.file.drop.done', undefined, '收到啦！已经放到背包。'),
            bubbleDuration: 3600
          }
        ]
      },
      default: [
        {
          id: 'first-file-drop-timeout',
          type: 'speak',
          text: getCharacterRoutineText('onboarding.file.drop.invite', undefined, '可以把文件拖拽给我'),
          bubbleDuration: 3200
        }
      ]
    }
  ];
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
      match: { windowKey: ['assistant', 'assistantMini', 'chat', 'chatOverlay'] },
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

/**
 * 新手引导 — 引导用户通过右键助手菜单打开背包。
 */
function createOpenResourceLibraryRoutineSteps(): SpriteRoutineStepInput[] {
  return [
    { id: 'resource-menu-wave', type: 'playAnimation', trigger: 'wave', durationMs: 900, waitFor: 'duration', silent: true },
    {
      id: 'resource-menu-invite',
      type: 'showNotice',
      messageId: OPEN_INVENTORY_NOTICE_ID,
      content: getCharacterRoutineText('onboarding.resource.open-library.invite', undefined, '右键点我，打开菜单里的背包。'),
      level: 'info',
      persistent: true,
      speak: true
    },
    {
      id: 'wait-context-menu-open',
      type: 'waitForEvent',
      source: 'sprite-event-bus',
      event: 'interact:context-menu',
      match: { open: true },
      timeoutMs: OPEN_INVENTORY_WAIT_MS,
      assignTo: 'contextMenuOpenEvent',
      ignoreHistory: true
    },
    {
      id: 'resource-menu-tip',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.resource.open-library.menu-tip', undefined, '现在点菜单里的「背包」。'),
      bubbleDuration: 3600
    },
    {
      id: 'wait-inventory-open',
      type: 'waitForEvent',
      source: 'app-event',
      event: 'ASSISTANT_MENU_ITEM_SELECTED',
      match: {
        itemId: 'inventory',
        windowKey: 'inventory',
        'payload.source': 'assistant-context-menu'
      },
      timeoutMs: OPEN_INVENTORY_WAIT_MS,
      assignTo: 'inventoryOpenEvent',
      ignoreHistory: true
    },
    { id: 'clear-resource-menu-notice', type: 'clearMessage', messageId: OPEN_INVENTORY_NOTICE_ID, messageType: 'notice' },
    { id: 'resource-menu-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
    {
      id: 'resource-menu-done',
      type: 'speak',
      text: getCharacterRoutineText('onboarding.resource.open-library.done', undefined, '打开啦！以后导入的文件都可以在背包里整理。'),
      bubbleDuration: 3800
    },
    { id: 'return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
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
    id: 'file.drop',
    title: '文件投递',
    purposeKind: 'file.drop',
    defaultPriority: 100,
    steps: createFileDropSteps
  },
  {
    id: 'daily.rest-reminder',
    title: '休息提醒',
    purposeKind: 'daily.rest-reminder',
    defaultPriority: 60,
    steps: createRestReminderSteps
  },
  {
    id: 'workflow.waiting',
    title: '工作流等待',
    purposeKind: 'workflow.waiting',
    defaultPriority: 65,
    steps: createWorkflowWaitingSteps
  },
  {
    id: 'resource.import.waiting',
    title: '资源导入等待',
    purposeKind: 'resource.import.waiting',
    defaultPriority: 65,
    steps: createResourceImportWaitingSteps
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
    id: 'onboarding.workspace.create',
    title: '新手引导：创建工作空间',
    purposeKind: 'onboarding.workspace.create',
    defaultPriority: 70,
    goal: WORKSPACE_EXISTS_GUIDE_GOAL,
    steps: createWorkspaceCreateRoutineSteps
  },
  {
    id: 'onboarding.chat.start',
    title: '新手引导：开始聊天',
    purposeKind: 'onboarding.chat.start',
    defaultPriority: 68,
    goal: FIRST_CHAT_GUIDE_GOAL,
    steps: createFirstChatRoutineSteps
  },
  {
    id: 'onboarding.file.drop',
    title: '新手引导：拖拽导入文件',
    purposeKind: 'onboarding.file.drop',
    defaultPriority: 68,
    goal: FIRST_FILE_DROP_GUIDE_GOAL,
    steps: createOnboardingFileDropRoutineSteps
  },
  {
    id: 'onboarding.resource.open-library',
    title: '新手引导：打开背包',
    purposeKind: 'onboarding.resource.open-library',
    defaultPriority: 66,
    goal: OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
    steps: createOpenResourceLibraryRoutineSteps
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
