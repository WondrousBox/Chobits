import type { Edge, Node, Viewport } from 'reactflow';

import type { ImageGenerationCanvasAssetView, ImageGenerationCanvasLayout, ImageGenerationCanvasLayoutNode, ImageGenerationReactFlowNodeData } from './types';

export interface ImageGenerationCanvasEdgeData {
  kind: 'reference';
  sourceAssetId?: string;
  status?: 'failed' | 'pending' | 'resolved';
  targetAssetId?: string;
}

const NODE_X_GAP = 360;
const NODE_Y_GAP = 260;

export function imageNodeId(assetId: string): string {
  return `gallery-item:${assetId}`;
}

export function formNodeId(): string {
  return `form:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findViewportCenter(viewport?: Viewport): { x: number; y: number } {
  if (!viewport) return { x: 120, y: 120 };
  const zoom = viewport.zoom || 1;
  return {
    x: -viewport.x / zoom + 360,
    y: -viewport.y / zoom + 240
  };
}

export function buildAutoLayout(assets: ImageGenerationCanvasAssetView[]): Map<string, { x: number; y: number }> {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const childrenByParent = new Map<string, ImageGenerationCanvasAssetView[]>();
  const roots: ImageGenerationCanvasAssetView[] = [];

  for (const asset of assets) {
    const parentId = asset.parentAssetId;
    if (parentId && byId.has(parentId)) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(asset);
      childrenByParent.set(parentId, children);
    } else {
      roots.push(asset);
    }
  }

  const result = new Map<string, { x: number; y: number }>();
  let row = 0;

  const visit = (asset: ImageGenerationCanvasAssetView, depth: number): void => {
    const children = childrenByParent.get(asset.assetId) ?? [];
    const currentRow = row;
    row += 1;
    result.set(asset.assetId, {
      x: 80 + depth * NODE_X_GAP,
      y: 80 + currentRow * NODE_Y_GAP
    });
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  for (const root of roots) {
    visit(root, 0);
  }

  return result;
}

export function mergeLayoutPositions(assets: ImageGenerationCanvasAssetView[], layout?: ImageGenerationCanvasLayout | null): Map<string, { nodeId: string; x: number; y: number }> {
  const auto = buildAutoLayout(assets);
  const layoutByAssetId = new Map<string, ImageGenerationCanvasLayoutNode>();
  const layoutByNodeId = new Map<string, ImageGenerationCanvasLayoutNode>();

  for (const node of layout?.nodes ?? []) {
    layoutByNodeId.set(node.id, node);
    if (node.assetId) layoutByAssetId.set(node.assetId, node);
  }

  const result = new Map<string, { nodeId: string; x: number; y: number }>();
  for (const asset of assets) {
    const nodeId = imageNodeId(asset.assetId);
    const saved = layoutByAssetId.get(asset.assetId) ?? layoutByNodeId.get(nodeId);
    const fallback = auto.get(asset.assetId) ?? { x: 80, y: 80 };
    result.set(asset.assetId, {
      nodeId: saved?.id ?? nodeId,
      x: typeof saved?.x === 'number' ? saved.x : fallback.x,
      y: typeof saved?.y === 'number' ? saved.y : fallback.y
    });
  }
  return result;
}

export function buildImageEdges(assets: ImageGenerationCanvasAssetView[], nodeIdByAssetId?: Map<string, string>): Array<Edge<ImageGenerationCanvasEdgeData>> {
  const assetIds = new Set(assets.map((asset) => asset.assetId));
  return assets
    .filter((asset) => asset.parentAssetId && assetIds.has(asset.parentAssetId))
    .map((asset) => ({
      id: `edge:${asset.parentAssetId}->${asset.assetId}`,
      source: nodeIdByAssetId?.get(asset.parentAssetId as string) ?? imageNodeId(asset.parentAssetId as string),
      target: nodeIdByAssetId?.get(asset.assetId) ?? imageNodeId(asset.assetId),
      style: {
        stroke: 'hsl(var(--muted-foreground))',
        strokeWidth: 2
      },
      data: {
        kind: 'reference',
        sourceAssetId: asset.parentAssetId,
        targetAssetId: asset.assetId,
        status: 'resolved'
      }
    }));
}

export function serializeCanvasLayout(nodes: Array<Node<ImageGenerationReactFlowNodeData>>, viewport?: Viewport): ImageGenerationCanvasLayout {
  return {
    version: 1,
    ...(viewport
      ? {
          viewport: {
            x: viewport.x,
            y: viewport.y,
            zoom: viewport.zoom
          }
        }
      : {}),
    nodes: nodes.map((node) => {
      if (node.data.kind === 'image') {
        return {
          id: node.id,
          assetId: node.data.asset.assetId,
          x: node.position.x,
          y: node.position.y
        };
      }
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        draft: {
          ...node.data.draft,
          mode: node.data.mode,
          ...(node.data.reference?.assetId ? { referenceAssetId: node.data.reference.assetId } : {}),
          ...(node.data.references?.length ? { referenceAssetIds: node.data.references.map((asset) => asset.assetId) } : {})
        }
      };
    })
  };
}
