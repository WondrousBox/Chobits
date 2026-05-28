import { TbPhotoCog } from 'react-icons/tb';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

import type { ImageAssetNodeData } from '../types';

export default function ImageAssetNode({ data, id, selected }: NodeProps<ImageAssetNodeData>): JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('relative w-56 overflow-hidden rounded-lg border border-solid bg-muted text-foreground shadow-md transition-all duration-200', selected ? 'border-primary ring-2 ring-primary' : 'border-ring')}>
          <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-rose-400" />
          <button type="button" className="block w-full text-left" onClick={() => data.onPreview(data.asset.assetId)}>
            <div className="relative aspect-[4/5] bg-background/70">
              <img src={data.asset.thumbnailSrc || data.asset.imageSrc} alt={data.asset.title} className="h-full w-full object-contain" draggable={false} />
              {data.asset.badges?.length ? (
                <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                  {data.asset.badges.slice(0, 2).map((badge) => (
                    <span key={badge} className="rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-1 border-t border-border/60 bg-muted px-2 py-2">
              <div className="truncate text-sm font-medium leading-tight">{data.asset.title}</div>
              {data.asset.subtitle ? <div className="truncate text-xs text-muted-foreground">{data.asset.subtitle}</div> : null}
            </div>
          </button>
          <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-sky-400" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <ContextMenuItem className="flex items-center gap-2" disabled={data.readonly} onSelect={() => data.onCreateEditForm(data.asset.assetId, id)}>
          <TbPhotoCog />
          以此图生成
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
