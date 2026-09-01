import type { WorkflowIntegrationResourceReadCapability } from '../capabilities/resources';

export interface WorkflowIntegrationResourceReadPorts extends WorkflowIntegrationResourceReadCapability {}

export function createWorkflowIntegrationResourceReadCapability(ports: WorkflowIntegrationResourceReadPorts): WorkflowIntegrationResourceReadCapability {
  return {
    resources: {
      getById: (id) => ports.resources.getById(id),
      list: (filter, limit, offset) => ports.resources.list(filter, limit, offset)
    },
    folders: {
      list: (filter, limit, offset) => ports.folders.list(filter, limit, offset)
    },
    workspaces: {
      getById: (id) => ports.workspaces.getById(id)
    }
  };
}
