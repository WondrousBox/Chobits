export type ManagedTask<TExtra extends object = Record<string, never>> = {
  controller: AbortController;
  requestId: string;
  startTime: number;
  taskLabel?: string;
} & TExtra;

type StartTaskOptions<TExtra extends object> = {
  controller: AbortController;
  extra?: TExtra;
  startTime?: number;
  taskLabel?: string;
};

export interface TaskRegistry<TExtra extends object> {
  start(requestId: string, startOptions: StartTaskOptions<TExtra>): ManagedTask<TExtra>;
  get(requestId: string): ManagedTask<TExtra> | undefined;
  update(requestId: string, patch: Partial<Omit<ManagedTask<TExtra>, 'requestId'>>): ManagedTask<TExtra> | undefined;
  list(): ManagedTask<TExtra>[];
  getByLabel(taskLabel: string): string[];
  hasActive(): boolean;
  cancel(requestId: string): boolean;
  complete(requestId: string): void;
}

export function createTaskRegistry<TExtra extends object = Record<string, never>>(options?: { deleteOnCancel?: boolean }): TaskRegistry<TExtra> {
  const tasks = new Map<string, ManagedTask<TExtra>>();
  const deleteOnCancel = options?.deleteOnCancel ?? true;

  return {
    start(requestId: string, startOptions: StartTaskOptions<TExtra>): ManagedTask<TExtra> {
      const task = {
        controller: startOptions.controller,
        requestId,
        startTime: startOptions.startTime ?? Date.now(),
        taskLabel: startOptions.taskLabel,
        ...(startOptions.extra || {})
      } as ManagedTask<TExtra>;

      tasks.set(requestId, task);
      return task;
    },

    get(requestId: string): ManagedTask<TExtra> | undefined {
      return tasks.get(requestId);
    },

    update(requestId: string, patch: Partial<Omit<ManagedTask<TExtra>, 'requestId'>>): ManagedTask<TExtra> | undefined {
      const task = tasks.get(requestId);
      if (!task) return undefined;

      const nextTask = {
        ...task,
        ...patch,
        requestId: task.requestId
      } as ManagedTask<TExtra>;

      tasks.set(requestId, nextTask);
      return nextTask;
    },

    list(): ManagedTask<TExtra>[] {
      return Array.from(tasks.values());
    },

    getByLabel(taskLabel: string): string[] {
      return Array.from(tasks.values())
        .filter((task) => task.taskLabel === taskLabel)
        .map((task) => task.requestId);
    },

    hasActive(): boolean {
      return tasks.size > 0;
    },

    cancel(requestId: string): boolean {
      const task = tasks.get(requestId);
      if (!task) return false;

      task.controller.abort();
      if (deleteOnCancel) {
        tasks.delete(requestId);
      }
      return true;
    },

    complete(requestId: string): void {
      tasks.delete(requestId);
    }
  };
}

export function bindAbortControllerToSignal(controller: AbortController, externalSignal?: AbortSignal): () => void {
  if (!externalSignal) {
    return () => {
      //
    };
  }

  const abortHandler = (): void => {
    controller.abort();
  };

  if (externalSignal.aborted) {
    controller.abort();
    return () => {
      //
    };
  }

  externalSignal.addEventListener('abort', abortHandler, { once: true });
  return () => {
    externalSignal.removeEventListener('abort', abortHandler);
  };
}
