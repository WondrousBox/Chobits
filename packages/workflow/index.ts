import { BrowserWindow, ipcMain } from 'electron';

import { getResourcePath } from '../common/utils';
import { eventManager, sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { AppEvent } from '../event/events';
import { pluginResourceManager } from '../plugins';
import { addResource, FoldersRepo, ResourcesRepo, WorkspacesRepo } from './../common/db';
import type { WorkflowExecutionResult, WorkflowRunHandle } from './application-service';
import { WorkflowApplicationService } from './application-service';
import { registerNode, registerPlugin } from './core/registry';
import { createEngine } from './engine';
import { renderWorkflowHtmlScreenshot } from './html-screenshot-adapter';
import { registerWorkflowIpcHandlers } from './ipc-adapter';
import {
  AiChatNode,
  AiPromptOptimizerNode,
  CollectFolderTextsNode,
  ConditionNode,
  DisplayImageNode,
  DisplayMediaNode,
  DisplayResourceCardNode,
  DisplayTextNode,
  DocToMarkdownNode,
  EndNode,
  ExtractKeyframesNode,
  GenerateLearningCardNode,
  ImageGenerateNode,
  ImageUnderstandNode,
  JsonParseNode,
  JsonStringifyNode,
  MusicGenerateNode,
  OCRNode,
  PaddleOCRNode,
  ResourceCreateNode,
  ResourceLoadNode,
  ResourceUpdateNode,
  StartNode,
  TextOutputNode,
  TextToImageNode,
  TranscodeAdvancedNode,
  TranscodeNode,
  TranscribeFastWhisperNode,
  TranscribeFunASRNode,
  TranscribeParakeetNode,
  TranscribeWhisperNode
} from './nodes';
import { FastWhisperPlugin, FfmpegPlugin, FunASRPlugin, PaddleOcrPlugin, ParakeetPlugin, TesseractPlugin, WhisperPlugin } from './plugins';
import { attachWorkflowResourceEventAdapter } from './resource-event-adapter';
import { createWorkflowResourceProjectResolver, type ResourceProjectDirectorySet } from './resource-project-adapter';
import { attachWorkflowRunEventCoordinator, type WorkflowRunLifecycleEvent } from './run-event-coordinator';
import { createRunPersistenceQueue, type RunPersistenceQueue } from './run-persistence-queue';
import { createWorkflowRunHistoryRetention } from './run-history-retention';
import { sanitizeWorkflowValue } from './sanitize';
import { WorkflowStore } from './store';
import type { WorkflowDefinition, WorkflowRunRecord } from './types';

export type { WorkflowExecutionResult, WorkflowRunHandle } from './application-service';

let workflowApplicationService: WorkflowApplicationService | undefined;
let runPersistenceQueue: RunPersistenceQueue | undefined;

export async function flushWorkflowPersistence(): Promise<void> {
  await runPersistenceQueue?.flush();
}

async function resolveWorkflowWorkspaceId(workspaceId?: string): Promise<string> {
  const resolved = workspaceId || (await WorkspacesRepo.getDefault())?.id;
  if (!resolved) throw new Error('workspaceId is required');
  return resolved;
}

function getWorkflowApplicationService(): WorkflowApplicationService {
  if (!workflowApplicationService) throw new Error('Workflow engine not initialized');
  return workflowApplicationService;
}

export async function executeWorkflow(def: WorkflowDefinition, input: Record<string, any> = {}, metadata?: Record<string, any>): Promise<WorkflowExecutionResult> {
  return getWorkflowApplicationService().executeDefinition(def, input, metadata);
}

export async function startValidatedWorkflow(
  def: WorkflowDefinition,
  input: Record<string, any> = {},
  metadata?: Record<string, any>,
  onProgress?: (progress: number, message?: string) => void
): Promise<WorkflowRunHandle> {
  return getWorkflowApplicationService().startValidatedDefinition(def, input, metadata, onProgress);
}

export async function runWorkflow(def: WorkflowDefinition, input?: any, metadata?: Record<string, any>, onProgress?: (progress: number, message?: string) => void): Promise<WorkflowRunRecord> {
  return getWorkflowApplicationService().runDefinition(def, input || {}, metadata, onProgress);
}

export function startWorkflow(def: WorkflowDefinition, input?: any, metadata?: Record<string, any>, onProgress?: (progress: number, message?: string) => void): WorkflowRunHandle {
  return getWorkflowApplicationService().startDefinition(def, input || {}, metadata, onProgress);
}

export async function getWorkflow(id: string, workspaceId?: string): Promise<WorkflowDefinition | undefined> {
  return getWorkflowApplicationService().getDefinition(id, workspaceId);
}

export async function listAllWorkflowDefinitions(workspaceId?: string): Promise<WorkflowDefinition[]> {
  return getWorkflowApplicationService().listDefinitions(workspaceId);
}

export function initWorkflowSystem(options: {
  getWorkflowDefinitionsPath: () => string;
  ensureResourceProjectDir: (resourceId: string, workspaceId: string) => Promise<ResourceProjectDirectorySet | null>;
}): void {
  const { getWorkflowDefinitionsPath, ensureResourceProjectDir } = options || {};
  if (!getWorkflowDefinitionsPath || !ensureResourceProjectDir) {
    throw new Error('getWorkflowDefinitionsPath and ensureResourceProjectDir are required');
  }
  // Register plugins first
  registerPlugin(FfmpegPlugin);
  registerPlugin(FunASRPlugin);
  registerPlugin(FastWhisperPlugin);
  registerPlugin(ParakeetPlugin);
  registerPlugin(PaddleOcrPlugin);
  registerPlugin(TesseractPlugin);
  registerPlugin(WhisperPlugin);
  // Register nodes
  [
    StartNode,
    EndNode,
    TextOutputNode,
    TextToImageNode,
    ResourceLoadNode,
    ResourceCreateNode,
    ResourceUpdateNode,
    CollectFolderTextsNode,
    ConditionNode,
    TranscodeNode,
    TranscodeAdvancedNode,
    OCRNode,
    PaddleOCRNode,
    TranscribeWhisperNode,
    TranscribeFastWhisperNode,
    TranscribeParakeetNode,
    TranscribeFunASRNode,
    DocToMarkdownNode,
    ExtractKeyframesNode,
    ImageUnderstandNode,
    ImageGenerateNode,
    MusicGenerateNode,
    GenerateLearningCardNode,
    JsonStringifyNode,
    JsonParseNode,
    AiChatNode,
    AiPromptOptimizerNode,
    DisplayTextNode,
    DisplayImageNode,
    DisplayMediaNode,
    DisplayResourceCardNode
  ].forEach(registerNode);

  const ffmpegPath: string | undefined = getResourcePath('ffmpeg');
  const ffprobePath: string | undefined = getResourcePath('ffprobe');

  const getResourceProjectDirs = createWorkflowResourceProjectResolver({ ensure: ensureResourceProjectDir });

  const engine = createEngine({
    pluginResourceManager,
    ffmpegPath,
    ffprobePath,
    getResourceProjectDirs,
    services: {
      resources: {
        getById: (id) => ResourcesRepo.getById(id),
        list: (filter, limit, offset) => ResourcesRepo.list(filter as any, limit, offset)
      },
      folders: {
        list: (filter, limit, offset) => FoldersRepo.list(filter as any, limit, offset)
      },
      workspaces: {
        getById: (id) => WorkspacesRepo.getById(id)
      },
      renderHtmlScreenshot: renderWorkflowHtmlScreenshot
    }
  });
  const applicationService = new WorkflowApplicationService(
    engine,
    {
      listPresets: () => WorkflowStore.loadPresetWorkflows(getWorkflowDefinitionsPath()),
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
  workflowApplicationService = applicationService;

  // Persist run updates
  const broadcast = (channel: string, payload: any): void => {
    const safePayload = sanitizeWorkflowValue(payload, { maxTotalChars: 512 * 1024 });
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, safePayload);
      }
    });
  };

  // 将 AI 相关事件转发到渲染进程（如缺少服务商配置时弹出窗口）
  // payload: { providerId: string; fields?: string[] }
  engine.on('ai:missing-provider', (payload: any) => {
    broadcast('wf:ai-missing-provider', payload);
  });

  attachWorkflowResourceEventAdapter({
    engine,
    addResource: (payload) => addResource(payload as any),
    resources: {
      getById: (id) => ResourcesRepo.getById(id),
      update: (id, patch) => ResourcesRepo.update(id, patch as any)
    },
    folders: {
      list: (query, limit, offset) => FoldersRepo.list(query as any, limit, offset),
      create: (folder) => FoldersRepo.create(folder as any)
    },
    workspaces: {
      getById: (id) => WorkspacesRepo.getById(id),
      getDefault: () => WorkspacesRepo.getDefault()
    },
    onResourceUpdated: (resource) => eventManager.emit(AppEvent.RESOURCE_UPDATED, resource)
  });

  const runHistoryRetention = createWorkflowRunHistoryRetention((workspaceId, policy) => WorkflowStore.pruneRuns(workspaceId, policy));
  runPersistenceQueue = createRunPersistenceQueue(async (record) => {
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
    persistence: runPersistenceQueue,
    loadDefinition: (id, workspaceId) => applicationService.getDefinition(id, workspaceId),
    broadcast,
    emitLifecycle: (event, payload) => eventManager.emit(lifecycleEvents[event], payload),
    busy: {
      start: sendAppBusyStart,
      progress: sendAppBusyProgress,
      end: sendAppBusyEnd
    }
  });

  registerWorkflowIpcHandlers(
    {
      handle: (channel, listener) => ipcMain.handle(channel, listener)
    },
    applicationService
  );
}
