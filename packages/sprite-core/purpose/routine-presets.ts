import { getCharacterRoutineText } from '../messages/character';
import type { SpritePurpose, SpriteRoutine, SpriteRoutineStep, StartSpritePurposeRequest } from './types';

export interface SpriteRoutinePresetDefinition {
  id: string;
  title: string;
  purposeKind: string;
  defaultPriority: number;
  steps: SpriteRoutineStep[] | ((purpose: SpritePurpose) => SpriteRoutineStep[]);
}

function createRestReminderSteps(): SpriteRoutineStep[] {
  return [
    { id: 'attention', type: 'playAnimation', trigger: 'wave', durationMs: 1200, waitFor: 'duration', silent: true },
    { id: 'speak', type: 'speak', text: getCharacterRoutineText('daily.rest-reminder.speak', undefined, '差不多该休息一下了。'), bubbleDuration: 3600 },
    { id: 'pause', type: 'wait', durationMs: 800 },
    { id: 'tired', type: 'playAnimation', trigger: 'tired', durationMs: 1800, waitFor: 'duration', silent: true }
  ];
}

function createIdlePresenceSteps(): SpriteRoutineStep[] {
  return [];
}

function createFileDropInviteSteps(): SpriteRoutineStep[] {
  return [
    { id: 'invite-go-center', type: 'walkTo', target: 'center', speed: 130, timeoutMs: 8000 },
    { id: 'invite-ready', type: 'playAnimation', trigger: 'fileDragOver', durationMs: 900, waitFor: 'duration', silent: true },
    {
      id: 'wait-file-drop-or-leave',
      type: 'loopUntil',
      source: 'sprite-event-bus',
      untilEvent: ['interact:file-drop', 'interact:file-drag-leave'],
      maxDurationMs: 2 * 60 * 1000,
      assignTo: 'dragResult',
      body: [{ id: 'invite-wait-pulse', type: 'playAnimation', trigger: 'thinking', durationMs: 1200, waitFor: 'duration', silent: true }]
    },
    {
      id: 'drag-result-branch',
      type: 'branch',
      by: 'dragResult.event.event',
      cases: {
        'interact:file-drag-leave': [
          { id: 'invite-cancelled', type: 'playAnimation', trigger: 'confused', durationMs: 900, waitFor: 'duration', silent: true },
          { id: 'invite-return-corner', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }
        ],
        'interact:file-drop': [{ id: 'invite-drop-settle', type: 'wait', durationMs: 120 }]
      },
      default: [{ id: 'invite-default-return', type: 'walkTo', target: 'corner', speed: 110, timeoutMs: 10000 }]
    }
  ];
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

function createFileDropIntakeSteps(purpose: SpritePurpose): SpriteRoutineStep[] {
  const match = purpose.correlationId ? { correlationId: purpose.correlationId } : undefined;
  const ctx = {
    purposeKind: purpose.kind,
    correlationId: purpose.correlationId,
    files: purpose.context?.files,
    resources: purpose.context?.resources
  };
  return [
    { id: 'ack-drop', type: 'playAnimation', trigger: 'fileDrop', durationMs: 900, waitFor: 'duration', silent: true },
    { id: 'thinking', type: 'playAnimation', trigger: 'thinking', durationMs: 1200, waitFor: 'duration', silent: true },
    { id: 'prompt-action', type: 'showToast', content: getCharacterRoutineText('file.drop.intake.prompt', ctx, '要怎么处理这个文件？'), category: 'question', duration: 2600 },
    { id: 'open-file-actions-menu', type: 'openWindow', window: 'fileActionsMenu', payload: createFileActionsMenuPayload(purpose), timeoutMs: 10000 },
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

function getPurposeContextString(purpose: SpritePurpose, key: string): string | undefined {
  const value = purpose.context?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function createWorkflowWaitingSteps(purpose: SpritePurpose): SpriteRoutineStep[] {
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

function createResourceImportWaitingSteps(purpose: SpritePurpose): SpriteRoutineStep[] {
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

function createDailyCareReminderSteps(purpose: SpritePurpose): SpriteRoutineStep[] {
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
function createWorkspaceCreateRoutineSteps(): SpriteRoutineStep[] {
  return [
    { id: 'attention-wave', type: 'playAnimation', trigger: 'wave', durationMs: 1200, waitFor: 'duration', silent: true },
    {
      id: 'invite-notice',
      type: 'showNotice',
      messageId: WORKSPACE_CREATE_NOTICE_ID,
      content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '没有找到工作空间，点这里立即创建吧。'),
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
                    { id: 'walk-near-wizard', type: 'walkTo', target: { window: 'workspaceWizard', placement: 'right', offset: 16 }, speed: 130, timeoutMs: 10000 },
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
                          bubbleDuration: 5200,
                          cooldownKey: 'onboarding.workspace.create.workspace-intro',
                          cooldownMs: WORKSPACE_CREATE_WINDOW_HELPER_COOLDOWN_MS
                        },
                        { id: 'workspace-intro-breath', type: 'wait', durationMs: 5000 },
                        {
                          id: 'speak-workspace-quickstart-tip',
                          type: 'speak',
                          text: getCharacterRoutineText('onboarding.workspace.create.quickstart-tip', undefined, '这里可以先用快速创建，默认目录就能开始；以后也可以再调整。'),
                          bubbleDuration: 4200,
                          cooldownKey: 'onboarding.workspace.create.quickstart-tip',
                          cooldownMs: WORKSPACE_CREATE_WINDOW_HELPER_COOLDOWN_MS
                        },
                        { id: 'await-wizard-result-pause', type: 'wait', durationMs: 1000 }
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
                            content: getCharacterRoutineText('onboarding.workspace.create.closed-without-create', undefined, '还没有创建工作空间哦。先点这里创建一个吧。'),
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
                content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '没有找到工作空间，点这里立即创建吧。'),
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
            text: getCharacterRoutineText('onboarding.workspace.create.done', undefined, '工作空间建好啦！我可以做更多事情啦。'),
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

export const DEFAULT_SPRITE_ROUTINE_PRESETS: SpriteRoutinePresetDefinition[] = [
  {
    id: 'idle.presence',
    title: '安静陪伴',
    purposeKind: 'idle.presence',
    defaultPriority: 10,
    steps: createIdlePresenceSteps
  },
  {
    id: 'file.drop.intake',
    title: '文件投递接收',
    purposeKind: 'file.drop.intake',
    defaultPriority: 100,
    steps: createFileDropIntakeSteps
  },
  {
    id: 'file.drop.invite',
    title: '文件投递等待',
    purposeKind: 'file.drop.invite',
    defaultPriority: 85,
    steps: createFileDropInviteSteps
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
    id: 'onboarding.workspace.create',
    title: '新手引导：创建工作空间',
    purposeKind: 'onboarding.workspace.create',
    defaultPriority: 70,
    steps: createWorkspaceCreateRoutineSteps
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
    const steps = typeof preset.steps === 'function' ? preset.steps(purpose) : preset.steps;
    return {
      id: `routine-${purpose.id}`,
      purposeId: purpose.id,
      presetId: preset.id,
      priority: purpose.priority,
      source: 'preset',
      status: 'queued',
      steps: steps.map((step) => ({ ...step })),
      cursor: 0,
      createdAt: now
    };
  }

  list(): SpriteRoutinePresetDefinition[] {
    return Array.from(this.presets.values());
  }
}
