import React, { useMemo, useState } from 'react';
import { TbExternalLink, TbFileExport, TbFolderOpen, TbLoader2, TbMovie } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function ensureWebmPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) return '';
  return /\.webm$/i.test(trimmed) ? trimmed : `${trimmed}.webm`;
}

function defaultWebmPath(inputPath: string): string {
  const slashIndex = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'));
  const dir = slashIndex >= 0 ? inputPath.slice(0, slashIndex + 1) : '';
  const name = slashIndex >= 0 ? inputPath.slice(slashIndex + 1) : inputPath;
  const stem = name.replace(/\.[^./\\]+$/, '') || 'converted';
  return `${dir}${stem}.webm`;
}

export const MovToWebmConverterItem: React.FC<{
  selected: boolean;
  onSelect: () => void;
}> = ({ selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <TbMovie className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">MOV 透明转 WebM</div>
      <div className="line-clamp-1 text-xs text-muted-foreground">调用 FFmpeg Alpha 转码入口</div>
    </div>
  </div>
);

export const MovToWebmConverterDetailContent: React.FC = () => {
  const [inputPath, setInputPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [lastOutputPath, setLastOutputPath] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const normalizedOutputPath = useMemo(() => ensureWebmPath(outputPath), [outputPath]);
  const canConvert = inputPath.trim().length > 0 && normalizedOutputPath.length > 0 && !running;

  const pickInput = async (): Promise<void> => {
    const result = await window.YUA.file['file:pickFile']({
      filters: [
        { name: 'MOV / QuickTime', extensions: ['mov'] },
        { name: 'Video', extensions: ['mov', 'mp4', 'm4v'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      multi: false
    });

    if (result.canceled || !result.path) return;

    setInputPath(result.path);
    setErrorMessage('');
    if (!outputPath.trim()) {
      setOutputPath(defaultWebmPath(result.path));
    }
  };

  const pickOutput = async (): Promise<void> => {
    const result = await window.YUA.file['file:saveFile']({
      title: '保存 WebM 文件',
      defaultPath: normalizedOutputPath || (inputPath ? defaultWebmPath(inputPath) : undefined),
      filters: [
        { name: 'WebM', extensions: ['webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.path) return;

    setOutputPath(ensureWebmPath(result.path));
    setErrorMessage('');
  };

  const convert = async (): Promise<void> => {
    if (!canConvert) return;

    const input = inputPath.trim();
    const output = normalizedOutputPath;
    setRunning(true);
    setErrorMessage('');

    try {
      await window.YUA.ffmpeg.convertMovToWebmWithAlpha({
        inputPath: input,
        outputPath: output
      });
      setOutputPath(output);
      setLastOutputPath(output);
      toast.success('转换完成', {
        description: basename(output)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      toast.error('转换失败', {
        description: message
      });
    } finally {
      setRunning(false);
    }
  };

  const revealOutput = async (): Promise<void> => {
    const target = lastOutputPath || normalizedOutputPath;
    if (!target) return;
    await window.YUA.file['file:reveal'](target);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">MOV 透明转 WebM</h3>
        <p className="text-sm text-muted-foreground">VP9 / yuva420p</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="mov-alpha-input">
            输入视频
          </label>
          <div className="flex gap-2">
            <Input id="mov-alpha-input" value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder="MOV 文件路径" disabled={running} />
            <Button type="button" variant="outline" onClick={pickInput} disabled={running}>
              <TbFolderOpen />
              选择
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="mov-alpha-output">
            输出 WebM
          </label>
          <div className="flex gap-2">
            <Input id="mov-alpha-output" value={outputPath} onChange={(event) => setOutputPath(event.target.value)} placeholder="WebM 输出路径" disabled={running} />
            <Button type="button" variant="outline" onClick={pickOutput} disabled={running}>
              <TbFileExport />
              保存到
            </Button>
          </div>
        </div>

        {errorMessage ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={convert} disabled={!canConvert}>
            {running ? <TbLoader2 className="animate-spin" /> : <TbFileExport />}
            {running ? '转换中' : '开始转换'}
          </Button>
          {(lastOutputPath || normalizedOutputPath) && (
            <Button type="button" variant="outline" onClick={revealOutput} disabled={running}>
              <TbExternalLink />
              打开位置
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovToWebmConverterDetailContent;
