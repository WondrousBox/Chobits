import { TbLoader2, TbPhotoPlus, TbTrash } from 'react-icons/tb';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { ImageGenerationCanvasDraft, ImageGenerationFormNodeData } from '../types';

function optionItems(options: Array<{ label: string; value: string }>): JSX.Element[] {
  return options.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
}

export default function ImageGenerationFormNode({ id, data, selected }: NodeProps<ImageGenerationFormNodeData>): JSX.Element {
  const update = (patch: Partial<ImageGenerationCanvasDraft>): void => data.onDraftChange(id, patch);
  const running = data.status === 'running';

  return (
    <div
      className={cn(
        'relative w-[440px] rounded-lg border border-solid bg-muted text-foreground shadow-md transition-all duration-200',
        selected ? 'border-primary ring-2 ring-primary' : 'border-ring',
        data.status === 'failed' ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-400/70' : undefined,
        running ? 'image-generation-form-node-running border-amber-400 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]' : undefined
      )}
    >
      {data.mode === 'edit' ? <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-rose-400" /> : null}
      <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-background p-3">
        <div>
          <div className="text-sm font-medium">{data.mode === 'edit' ? '参考图生成' : 'AI 新建图片'}</div>
          <div className="text-xs text-muted-foreground">{data.mode === 'edit' ? `参考：${data.reference?.title ?? '未选择'}` : '无参考图'}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="nodrag w-8 h-8" onClick={() => data.onRemove(id)} disabled={running} aria-label="移除表单">
              <TbTrash />
            </Button>
          </TooltipTrigger>
          <TooltipContent>移除表单</TooltipContent>
        </Tooltip>
      </div>

      <div className="nodrag space-y-3 p-3">
        <ProviderModelSelect
          providerId={data.draft.providerId}
          modelId={data.draft.modelId}
          onChange={(providerId, modelId) => update({ providerId, modelId })}
          modelTypes={['image']}
          providerFilter={(provider) => provider.capabilities?.imageGeneration === true}
          className="max-w-full"
          buttonSize="sm"
          showModelDetails
        />

        {data.reference ? (
          <div className="flex gap-3 rounded-md border bg-muted/40 p-2">
            <img src={data.reference.thumbnailSrc || data.reference.imageSrc} alt={data.reference.title} className="h-20 w-16 rounded border bg-muted object-contain" draggable={false} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{data.reference.title}</div>
              {data.reference.subtitle ? <div className="truncate text-xs text-muted-foreground">{data.reference.subtitle}</div> : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">名称</Label>
            <Input className="h-8" value={data.draft.title} onChange={(event) => update({ title: event.target.value })} disabled={running} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <Select value={data.draft.kind} onValueChange={(value) => update({ kind: value })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{optionItems(data.fieldOptions.kinds)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">参考角色</Label>
            <Select value={data.draft.referenceRole} onValueChange={(value) => update({ referenceRole: value })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{optionItems(data.fieldOptions.referenceRoles)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">动作</Label>
            <Input className="h-8" value={data.draft.action} onChange={(event) => update({ action: event.target.value })} disabled={running} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">视角</Label>
            <Select value={data.draft.view || 'none'} onValueChange={(value) => update({ view: value === 'none' ? '' : value })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未设置</SelectItem>
                {optionItems(data.fieldOptions.views)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">表情</Label>
            <Input className="h-8" value={data.draft.emotion} onChange={(event) => update({ emotion: event.target.value })} disabled={running} />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">尺寸</Label>
            <Select value={data.draft.size} onValueChange={(value) => update({ size: value })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{optionItems(data.fieldOptions.sizes)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">质量</Label>
            <Select value={data.draft.quality} onValueChange={(value) => update({ quality: value })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{optionItems(data.fieldOptions.qualities)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">格式</Label>
            <Select value={data.draft.outputFormat} onValueChange={(value) => update({ outputFormat: value as ImageGenerationCanvasDraft['outputFormat'] })} disabled={running}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{optionItems(data.fieldOptions.outputFormats)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">提示词</Label>
          <Textarea className="min-h-24" value={data.draft.prompt} onChange={(event) => update({ prompt: event.target.value })} disabled={running} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">负面提示</Label>
            <Input className="h-8" value={data.draft.negativePrompt} onChange={(event) => update({ negativePrompt: event.target.value })} disabled={running} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">标签</Label>
            <Input className="h-8" value={data.draft.tags} onChange={(event) => update({ tags: event.target.value })} disabled={running} />
          </div>
        </div>

        {data.errorMessage ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{data.errorMessage}</div> : null}

        <Button type="button" size="sm" className="w-full justify-center" onClick={() => data.onSubmit(id)} disabled={data.readonly || running}>
          {running ? <TbLoader2 className="animate-spin" /> : <TbPhotoPlus />}
          {data.mode === 'edit' ? '图生图加入图集' : '文生图加入图集'}
        </Button>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-sky-400" />
    </div>
  );
}
