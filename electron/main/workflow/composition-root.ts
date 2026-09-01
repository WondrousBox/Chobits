import { type NodeConfig, type PortSchema, sanitizeWorkflowValue } from '@chobits/workflow';
import { WorkflowApplicationService, type WorkflowRuntimeFacade } from '@chobits/workflow/application';
import { createWorkflowRegistry } from '@chobits/workflow/core';
import { createEngine } from '@chobits/workflow/node';
import { ConditionNode, EndNode, JsonParseNode, JsonStringifyNode, TextOutputNode } from '@chobits/workflow/nodes';
import {
  attachWorkflowResourceEventAdapter,
  workflowIntegrationNodes,
  workflowIntegrationPlugins,
  createWorkflowIntegrationAiCapability,
  createWorkflowIntegrationCapabilities,
  createWorkflowIntegrationExecutionLimiter,
  createWorkflowIntegrationLocalProcessingCapability,
  createWorkflowIntegrationOcrCapability,
  createWorkflowIntegrationRenderingCapability,
  createWorkflowIntegrationResourceReadCapability,
  createWorkflowIntegrationResourceWriteCapability,
  renderWorkflowHtmlScreenshot,
  WorkflowStore
} from '@workflow/integrations';
import { WORKFLOW_IPC_EVENT_CHANNELS, type WorkflowIpcEventChannel, type WorkflowIpcRegistrar } from '@workflow/integrations/client';
import { BrowserWindow, ipcMain } from 'electron';

