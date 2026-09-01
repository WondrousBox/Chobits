import { defineCapability } from '@chobits/workflow/sdk';

export type WorkflowIntegrationDataRecord = Record<string, any>;

export interface WorkflowIntegrationResourceReadCapability {
  resources: {
    getById(id: string): Promise<WorkflowIntegrationDataRecord | undefined>;
    list(filter: WorkflowIntegrationDataRecord, limit: number, offset: number): Promise<WorkflowIntegrationDataRecord[]>;
  };
  folders: {
    list(filter: WorkflowIntegrationDataRecord, limit: number, offset: number): Promise<WorkflowIntegrationDataRecord[]>;
  };
  workspaces: {
    getById(id: string): Promise<WorkflowIntegrationDataRecord | undefined>;
  };
}

export interface WorkflowIntegrationResourceDownloadRequest {
  folderId?: string;
  runId?: string;
  signal?: AbortSignal;
  url: string;
  workspaceId?: string;
}

export interface WorkflowIntegrationResourceDownloadResult {
  filePath: string;
  folderId?: string;
  workspaceId: string;
}

export interface WorkflowIntegrationResourceWriteCapability {
  copyFileToFolder(sourcePath: string, workspaceId: string, folderId: string): Promise<string>;
  create(resource: WorkflowIntegrationDataRecord): Promise<WorkflowIntegrationDataRecord | undefined>;
  download(request: WorkflowIntegrationResourceDownloadRequest): Promise<WorkflowIntegrationResourceDownloadResult>;
  update(resourceId: string, patch: WorkflowIntegrationDataRecord): Promise<WorkflowIntegrationDataRecord | undefined>;
  updateContext(runId: string, context: { folderId?: string; workspaceId?: string }): void;
}

export const WORKFLOW_RESOURCE_READ = defineCapability<WorkflowIntegrationResourceReadCapability>('workflow.integration.resource.read', {
  description: 'Read host application resources, folders, and workspaces'
});

export const WORKFLOW_RESOURCE_WRITE = defineCapability<WorkflowIntegrationResourceWriteCapability>('workflow.integration.resource.write', {
  description: 'Create, update, download, and copy host application resources'
});
