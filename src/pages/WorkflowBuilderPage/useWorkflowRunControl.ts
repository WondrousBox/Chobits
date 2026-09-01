import type { WorkflowDraft } from '@chobits/workflow';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Node } from 'reactflow';
import { toast } from 'sonner';

import { runWorkflow, type RunWorkflowOptions } from '@/lib/workflow-runner';

import type { NodeData } from './types';

const START_NODE_ID = 'start';

export interface WorkflowRunResource {
  id: string;
  title?: string;
  filePath?: string;
  thumbnailPath?: string;
  workspaceId?: string;
}

export type WorkflowConfiguredInput =
  | { type: 'resource' }
  | { type: 'text'; value?: string }
  | { type: 'file'; value?: string }
  | { type: 'url'; value?: string }
  | { type: 'folder'; value?: string }
  | { type: string; value?: string };

interface WorkflowRunEventPublisher {
  postMessage(message: { type: 'run-started'; defId: string; resourceId?: string; workspaceId: string }): void;
}

type WorkflowRunner = (options: RunWorkflowOptions) => Promise<void>;
type WorkflowSuccessNotifier = (title: string, description: string) => void;

interface UseWorkflowRunControlOptions {
  draft: WorkflowDraft | null;
  nodes: Node<NodeData>[];
  eventPublisher: WorkflowRunEventPublisher;
  runner?: WorkflowRunner;
  notifySuccess?: WorkflowSuccessNotifier;
}

interface WorkflowRunControlState {
  running: boolean;
  startNodeInputMode: string;
  configuredInput: WorkflowConfiguredInput | null;
  runConfiguredInput(): Promise<void>;
  runWithResource(resource: WorkflowRunResource): Promise<void>;
  runWithText(text?: string): Promise<void>;
  runWithFile(filePath?: string): Promise<void>;
  runWithUrl(url?: string): Promise<void>;
  runWithFolder(folderId?: string): Promise<void>;
}

interface ActiveRunAttempt {
  scope: symbol;
  attempt: symbol;
}

const defaultSuccessNotifier: WorkflowSuccessNotifier = (title, description) => {
  toast.success(title, { description });
};

export function getWorkflowStartInputMode(draft: WorkflowDraft | null): string {
  const startNode = draft?.nodes.find((node) => node.id === START_NODE_ID);
  return (startNode?.config?.inputMode as string) || 'resource';
}

export function getWorkflowConfiguredInput(nodes: Node<NodeData>[], mode: string): WorkflowConfiguredInput | null {
  const startNode = nodes.find((node) => node.id === START_NODE_ID);
  if (!startNode) return null;
  const inputDefaults = startNode.data?.inputDefaults || {};
  const inputKey = mode === 'folder' ? 'folderId' : mode;
  const value = inputDefaults[inputKey];
  return {
    type: mode,
    ...(value !== undefined && value !== null && String(value).trim() ? { value: String(value).trim() } : {})
  };
}

export function useWorkflowRunControl({ draft, nodes, eventPublisher, runner = runWorkflow, notifySuccess = defaultSuccessNotifier }: UseWorkflowRunControlOptions): WorkflowRunControlState {
  const runScope = useMemo(() => Symbol(`${draft?.workspaceId || 'default'}:${draft?.id || 'none'}`), [draft?.id, draft?.workspaceId]);
  const activeAttemptRef = useRef<ActiveRunAttempt | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<ActiveRunAttempt | null>(null);
  const startNodeInputMode = useMemo(() => getWorkflowStartInputMode(draft), [draft]);
  const configuredInput = useMemo(() => getWorkflowConfiguredInput(nodes, startNodeInputMode), [nodes, startNodeInputMode]);

  const execute = useCallback(
    async (input: Record<string, any>, metadata: Record<string, any>, description: string, resourceId?: string): Promise<void> => {
      if (!draft) return;
      const attempt = { scope: runScope, attempt: Symbol('workflow-run') };
      activeAttemptRef.current = attempt;
      setActiveAttempt(attempt);

      try {
        await runner({
          defId: draft.id,
          input,
          metadata,
          onSuccess: () => {
            notifySuccess('工作流执行完成', description);
            try {
              eventPublisher.postMessage({
                type: 'run-started',
                defId: draft.id,
                ...(resourceId ? { resourceId } : {}),
                workspaceId: metadata.workspaceId || draft.workspaceId!
              });
            } catch {
              // A closed cross-window channel must not change the run result.
            }
          }
        });
      } finally {
        if (activeAttemptRef.current?.attempt === attempt.attempt) {
          activeAttemptRef.current = null;
          setActiveAttempt((current) => (current?.attempt === attempt.attempt ? null : current));
        }
      }
    },
    [draft, runScope, runner, notifySuccess, eventPublisher]
  );

  const runWithResource = useCallback(
    async (resource: WorkflowRunResource): Promise<void> => {
      if (!draft) return;
      const workspaceId = resource.workspaceId || draft.workspaceId;
      await execute(
        { resource, resourceId: resource.id },
        {
          resourceId: resource.id,
          resourceName: resource.title || 'Unknown',
          thumbnailPath: resource.thumbnailPath,
          workspaceId
        },
        resource.title || resource.filePath || resource.id,
        resource.id
      );
    },
    [draft, execute]
  );

  const runWithText = useCallback(
    (text?: string) => execute({ text }, { textLength: text?.length, workspaceId: draft?.workspaceId }, `文本输入 (${text?.length} 字符)`),
    [draft?.workspaceId, execute]
  );

  const runWithFile = useCallback(
    (filePath?: string) => {
      const fileName = filePath?.split(/[/\\]/).pop() || filePath;
      return execute({ file: filePath }, { filePath, workspaceId: draft?.workspaceId }, `文件: ${fileName}`);
    },
    [draft?.workspaceId, execute]
  );

  const runWithUrl = useCallback((url?: string) => execute({ url }, { url, workspaceId: draft?.workspaceId }, `链接: ${url}`), [draft?.workspaceId, execute]);

  const runWithFolder = useCallback((folderId?: string) => execute({ folderId }, { folderId, workspaceId: draft?.workspaceId }, `文件夹 ID: ${folderId}`), [draft?.workspaceId, execute]);

  const runConfiguredInput = useCallback(async (): Promise<void> => {
    if (!configuredInput) return;
    if (configuredInput.type === 'text') return runWithText(configuredInput.value);
    if (configuredInput.type === 'file') return runWithFile(configuredInput.value);
    if (configuredInput.type === 'url') return runWithUrl(configuredInput.value);
    if (configuredInput.type === 'folder') return runWithFolder(configuredInput.value);
  }, [configuredInput, runWithText, runWithFile, runWithUrl, runWithFolder]);

  return {
    running: activeAttempt?.scope === runScope,
    startNodeInputMode,
    configuredInput,
    runConfiguredInput,
    runWithResource,
    runWithText,
    runWithFile,
    runWithUrl,
    runWithFolder
  };
}
