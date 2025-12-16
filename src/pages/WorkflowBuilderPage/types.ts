import { NodeRunState } from '@/types/workflow';

import type { NodeSpec } from '../../../packages/workflow/types';

export type NodeData = {
  label: string;
  specId: string;
  spec: NodeSpec;
  config: Record<string, any>;
  inputDefaults: Record<string, any>;
  runtime?: NodeRunState;
};
