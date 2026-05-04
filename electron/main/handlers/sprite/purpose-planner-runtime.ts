import type { CreatePiTaskRuntimeRequest, PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildNonReasoningTaskRuntimeRequest } from '../../../../packages/ai/runtime/pi/task-model-policy';
import { collectTaskChatText, createActivityAwareTaskTimeoutController, type TaskChatTimeoutConfig } from '../../../../packages/ai/services/task-chat-runner';
import type {
  SpritePurpose,
  SpritePurposeHistoryEntry,
  SpritePurposePlannerExecutor,
  SpritePurposePlannerInput,
  SpritePurposePlannerOutput,
  StartSpritePurposeRequest
} from '../../../../packages/sprite-core/purpose';

const TAG = '[SpritePurposePlanner]';
const PURPOSE_PLANNER_MAX_TOKENS = 1800;
const PURPOSE_PLANNER_TEMPERATURE = 0.2;
const PURPOSE_PLANNER_HISTORY_LIMIT = 8;
const PURPOSE_PLANNER_MAX_CONTEXT_CHARS = 1200;
const PURPOSE_PLANNER_MAX_PROMPT_CHARS = 16_000;
const PURPOSE_PLANNER_MAX_RAW_PREVIEW_CHARS = 600;

export interface SpritePurposePlannerRuntimeContext {
  providerId: string;
  providerPresetId?: string;
  workspaceId?: string;
  model?: string;
}

export type SpritePurposePlannerRuntimeContextResolver = (
  input: SpritePurposePlannerInput
) => Promise<SpritePurposePlannerRuntimeContext | null | undefined> | SpritePurposePlannerRuntimeContext | null | undefined;

export type SpritePurposePlannerRuntimeFactory = (request: CreatePiTaskRuntimeRequest) => Promise<{
  chatFn: PiTaskChatFunction;
  modelId: string;
}>;

export interface SpritePurposePiPlannerExecutorOptions {
  context: SpritePurposePlannerRuntimeContext | SpritePurposePlannerRuntimeContextResolver;
  createRuntime?: SpritePurposePlannerRuntimeFactory;
  timeouts?: TaskChatTimeoutConfig;
}

export const PURPOSE_PLANNER_TIMEOUTS: TaskChatTimeoutConfig = {
  firstActivityTimeoutMs: 45_000,
  firstActivityReason: 'purpose_planner_first_activity_timeout',
  streamIdleTimeoutMs: 45_000,
  streamIdleReason: 'purpose_planner_stream_idle_timeout',
  maxTimeoutMs: 2 * 60 * 1000,
  maxTimeoutReason: 'purpose_planner_max_timeout'
};

export function buildSpritePurposePlannerRuntimeRequest(context: SpritePurposePlannerRuntimeContext): CreatePiTaskRuntimeRequest {
  return buildNonReasoningTaskRuntimeRequest({
    agentId: 'chat',
    ...(context.workspaceId ? { extras: { workspaceId: context.workspaceId } } : {}),
    maxTokens: PURPOSE_PLANNER_MAX_TOKENS,
    ...(context.model ? { model: context.model } : {}),
    providerId: context.providerId,
    providerPresetId: context.providerPresetId,
    temperature: PURPOSE_PLANNER_TEMPERATURE
  });
}

export function createSpritePurposePiPlannerExecutor(options: SpritePurposePiPlannerExecutorOptions): SpritePurposePlannerExecutor {
  return new SpritePurposePiPlannerExecutor(options);
}

export class SpritePurposePiPlannerExecutor implements SpritePurposePlannerExecutor {
  private readonly context: SpritePurposePlannerRuntimeContext | SpritePurposePlannerRuntimeContextResolver;
  private readonly createRuntime: SpritePurposePlannerRuntimeFactory;
  private readonly timeouts: TaskChatTimeoutConfig;

  constructor(options: SpritePurposePiPlannerExecutorOptions) {
    this.context = options.context;
    this.createRuntime = options.createRuntime ?? createDefaultPurposePlannerRuntime;
    this.timeouts = {
      ...PURPOSE_PLANNER_TIMEOUTS,
      ...(options.timeouts ?? {})
    };
  }

  async plan(input: SpritePurposePlannerInput): Promise<SpritePurposePlannerOutput | null> {
    const context = await this.resolveContext(input);
    if (!context?.providerId) {
      return null;
    }

    const prompt = buildSpritePurposePlannerPrompt(input);
    const runtime = await this.createRuntime(buildSpritePurposePlannerRuntimeRequest(context));
    const timeoutController = createActivityAwareTaskTimeoutController({
      tag: TAG,
      timeouts: this.timeouts
    });

    let raw = '';
    try {
      raw = await collectTaskChatText(runtime.chatFn, prompt, {
        noteActivity: timeoutController.noteActivity,
        signal: timeoutController.signal
      });
    } finally {
      timeoutController.dispose();
    }

    const parsed = parseSpritePurposePlannerOutput(raw);
    if (!parsed) {
      return {
        metadata: {
          modelId: runtime.modelId,
          parseError: 'json-parse-failed',
          rawPreview: truncateText(raw, PURPOSE_PLANNER_MAX_RAW_PREVIEW_CHARS)
        }
      };
    }

    return {
      ...parsed,
      metadata: {
        ...(parsed.metadata ?? {}),
        modelId: runtime.modelId
      }
    };
  }

