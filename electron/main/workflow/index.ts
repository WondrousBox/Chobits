import type { WorkflowRuntimeFacade } from '@chobits/workflow/application';

import { configurePiWorkflowRuntime } from '../../../packages/ai/runtime/pi/tool-context';
import { createMainWorkflowRuntime, type MainWorkflowCompositionOptions } from './composition-root';

let mainWorkflowRuntime: WorkflowRuntimeFacade | undefined;

export type { MainWorkflowCompositionOptions } from './composition-root';
export type { WorkflowRuntimeFacade } from '@chobits/workflow/application';

export function initWorkflowSystem(options: MainWorkflowCompositionOptions): WorkflowRuntimeFacade {
  if (mainWorkflowRuntime) return mainWorkflowRuntime;
  mainWorkflowRuntime = createMainWorkflowRuntime(options);
  configurePiWorkflowRuntime(mainWorkflowRuntime);
  return mainWorkflowRuntime;
}

export function getMainWorkflowRuntime(): WorkflowRuntimeFacade {
  if (!mainWorkflowRuntime) throw new Error('Workflow engine not initialized');
  return mainWorkflowRuntime;
}

export async function flushWorkflowPersistence(): Promise<void> {
  await mainWorkflowRuntime?.flushPersistence();
}

export async function disposeWorkflowSystem(): Promise<void> {
  await mainWorkflowRuntime?.dispose();
  configurePiWorkflowRuntime(undefined);
  mainWorkflowRuntime = undefined;
}
