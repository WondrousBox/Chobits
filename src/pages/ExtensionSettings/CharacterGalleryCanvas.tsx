import type { ImageGenerationResponse, ProviderPresetRecord } from '@packages/ai/types';
import type {
  CharacterGalleryCanvasLayout,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryReferenceRole,
  CharacterGalleryViewAngle
} from '@packages/sprite-core/character-gallery';
import type { CharacterPackSource } from '@packages/sprite-core/character-pack-manager';
import type { ComponentProps } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { TbLayout, TbMaximize, TbPhotoPlus, TbSparkles } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ImageGenerationCanvas from '@/features/image-generation-canvas/ImageGenerationCanvas';
import type {
  ImageGenerationCanvasAdapter,
  ImageGenerationCanvasAssetView,
  ImageGenerationCanvasDraft,
  ImageGenerationCanvasFieldOptions,
  ImageGenerationCanvasHandle,
  ImageGenerationCanvasLayout
} from '@/features/image-generation-canvas/types';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

interface CharacterGalleryCanvasProps {
  canWrite: boolean;
  items: CharacterGalleryItem[];
  layout?: CharacterGalleryCanvasLayout | null;
  loading?: boolean;
  lockedTitle?: string;
  packId?: string;
  source?: CharacterPackSource;
  onChanged: (item?: CharacterGalleryItem) => Promise<void> | void;
  onDeleteItem: (item: CharacterGalleryItem) => Promise<boolean | void> | boolean | void;
  onImportImage: () => Promise<void> | void;
  onLayoutChange?: (layout: CharacterGalleryCanvasLayout) => Promise<void> | void;
  onPreviewItem: (item: CharacterGalleryItem) => void;
}

const KIND_OPTIONS: Array<{ value: CharacterGalleryItemKind; label: string }> = [
  { value: 'reference', label: '参考' },
  { value: 'pose', label: '姿势' },
  { value: 'action', label: '动作' },
  { value: 'expression', label: '表情' },
  { value: 'outfit', label: '服装' },
  { value: 'prop', label: '道具' },
  { value: 'background', label: '背景' },
  { value: 'custom', label: '自定义' }
];

const VIEW_OPTIONS: Array<{ value: CharacterGalleryViewAngle; label: string }> = [
  { value: 'front', label: '正面' },
  { value: 'back', label: '背面' },
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'three-quarter-left', label: '左前 3/4' },
  { value: 'three-quarter-right', label: '右前 3/4' },
  { value: 'top', label: '俯视' },
  { value: 'bottom', label: '仰视' },
  { value: 'custom', label: '自定义角度' }
];

const REFERENCE_ROLE_OPTIONS: Array<{ value: CharacterGalleryReferenceRole; label: string }> = [
  { value: 'character', label: '角色一致性' },
  { value: 'pose', label: '姿势参考' },
  { value: 'style', label: '画风参考' },
  { value: 'prop', label: '道具参考' },
  { value: 'background', label: '背景参考' },
  { value: 'storyboard', label: '分镜参考' },
  { value: 'custom', label: '自定义' }
];

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1:1 1024' },
  { value: '1536x1024', label: '3:2 横图' },
  { value: '1024x1536', label: '2:3 竖图' },
  { value: 'auto', label: '自动' }
];

const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
];

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' }
];

