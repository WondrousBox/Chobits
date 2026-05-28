import 'reactflow/dist/style.css';
import './image-generation-canvas.scss';

import { forwardRef, type MouseEvent as ReactMouseEvent, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { TbSparkles } from 'react-icons/tb';
import ReactFlow, { Background, Controls, type Edge, MiniMap, type Node, type NodeChange, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Viewport } from 'reactflow';
import { toast } from 'sonner';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { buildImageEdges, findViewportCenter, formNodeId, type ImageGenerationCanvasEdgeData, imageNodeId, mergeLayoutPositions, serializeCanvasLayout } from './layout';
import ImageAssetNode from './nodes/ImageAssetNode';
import ImageGenerationFormNode from './nodes/ImageGenerationFormNode';
import type {
  ImageGenerationCanvasAssetView,
  ImageGenerationCanvasDraft,
  ImageGenerationCanvasHandle,
  ImageGenerationCanvasMode,
  ImageGenerationCanvasProps,
  ImageGenerationReactFlowNodeData
} from './types';

type ImageGenerationCanvasEdge = Edge<ImageGenerationCanvasEdgeData>;

const nodeTypes = {
  imageAsset: ImageAssetNode,
  generationForm: ImageGenerationFormNode
};

const defaultEdgeOptions: Partial<ImageGenerationCanvasEdge> = {
  style: {
    stroke: 'hsl(var(--muted-foreground))',
    strokeWidth: 2
  }
};

type CanvasContextMenuState = {
  flowPosition: {
    x: number;
    y: number;
  };
  screenPosition: {
    x: number;
    y: number;
  };
};

function normalizeDraft(draft: Partial<ImageGenerationCanvasDraft> | undefined, fallback: ImageGenerationCanvasDraft): ImageGenerationCanvasDraft {
  return {
    ...fallback,
    ...(draft ?? {}),
    outputFormat: (draft?.outputFormat ?? fallback.outputFormat) as ImageGenerationCanvasDraft['outputFormat']
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingImageProviderConfigError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /missing api key|api key.*missing|未配置.*api\s*key|没有配置.*api\s*key|没有可用.*预设|没有可用.*preset|no usable.*preset/i.test(message);
}

function getMissingImageProviderConfigMessage(providerId: string): string {
  return `当前图片服务 ${providerId} 还没有配置可用的 API Key，请先在 AI 提供商设置中保存 API Key 后再生成。`;
}

function openImageProviderSettings(providerId: string): void {
  void window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: providerId });
}

function showImageGenerationError(error: unknown, providerId: string): string {
  if (isMissingImageProviderConfigError(error)) {
    const message = getMissingImageProviderConfigMessage(providerId);
    toast.warning('请先配置图片服务 API Key', {
      description: message,
      action: {
        label: '去配置',
        onClick: () => openImageProviderSettings(providerId)
      }
    });
    return message;
  }

  const message = getErrorMessage(error);
  toast.error('AI 图片任务失败', {
    description: message
  });
  return message;
}

function buildPendingReferenceEdge(sourceNodeId: string, targetNodeId: string, sourceAssetId: string): ImageGenerationCanvasEdge {
  return {
    id: `edge:${sourceAssetId}->${targetNodeId}`,
    source: sourceNodeId,
    target: targetNodeId,
    animated: true,
    style: {
      stroke: 'hsl(var(--primary))',
      strokeDasharray: '6 4',
      strokeWidth: 2
    },
    data: {
      kind: 'reference',
      sourceAssetId,
      status: 'pending'
    }
  };
}

