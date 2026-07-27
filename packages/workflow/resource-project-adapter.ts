import type { ExecutionContext } from './types';

export interface ResourceProjectDirectorySet {
  path: string;
  subDirs: {
    outputs: string;
    cache: string;
    temp: string;
    data: string;
  };
}

export interface WorkflowResourceProjectService {
  ensure(resourceId: string, workspaceId: string): Promise<ResourceProjectDirectorySet | null>;
}

export type WorkflowResourceProjectResolver = NonNullable<ExecutionContext['getResourceProjectDirs']>;

export function createWorkflowResourceProjectResolver(service: WorkflowResourceProjectService): WorkflowResourceProjectResolver {
  return async (_taskType, context = {}) => {
    const { resourceId, workspaceId } = context;
    if (!resourceId || !workspaceId) return null;

    const project = await service.ensure(resourceId, workspaceId);
    if (!project) return null;

    return {
      isResource: true,
      resourceId,
      workspaceId,
      outputsDir: project.subDirs.outputs,
      cacheDir: project.subDirs.cache,
      tempDir: project.subDirs.temp,
      dataDir: project.subDirs.data
    };
  };
}