  private async resolveContext(input: SpritePurposePlannerInput): Promise<SpritePurposePlannerRuntimeContext | null | undefined> {
    return typeof this.context === 'function' ? this.context(input) : this.context;
  }
}

async function createDefaultPurposePlannerRuntime(request: CreatePiTaskRuntimeRequest): ReturnType<SpritePurposePlannerRuntimeFactory> {
  const { createPiTaskChatRuntimeFromRequest } = await import('../../../../packages/ai/runtime/pi/task-chat');
  return createPiTaskChatRuntimeFromRequest(request);
}

export function buildSpritePurposePlannerPrompt(input: SpritePurposePlannerInput): string {
  const compactInput = compactPlannerInput(input);
  const prompt = `You are a bounded routine planner for a desktop companion sprite.

Return only JSON. Do not include markdown, comments, prose, or tool calls.

Your task:
- Build a short routineDraft for the current purpose.
- Prefer simple, safe routines. If unsure, set fallbackPresetId to an available preset.
- Use only step types, windows, events, and animation triggers present in the input.
- Every walkTo, waitForEvent, and openWindow step must include timeoutMs.
- Every loopUntil step must include maxDurationMs.
- Every playAnimation step must include durationMs, timeoutMs, or waitFor:"none".
- Keep text short, friendly, and non-intrusive.
- Treat movement as optional expression, not as a fixed requirement. For rest reminders, do not walk to screen center by default; only add a walkTo step when the purpose/context clearly needs a spatial gesture.
- Do not invent file paths, shell commands, IPC channels, hidden windows, or new runtime events.

Output shape:
{
  "whyThisPlan": "short reason",
  "fallbackPresetId": "optional available preset id",
  "routineDraft": {
    "title": "optional title",
    "expectedDurationMs": 0,
    "steps": [
      { "id": "step-id", "type": "playAnimation", "trigger": "allowed-trigger", "durationMs": 800, "waitFor": "duration" }
    ]
  }
}

Planner input:
${JSON.stringify(compactInput, null, 2)}
`;

  return truncateText(prompt, PURPOSE_PLANNER_MAX_PROMPT_CHARS);
}

export function parseSpritePurposePlannerOutput(text: string): SpritePurposePlannerOutput | null {
  const parsed = safeParseJson(text);
  return isRecord(parsed) ? (parsed as SpritePurposePlannerOutput) : null;
}

function compactPlannerInput(input: SpritePurposePlannerInput): Record<string, unknown> {
  return {
    purpose: compactPurpose(input.purpose),
    currentPurpose: input.currentPurpose ? compactPurpose(input.currentPurpose) : null,
    availablePresets: input.availablePresets,
    availableStepSchema: input.availableStepSchema,
    availableAnimationTriggers: input.availableAnimationTriggers,
    allowedWindows: input.allowedWindows,
    allowedEvents: input.allowedEvents,
    recentHistory: input.recentHistory.slice(-PURPOSE_PLANNER_HISTORY_LIMIT).map((entry) => compactHistoryEntry(entry)),
    ...(input.screen ? { screen: input.screen } : {}),
    ...(input.context ? { context: truncateJsonLike(input.context, PURPOSE_PLANNER_MAX_CONTEXT_CHARS) } : {})
  };
}

function compactPurpose(purpose: SpritePurpose | StartSpritePurposeRequest): Record<string, unknown> {
  return compactRecord({
    id: 'id' in purpose ? purpose.id : undefined,
    kind: purpose.kind,
    title: purpose.title,
    reason: purpose.reason,
    source: purpose.source,
    status: 'status' in purpose ? purpose.status : undefined,
    priority: purpose.priority,
    interruptPolicy: purpose.interruptPolicy,
    presetId: purpose.presetId,
    correlationId: purpose.correlationId,
    context: purpose.context ? truncateJsonLike(purpose.context, PURPOSE_PLANNER_MAX_CONTEXT_CHARS) : undefined
  });
}

function compactHistoryEntry(entry: SpritePurposeHistoryEntry): Record<string, unknown> {
  return compactRecord({
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    purposeId: entry.purposeId,
    purposeKind: entry.purposeKind,
    routineId: entry.routineId,
    stepId: entry.stepId,
    status: entry.status,
    summary: typeof entry.summary === 'string' ? truncateText(entry.summary, 180) : entry.summary,
    error: typeof entry.error === 'string' ? truncateText(entry.error, 180) : entry.error,
    result: entry.result ? truncateJsonLike(entry.result, PURPOSE_PLANNER_MAX_CONTEXT_CHARS) : undefined
  });
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function truncateJsonLike(value: unknown, maxChars: number): unknown {
  const text = safeStringify(value);
  if (text.length <= maxChars) {
    return value;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function safeParseJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    ...(trimmed.match(/```json\s*([\s\S]*?)```/i)?.slice(1) ?? []),
    ...(trimmed.match(/```\s*([\s\S]*?)```/i)?.slice(1) ?? []),
    ...(trimmed.match(/(\{[\s\S]*\})/)?.slice(1) ?? [])
  ]
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}
