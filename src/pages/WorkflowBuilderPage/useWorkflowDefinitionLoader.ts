import type { WorkflowDefinition, WorkflowDraft } from '@packages/workflow/types';
import { nanoid } from 'nanoid';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Edge, Node } from 'reactflow';

import type { NodeData, NodeSpec } from './types';
import { toWorkflowEditorDefinitionState } from './workflow-definition-mapper';

interface UseWorkflowDefinitionLoaderOptions {
  routeId?: string;
  workspaceId?: string;
  mode: string | null;
  presetId: string | null;
  specs: NodeSpec[];
  loadDefinition(id: string, workspaceId?: string): Promise<WorkflowDefinition | null>;
  setNodes: Dispatch<SetStateAction<Node<NodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  markNeedsAutoFit(): void;
}

interface ScopedDefinitionState {
  scope: symbol;
  loaded: boolean;
  draft: WorkflowDraft | null;
  isPresetWorkflow: boolean;
}

interface WorkflowDefinitionLoaderState {
  draft: WorkflowDraft | null;
  setDraft: Dispatch<SetStateAction<WorkflowDraft | null>>;
  loadingExisting: boolean;
  isPresetWorkflow: boolean;
}

export function useWorkflowDefinitionLoader({
  routeId,
  workspaceId,
  mode,
  presetId,
  specs,
  loadDefinition,
  setNodes,
  setEdges,
  markNeedsAutoFit
}: UseWorkflowDefinitionLoaderOptions): WorkflowDefinitionLoaderState {
  const loadScope = useMemo(() => Symbol(`${workspaceId || 'default'}:${routeId || `${mode || 'default'}:${presetId || 'blank'}`}`), [workspaceId, routeId, mode, presetId]);
  const [state, setState] = useState<ScopedDefinitionState>(() => ({ scope: loadScope, loaded: false, draft: null, isPresetWorkflow: false }));

  useEffect(() => {
    let active = true;
    const targetId = routeId || (mode === 'create' ? presetId || 'blank' : 'blank');
    const clonePreset = !routeId;

    void loadDefinition(targetId, workspaceId)
      .then((definition) => {
        if (!active) return;
        if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
          setState({ scope: loadScope, loaded: true, draft: null, isPresetWorkflow: false });
          return;
        }

        const editorState = toWorkflowEditorDefinitionState(definition, specs, {
          clonePreset,
          createId: nanoid,
          random: Math.random
        });
        setNodes(editorState.nodes);
        setEdges(editorState.edges);
        setState({
          scope: loadScope,
          loaded: true,
          draft: editorState.draft,
          isPresetWorkflow: editorState.isPresetWorkflow
        });
        markNeedsAutoFit();
      })
      .catch(() => {
        if (active) setState({ scope: loadScope, loaded: true, draft: null, isPresetWorkflow: false });
      });

    return () => {
      active = false;
    };
  }, [loadScope, routeId, workspaceId, mode, presetId, specs, loadDefinition, setNodes, setEdges, markNeedsAutoFit]);

  const setDraft = useCallback<Dispatch<SetStateAction<WorkflowDraft | null>>>(
    (nextDraft) => {
      setState((current) => {
        if (current.scope !== loadScope) return current;
        const draft = typeof nextDraft === 'function' ? nextDraft(current.draft) : nextDraft;
        return { ...current, draft };
      });
    },
    [loadScope]
  );

  const ownsState = state.scope === loadScope;
  return {
    draft: ownsState ? state.draft : null,
    setDraft,
    loadingExisting: !ownsState || !state.loaded,
    isPresetWorkflow: ownsState ? state.isPresetWorkflow : false
  };
}
