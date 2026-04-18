import { randomUUID } from 'node:crypto';

import {
  LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID,
  LONG_TASK_BACKGROUND_CHOICE_VALUE,
  type UserChoiceRequest
} from '../../../types';
import type { PiSessionToolContext } from '../tool-context';

export type LongTaskWaitOutcome<T> = { mode: 'completed'; result: T } | { mode: 'background' };

interface WaitForLongTaskOptions<T> {
  toolCallId: string;
  toolContext: PiSessionToolContext;
  taskLabel: string;
  taskPromise: Promise<T>;
  prompt?: string;
  description?: string;
}

export async function waitForLongTaskOrBackground<T>(options: WaitForLongTaskOptions<T>): Promise<LongTaskWaitOutcome<T>> {
  const completionPromise: Promise<LongTaskWaitOutcome<T>> = options.taskPromise.then((result) => ({
    mode: 'completed',
    result
  }));

  const { cancelUserChoiceRequest, emitUserChoiceRequest, waitForUserChoiceResponse } = options.toolContext;
  if (!emitUserChoiceRequest || !waitForUserChoiceResponse) {
    return completionPromise;
  }

  const choiceId = randomUUID();
  const request: UserChoiceRequest = {
    choiceId,
    toolCallId: options.toolCallId,
    prompt: options.prompt || `${options.taskLabel}正在执行中。AI 会继续等待结果，并在完成后继续后续处理。`,
    questions: [
      {
        id: LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID,
        title: `${options.taskLabel}仍在执行`,
        description: options.description || '如果你不想继续等待，可以把它切到后台执行，当前聊天先结束等待。',
        options: [
          {
            value: LONG_TASK_BACKGROUND_CHOICE_VALUE,
            label: '转为后台执行',
            description: '停止当前等待，但任务会继续在后台运行。'
          }
        ]
      }
    ]
  };

  emitUserChoiceRequest(request);

  const backgroundPromise: Promise<LongTaskWaitOutcome<T>> = waitForUserChoiceResponse(choiceId)
    .then((response) => {
      const answers = response.answers[LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID] || [];
      if (answers.includes(LONG_TASK_BACKGROUND_CHOICE_VALUE)) {
        return { mode: 'background' } as const;
      }

      return completionPromise;
    })
    .catch(() => completionPromise);

  try {
    return await Promise.race([completionPromise, backgroundPromise]);
  } finally {
    cancelUserChoiceRequest?.(choiceId);
  }
}