import { addResource, FoldersRepo, ResourcesRepo, WorkspacesRepo } from '../../../packages/common/db';
import { eventManager, sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../../../packages/event';
import { AppEvent } from '../../../packages/event/events';
import { pluginResourceManager } from '../../../packages/plugins';
import { createWorkflowResourceProjectResolver, type ResourceProjectDirectorySet } from '../../../packages/workflow/resource-project-adapter';
import { attachWorkflowRunEventCoordinator, type WorkflowRunLifecycleEvent } from '../../../packages/workflow/run-event-coordinator';
import { createWorkflowRunHistoryRetention } from '../../../packages/workflow/run-history-retention';
import { createRunPersistenceQueue } from '../../../packages/workflow/run-persistence-queue';
import { scanTaskResults } from '../../../packages/workflow/task-results';
import { getResourcePath } from '../utils/resources-path';
import { registerWorkflowIpcHandlers } from './ipc-main';

export interface MainWorkflowCompositionOptions {
  ensureResourceProjectDir(resourceId: string, workspaceId: string): Promise<ResourceProjectDirectorySet | null>;
  getWorkflowDefinitionsPath(): string;
  ipc?: WorkflowIpcRegistrar;
}

export function createMainWorkflowRuntime(options: MainWorkflowCompositionOptions): WorkflowRuntimeFacade {
  if (!options?.getWorkflowDefinitionsPath || !options?.ensureResourceProjectDir) {
    throw new Error('getWorkflowDefinitionsPath and ensureResourceProjectDir are required');
  }

  const ffmpegPath = getResourcePath('ffmpeg');
  const ffprobePath = getResourcePath('ffprobe');
  const getResourceProjectDirs = createWorkflowResourceProjectResolver({ ensure: options.ensureResourceProjectDir });
  const resourceRead = createWorkflowIntegrationResourceReadCapability({
    resources: {
      getById: (id) => ResourcesRepo.getById(id),
      list: (filter, limit, offset) => ResourcesRepo.list(filter as Parameters<typeof ResourcesRepo.list>[0], limit, offset)
    },
    folders: {
      list: (filter, limit, offset) => FoldersRepo.list(filter as Parameters<typeof FoldersRepo.list>[0], limit, offset)
    },
    workspaces: {
      getById: (id) => WorkspacesRepo.getById(id)
    }
  });

  let updateRunContext: (runId: string, context: { folderId?: string; workspaceId?: string }) => void = () => {};
  const resourceWritePorts = {
    addResource: (payload: { resource: Record<string, unknown> }) => addResource(payload as Parameters<typeof addResource>[0]),
    resources: {
      getById: (id: string) => ResourcesRepo.getById(id),
      update: (id: string, patch: Record<string, unknown>) => ResourcesRepo.update(id, patch as Parameters<typeof ResourcesRepo.update>[1])
    },
    folders: {
      list: (query: Record<string, unknown>, limit: number, offset: number) => FoldersRepo.list(query as Parameters<typeof FoldersRepo.list>[0], limit, offset),
      create: (folder: Record<string, unknown>) => FoldersRepo.create(folder as Parameters<typeof FoldersRepo.create>[0])
    },
    workspaces: {
      getById: (id: string) => WorkspacesRepo.getById(id),
      getDefault: () => WorkspacesRepo.getDefault()
    },
    updateRunContext: (runId: string, context: { folderId?: string; workspaceId?: string }) => updateRunContext(runId, context),
    onResourceUpdated: (resource: Record<string, unknown>) => eventManager.emit(AppEvent.RESOURCE_UPDATED, resource)
  };
  const capabilities = createWorkflowIntegrationCapabilities({
    resourceRead,
    resourceWrite: createWorkflowIntegrationResourceWriteCapability(resourceWritePorts),
    ai: createWorkflowIntegrationAiCapability(),
    localProcessing: createWorkflowIntegrationLocalProcessingCapability({ pluginResourceManager, ffmpegPath, ffprobePath, getResourceProjectDirs }),
    ocr: createWorkflowIntegrationOcrCapability(),
    rendering: createWorkflowIntegrationRenderingCapability({ renderHtmlScreenshot: renderWorkflowHtmlScreenshot })
  });
  const registry = createWorkflowRegistry({
    plugins: workflowIntegrationPlugins,
    nodes: [EndNode, TextOutputNode, ConditionNode, JsonStringifyNode, JsonParseNode, ...workflowIntegrationNodes]
  });
  const engine = createEngine({ pluginResourceManager, ffmpegPath, ffprobePath, getResourceProjectDirs }, { registry, capabilities, limiter: createWorkflowIntegrationExecutionLimiter() });
  updateRunContext = (runId, context) => engine.updateRunContext(runId, context);

  const application = new WorkflowApplicationService(
    engine,
    {
      listPresets: () => WorkflowStore.loadPresetWorkflows(options.getWorkflowDefinitionsPath()),
      listDefinitions: (workspaceId) => WorkflowStore.list(workspaceId),
      getDefinition: (id, workspaceId) => WorkflowStore.get(id, workspaceId),
      saveDefinition: (definition) => WorkflowStore.upsert(definition),
      deleteDefinition: (id, workspaceId) => WorkflowStore.remove(id, workspaceId),
      listRuns: (workspaceId, workflowId, limit, resourceId) => WorkflowStore.listRuns(workspaceId, workflowId, limit, resourceId),
      getRun: (runId, workspaceId) => WorkflowStore.getRun(runId, workspaceId),
      deleteRun: (runId, workspaceId) => WorkflowStore.removeRun(runId, workspaceId)
    },
    resolveWorkflowWorkspaceId
  );

  const broadcast = (channel: WorkflowIpcEventChannel, payload: unknown): void => {
    const safePayload = sanitizeWorkflowValue(payload, { maxTotalChars: 512 * 1024 });
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send(channel, safePayload);
    });
  };
  engine.on('ai:missing-provider', (payload: unknown) => broadcast(WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider, payload));
  attachWorkflowResourceEventAdapter({ engine, ...resourceWritePorts });

  const runHistoryRetention = createWorkflowRunHistoryRetention((workspaceId, policy) => WorkflowStore.pruneRuns(workspaceId, policy));
  const persistence = createRunPersistenceQueue(async (record) => {
    await WorkflowStore.updateRun(record);
    await runHistoryRetention.afterPersisted(record);
  });
  const lifecycleEvents: Record<WorkflowRunLifecycleEvent, AppEvent> = {
    start: AppEvent.SPRITE_WORKFLOW_START,
    progress: AppEvent.SPRITE_WORKFLOW_PROGRESS,
    complete: AppEvent.SPRITE_WORKFLOW_COMPLETE,
    fail: AppEvent.SPRITE_WORKFLOW_FAIL,
    cancel: AppEvent.SPRITE_WORKFLOW_CANCEL
  };
  attachWorkflowRunEventCoordinator({
    engine,
    persistence,
    loadDefinition: (id, workspaceId) => application.getDefinition(id, workspaceId),
    broadcast: {
      runStatus: (payload) => broadcast(WORKFLOW_IPC_EVENT_CHANNELS.runStatus, payload),
      nodeStatus: (payload) => broadcast(WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus, payload),
      runLog: (payload) => broadcast(WORKFLOW_IPC_EVENT_CHANNELS.runLog, payload)
    },
    emitLifecycle: (event, payload) => eventManager.emit(lifecycleEvents[event], payload),
    busy: { start: sendAppBusyStart, progress: sendAppBusyProgress, end: sendAppBusyEnd }
  });

  const runtime = createFacade(application, registry, persistence.flush);
  registerWorkflowIpcHandlers(options.ipc || electronWorkflowIpcRegistrar, runtime, { scanTaskResults });
  return runtime;
}