function ImageGenerationCanvasInner<TAsset>({
  adapter,
  assets,
  className,
  fieldOptions,
  layout,
  loading,
  lockedTitle,
  onAssetCreated,
  onLayoutChange,
  onPreviewAsset,
  readonly,
  renderToolbar,
  canvasRef
}: ImageGenerationCanvasProps<TAsset> & { canvasRef?: Ref<ImageGenerationCanvasHandle> }): JSX.Element {
  const rf = useReactFlow<ImageGenerationReactFlowNodeData>();
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<ImageGenerationReactFlowNodeData>([]);
  const [edges, setEdges, rawOnEdgesChange] = useEdgesState<ImageGenerationCanvasEdgeData>([]);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null);
  const assetViews = useMemo(() => assets.map((asset) => adapter.getAssetView(asset)), [adapter, assets]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [adapter.getAssetView(asset).assetId, asset])), [adapter, assets]);
  const assetViewById = useMemo(() => new Map(assetViews.map((asset) => [asset.assetId, asset])), [assetViews]);
  const createEditFormRef = useRef<(assetId: string, sourceNodeId?: string) => void>(() => undefined);
  const hydratedRef = useRef(false);
  const serializedLayoutRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);

  const updateFormDraft = useCallback(
    (nodeId: string, patch: Partial<ImageGenerationCanvasDraft>): void => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId && node.data.kind === 'generation-form'
            ? {
                ...node,
                data: {
                  ...node.data,
                  draft: {
                    ...node.data.draft,
                    ...patch
                  }
                }
              }
            : node
        )
      );
    },
    [setNodes]
  );

  const removeFormNode = useCallback(
    (nodeId: string): void => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );

  const deleteAssetNode = useCallback(
    async (assetId: string, sourceNodeId: string): Promise<void> => {
      if (readonly || !adapter.deleteAsset) return;
      const target = assetById.get(assetId);
      if (!target) return;

      try {
        const deleted = await adapter.deleteAsset(target);
        if (deleted === false) return;
        setNodes((current) => current.filter((node) => node.id !== sourceNodeId));
        setEdges((current) => current.filter((edge) => edge.source !== sourceNodeId && edge.target !== sourceNodeId));
      } catch (error) {
        toast.error('删除图片失败', {
          description: getErrorMessage(error)
        });
      }
    },
    [adapter, assetById, readonly, setEdges, setNodes]
  );

  const createImageNodeData = useCallback(
    (asset: ImageGenerationCanvasAssetView): ImageGenerationReactFlowNodeData => ({
      asset,
      kind: 'image',
      onCreateEditForm: (assetId, sourceNodeId) => {
        createEditFormRef.current(assetId, sourceNodeId);
      },
      onDelete: adapter.deleteAsset
        ? (assetId, sourceNodeId) => {
            void deleteAssetNode(assetId, sourceNodeId);
          }
        : undefined,
      onPreview: (assetId) => {
        const target = assetById.get(assetId);
        if (target) onPreviewAsset(target);
      },
      readonly
    }),
    [adapter.deleteAsset, assetById, deleteAssetNode, onPreviewAsset, readonly]
  );

  const submitFormNode = useCallback(
    async (nodeId: string): Promise<void> => {
      const node = rf.getNode(nodeId);
      if (!node || node.data.kind !== 'generation-form' || readonly) return;
      const nodeData = node.data;
      const referenceAsset = node.data.reference?.assetId ? assetById.get(node.data.reference.assetId) : undefined;

      setNodes((current) =>
        current.map((entry) =>
          entry.id === nodeId && entry.data.kind === 'generation-form'
            ? {
                ...entry,
                data: {
                  ...entry.data,
                  errorMessage: undefined,
                  status: 'running'
                }
              }
            : entry
        )
      );

      try {
        const created = await adapter.submitGeneration({
          draft: nodeData.draft,
          mode: nodeData.mode,
          referenceAsset
        });
        const view = adapter.getAssetView(created);
        const imageData = createImageNodeData(view);
        const nextNodeId = imageNodeId(view.assetId);
        const nextNodes = rf.getNodes().map((entry) =>
          entry.id === nodeId
            ? {
                ...entry,
                id: nextNodeId,
                type: 'imageAsset',
                data: imageData
              }
            : entry
        );
        const nextEdges = (rf.getEdges() as ImageGenerationCanvasEdge[]).map((edge) =>
          edge.target === nodeId
            ? {
                ...edge,
                animated: false,
                id: `edge:${view.parentAssetId ?? nodeData.reference?.assetId}->${view.assetId}`,
                style: {
                  stroke: 'hsl(var(--muted-foreground))',
                  strokeWidth: 2
                },
                target: nextNodeId,
                data: {
                  ...(edge.data ?? {}),
                  kind: 'reference' as const,
                  status: 'resolved' as const,
                  targetAssetId: view.assetId
                }
              }
            : edge
        );
        setNodes(nextNodes);
        setEdges(nextEdges);
        if (onLayoutChange) {
          const serializable = serializeCanvasLayout(nextNodes, rf.getViewport());
          serializedLayoutRef.current = JSON.stringify(serializable);
          await onLayoutChange(serializable);
        }
        await onAssetCreated?.(created);
        toast.success(nodeData.mode === 'edit' ? 'AI 编辑结果已加入图集' : 'AI 生成图片已加入图集');
      } catch (error) {
        const errorMessage = showImageGenerationError(error, nodeData.draft.providerId);
        setNodes((current) =>
          current.map((entry) =>
            entry.id === nodeId && entry.data.kind === 'generation-form'
              ? {
                  ...entry,
                  data: {
                    ...entry.data,
                    errorMessage,
                    status: 'failed'
                  }
                }
              : entry
          )
        );
        setEdges((current) =>
          current.map((edge) =>
            edge.target === nodeId
              ? {
                  ...edge,
                  animated: false,
                  style: {
                    stroke: 'hsl(var(--destructive))',
                    strokeDasharray: '6 4',
                    strokeWidth: 2
                  },
                  data: {
                    ...(edge.data ?? {}),
                    kind: 'reference',
                    status: 'failed'
                  }
                }
              : edge
          )
        );
      }
    },
    [adapter, assetById, createImageNodeData, onAssetCreated, onLayoutChange, readonly, rf, setEdges, setNodes]
  );

  const createFormNode = useCallback(
    (input: { mode: ImageGenerationCanvasMode; position: { x: number; y: number }; reference?: ImageGenerationCanvasAssetView; referenceAsset?: TAsset; sourceNodeId?: string }): void => {
      if (readonly) return;
      const id = formNodeId();
      const referenceAssetId = input.reference?.assetId;
      const draft = adapter.buildInitialDraft({
        mode: input.mode,
        referenceAsset: input.referenceAsset
      });
      setNodes((current) => [
        ...current,
        {
          id,
          type: 'generationForm',
          position: input.position,
          data: {
            draft,
            fieldOptions,
            kind: 'generation-form',
            mode: input.mode,
            onDraftChange: updateFormDraft,
            onRemove: removeFormNode,
            onSubmit: submitFormNode,
            readonly,
            reference: input.reference,
            status: 'idle'
          }
        }
      ]);
      if (input.mode === 'edit' && referenceAssetId && input.sourceNodeId) {
        setEdges((current) => [...current, buildPendingReferenceEdge(input.sourceNodeId as string, id, referenceAssetId)]);
      }
    },
    [adapter, fieldOptions, readonly, removeFormNode, setEdges, setNodes, submitFormNode, updateFormDraft]
  );

  const createEditForm = useCallback(
    (assetId: string, sourceNodeId?: string): void => {
      if (readonly) return;
      const referenceAsset = assetById.get(assetId);
      const referenceView = assetViewById.get(assetId);
      if (!referenceAsset || !referenceView) return;
      const sourceNode = sourceNodeId ? rf.getNode(sourceNodeId) : undefined;
      const fallbackSourceNode = rf.getNode(imageNodeId(assetId));
      const resolvedSourceNode = sourceNode ?? fallbackSourceNode;
      createFormNode({
        mode: 'edit',
        position: {
          x: (resolvedSourceNode?.position.x ?? 120) + 320,
          y: resolvedSourceNode?.position.y ?? 120
        },
        reference: referenceView,
        referenceAsset,
        sourceNodeId: resolvedSourceNode?.id ?? imageNodeId(assetId)
      });
    },
    [assetById, assetViewById, createFormNode, readonly, rf]
  );

  useEffect(() => {
    createEditFormRef.current = createEditForm;
  }, [createEditForm]);

  const createGenerateForm = useCallback((): void => {
    if (readonly) return;
    createFormNode({
      mode: 'generate',
      position: findViewportCenter(rf.getViewport())
    });
  }, [createFormNode, readonly, rf]);

  const createGenerateFormAt = useCallback(
    (position: { x: number; y: number }): void => {
      if (readonly) return;
      createFormNode({
        mode: 'generate',
        position
      });
    },
    [createFormNode, readonly]
  );

  const fitCanvas = useCallback((): void => {
    rf.fitView({ padding: 0.2, duration: 300 });
  }, [rf]);

  const rebuildAutoLayout = useCallback((): void => {
    const positions = mergeLayoutPositions(assetViews, null);
    setNodes((current) =>
      current.map((node) => {
        if (node.data.kind !== 'image') return node;
        const next = positions.get(node.data.asset.assetId);
        return next ? { ...node, position: { x: next.x, y: next.y } } : node;
      })
    );
    window.setTimeout(() => fitCanvas(), 0);
  }, [assetViews, fitCanvas, setNodes]);

  useImperativeHandle(
    canvasRef,
    () => ({
      autoLayout: rebuildAutoLayout,
      createEditForm,
      createGenerateForm,
      fitView: fitCanvas
    }),
    [createEditForm, createGenerateForm, fitCanvas, rebuildAutoLayout]
  );

  useEffect(() => {
    const positions = mergeLayoutPositions(assetViews, layout);
    const nodeIdByAssetId = new Map<string, string>();
    for (const asset of assetViews) {
      nodeIdByAssetId.set(asset.assetId, positions.get(asset.assetId)?.nodeId ?? imageNodeId(asset.assetId));
    }

    const nextImageNodes: Node<ImageGenerationReactFlowNodeData>[] = assetViews.map((asset) => {
      const saved = positions.get(asset.assetId);
      return {
        id: saved?.nodeId ?? imageNodeId(asset.assetId),
        type: 'imageAsset',
        position: {
          x: saved?.x ?? 80,
          y: saved?.y ?? 80
        },
        data: createImageNodeData(asset)
      };
    });

    const layoutFormNodes: Node<ImageGenerationReactFlowNodeData>[] = (layout?.nodes ?? [])
      .filter((entry) => !entry.assetId && entry.draft)
      .map((entry) => {
        const mode = entry.draft?.mode ?? 'generate';
        const referenceAsset = entry.draft?.referenceAssetId ? assetById.get(entry.draft.referenceAssetId) : undefined;
        const referenceView = entry.draft?.referenceAssetId ? assetViewById.get(entry.draft.referenceAssetId) : undefined;
        const fallback = adapter.buildInitialDraft({ mode, referenceAsset });
        return {
          id: entry.id,
          type: 'generationForm',
          position: {
            x: entry.x,
            y: entry.y
          },
          data: {
            draft: normalizeDraft(entry.draft, fallback),
            fieldOptions,
            kind: 'generation-form',
            mode,
            onDraftChange: updateFormDraft,
            onRemove: removeFormNode,
            onSubmit: submitFormNode,
            readonly,
            reference: referenceView,
            status: 'idle'
          }
        };
      });

    const pendingEdges: ImageGenerationCanvasEdge[] = layoutFormNodes
      .filter((node) => node.data.kind === 'generation-form' && !!node.data.reference)
      .map((node) => {
        const referenceAssetId = node.data.kind === 'generation-form' ? node.data.reference?.assetId : undefined;
        const source = referenceAssetId ? (nodeIdByAssetId.get(referenceAssetId) ?? imageNodeId(referenceAssetId)) : '';
        return buildPendingReferenceEdge(source, node.id, referenceAssetId ?? '');
      });

    const nextNodes = [...nextImageNodes, ...layoutFormNodes];
    const nextEdges = [...buildImageEdges(assetViews, nodeIdByAssetId), ...pendingEdges];
    setNodes(nextNodes);
    setEdges(nextEdges);

    const initialLayout = serializeCanvasLayout(nextNodes, layout?.viewport);
    serializedLayoutRef.current = JSON.stringify(initialLayout);
    hydratedRef.current = true;

    if (layout?.viewport) {
      const viewport: Viewport = layout.viewport;
      window.setTimeout(() => rf.setViewport(viewport), 0);
    } else {
      window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 0 }), 0);
    }
  }, [adapter, assetById, assetViewById, assetViews, createImageNodeData, fieldOptions, layout, readonly, removeFormNode, rf, setEdges, setNodes, submitFormNode, updateFormDraft]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]): void => {
      rawOnNodesChange(changes);
    },
    [rawOnNodesChange]
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof rawOnEdgesChange>[0]): void => {
      if (readonly) return;
      rawOnEdgesChange(changes);
    },
    [rawOnEdgesChange, readonly]
  );

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent): void => {
      event.preventDefault();
      if (readonly) return;
      setCanvasContextMenu({
        flowPosition: rf.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        }),
        screenPosition: {
          x: event.clientX,
          y: event.clientY
        }
      });
    },
    [readonly, rf]
  );

  const handleCreateGenerateFormFromContextMenu = useCallback((): void => {
    if (!canvasContextMenu) return;
    createGenerateFormAt(canvasContextMenu.flowPosition);
    setCanvasContextMenu(null);
  }, [canvasContextMenu, createGenerateFormAt]);

  useEffect(() => {
    if (!onLayoutChange || readonly || !hydratedRef.current) return;
    const serializable = serializeCanvasLayout(nodes, rf.getViewport());
    const serialized = JSON.stringify(serializable);
    if (serializedLayoutRef.current === serialized) return;
    serializedLayoutRef.current = serialized;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void onLayoutChange(serializable);
    }, 600);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [nodes, onLayoutChange, readonly, rf, viewportVersion]);

  const toolbar = renderToolbar?.({
    autoLayout: rebuildAutoLayout,
    createEditForm,
    createGenerateForm,
    fitView: fitCanvas
  });

  return (
    <div className={cn('relative min-h-[560px] overflow-hidden rounded-md border border-border/60 bg-background', className)}>
      {toolbar ? <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">{toolbar}</div> : null}
      {loading ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">正在读取图集...</div> : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMoveEnd={() => setViewportVersion((version) => version + 1)}
        onPaneContextMenu={handlePaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readonly}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={[]}
      >
        <Background />
        <MiniMap className="bg-background text-foreground" zoomable pannable />
        <Controls />
      </ReactFlow>
      <DropdownMenu open={!!canvasContextMenu} onOpenChange={(open) => !open && setCanvasContextMenu(null)}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="画布菜单"
            tabIndex={-1}
            className="pointer-events-none fixed h-px w-px opacity-0"
            style={{
              left: canvasContextMenu?.screenPosition.x ?? 0,
              top: canvasContextMenu?.screenPosition.y ?? 0
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[180px]" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <DropdownMenuItem disabled={readonly} onSelect={handleCreateGenerateFormFromContextMenu}>
            <TbSparkles />
            AI 新建
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {assets.length === 0 && !loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">还没有图集图片，可以导入图片或创建 AI 新建表单。</div>
      ) : null}
      {readonly && lockedTitle ? <div className="absolute bottom-3 left-3 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">{lockedTitle}</div> : null}
    </div>
  );
}

function ImageGenerationCanvasWithProvider<TAsset>(props: ImageGenerationCanvasProps<TAsset>, ref: Ref<ImageGenerationCanvasHandle>): JSX.Element {
  return (
    <ReactFlowProvider>
      <ImageGenerationCanvasInner {...props} canvasRef={ref} />
    </ReactFlowProvider>
  );
}

const ImageGenerationCanvas = forwardRef(ImageGenerationCanvasWithProvider) as <TAsset>(props: ImageGenerationCanvasProps<TAsset> & { ref?: Ref<ImageGenerationCanvasHandle> }) => JSX.Element;

export default ImageGenerationCanvas;
