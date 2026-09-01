import type { WorkflowDefinition, WorkflowPluginResourceResolver } from '@chobits/workflow';
import { createEngine, createWorkflowRuntime, defineCapability, parseWorkflowDefinition, planWorkflowDag } from '@chobits/workflow';
import { ConditionNode, EndNode, JsonParseNode, JsonStringifyNode, TextOutputNode } from '@chobits/workflow/nodes';
import { describe, expect, it } from 'vitest';

describe('workflow public package entry', () => {
  it('loads without Electron or Chobits host modules', () => {
    expect(createEngine).toBeTypeOf('function');
    expect(createWorkflowRuntime).toBeTypeOf('function');
    expect(defineCapability).toBeTypeOf('function');
    expect(parseWorkflowDefinition).toBeTypeOf('function');
    expect(planWorkflowDag).toBeTypeOf('function');
  });

  it('exports public contracts and core planning through one entry', () => {
    const definition: WorkflowDefinition = {
      id: 'public-entry',
      name: 'Public entry',
      nodes: [{ id: 'start', type: 'core/start' }],
      edges: []
    };
    const resolver: WorkflowPluginResourceResolver = {
      getEnginePath: () => '/engine',
      getModelPath: () => '/model',
      getPluginResourceDir: () => '/resources'
    };

    expect(parseWorkflowDefinition(definition)).toMatchObject({ ok: true });
    expect(planWorkflowDag(definition).terminalNodeIds).toEqual(['start']);
    expect(resolver.getModelPath('plugin:test', 'model')).toBe('/model');
  });

  it('exports host-neutral built-in nodes from the nodes subpath', () => {
    expect([ConditionNode, EndNode, JsonParseNode, JsonStringifyNode, TextOutputNode].map((node) => node.spec.id)).toEqual([
      'logic/condition',
      'core/end',
      'data/json-parse',
      'data/json-stringify',
      'core/text-output'
    ]);
  });
});
