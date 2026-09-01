export type WorkflowValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'resource' | 'any';

export type WorkflowSelectOption = {
  value: string;
  label: string;
  description?: string;
  children?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
};

export type WorkflowSelectOptionGroup = {
  group: string;
  options: WorkflowSelectOption[];
};

export type WorkflowSelectOptions = Array<WorkflowSelectOption | WorkflowSelectOptionGroup>;

export type WorkflowPortSchema = {
  key: string;
  label?: string;
  type: WorkflowValueType | WorkflowValueType[];
  required?: boolean;
  description?: string;
  default?: any;
  searchable?: boolean;
  inputType?: 'file' | 'url' | 'folder' | 'text' | 'select' | 'select-multiple' | 'number' | 'textarea' | 'condition-list' | 'port-list' | 'select-menu';
  options?: WorkflowSelectOptions;
  group?: string;
  showInNode?: boolean;
};

export type WorkflowNodeSpec = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  backgroundColor?: string;
  icon?: string;
  inputs: WorkflowPortSchema[];
  outputs: WorkflowPortSchema[];
  requires?: string[];
  config?: WorkflowPortSchema[];
  configGroups?: Record<string, { label: string; defaultExpanded?: boolean }>;
  hasDynamicConfig?: boolean;
  hasDynamicInputs?: boolean;
  hasDynamicOutputs?: boolean;
};

export type WorkflowNodeConfig = Record<string, any>;

export type WorkflowNodeInstance = {
  id: string;
  type: string;
  name?: string;
  config?: WorkflowNodeConfig;
  inputDefaults?: Record<string, any>;
  x?: number;
  y?: number;
};

export type WorkflowEdge = {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  schemaVersion?: number;
  workspaceId?: string;
  description?: string;
  icon?: string;
  nodes: WorkflowNodeInstance[];
  edges: WorkflowEdge[];
  options?: {
    concurrency?: number;
    errorStrategy?: 'fail-fast' | 'continue';
  };
  isPreset?: boolean;
};

// Compatibility aliases retained while existing callers migrate.
export type ValueType = WorkflowValueType;
export type SelectOption = WorkflowSelectOption;
export type SelectOptionGroup = WorkflowSelectOptionGroup;
export type SelectOptions = WorkflowSelectOptions;
export type PortSchema = WorkflowPortSchema;
export type NodeSpec = WorkflowNodeSpec;
export type NodeConfig = WorkflowNodeConfig;
export type NodeInstance = WorkflowNodeInstance;
export type Edge = WorkflowEdge;