function splitTags(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function getKindLabel(kind: CharacterGalleryItemKind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function getResultPath(response: ImageGenerationResponse): string | undefined {
  return response.filePath || response.artifacts?.find((artifact) => artifact.filePath)?.filePath;
}

function buildReferencePrompt(prompt: string, reference?: CharacterGalleryItem): string {
  if (!reference) return prompt;
  const details = [
    reference.title,
    reference.semantic?.action ? `动作：${reference.semantic.action}` : '',
    reference.semantic?.view ? `视角：${reference.semantic.view}` : '',
    reference.semantic?.emotion ? `表情：${reference.semantic.emotion}` : '',
    reference.tags?.length ? `标签：${reference.tags.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('；');
  return `${prompt}\n\n参考图信息：${details}。保持角色身份、比例、服装关键特征和画风一致。`;
}

function buildRequestPrompt(draft: ImageGenerationCanvasDraft, mode: 'edit' | 'generate', reference?: CharacterGalleryItem): string {
  const prompt = mode === 'generate' ? draft.prompt.trim() : buildReferencePrompt(draft.prompt.trim(), reference);
  const negativePrompt = draft.negativePrompt.trim();
  return negativePrompt ? `${prompt}\n\n避免：${negativePrompt}` : prompt;
}

function toGalleryDraft(draft: ImageGenerationCanvasDraft, response: ImageGenerationResponse): CharacterGalleryItemDraft {
  const kind = KIND_OPTIONS.some((option) => option.value === draft.kind) ? (draft.kind as CharacterGalleryItemKind) : 'reference';
  const view = VIEW_OPTIONS.some((option) => option.value === draft.view) ? (draft.view as CharacterGalleryViewAngle) : undefined;
  const referenceRole = REFERENCE_ROLE_OPTIONS.some((option) => option.value === draft.referenceRole) ? (draft.referenceRole as CharacterGalleryReferenceRole) : 'character';
  return {
    title: draft.title.trim() || 'AI 生成图片',
    kind,
    semantic: {
      ...(draft.action.trim() ? { action: draft.action.trim() } : {}),
      ...(view ? { view } : {}),
      ...(draft.emotion.trim() ? { emotion: draft.emotion.trim() } : {})
    },
    tags: splitTags(draft.tags),
    ai: {
      referenceRole,
      preserveIdentity: true,
      referenceStrength: 0.8,
      ...(draft.prompt.trim() ? { promptHint: draft.prompt.trim() } : {}),
      ...(draft.negativePrompt.trim() ? { negativePrompt: draft.negativePrompt.trim() } : {})
    },
    ...(response.revisedPrompt ? { description: `Revised prompt: ${response.revisedPrompt}` } : {})
  };
}

async function resolveImageProviderPreset(providerId: string, preferredPresetId?: string): Promise<ProviderPresetRecord | null> {
  const preset = await window.YUA.ai.resolveUsablePreset(providerId, preferredPresetId).catch(() => null);
  if (preset?.id) return preset;
  return null;
}

function buildInitialDraft(mode: 'edit' | 'generate', reference?: CharacterGalleryItem): ImageGenerationCanvasDraft {
  return {
    action: reference?.semantic?.action ?? '',
    emotion: reference?.semantic?.emotion ?? '',
    kind: reference?.kind ?? 'reference',
    modelId: 'gpt-image-2',
    negativePrompt: reference?.ai?.negativePrompt ?? '',
    outputFormat: 'png',
    prompt: reference?.ai?.promptHint ?? '',
    providerId: 'gpteam',
    quality: 'high',
    referenceRole: reference?.ai?.referenceRole ?? 'character',
    size: '1024x1024',
    tags: reference?.tags?.join(', ') ?? '',
    title: mode === 'edit' && reference ? `${reference.title} 变体` : '新角色状态',
    view: reference?.semantic?.view ?? ''
  };
}

function buildAssetView(item: CharacterGalleryItem): ImageGenerationCanvasAssetView {
  return {
    assetId: item.id,
    badges: [getKindLabel(item.kind), item.origin?.type === 'ai-edited' ? '派生' : item.origin?.type === 'ai-generated' ? 'AI' : item.origin?.type === 'import' ? '导入' : '图集'].filter(Boolean),
    imageSrc: makeResSrc(item.source.localPath),
    metadata: {
      kind: item.kind,
      originType: item.origin?.type
    },
    parentAssetId: item.origin?.parentId,
    subtitle: item.semantic?.action || item.semantic?.view || item.semantic?.emotion || item.tags?.join(', ') || item.id,
    thumbnailSrc: makeResSrc(item.thumbnail?.localPath || item.source.localPath),
    title: item.title
  };
}

function IconTooltipButton({
  children,
  label,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props} aria-label={props['aria-label'] ?? label} className={props.size === 'sm' ? `w-8 h-8 ${className ?? ''}` : className}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const CharacterGalleryCanvas = forwardRef<ImageGenerationCanvasHandle, CharacterGalleryCanvasProps>(function CharacterGalleryCanvas(
  { canWrite, items, layout, loading, lockedTitle, onChanged, onDeleteItem, onImportImage, onLayoutChange, onPreviewItem, packId, source },
  ref
): JSX.Element {
  const onDeleteItemRef = useRef(onDeleteItem);

  useEffect(() => {
    onDeleteItemRef.current = onDeleteItem;
  }, [onDeleteItem]);

  const fieldOptions = useMemo<ImageGenerationCanvasFieldOptions>(
    () => ({
      kinds: KIND_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
      outputFormats: OUTPUT_FORMAT_OPTIONS,
      qualities: QUALITY_OPTIONS,
      referenceRoles: REFERENCE_ROLE_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
      sizes: SIZE_OPTIONS,
      views: VIEW_OPTIONS.map((option) => ({ label: option.label, value: option.value }))
    }),
    []
  );

  const adapter = useMemo<ImageGenerationCanvasAdapter<CharacterGalleryItem>>(
    () => ({
      buildInitialDraft: ({ mode, referenceAsset }) => buildInitialDraft(mode, referenceAsset),
      deleteAsset: async (asset) => {
        return onDeleteItemRef.current(asset);
      },
      getAssetView: buildAssetView,
      submitGeneration: async ({ draft, mode, referenceAsset }) => {
        const prompt = draft.prompt.trim();
        if (!prompt) {
          throw new Error('请先填写图片提示词');
        }
        if (mode === 'edit' && !referenceAsset) {
          throw new Error('图生图需要一张参考图');
        }
        const resolvedPreset = await resolveImageProviderPreset(draft.providerId, draft.providerPresetId);
        if (!resolvedPreset) {
          throw new Error(`Provider ${draft.providerId} 没有可用图片预设，请先配置 API Key`);
        }

        const finalPrompt = buildRequestPrompt(draft, mode, referenceAsset);
        const common = {
          model: draft.modelId || 'gpt-image-2',
          outputFormat: draft.outputFormat,
          prompt: finalPrompt,
          providerId: draft.providerId,
          providerPresetId: resolvedPreset.id,
          quality: draft.quality,
          responseFormat: 'b64_json' as const,
          size: draft.size
        };

        console.info('[CharacterGalleryCanvas] final image prompt before request', {
          mode,
          model: common.model,
          outputFormat: common.outputFormat,
          providerId: common.providerId,
          providerPresetId: common.providerPresetId,
          quality: common.quality,
          referenceImagePath: mode === 'edit' ? referenceAsset?.source.localPath : undefined,
          size: common.size,
          prompt: finalPrompt
        });

        const response =
          mode === 'edit' && referenceAsset
            ? await window.YUA.ai.editImage({
                ...common,
                imagePaths: [referenceAsset.source.localPath]
              })
            : await window.YUA.ai.generateImageArtifact(common);
        const filePath = getResultPath(response);
        if (!filePath) {
          throw new Error('接口没有返回可导入的本地图片文件');
        }

        const imported = await window.YUA.persona.importCharacterGalleryItem({
          packId,
          source,
          filePath,
          draft: toGalleryDraft(draft, response)
        });
        if (!imported?.item) {
          throw new Error('生成结果导入图集失败');
        }

        const updated = await window.YUA.persona.updateCharacterGalleryItem({
          packId,
          source,
          itemId: imported.item.id,
          patch: {
            origin: {
              type: mode === 'edit' ? 'ai-edited' : 'ai-generated',
              ...(mode === 'edit' && referenceAsset ? { parentId: referenceAsset.id } : {}),
              model: response.model || common.model,
              prompt: finalPrompt
            }
          }
        });

        console.info('[CharacterGalleryCanvas] gallery image imported', {
          itemId: updated?.item?.id ?? imported.item.id,
          sourcePath: updated?.item?.source.localPath ?? imported.item.source.localPath,
          temporaryGeneratedPath: filePath
        });

        return updated?.item ?? imported.item;
      }
    }),
    [packId, source]
  );

  const handleLayoutChange = useCallback(
    async (nextLayout: ImageGenerationCanvasLayout): Promise<void> => {
      await onLayoutChange?.(nextLayout as CharacterGalleryCanvasLayout);
    },
    [onLayoutChange]
  );

  return (
    <ImageGenerationCanvas
      ref={ref}
      adapter={adapter}
      assets={items}
      className="h-[640px]"
      fieldOptions={fieldOptions}
      layout={layout as ImageGenerationCanvasLayout | null | undefined}
      loading={loading}
      lockedTitle={lockedTitle}
      onAssetCreated={onChanged}
      onLayoutChange={canWrite ? handleLayoutChange : undefined}
      onPreviewAsset={onPreviewItem}
      readonly={!canWrite}
      renderToolbar={(actions) => (
        <>
          <Button type="button" size="sm" onClick={() => void onImportImage()} disabled={!canWrite} title={lockedTitle}>
            <TbPhotoPlus />
            导入图片
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={actions.createGenerateForm} disabled={!canWrite} title={lockedTitle}>
            <TbSparkles />
            AI 新建
          </Button>
          <IconTooltipButton label="自动整理" type="button" size="sm" variant="outline" onClick={actions.autoLayout}>
            <TbLayout />
          </IconTooltipButton>
          <IconTooltipButton label="适配视图" type="button" size="sm" variant="outline" onClick={actions.fitView}>
            <TbMaximize />
          </IconTooltipButton>
        </>
      )}
    />
  );
});

export default CharacterGalleryCanvas;
