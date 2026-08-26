import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { WorkspacesRepo } from '../../../../common/db';
import { getWorkflow, listAllWorkflowDefinitions, startWorkflow } from '../../../../workflow';
import type { NodeRunState, WorkflowDefinition, WorkflowRunRecord } from '../../../../workflow/types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { waitForLongTaskOrBackground } from './long-task-control';
import { createJsonToolResult } from './result';

async function resolveWorkflowMetadata(toolContext: PiSessionToolContext, workflowInput?: Record<string, any>): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {};
  const resourceId = workflowInput?.resourceId;

  if (resourceId) {
    try {
      const resource = await toolContext.resourcesRepo.getById(resourceId);
      if (resource) {
        if (resource.workspaceId) metadata.workspaceId = resource.workspaceId;
        if (resource.folderId) metadata.folderId = resource.folderId;
      }
    } catch (error) {
      console.warn('[workflowRunTool] Failed to resolve resource metadata:', error);
    }
  }

  if (!metadata.workspaceId) {
    try {
      const workspace = await WorkspacesRepo.getDefault();
      if (workspace?.id) {
        metadata.workspaceId = workspace.id;
      }
    } catch (error) {
      console.warn('[workflowRunTool] Failed to resolve default workspace:', error);
    }
  }

  return metadata;
}

interface WorkflowSummary {
  acceptedResourceKinds?: string[];
  coreNodeTypes: string[];
  description?: string;
  id: string;
  inputMode?: string;
  isPreset: boolean;
  name: string;
}

interface ProducedResourceSummary {
  ext?: string;
  id: string;
  kind?: string;
  mime?: string;
  name?: string;
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  parentResourceId?: string;
  path?: string;
  resource?: Record<string, any>;
  role?: 'subtitle' | 'resource';
}

