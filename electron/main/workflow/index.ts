import type { WorkflowDefinition, WorkflowExecutionResult, WorkflowRunHandle, WorkflowRunRecord } from '@chobits/workflow';
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

export async function executeWorkflow(definition: WorkflowDefinition, input: Record<string, unknown> = {}, metadata?: Record<string, unknown>): Promise<WorkflowExecutionResult> {
  return getMainWorkflowRuntime().executeDefinition(definition, input, metadata);
}

export async function startValidatedWorkflow(
  definition: WorkflowDefinition,
  input: Record<string, unknown> = {},
  metadata?: Record<string, unknown>,
  onProgress?: (progress: number, message?: string) => void
): Promise<WorkflowRunHandle> {
  return getMainWorkflowRuntime().startValidatedDefinition(definition, input, metadata, onProgress);
}

export function startWorkflow(
  definition: WorkflowDefinition,
  input: Record<string, unknown> = {},
  metadata?: Record<string, unknown>,
  onProgress?: (progress: number, message?: string) => void
): WorkflowRunHandle {
  return getMainWorkflowRuntime().startDefinition(definition, input, metadata, onProgress);
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  input: Record<string, unknown> = {},
  metadata?: Record<string, unknown>,
  onProgress?: (progress: number, message?: string) => void
): Promise<WorkflowRunRecord> {
  return getMainWorkflowRuntime().runDefinition(definition, input, metadata, onProgress);
}

export async function getWorkflow(id: string, workspaceId?: string): Promise<WorkflowDefinition | undefined> {
  return getMainWorkflowRuntime().getDefinition(id, workspaceId);
}

export async function listAllWorkflowDefinitions(workspaceId?: string): Promise<WorkflowDefinition[]> {
  return getMainWorkflowRuntime().listDefinitions(workspaceId);
}
