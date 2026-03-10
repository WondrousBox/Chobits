/**
 * 精灵视频编辑器
 *
 * 用于处理用户上传的精灵视频：
 * 1. 视频预览 + 时间轴
 * 2. 片段标记（开始、循环开始、循环结束、结束）
 * 3. 背景抠图（色度键）
 * 4. 转码为 WebM（含透明通道）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbColorPicker, TbCut, TbEye, TbEyeOff, TbPlayerPause, TbPlayerPlay, TbReload, TbTrash, TbZoomIn, TbZoomOut } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

// 片段标记类型
export interface SegmentMarkers {
  start: number; // 开始时间 (ms)
  loopStart: number; // 循环开始时间 (ms)
  loopEnd: number; // 循环结束时间 (ms)
  end: number; // 结束时间 (ms)
}

// 背景抠图设置
export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // 十六进制颜色值，如 "#00ff00"
  similarity: number; // 相似度阈值 0-100
  blend: number; // 混合/边缘羽化 1-100
}

// 编辑器配置
export interface SpriteVideoConfig {
  inputPath: string;
  segments: SegmentMarkers;
  chromaKey: ChromaKeySettings;
  eventType?: string;
  title?: string;
}

// 格式化时间为 mm:ss.ms
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

// 解析时间字符串为毫秒
function parseTime(str: string): number {
  const match = str.match(/^(\d+):(\d+)\.?(\d*)$/);
  if (!match) return 0;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const ms = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) * 10 : 0;
  return minutes * 60 * 1000 + seconds * 1000 + ms;
}

interface SpriteVideoEditorProps {
  initialConfig?: Partial<SpriteVideoConfig>;
  onConfigChange?: (config: SpriteVideoConfig) => void;
  onProcess?: (config: SpriteVideoConfig) => Promise<void>;
  isProcessing?: boolean;
}

export function SpriteVideoEditor({ initialConfig, onConfigChange, onProcess, isProcessing }: SpriteVideoEditorProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 视频状态
  const [inputPath, setInputPath] = useState<string>(initialConfig?.inputPath || '');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // 片段标记
  const [segments, setSegments] = useState<SegmentMarkers>(
    initialConfig?.segments || { start: 0, loopStart: 0, loopEnd: 0, end: 0 }
  );

  // 背景抠图设置
  const [chromaKey, setChromaKey] = useState<ChromaKeySettings>(
    initialConfig?.chromaKey || {
      enabled: false,
      color: '#00ff00', // 默认绿色
      similarity: 40,
      blend: 15
    }
  );

  // 元数据
  const [eventType, setEventType] = useState<string>(initialConfig?.eventType || '');
  const [title, setTitle] = useState<string>(initialConfig?.title || '');

  // 预览模式
  const [previewChroma, setPreviewChroma] = useState<boolean>(false);

  // 更新配置
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({
        inputPath,
        segments,
        chromaKey,
        eventType,
        title
      });
    }
  }, [inputPath, segments, chromaKey, eventType, title, onConfigChange]);

  // 视频加载完成
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration * 1000;
    setDuration(dur);
    // 初始化片段标记
    setSegments((prev) => ({
      start: prev.start || 0,
      loopStart: prev.loopStart || 0,
      loopEnd: prev.loopEnd || dur * 0.3,
      end: prev.end || dur
    }));
  }, []);

  // 时间更新
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime * 1000);
  }, []);

  // 播放/暂停
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // 跳转到指定时间
  const seekTo = useCallback((ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    setCurrentTime(ms);
  }, []);

  // 设置片段标记
  const setMarker = useCallback((marker: keyof SegmentMarkers, value: number) => {
    setSegments((prev) => ({ ...prev, [marker]: value }));
  }, []);

  // 在当前时间设置标记
  const setMarkerAtCurrent = useCallback((marker: keyof SegmentMarkers) => {
    setMarker(marker, currentTime);
  }, [currentTime, setMarker]);

  // 选择文件
  const handleSelectFile = useCallback(async () => {
    const pick = await window.YUA.file['file:pickFile']({
      filters: [
        { name: 'Videos', extensions: ['mov', 'mp4', 'mkv', 'avi', 'webm', 'm4v', 'ogg', 'ogv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      multi: false
    });
    if (!pick.canceled && pick.path) {
      setInputPath(pick.path);
      // 从文件名提取标题
      const name = pick.path.replace(/\\/g, '/').split('/').pop() || '';
      setTitle(name.replace(/\.[^.]+$/, ''));
      // 重置状态
      setSegments({ start: 0, loopStart: 0, loopEnd: 0, end: 0 });
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, []);

  // 色度键预览
  useEffect(() => {
    if (!previewChroma || !chromaKey.enabled || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const draw = () => {
      if (video.paused || video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 应用色度键效果（简化版预览）
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 解析目标颜色
      const targetR = parseInt(chromaKey.color.slice(1, 3), 16);
      const targetG = parseInt(chromaKey.color.slice(3, 5), 16);
      const targetB = parseInt(chromaKey.color.slice(5, 7), 16);
      const threshold = (chromaKey.similarity / 100) * 255;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const distance = Math.sqrt(
          Math.pow(r - targetR, 2) +
          Math.pow(g - targetG, 2) +
          Math.pow(b - targetB, 2)
        );

        if (distance < threshold) {
          data[i + 3] = 0; // 设置为透明
        } else if (distance < threshold + chromaKey.blend) {
          // 边缘羽化
          const alpha = ((distance - threshold) / chromaKey.blend) * 255;
          data[i + 3] = Math.min(data[i + 3], alpha);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationId = requestAnimationFrame(draw);
    };

    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    draw();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [previewChroma, chromaKey]);

  // 预览循环动画（播放 loopStart 到 loopEnd）
  const previewLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = segments.loopStart / 1000;
    video.play().catch(() => {});
    setIsPlaying(true);

    const checkLoop = () => {
      if (video.currentTime * 1000 >= segments.loopEnd) {
        video.currentTime = segments.loopStart / 1000;
      }
      if (!video.paused) {
        requestAnimationFrame(checkLoop);
      }
    };
    requestAnimationFrame(checkLoop);
  }, [segments]);

  // 预览完整动画（start → end）
  const previewFull = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = segments.start / 1000;
    video.play().catch(() => {});
    setIsPlaying(true);
  }, [segments]);

  return (
    <div className="space-y-4">
      {/* 文件选择 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground shrink-0 w-16">输入视频：</span>
        <Input
          className="flex-1 cursor-pointer"
          placeholder="点击选择视频文件..."
          value={inputPath}
          readOnly
          onClick={handleSelectFile}
        />
      </div>

      {inputPath && (
        <>
          {/* 视频预览区域 */}
          <div className="flex gap-4">
            {/* 视频播放器 */}
            <div className="flex-1">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4] max-h-[300px] flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="max-h-full max-w-full"
                  src={`file:///${inputPath}`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  muted
                  playsInline
                />
                {previewChroma && chromaKey.enabled && (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
              </div>

              {/* 播放控制 */}
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={togglePlay}>
                  {isPlaying ? <TbPlayerPause /> : <TbPlayerPlay />}
                </Button>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={previewLoop} title="预览循环片段">
                  循环预览
                </Button>
                <Button size="sm" variant="outline" onClick={previewFull} title="预览完整动画">
                  完整预览
                </Button>
              </div>
            </div>

            {/* 元数据设置 */}
            <div className="w-48 space-y-3">
              <div>
                <Label className="text-xs">动画标题</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="动画名称"
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs">事件类型</Label>
                <Input
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="如 idle, walk, click..."
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* 时间轴 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">片段标记</Label>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.5))}>
                  <TbZoomOut />
                </Button>
                <span className="text-xs text-muted-foreground">{zoomLevel}x</span>
                <Button size="sm" variant="ghost" onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))}>
                  <TbZoomIn />
                </Button>
              </div>
            </div>

            {/* 时间轴可视化 */}
            <div
              className="relative h-16 bg-muted rounded-lg overflow-hidden cursor-pointer"
              style={{ width: `${100 * zoomLevel}%`, minWidth: '100%' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                seekTo(percent * duration);
              }}
            >
              {/* 播放进度线 */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />

              {/* 片段标记 */}
              {/* 开始标记 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-green-500 cursor-ew-resize"
                style={{ left: `${(segments.start / duration) * 100}%` }}
                title={`开始: ${formatTime(segments.start)}`}
              />
              {/* 循环开始标记 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-blue-500 cursor-ew-resize"
                style={{ left: `${(segments.loopStart / duration) * 100}%` }}
                title={`循环开始: ${formatTime(segments.loopStart)}`}
              />
              {/* 循环结束标记 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-blue-500 cursor-ew-resize"
                style={{ left: `${(segments.loopEnd / duration) * 100}%` }}
                title={`循环结束: ${formatTime(segments.loopEnd)}`}
              />
              {/* 结束标记 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-red-500 cursor-ew-resize"
                style={{ left: `${(segments.end / duration) * 100}%` }}
                title={`结束: ${formatTime(segments.end)}`}
              />

              {/* 循环区域高亮 */}
              <div
                className="absolute top-0 bottom-0 bg-blue-500/20"
                style={{
                  left: `${(segments.loopStart / duration) * 100}%`,
                  width: `${((segments.loopEnd - segments.loopStart) / duration) * 100}%`
                }}
              />
            </div>

            {/* 标记时间输入 */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs text-green-600">开始</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={formatTime(segments.start)}
                    onChange={(e) => setMarker('start', parseTime(e.target.value))}
                    className="h-7 text-xs font-mono"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setMarkerAtCurrent('start')}>
                    <TbCut className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-blue-600">循环开始</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={formatTime(segments.loopStart)}
                    onChange={(e) => setMarker('loopStart', parseTime(e.target.value))}
                    className="h-7 text-xs font-mono"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setMarkerAtCurrent('loopStart')}>
                    <TbCut className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-blue-600">循环结束</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={formatTime(segments.loopEnd)}
                    onChange={(e) => setMarker('loopEnd', parseTime(e.target.value))}
                    className="h-7 text-xs font-mono"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setMarkerAtCurrent('loopEnd')}>
                    <TbCut className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-red-600">结束</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={formatTime(segments.end)}
                    onChange={(e) => setMarker('end', parseTime(e.target.value))}
                    className="h-7 text-xs font-mono"
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setMarkerAtCurrent('end')}>
                    <TbCut className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 背景抠图设置 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm">背景抠图（色度键）</Label>
              <Switch
                checked={chromaKey.enabled}
                onCheckedChange={(checked) => setChromaKey((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            {chromaKey.enabled && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">目标颜色</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={chromaKey.color}
                      onChange={(e) => setChromaKey((prev) => ({ ...prev, color: e.target.value }))}
                      className="w-10 h-8 rounded cursor-pointer border"
                    />
                    <Input
                      value={chromaKey.color}
                      onChange={(e) => setChromaKey((prev) => ({ ...prev, color: e.target.value }))}
                      className="h-8 font-mono text-xs"
                    />
                    {/* 预设颜色 */}
                    <div className="flex gap-1">
                      <button
                        className="w-6 h-6 rounded bg-green-500 border-2 border-transparent hover:border-white"
                        onClick={() => setChromaKey((prev) => ({ ...prev, color: '#00ff00' }))}
                        title="绿色幕布"
                      />
                      <button
                        className="w-6 h-6 rounded bg-blue-500 border-2 border-transparent hover:border-white"
                        onClick={() => setChromaKey((prev) => ({ ...prev, color: '#0000ff' }))}
                        title="蓝色幕布"
                      />
                      <button
                        className="w-6 h-6 rounded bg-black border-2 border-transparent hover:border-white"
                        onClick={() => setChromaKey((prev) => ({ ...prev, color: '#000000' }))}
                        title="黑色背景"
                      />
                      <button
                        className="w-6 h-6 rounded bg-white border-2 border-gray-300 hover:border-blue-500"
                        onClick={() => setChromaKey((prev) => ({ ...prev, color: '#ffffff' }))}
                        title="白色背景"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">相似度阈值: {chromaKey.similarity}%</Label>
                  <Slider
                    value={[chromaKey.similarity]}
                    onValueChange={([v]) => setChromaKey((prev) => ({ ...prev, similarity: v }))}
                    min={1}
                    max={100}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="text-xs">边缘羽化: {chromaKey.blend}%</Label>
                  <Slider
                    value={[chromaKey.blend]}
                    onValueChange={([v]) => setChromaKey((prev) => ({ ...prev, blend: v }))}
                    min={1}
                    max={50}
                    className="mt-2"
                  />
                </div>
              </div>
            )}

            {chromaKey.enabled && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewChroma(!previewChroma)}
                >
                  {previewChroma ? <TbEyeOff /> : <TbEye />}
                  {previewChroma ? '隐藏预览' : '预览抠图效果'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  预览效果为模拟显示，实际效果以转码结果为准
                </span>
              </div>
            )}
          </div>

          {/* 处理按钮 */}
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              variant="default"
              onClick={() => onProcess?.({
                inputPath,
                segments,
                chromaKey,
                eventType,
                title
              })}
              disabled={isProcessing || !inputPath}
            >
              {isProcessing ? '处理中…' : '转码并导入'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default SpriteVideoEditor;