function extractWorkflowSummary(definition: WorkflowDefinition): WorkflowSummary {
  const startNode = definition.nodes.find((node) => node.type === 'core/start');
  const inputMode = (startNode?.config?.inputMode as string) || 'resource';
  const acceptedResourceKinds: string[] = (startNode?.config?.resourceKinds as string[]) || [];

  const utilityTypes = new Set(['core/start', 'core/end', 'resource/load', 'resource/create', 'resource/update']);
  const coreNodeTypes = [...new Set(definition.nodes.map((node) => node.type).filter((type) => !utilityTypes.has(type)))];

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    inputMode,
    acceptedResourceKinds: acceptedResourceKinds.length > 0 ? acceptedResourceKinds : undefined,
    coreNodeTypes,
    isPreset: Boolean(definition.isPreset)
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveResourceRole(resource: ProducedResourceSummary): ProducedResourceSummary['role'] {
  const kind = resource.kind?.toLowerCase();
  const ext = resource.ext?.toLowerCase();
  const mime = resource.mime?.toLowerCase();
  const type = typeof resource.resource?.type === 'string' ? resource.resource.type.toLowerCase() : undefined;

  if (kind === 'subtitle' || type === 'subtitle' || ['.srt', '.vtt', '.ass', '.ssa'].includes(ext || '') || mime?.includes('subtitle')) {
    return 'subtitle';
  }

  return 'resource';
}

function extractResourceSummary(value: unknown, node?: NodeRunState): ProducedResourceSummary | undefined {
  if (!isRecord(value)) return undefined;

  const resource = isRecord(value.resource) ? value.resource : undefined;
  const id = typeof value.resourceId === 'string' ? value.resourceId : typeof value.id === 'string' ? value.id : typeof resource?.id === 'string' ? resource.id : undefined;
  if (!id) return undefined;

  const summary: ProducedResourceSummary = {
    id,
    ...(typeof value.ext === 'string' ? { ext: value.ext } : {}),
    ...(typeof value.kind === 'string' ? { kind: value.kind } : {}),
    ...(typeof value.mime === 'string' ? { mime: value.mime } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.parentResourceId === 'string' ? { parentResourceId: value.parentResourceId } : {}),
    ...(typeof value.path === 'string' ? { path: value.path } : {}),
    ...(resource ? { resource } : {}),
    ...(node
      ? {
          nodeId: node.nodeId,
          ...(typeof node.input?.nodeLabel === 'string' ? { nodeLabel: node.input.nodeLabel } : {}),
          ...(typeof node.input?.nodeType === 'string' ? { nodeType: node.input.nodeType } : {})
        }
      : {})
  };

  summary.role = resolveResourceRole(summary);
  return summary;
}

function collectProducedResources(runRecord: WorkflowRunRecord): ProducedResourceSummary[] {
  const resources = new Map<string, ProducedResourceSummary>();
  const add = (resource: ProducedResourceSummary | undefined): void => {
    if (!resource) return;
    resources.set(resource.id, {
      ...resources.get(resource.id),
      ...resource
    });
  };

  add(extractResourceSummary(runRecord.output));

  for (const node of Object.values(runRecord.nodes || {})) {
    add(extractResourceSummary(node.output, node));
  }

  return Array.from(resources.values());
}

function buildWorkflowOutputSummary(runRecord: WorkflowRunRecord): Record<string, any> {
  const createdResources = collectProducedResources(runRecord);
  if (createdResources.length === 0) {
    return {};
  }

  const primary = createdResources.find((resource) => resource.role === 'subtitle') || createdResources[0];
  return {
    createdResources,
    next: {
      resourceId: primary.id,
      resourceRole: primary.role
    },
    outputResource: primary.resource,
    outputResourceId: primary.id,
    outputResourceRole: primary.role,
    producedResourceIds: createdResources.map((resource) => resource.id)
  };
}

const workflowRunParameters = Type.Object({
  action: Type.Union([Type.Literal('search'), Type.Literal('list'), Type.Literal('run')], {
    description: 'list lists workflows, search finds matching workflows, and run executes a specific workflow.'
  }),
  query: Type.Optional(Type.String({ description: 'Keyword query used by the search action.' })),
  workflowId: Type.Optional(Type.String({ description: 'Workflow ID returned by list or search and used by the run action.' })),
  waitForCompletion: Type.Optional(
    Type.Boolean({
      description: 'For run only. Defaults to true. False starts the workflow and immediately continues in background mode.'
    })
  ),
  input: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: 'Workflow input payload. Common examples include resourceId, text, url, or file.'
      }
    )
  ),
  configOverrides: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: 'Optional node config overrides, keyed by node ID.'
      }
    )
  )
});

