import { Archive, ChevronDown, FolderOpen, FolderPlus, ImagePlus, Loader2, PackageOpen, SmilePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { EmojiPackImportResult, EmojiPackSummary } from '../../../electron/main/handlers/emoji-packs/types';

interface EmojiPackButtonProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

function extractDroppedPaths(files: File[]): string[] {
  return files.map((file) => (file as File & { path?: string }).path).filter((filePath): filePath is string => Boolean(filePath));
}

function summarizeImportResults(results: EmojiPackImportResult[]): void {
  const successCount = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok);

  if (successCount > 0) {
    toast.success(`已导入 ${successCount} 个表情包`);
  }

  if (failed.length > 0) {
    toast.error('部分表情包导入失败', {
      description: failed
        .slice(0, 2)
        .map((item) => item.error || item.sourcePath)
        .join('\n')
    });
  }
}

function hasSuccessfulImport(results: EmojiPackImportResult[]): boolean {
  return results.some((item) => item.ok);
}

export default function EmojiPackButton({ enabled, onEnabledChange }: EmojiPackButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<EmojiPackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const packCount = packs.length;
  const hasPacks = packCount > 0;

  const refreshPacks = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setPacks((await window.YUA.emojiPacks['emojiPacks:listPacks']()) || []);
    } catch {
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  const setEnabled = useCallback(
    (nextEnabled: boolean): void => {
      onEnabledChange(nextEnabled);
    },
    [onEnabledChange]
  );

  const importFromPaths = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!paths.length) {
        toast.error('没有拿到可导入路径');
        return;
      }
      setImporting(true);
      try {
        const results = await window.YUA.emojiPacks['emojiPacks:importFromPaths']({ paths });
        summarizeImportResults(results);
        await refreshPacks();
        if (hasSuccessfulImport(results)) {
          onEnabledChange(true);
        }
      } finally {
        setImporting(false);
      }
    },
    [onEnabledChange, refreshPacks]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      void importFromPaths(extractDroppedPaths(acceptedFiles));
    },
    [importFromPaths]
  );

  const dropzone = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop
  });

  const pickFolder = async (): Promise<void> => {
    setImporting(true);
    try {
      const result = await window.YUA.emojiPacks['emojiPacks:pickFolderAndImport']();
      if (!result.canceled) {
        summarizeImportResults(result.results);
        await refreshPacks();
        if (hasSuccessfulImport(result.results)) {
          onEnabledChange(true);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const pickArchive = async (): Promise<void> => {
    setImporting(true);
    try {
      const result = await window.YUA.emojiPacks['emojiPacks:pickArchiveAndImport']();
      if (!result.canceled) {
        summarizeImportResults(result.results);
        await refreshPacks();
        if (hasSuccessfulImport(result.results)) {
          onEnabledChange(true);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const statusText = useMemo(() => {
    if (loading) return '扫描中';
    if (!hasPacks) return '未导入';
    return `${packCount} 个包`;
  }, [hasPacks, loading, packCount]);

  return (
    <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-full border border-border/70 bg-background/70">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 rounded-none border-0', enabled && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
            onClick={() => void setEnabled(!enabled)}
            aria-label={enabled ? '关闭表情包回复' : '开启表情包回复'}
          >
            {enabled ? <SmilePlus className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{enabled ? '表情包回复已开启' : '表情包回复已关闭'}</TooltipContent>
      </Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-7 rounded-none border-0 border-l border-border/70" aria-label="管理表情包">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PackageOpen className="h-4 w-4" />
                  <span>表情包</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{statusText}</span>
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={(checked) => void setEnabled(checked)} aria-label={enabled ? '关闭表情包回复' : '开启表情包回复'} />
            </div>

            <div
              {...dropzone.getRootProps()}
              className={cn(
                'mt-3 flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-center transition-colors',
                dropzone.isDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
              )}
            >
              <input {...dropzone.getInputProps()} />
              {importing ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <Archive className="mb-2 h-5 w-5 text-muted-foreground" />}
              <div className="text-xs font-medium">{dropzone.isDragActive ? '松开导入' : '拖入压缩包或文件夹'}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">zip / 7z / rar / tar / 图片目录</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={importing} onClick={() => void pickFolder()}>
                <FolderPlus className="h-3.5 w-3.5" />
                选择文件夹
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={importing} onClick={() => void pickArchive()}>
                <Archive className="h-3.5 w-3.5" />
                选择压缩包
              </Button>
            </div>
          </div>

          {hasPacks && (
            <>
              <Separator />
              <div className="max-h-48 overflow-y-auto py-1">
                {packs.map((pack) => (
                  <div key={pack.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {pack.previewUrls[0] ? <img src={pack.previewUrls[0]} alt={pack.name} className="h-full w-full object-cover" /> : <PackageOpen className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{pack.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {pack.totalFileCount} 张 · {pack.topLevelFolders.slice(0, 4).join('、') || '根目录'}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => {
                        void window.YUA.emojiPacks['emojiPacks:revealPack']({ packId: pack.id });
                      }}
                      aria-label="在文件管理器中显示"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
