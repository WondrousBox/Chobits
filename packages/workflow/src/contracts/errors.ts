export type WorkflowValidationIssueCode =
  | 'invalid-definition'
  | 'invalid-run-request'
  | 'unsupported-schema-version'
  | 'duplicate-node-id'
  | 'duplicate-edge-id'
  | 'invalid-edge-node'
  | 'invalid-output-port'
  | 'invalid-input-port'
  | 'incompatible-port-types'
  | 'duplicate-input-connection'
  | 'missing-required-input'
  | 'missing-capability'
  | 'invalid-input-default'
  | 'invalid-node-port'
  | 'invalid-node-config'
  | 'invalid-graph';

export type WorkflowValidationIssue = {
  code: WorkflowValidationIssueCode;
  message: string;
  path: Array<string | number>;
  nodeId?: string;
  edgeId?: string;
  capabilityId?: string;
};
