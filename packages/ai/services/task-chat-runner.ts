import type { PiTaskChatFunction } from '../runtime/pi/task-chat';

export type TaskChatActivityKind = 'thinking' | 'answer' | 'completed';

export interface TaskChatTimeoutConfig {
  firstActivityTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  maxTimeoutMs?: number;
  firstActivityReason?: string;
  streamIdleReason?: string;
  maxTimeoutReason?: string;
}

export interface TaskChatTimeoutController {
  signal: AbortSignal;
  noteActivity: (activity: TaskChatActivityKind) => void;
  getAbortReason: () => string | undefined;
  dispose: () => void;
}

export interface CollectTaskChatTextOptions {
  noteActivity?: (activity: TaskChatActivityKind) => void;
  signal?: AbortSignal;
}

export const LONG_TASK_CHAT_TIMEOUTS: Required<TaskChatTimeoutConfig> = {
  firstActivityReason: 'llm_first_activity_timeout',
  firstActivityTimeoutMs: 90_000,
  maxTimeoutMs: 8 * 60 * 1000,
  maxTimeoutReason: 'llm_max_timeout',
  streamIdleReason: 'llm_stream_idle_timeout',
  streamIdleTimeoutMs: 90_000
};

function resolveSignalReason(signal: AbortSignal | undefined): string | undefined {
  if (!signal?.aborted) return undefined;

  const reason = signal.reason;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  return undefined;
}

export function createActivityAwareTaskTimeoutController(options: { externalSignal?: AbortSignal; tag: string; timeouts: TaskChatTimeoutConfig }): TaskChatTimeoutController {
  const controller = new AbortController();
  const startedAt = Date.now();
  const tag = options.tag;
  const timeouts = {
    ...LONG_TASK_CHAT_TIMEOUTS,
    ...options.timeouts
  };

  let abortReason: string | undefined;
  let activityCount = 0;
  let firstActivityAt: number | undefined;
  let lastActivityAt: number | undefined;
  let lastActivityKind: TaskChatActivityKind | undefined;
  let firstActivityTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | undefined): void => {
    if (timer) clearTimeout(timer);
  };

  const abortWithReason = (reason: string): void => {
    if (controller.signal.aborted) return;
    abortReason = reason;
    const elapsedMs = Date.now() - startedAt;
    const idleForMs = lastActivityAt ? Date.now() - lastActivityAt : undefined;
    console.warn(
      `${tag} aborting task chat: ${reason} (elapsed=${elapsedMs}ms, activities=${activityCount}, lastActivity=${lastActivityKind || 'none'}${typeof idleForMs === 'number' ? `, idleFor=${idleForMs}ms` : ''})`
    );
    controller.abort(reason);
  };

  const armIdleTimer = (): void => {
    clearTimer(idleTimer);
    if (!timeouts.streamIdleTimeoutMs) return;
    idleTimer = setTimeout(() => abortWithReason(timeouts.streamIdleReason), timeouts.streamIdleTimeoutMs);
  };

  if (timeouts.firstActivityTimeoutMs) {
    firstActivityTimer = setTimeout(() => abortWithReason(timeouts.firstActivityReason), timeouts.firstActivityTimeoutMs);
  }

  if (timeouts.maxTimeoutMs) {
    maxTimer = setTimeout(() => abortWithReason(timeouts.maxTimeoutReason), timeouts.maxTimeoutMs);
  }

  let cleanupExternalAbort = (): void => {
    //
  };

  if (options.externalSignal) {
    const externalAbortHandler = (): void => {
      if (controller.signal.aborted) return;
      abortReason = resolveSignalReason(options.externalSignal);
      controller.abort(options.externalSignal?.reason);
    };

    if (options.externalSignal.aborted) {
      externalAbortHandler();
    } else {
      options.externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
      cleanupExternalAbort = () => {
        options.externalSignal?.removeEventListener('abort', externalAbortHandler);
      };
    }
  }

  return {
    getAbortReason: () => abortReason || resolveSignalReason(controller.signal),
    noteActivity: (activity: TaskChatActivityKind) => {
      if (controller.signal.aborted) return;

      activityCount += 1;
      lastActivityAt = Date.now();
      lastActivityKind = activity;

      if (!firstActivityAt) {
        firstActivityAt = lastActivityAt;
        console.log(`${tag} first stream activity detected: ${activity} after ${firstActivityAt - startedAt}ms`);
      }

      clearTimer(firstActivityTimer);
      firstActivityTimer = undefined;
      armIdleTimer();
    },
    signal: controller.signal,
    dispose: () => {
      clearTimer(firstActivityTimer);
      clearTimer(idleTimer);
      clearTimer(maxTimer);
      cleanupExternalAbort();
    }
  };
}

export async function collectTaskChatText(piChatFn: PiTaskChatFunction, prompt: string, options: CollectTaskChatTextOptions = {}): Promise<string> {
  let fullText = '';
  let errorMessage: string | undefined;

  await piChatFn(
    prompt,
    (event) => {
      if (event.type === 'delta') {
        options.noteActivity?.('answer');
        if (event.data.text) {
          fullText += event.data.text;
        }
        return;
      }

      if (event.type === 'thinking_delta') {
        options.noteActivity?.('thinking');
        return;
      }

      if (event.type === 'message_completed') {
        options.noteActivity?.('completed');
        if (event.data?.text && event.data.text.length >= fullText.length) {
          fullText = event.data.text;
        }
        return;
      }

      if (event.type === 'error') {
        errorMessage = event.data.message;
      }
    },
    options.signal
  );

  if (errorMessage) {
    throw new Error(`LLM call failed: ${errorMessage}`);
  }

  return fullText;
}

export function createManagedTaskChatFn(
  piChatFn: PiTaskChatFunction,
  options: {
    tag: string;
    timeouts?: TaskChatTimeoutConfig;
  }
): (prompt: string, signal?: AbortSignal) => Promise<string> {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    const timeoutController = options.timeouts
      ? createActivityAwareTaskTimeoutController({
          externalSignal: signal,
          tag: options.tag,
          timeouts: options.timeouts
        })
      : undefined;

    try {
      return await collectTaskChatText(piChatFn, prompt, {
        noteActivity: timeoutController?.noteActivity,
        signal: timeoutController?.signal || signal
      });
    } finally {
      timeoutController?.dispose();
    }
  };
}
