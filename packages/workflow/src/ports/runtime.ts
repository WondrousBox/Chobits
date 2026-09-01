export type WorkflowDataRecord = Record<string, any>;

export type ResourceProjectContext = {
  resourceId?: string;
  workspaceId?: string;
  folderId?: string;
};

export interface WorkflowResourceReader {
  getById(id: string): Promise<WorkflowDataRecord | undefined>;
  list(filter: WorkflowDataRecord, limit: number, offset: number): Promise<WorkflowDataRecord[]>;
}

export interface WorkflowFolderReader {
  list(filter: WorkflowDataRecord, limit: number, offset: number): Promise<WorkflowDataRecord[]>;
}

export interface WorkflowWorkspaceReader {
  getById(id: string): Promise<WorkflowDataRecord | undefined>;
}

export interface WorkflowHtmlScreenshotRequest {
  html: string;
  outputPath: string;
  width: number;
  height: number;
  contentHeightMode?: 'fixed' | 'exact' | 'expand';
  captureDelayMs?: number;
  jpegQuality?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export type WorkflowHtmlScreenshotRenderer = (request: WorkflowHtmlScreenshotRequest) => Promise<string>;

export interface WorkflowRuntimeServices {
  resources?: WorkflowResourceReader;
  folders?: WorkflowFolderReader;
  workspaces?: WorkflowWorkspaceReader;
  renderHtmlScreenshot?: WorkflowHtmlScreenshotRenderer;
}

export interface WorkflowPluginResourceResolver {
  getEnginePath(pluginId: string, binaryName: string): string;
  getModelPath(pluginId: string, modelName: string): string;
  getPluginResourceDir(pluginId: string, type: 'engine' | 'model'): string;
}

export type WorkflowExecutionContext = {
  tmpDir: string;
  signal?: AbortSignal;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
  workflowNodeId?: string;
  workflowNodeType?: string;
  workflowNodeLabel?: string;
  workflowAttempt?: number;
  workflowIdempotencyKey?: string;
  workspaceId?: string;
  folderId?: string;
  resourceId?: string;
  services?: WorkflowRuntimeServices;
  pluginResourceManager?: WorkflowPluginResourceResolver;
  ffmpegPath?: string;
  ffprobePath?: string;
  getResourceProjectDirs?: (
    taskType: string,
    context?: ResourceProjectContext
  ) => Promise<{
    isResource: boolean;
    resourceId?: string;
    workspaceId?: string;
    outputsDir: string;
    cacheDir: string;
    tempDir: string;
    dataDir: string;
  } | null>;
};

export type ExecutionContext = WorkflowExecutionContext;
