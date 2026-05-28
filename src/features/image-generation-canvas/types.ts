import type { ReactNode } from 'react';

export type ImageGenerationCanvasMode = 'edit' | 'generate';
export type ImageGenerationNodeKind = 'image' | 'generation-form';
export type ImageGenerationFormStatus = 'failed' | 'idle' | 'running';

export interface ImageGenerationCanvasSelectOption {
  label: string;
  value: string;
}

export interface ImageGenerationCanvasFieldOptions {
  kinds: ImageGenerationCanvasSelectOption[];
  outputFormats: ImageGenerationCanvasSelectOption[];
  qualities: ImageGenerationCanvasSelectOption[];
  referenceRoles: ImageGenerationCanvasSelectOption[];
  sizes: ImageGenerationCanvasSelectOption[];
  views: ImageGenerationCanvasSelectOption[];
}

export interface ImageGenerationCanvasDraft {
  action: string;
  emotion: string;
  kind: string;
  modelId: string;
  negativePrompt: string;
  outputFormat: 'jpeg' | 'png' | 'webp';
  prompt: string;
  providerId: string;
  providerPresetId?: string;
  quality: string;
  referenceRole: string;
  size: string;
  tags: string;
  title: string;
  view: string;
}

export interface ImageGenerationCanvasAssetView {
  assetId: string;
  badges?: string[];
  imageSrc: string;
  metadata?: Record<string, unknown>;
  parentAssetId?: string;
  subtitle?: string;
  thumbnailSrc?: string;
  title: string;
}

export interface ImageGenerationCanvasLayoutNode {
  assetId?: string;
  draft?: Partial<ImageGenerationCanvasDraft> & {
    mode?: ImageGenerationCanvasMode;
    referenceAssetId?: string;
  };
  id: string;
  x: number;
  y: number;
}

export interface ImageGenerationCanvasLayout {
  nodes: ImageGenerationCanvasLayoutNode[];
  updatedAt?: string;
  version: 1;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface ImageGenerationCanvasAdapter<TAsset> {
  buildInitialDraft(input: { mode: ImageGenerationCanvasMode; referenceAsset?: TAsset }): ImageGenerationCanvasDraft;
  getAssetView(asset: TAsset): ImageGenerationCanvasAssetView;
  submitGeneration(input: { draft: ImageGenerationCanvasDraft; mode: ImageGenerationCanvasMode; referenceAsset?: TAsset }): Promise<TAsset>;
}

export interface ImageGenerationCanvasActions {
  autoLayout: () => void;
  createEditForm: (assetId: string) => void;
  createGenerateForm: () => void;
  fitView: () => void;
}

export type ImageGenerationCanvasHandle = ImageGenerationCanvasActions;

export interface ImageGenerationCanvasProps<TAsset> {
  adapter: ImageGenerationCanvasAdapter<TAsset>;
  assets: TAsset[];
  className?: string;
  fieldOptions: ImageGenerationCanvasFieldOptions;
  layout?: ImageGenerationCanvasLayout | null;
  loading?: boolean;
  lockedTitle?: string;
  onAssetCreated?: (asset: TAsset) => Promise<void> | void;
  onLayoutChange?: (layout: ImageGenerationCanvasLayout) => Promise<void> | void;
  onPreviewAsset: (asset: TAsset) => void;
  readonly?: boolean;
  renderToolbar?: (actions: ImageGenerationCanvasActions) => ReactNode;
}

export interface ImageAssetNodeData {
  asset: ImageGenerationCanvasAssetView;
  kind: 'image';
  onCreateEditForm: (assetId: string, sourceNodeId: string) => void;
  onPreview: (assetId: string) => void;
  readonly?: boolean;
}

export interface ImageGenerationFormNodeData {
  draft: ImageGenerationCanvasDraft;
  errorMessage?: string;
  fieldOptions: ImageGenerationCanvasFieldOptions;
  kind: 'generation-form';
  mode: ImageGenerationCanvasMode;
  onDraftChange: (nodeId: string, patch: Partial<ImageGenerationCanvasDraft>) => void;
  onRemove: (nodeId: string) => void;
  onSubmit: (nodeId: string) => void;
  readonly?: boolean;
  reference?: ImageGenerationCanvasAssetView;
  status: ImageGenerationFormStatus;
}

export type ImageGenerationReactFlowNodeData = ImageAssetNodeData | ImageGenerationFormNodeData;