async function resolveWorkflowWorkspaceId(workspaceId?: string): Promise<string> {
  const resolved = workspaceId || (await WorkspacesRepo.getDefault())?.id;
  if (!resolved) throw new Error('workspaceId is required');
  return resolved;
}

function createFacade(application: WorkflowApplicationService, registry: ReturnType<typeof createWorkflowRegistry>, flushPersistence: () => Promise<void>): WorkflowRuntimeFacade {
  const nodeFields = async (nodeId: string, config: NodeConfig | undefined, field: 'config' | 'inputs' | 'outputs'): Promise<PortSchema[] | null | undefined> => {
    const handler = registry.getNode(nodeId);
    if (!handler) return null;
    if (field === 'config') return handler.getConfig ? Promise.resolve(handler.getConfig(config)) : handler.spec.config;
    if (field === 'inputs') return handler.getInputs ? handler.getInputs(config) : handler.spec.inputs;
    return handler.getOutputs ? handler.getOutputs(config) : handler.spec.outputs;
  };

  return {
    cancelRun: (runId, workspaceId) => application.cancelRun(runId, workspaceId),
    deleteDefinition: (id, workspaceId) => application.deleteDefinition(id, workspaceId),
    deleteRun: (runId, workspaceId) => application.deleteRun(runId, workspaceId),
    executeById: (definitionId, input, metadata) => application.executeById(definitionId, input, metadata),
    executeDefinition: (definition, input, metadata) => application.executeDefinition(definition, input, metadata),
    flushPersistence,
    getDefinition: (id, workspaceId) => application.getDefinition(id, workspaceId),
    getNodeConfig: (nodeId, config) => nodeFields(nodeId, config, 'config'),
    getNodeInputs: (nodeId, config) => nodeFields(nodeId, config, 'inputs'),
    getNodeOutputs: (nodeId, config) => nodeFields(nodeId, config, 'outputs'),
    getRun: (runId, workspaceId) => application.getRun(runId, workspaceId),
    getRunLogs: (runId, workspaceId) => application.getRunLogs(runId, workspaceId),
    isPresetDefinition: (id) => application.isPresetDefinition(id),
    listDefinitions: (workspaceId) => application.listDefinitions(workspaceId),
    listNodes: async () =>
      registry.listNodes().map((handler) => ({
        ...handler.spec,
        ...(handler.getConfig ? { hasDynamicConfig: true } : {}),
        ...(handler.getInputs ? { hasDynamicInputs: true } : {}),
        ...(handler.getOutputs ? { hasDynamicOutputs: true } : {})
      })),
    listPlugins: async () => registry.listPlugins().map((plugin) => ({ id: plugin.id, label: plugin.label, installed: false })),
    listPresetDefinitions: () => application.listPresetDefinitions(),
    listRuns: (workspaceId, workflowId, limit, resourceId) => application.listRuns(workspaceId, workflowId, limit, resourceId),
    runDefinition: (definition, input, metadata, onProgress) => application.runDefinition(definition, input, metadata, onProgress),
    saveDefinition: (definition, workspaceId) => application.saveDefinition(definition, workspaceId),
    startDefinition: (definition, input, metadata, onProgress) => application.startDefinition(definition, input, metadata, onProgress),
    startValidatedDefinition: (definition, input, metadata, onProgress) => application.startValidatedDefinition(definition, input, metadata, onProgress),
    validateDefinition: (definition) => application.validateDefinition(definition)
  };
}

const electronWorkflowIpcRegistrar: WorkflowIpcRegistrar = {
  handle: (channel, listener) => ipcMain.handle(channel, listener)
};
