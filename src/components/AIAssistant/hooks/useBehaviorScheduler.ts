import { useEffect, useRef } from 'react';

/**
 * Context provided to scheduler tasks, containing current state of the assistant.
 */
export interface SchedulerContext {
  isDragging: boolean;
  isWalking: boolean;
  isHovering: boolean;
  screenSize: { width: number; height: number };
  padding: number;
  spriteWidth: number;
  spriteHeight: number;
  getPosition: () => Promise<[number, number]>;
}

/**
 * Definition of a scheduled task/behavior.
 */
export interface SchedulerTask {
  id: string;
  name: string;
  type: 'interval' | 'random_interval';
  enabled: boolean;

  // For interval (fixed)
  intervalMs?: number;

  // For random interval
  minIntervalMs?: number;
  maxIntervalMs?: number;

  // Condition to run (optional). If returns false, action is skipped but task is rescheduled.
  condition?: (context: SchedulerContext) => boolean | Promise<boolean>;

  // Action to perform
  action: (context: SchedulerContext) => void | Promise<void>;
}

interface TaskState {
  nextRunTime: number;
  lastRunTime: number;
  timerId: ReturnType<typeof setTimeout> | null;
}

/**
 * A hook to schedule and execute background behaviors for the AI Assistant.
 * Handles task scheduling, conditions, and cleanup.
 *
 * @param context Current state context (updated on every render)
 * @param tasks List of tasks to schedule (re-evaluated when array changes)
 */
export function useBehaviorScheduler(context: SchedulerContext, tasks: SchedulerTask[]): void {
  const tasksRef = useRef(tasks);
  const contextRef = useRef(context);
  const taskStatesRef = useRef<Map<string, TaskState>>(new Map());
  const isMountedRef = useRef(true);

  // Handle mount/unmount status to prevent state updates on unmounted component
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear all timers on unmount
      taskStatesRef.current.forEach((state) => {
        if (state.timerId) {
          clearTimeout(state.timerId);
          state.timerId = null;
        }
      });
    };
  }, []);

  // Keep refs up to date
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    contextRef.current = context;
  }, [context.isDragging, context.isWalking, context.isHovering, context.screenSize, context.padding, context.spriteWidth, context.spriteHeight]);

  /**
   * Schedules a single task for execution.
   */
  const scheduleTask = (task: SchedulerTask): void => {
    if (!isMountedRef.current) return;

    const states = taskStatesRef.current;
    let delay = 0;

    // Calculate delay based on task type
    if (task.type === 'interval') {
      delay = task.intervalMs || 1000;
    } else if (task.type === 'random_interval') {
      const min = task.minIntervalMs || 1000;
      const max = task.maxIntervalMs || 5000;
      delay = Math.random() * (max - min) + min;
    }

    const timerId = setTimeout(async () => {
      if (!isMountedRef.current) return;

      // Get latest task definition and context
      const currentTask = tasksRef.current.find((t) => t.id === task.id);

      // If task was removed or disabled in the meantime, stop.
      if (!currentTask || !currentTask.enabled) {
        return;
      }

      const ctx = contextRef.current;

      // Check condition if provided
      let shouldRun = true;
      if (currentTask.condition) {
        try {
          shouldRun = await currentTask.condition(ctx);
        } catch (e) {
          console.error(`[Scheduler] Condition check failed for ${task.id}:`, e);
          shouldRun = false;
        }
      }

      // Execute action
      if (shouldRun) {
        try {
          await currentTask.action(ctx);
        } catch (e) {
          console.error(`[Scheduler] Task ${task.id} action failed:`, e);
        }
      }

      // Reschedule the task
      const state = states.get(task.id);
      if (state && isMountedRef.current) {
        state.lastRunTime = Date.now();
        scheduleTask(currentTask);
      }
    }, delay);

    // Update state with new timer
    const existingState = states.get(task.id);
    if (existingState) {
      if (existingState.timerId) {
        clearTimeout(existingState.timerId);
      }
      existingState.timerId = timerId;
      existingState.nextRunTime = Date.now() + delay;
    } else {
      states.set(task.id, {
        timerId,
        nextRunTime: Date.now() + delay,
        lastRunTime: 0
      });
    }
  };

  // Main effect to manage tasks when the task list changes
  useEffect(() => {
    const states = taskStatesRef.current;

    tasks.forEach((task) => {
      const state = states.get(task.id);

      if (!task.enabled) {
        // If disabled, clear any existing timer
        if (state?.timerId) {
          clearTimeout(state.timerId);
          state.timerId = null;
        }
        return;
      }

      // If not initialized or not running (timerId is null), schedule it
      if (!state || !state.timerId) {
        scheduleTask(task);
      }
    });

    // Cleanup removed tasks
    const taskIds = new Set(tasks.map((t) => t.id));
    states.forEach((state, id) => {
      if (!taskIds.has(id)) {
        if (state.timerId) {
          clearTimeout(state.timerId);
        }
        states.delete(id);
      }
    });
  }, [tasks]);
}
