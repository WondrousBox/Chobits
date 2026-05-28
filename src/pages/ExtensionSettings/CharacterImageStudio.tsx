import type { ImageGenerationResponse } from '@packages/ai/types';
import type { CharacterGalleryItem, CharacterGalleryItemDraft, CharacterGalleryItemKind, CharacterGalleryReferenceRole, CharacterGalleryViewAngle } from '@packages/sprite-core/character-gallery';
import type { CharacterPackSource } from '@packages/sprite-core/character-pack-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbLoader2, TbPhotoCog, TbPhotoPlus, TbReplace } from 'react-icons/tb';
import { toast } from 'sonner';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

interface CharacterImageStudioProps {
  canWrite: boolean;
  lockedTitle?: string;
  packId?: string;
  selected?: CharacterGalleryItem | null;
  source?: CharacterPackSource;
  onChanged: (item?: CharacterGalleryItem) => Promise<void> | void;
}

interface StudioDraft {
  title: string;
  kind: CharacterGalleryItemKind;
  view: CharacterGalleryViewAngle | '';
  action: string;
  emotion: string;
  tags: string;
  prompt: string;
  negativePrompt: string;
  referenceRole: CharacterGalleryReferenceRole;
}

interface ImageProviderPreset {
  id: string;
  providerId: string;
  name: string;
}

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
  { value: 'custom', label: '自定义' }
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

function emptyDraft(selected?: CharacterGalleryItem | null): StudioDraft {
  return {
    title: selected ? `${selected.title} 变体` : '新角色状态',
    kind: selected?.kind ?? 'reference',
    view: selected?.semantic?.view ?? '',
    action: selected?.semantic?.action ?? '',
    emotion: selected?.semantic?.emotion ?? '',
    tags: selected?.tags?.join(', ') ?? '',
    prompt: selected?.ai?.promptHint ?? '',
    negativePrompt: selected?.ai?.negativePrompt ?? '',
    referenceRole: selected?.ai?.referenceRole ?? 'character'
  };
}

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

function toGalleryDraft(draft: StudioDraft, response: ImageGenerationResponse): CharacterGalleryItemDraft {
  return {
    title: draft.title.trim() || 'AI 生成图片',
    kind: draft.kind,
    semantic: {
      ...(draft.action.trim() ? { action: draft.action.trim() } : {}),
      ...(draft.view ? { view: draft.view } : {}),
      ...(draft.emotion.trim() ? { emotion: draft.emotion.trim() } : {})
    },
    tags: splitTags(draft.tags),
    ai: {
      referenceRole: draft.referenceRole,
      preserveIdentity: true,
      referenceStrength: 0.8,
      ...(draft.prompt.trim() ? { promptHint: draft.prompt.trim() } : {}),
      ...(draft.negativePrompt.trim() ? { negativePrompt: draft.negativePrompt.trim() } : {})
    },
    ...(response.revisedPrompt ? { description: `Revised prompt: ${response.revisedPrompt}` } : {})
  };
}

function getResultPath(response: ImageGenerationResponse): string | undefined {
  return response.filePath || response.artifacts?.find((artifact) => artifact.filePath)?.filePath;
}

function toImageSrc(pathOrUrl?: string): string {
  if (!pathOrUrl) return '';
  if (/^(https?:|data:|res:)/i.test(pathOrUrl)) return pathOrUrl;
  return makeResSrc(pathOrUrl);
}

async function resolveImageProviderPreset(providerId: string): Promise<ImageProviderPreset | null> {
  const preset = (await window.YUA.ai.resolveUsablePreset(providerId).catch(() => null)) as ImageProviderPreset | null;
  if (preset?.id) return preset;
  toast.warning('请先配置图片服务 API Key', {
    description: `当前提供商 ${providerId} 还没有可用的预设，请保存 API Key 后再生成。`,
    action: {
      label: '去配置',
      onClick: () => {
        void window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: providerId });
      }
    }
  });
  return null;
}

