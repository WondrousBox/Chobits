import { NodeRunState, NodeSpec } from '@/types/workflow';

export type NodeData = {
  label: string;
  specId: string;
  spec: NodeSpec;
  config: Record<string, any>;
  inputDefaults: Record<string, any>;
  runtime?: NodeRunState;
};