export function createPiWorkflowRunTool(toolContext: PiSessionToolContext): ToolDefinition<typeof workflowRunParameters> {
  return {
    name: 'workflowRunTool',
    label: 'workflowRunTool',
    description: 'List, search, and run workflows for tasks such as OCR, transcription, extraction, or media generation.',
    parameters: workflowRunParameters,
    async execute(toolCallId, input) {
      const { action, query, workflowId, input: workflowInput, configOverrides, waitForCompletion } = input;
      const shouldWait = waitForCompletion !== false;
      console.log('[workflowRunTool] called:', { action, query, workflowId, waitForCompletion: shouldWait });

      if (action === 'list') {
        try {
          const definitions = await listAllWorkflowDefinitions();
          const workflows = definitions.filter((definition) => definition.id !== 'blank').map(extractWorkflowSummary);
          return createJsonToolResult({ success: true, workflows, total: workflows.length });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to load workflows.' });
        }
      }

      if (action === 'search') {
        if (!query) {
          return createJsonToolResult({ success: false, error: 'The search action requires a query.' });
        }

        try {
          const definitions = await listAllWorkflowDefinitions();
          const normalizedQuery = query.toLowerCase();
          const results = definitions
            .filter((definition) => definition.id !== 'blank')
            .filter((definition) => {
              const name = (definition.name || '').toLowerCase();
              const description = (definition.description || '').toLowerCase();
              const nodeTypes = definition.nodes.map((node) => node.type.toLowerCase()).join(' ');
              return name.includes(normalizedQuery) || description.includes(normalizedQuery) || nodeTypes.includes(normalizedQuery);
            })
            .map(extractWorkflowSummary);

          if (results.length === 0) {
            const allWorkflows = definitions.filter((definition) => definition.id !== 'blank').map(extractWorkflowSummary);
            return createJsonToolResult({
              success: true,
              results: [],
              message: `No workflows matched "${query}".`,
              allWorkflows
            });
          }

          return createJsonToolResult({ success: true, results });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to search workflows.' });
        }
      }

      if (action === 'run') {
        if (!workflowId) {
          return createJsonToolResult({ success: false, error: 'The run action requires a workflowId.' });
        }

        try {
          const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'workflow-run');
          if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
            return createJsonToolResult(guardResolution.details);
          }

          const definition = await getWorkflow(workflowId);
          if (!definition) {
            return createJsonToolResult({
              success: false,
              error: `Workflow "${workflowId}" was not found.`,
              hint: 'Use the list or search action to inspect available workflows first.'
            });
          }

          const runInput: Record<string, any> = { ...(workflowInput || {}) };
          if (configOverrides) {
            runInput.__configOverrides__ = configOverrides;
          }

          const metadata = await resolveWorkflowMetadata(toolContext, runInput);
          console.log('[workflowRunTool] run metadata:', metadata);

          const onProgress = toolContext.reportProgress
            ? (progress: number, message?: string) => {
                toolContext.reportProgress!(toolCallId, progress, message);
              }
            : undefined;

          const runHandle = startWorkflow(definition, runInput, metadata, onProgress);
          const runPromise = runHandle.completionPromise;

          if (!shouldWait) {
            return createJsonToolResult({
              success: true,
              executionMode: 'background',
              runId: runHandle.runId,
              workflowId: runHandle.workflowId,
              status: 'running',
              ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
              message: `Workflow "${definition.name}" started successfully. Run ID: ${runHandle.runId}`
            });
          }

          const waitOutcome = await waitForLongTaskOrBackground({
            toolCallId,
            toolContext,
            taskLabel: `工作流：${definition.name}`,
            taskPromise: runPromise,
            prompt: `工作流“${definition.name}”正在执行中。AI 会继续等待结果，并在完成后继续后续处理。`,
            description: '如果你不想继续等待，可以把这次执行切到后台，稍后再查看任务结果。'
          });

          if (waitOutcome.mode === 'background') {
            void runPromise.catch((error) => {
              console.warn('[workflowRunTool] Background workflow run failed:', error);
            });
            return createJsonToolResult({
              success: true,
              backgrounded: true,
              executionMode: 'background',
              runId: runHandle.runId,
              workflowId: definition.id,
              status: 'running',
              ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
              message: `Workflow "${definition.name}" is continuing in the background.`
            });
          }

          const runRecord = waitOutcome.result;

          const result: Record<string, any> = {
            success: runRecord.status === 'completed',
            executionMode: 'completed',
            runId: runRecord.runId,
            workflowId: runRecord.workflowId,
            status: runRecord.status,
            duration: runRecord.duration
          };

          if (runRecord.status === 'completed') {
            result.message = `Workflow "${definition.name}" completed successfully.`;
            if (runRecord.output && Object.keys(runRecord.output).length > 0) {
              result.output = runRecord.output;
            }
            Object.assign(result, buildWorkflowOutputSummary(runRecord));
          } else if (runRecord.status === 'failed') {
            result.message = `Workflow "${definition.name}" failed.`;
            result.error = runRecord.error;
          } else {
            result.message = `Workflow "${definition.name}" finished with status ${runRecord.status}.`;
          }

          return createJsonToolResult({
            ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
            ...result
          });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to run workflow.' });
        }
      }

      return createJsonToolResult({ success: false, error: `Unknown action: ${action}` });
    }
  };
}