function buildReferencePrompt(prompt: string, selected?: CharacterGalleryItem | null): string {
  if (!selected) return prompt;
  const details = [
    selected.title,
    selected.semantic?.action ? `动作：${selected.semantic.action}` : '',
    selected.semantic?.view ? `视角：${selected.semantic.view}` : '',
    selected.semantic?.emotion ? `表情：${selected.semantic.emotion}` : '',
    selected.tags?.length ? `标签：${selected.tags.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('；');
  return `${prompt}\n\n参考图信息：${details}。保持角色身份、比例、服装关键特征和画风一致。`;
}

function buildRequestPrompt(draft: StudioDraft, mode: 'edit-add' | 'edit-replace' | 'generate', selected?: CharacterGalleryItem | null): string {
  const prompt = mode === 'generate' ? draft.prompt.trim() : buildReferencePrompt(draft.prompt.trim(), selected);
  const negativePrompt = draft.negativePrompt.trim();
  return negativePrompt ? `${prompt}\n\n避免：${negativePrompt}` : prompt;
}

function logImageRequest(label: string, payload: Record<string, unknown>): void {
  console.info(`[CharacterImageStudio] ${label}`, payload);
}

export default function CharacterImageStudio({ canWrite, lockedTitle, packId, selected, source, onChanged }: CharacterImageStudioProps): JSX.Element {
  const [providerId, setProviderId] = useState('gpteam');
  const [modelId, setModelId] = useState('gpt-image-2');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('high');
  const [outputFormat, setOutputFormat] = useState<'png' | 'webp' | 'jpeg'>('png');
  const [draft, setDraft] = useState<StudioDraft>(() => emptyDraft(selected));
  const [submitting, setSubmitting] = useState<'edit-add' | 'edit-replace' | 'generate' | null>(null);
  const [lastResult, setLastResult] = useState<ImageGenerationResponse | null>(null);

  const selectedPreview = useMemo(() => (selected ? makeResSrc(selected.source.localPath) : ''), [selected]);
  const lastResultPath = lastResult ? getResultPath(lastResult) : undefined;
  const lastResultSrc = lastResultPath ? makeResSrc(lastResultPath) : toImageSrc(lastResult?.imageUrl);

  useEffect(() => {
    setDraft(emptyDraft(selected));
  }, [selected]);

  const runRequest = useCallback(
    async (mode: 'edit-add' | 'edit-replace' | 'generate'): Promise<void> => {
      if (!canWrite) return;
      const prompt = draft.prompt.trim();
      if (!prompt) {
        toast.warning('请先填写图片提示词');
        return;
      }
      if (mode !== 'generate' && !selected) {
        toast.warning('请先选择一张参考图');
        return;
      }
      setSubmitting(mode);
      try {
        const resolvedPreset = await resolveImageProviderPreset(providerId);
        if (!resolvedPreset) return;

        const common = {
          model: modelId,
          outputFormat,
          prompt: buildRequestPrompt(draft, mode, selected),
          providerId,
          providerPresetId: resolvedPreset.id,
          quality,
          responseFormat: 'b64_json' as const,
          size
        };
        logImageRequest('final image prompt before request', {
          mode,
          model: common.model,
          outputFormat: common.outputFormat,
          providerId: common.providerId,
          providerPresetId: common.providerPresetId,
          quality: common.quality,
          referenceImagePath: mode === 'generate' ? undefined : selected?.source.localPath,
          size: common.size,
          prompt: common.prompt
        });
        const response =
          mode === 'generate'
            ? await window.YUA.ai.generateImageArtifact(common)
            : await window.YUA.ai.editImage({
                ...common,
                imagePaths: selected ? [selected.source.localPath] : []
              });
        const filePath = getResultPath(response);
        if (!filePath) {
          throw new Error('接口没有返回可导入的本地图片文件');
        }

        setLastResult(response);
        if (mode === 'edit-replace' && selected) {
          const result = await window.YUA.persona.replaceCharacterGalleryItemImage({
            packId,
            source,
            itemId: selected.id,
            filePath,
            origin: {
              type: 'ai-edited',
              parentId: selected.id,
              model: response.model || modelId,
              prompt: common.prompt
            }
          });
          if (!result?.ok) throw new Error('替换图集图片失败');
          if (result.item?.source?.localPath) {
            logImageRequest('gallery image replaced', {
              itemId: result.item.id,
              title: result.item.title,
              sourcePath: result.item.source.localPath,
              thumbnailPath: result.item.thumbnail?.localPath,
              temporaryGeneratedPath: filePath
            });
          }
          await onChanged(result.item);
          toast.success('AI 编辑结果已替换当前图集图片', {
            description: result.item?.source?.localPath
          });
          return;
        }

        const imported = await window.YUA.persona.importCharacterGalleryItem({
          packId,
          source,
          filePath,
          draft: toGalleryDraft(draft, response)
        });
        if (imported?.item) {
          logImageRequest('gallery image imported', {
            itemId: imported.item.id,
            title: imported.item.title,
            sourcePath: imported.item.source.localPath,
            thumbnailPath: imported.item.thumbnail?.localPath,
            temporaryGeneratedPath: filePath
          });
          const updated = await window.YUA.persona.updateCharacterGalleryItem({
            packId,
            source,
            itemId: imported.item.id,
            patch: {
              origin: {
                type: mode === 'generate' ? 'ai-generated' : 'ai-edited',
                ...(selected ? { parentId: selected.id } : {}),
                model: response.model || modelId,
                prompt: common.prompt
              }
            }
          });
          await onChanged(updated?.item ?? imported.item);
        } else {
          await onChanged();
        }
        toast.success(mode === 'generate' ? 'AI 生成图片已加入图集' : 'AI 编辑结果已加入图集', {
          description: imported?.item?.source?.localPath
        });
      } catch (error) {
        toast.error('AI 图片任务失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setSubmitting(null);
      }
    },
    [canWrite, draft, modelId, onChanged, outputFormat, packId, providerId, quality, selected, size, source]
  );

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">AI 制图工作台</div>
          <div className="text-xs text-muted-foreground">对接 GPTeam /images/generations 与 /images/edits，结果会直接写入角色图集。</div>
        </div>
        <ProviderModelSelect
          providerId={providerId}
          modelId={modelId}
          onChange={(nextProviderId, nextModelId) => {
            setProviderId(nextProviderId);
            setModelId(nextModelId);
          }}
          modelTypes={['image']}
          providerFilter={(provider) => provider.capabilities?.imageGeneration === true}
          className="max-w-[260px]"
          showModelDetails
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border bg-muted">
            {selectedPreview ? (
              <img src={selectedPreview} alt={selected?.title} className="aspect-square w-full object-contain" draggable={false} />
            ) : (
              <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">未选择参考图</div>
            )}
          </div>
          {lastResultSrc ? (
            <div className="overflow-hidden rounded-md border bg-muted">
              <img src={lastResultSrc} alt="AI result" className="aspect-square w-full object-contain" draggable={false} />
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">名称</Label>
              <Input className="h-8" value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">类型</Label>
              <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as CharacterGalleryItemKind }))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">参考角色</Label>
              <Select value={draft.referenceRole} onValueChange={(value) => setDraft((prev) => ({ ...prev, referenceRole: value as CharacterGalleryReferenceRole }))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">动作</Label>
              <Input className="h-8" value={draft.action} onChange={(event) => setDraft((prev) => ({ ...prev, action: event.target.value }))} placeholder="walk / idle / jump" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">视角</Label>
              <Select value={draft.view || 'none'} onValueChange={(value) => setDraft((prev) => ({ ...prev, view: value === 'none' ? '' : (value as CharacterGalleryViewAngle) }))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未设置</SelectItem>
                  {VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">表情</Label>
              <Input className="h-8" value={draft.emotion} onChange={(event) => setDraft((prev) => ({ ...prev, emotion: event.target.value }))} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">尺寸</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">质量</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">格式</Label>
              <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as 'png' | 'webp' | 'jpeg')}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">提示词</Label>
            <Textarea
              className="min-h-24"
              value={draft.prompt}
              onChange={(event) => setDraft((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder="例如：保持角色一致，生成向右奔跑的 3/4 视角动作参考，透明背景，完整身体，适合作为桌面精灵状态设计。"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">负面提示</Label>
              <Input className="h-8" value={draft.negativePrompt} onChange={(event) => setDraft((prev) => ({ ...prev, negativePrompt: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">标签</Label>
              <Input className="h-8" value={draft.tags} onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder="多个标签用逗号分隔" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void runRequest('generate')} disabled={!canWrite || !!submitting} title={lockedTitle}>
              {submitting === 'generate' ? <TbLoader2 className="animate-spin" /> : <TbPhotoPlus />}
              文生图加入图集
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void runRequest('edit-add')} disabled={!canWrite || !selected || !!submitting} title={lockedTitle}>
              {submitting === 'edit-add' ? <TbLoader2 className="animate-spin" /> : <TbPhotoCog />}
              图生图加入图集
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void runRequest('edit-replace')} disabled={!canWrite || !selected || !!submitting} title={lockedTitle}>
              {submitting === 'edit-replace' ? <TbLoader2 className="animate-spin" /> : <TbReplace />}
              替换当前图
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
