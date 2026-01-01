import React, { useCallback, useEffect, useState } from 'react';
import { TbTools, TbTrash } from 'react-icons/tb';

import type { SpriteAnimation, SpriteEventType } from '@/components/AIAssistant/types';
import { AdditionalSpriteEventGroups, ALL_SPRITE_EVENT_TYPES, SpriteEventGroups } from '@/components/AIAssistant/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

function baseName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1] || '';
  return last;
}

function dirName(p: string): string {
  if (!p) return '';
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? p.slice(0, idx) : p;
}

// 小型预览组件：只有在 hover 时才真正挂载 <video>，离开时卸载，避免同时占用大量资源
// 精灵预览：静止首帧，hover 播放循环
function SpritePreview({ src, type, width, height }: { src: string; type: string; width: number; height: number }): JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // 初始：停在首帧
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* noop */
    }
  }, [src]);

  const handleEnter = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.loop = true;
      v.play().catch(() => {
        /* noop */
      });
    }
  }, []);

  const handleLeave = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
    }
  }, []);

  return (
    <div
      className="group relative inline-block rounded-md overflow-hidden select-none transition cursor-pointer"
      style={{ width, height }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label="鼠标悬停预览"
    >
      <video
        ref={videoRef}
        width={width}
        height={height}
        muted
        playsInline
        // 不自动播放，只有 hover / always 时才 play()
        preload="metadata"
        className="h-full w-full object-cover bg-muted pointer-events-none"
      >
        <source src={src} type={type} />
      </video>
    </div>
  );
}

export default function SpriteManager({ className }: { className?: string }): JSX.Element {
  const [list, setList] = useState<SpriteAnimation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({}); // 某分类中的添加状态
  const [categories, setCategories] = useState<string[]>([]); // 事件分类列表
  const [activeAddCat, setActiveAddCat] = useState<string | null>(null); // 当前触发的添加分类（用于弹窗后回填）
  const [query, setQuery] = useState(''); // 搜索框
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 分类折叠状态
  const [globalCat, setGlobalCat] = useState<string>(''); // 全局导入选择的分类
  // 转码工具弹窗与状态
  const [toolOpen, setToolOpen] = useState(false);
  const [inputPath, setInputPath] = useState<string>('');
  const [outputPath, setOutputPath] = useState<string>('');
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string>('');
  // 绿幕抠图工具弹窗与状态
  const [greenScreenToolOpen, setGreenScreenToolOpen] = useState(false);
  const [greenScreenInputPath, setGreenScreenInputPath] = useState<string>('');
  const [greenScreenOutputPath, setGreenScreenOutputPath] = useState<string>('');
  const [greenScreenConverting, setGreenScreenConverting] = useState(false);
  const [greenScreenConvertMsg, setGreenScreenConvertMsg] = useState<string>('');
  const [greenScreenColor, setGreenScreenColor] = useState<string>('0x00ff00');
  const [greenScreenSimilarity, setGreenScreenSimilarity] = useState<number>(0.3);
  const [greenScreenBlend, setGreenScreenBlend] = useState<number>(0.1);
  const [greenScreenCodec, setGreenScreenCodec] = useState<'prores_ks' | 'qtrle'>('prores_ks');
  const [useAIModel, setUseAIModel] = useState<boolean>(false); // 是否使用 AI 模型
  // 单张图片抠图工具弹窗与状态
  const [imageRemoveBgOpen, setImageRemoveBgOpen] = useState(false);
  const [imageRemoveBgInputPath, setImageRemoveBgInputPath] = useState<string>('');
  const [imageRemoveBgOutputPath, setImageRemoveBgOutputPath] = useState<string>('');
  const [imageRemoveBgProcessing, setImageRemoveBgProcessing] = useState(false);
  const [imageRemoveBgMsg, setImageRemoveBgMsg] = useState<string>('');
  // 默认的内置分类：使用全部预设事件类型（不包含 custom）
  const BUILTIN = React.useMemo(() => ALL_SPRITE_EVENT_TYPES.filter((c) => c !== 'custom'), []);

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const items = await window.YUA.sprite.list();
      setList(items || []);
      // 统计分类（meta.eventType）
      const setCat = new Set<string>();
      for (const it of items || []) {
        if (it.meta?.eventType) setCat.add(it.meta.eventType);
      }
      // 合并内置分类，保持稳定顺序
      const merged = [...BUILTIN, ...Array.from(setCat).filter((c) => !BUILTIN.includes(c))];
      setCategories(merged);
    } catch (e) {
      console.warn('sprite:list failed', e);
    } finally {
      setLoading(false);
    }
  }, [BUILTIN]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onImport = async (eventType?: string): Promise<void> => {
    // 使用局部 catKey，避免并发导入时 activeAddCat 被后一次覆盖导致前一次 finally 复位错误
    const catKey = eventType ?? activeAddCat ?? '';
    setActiveAddCat(catKey || null);
    setAddingMap((m) => ({ ...m, [catKey]: true }));
    try {
      const pick = await window.YUA.file['file:pickFile']({
        filters: [
          { name: 'Videos', extensions: ['webm', 'mp4', 'mov', 'mkv', 'ogg', 'ogv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multi: false
      });
      if (pick.canceled || !pick.path) return;
      const title = baseName(pick.path);
      const id = 'sprite-' + Math.random().toString(36).slice(2, 10);
      await window.YUA.sprite.register({ filePath: pick.path, meta: { id, title, eventType: catKey || undefined } });
      await refresh();
    } catch (e) {
      console.warn('sprite:register failed', e);
    } finally {
      setAddingMap((m) => ({ ...m, [catKey]: false }));
      setActiveAddCat(null);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    try {
      await window.YUA.sprite.remove(id, true);
      await refresh();
    } catch (e) {
      console.warn('sprite:remove failed', e);
    }
  };

  // 按分类分组
  const filteredList = React.useMemo(() => {
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      return it.meta.title.toLowerCase().includes(q) || it.meta.id.toLowerCase().includes(q) || it.meta.eventType?.toLowerCase().includes(q) || it.meta.tags?.some((t) => t.toLowerCase().includes(q));
    });
  }, [list, query]);

  const grouped: Record<string, SpriteAnimation[]> = {};
  for (const it of filteredList) {
    const cat = it.meta?.eventType || 'uncategorized';
    (grouped[cat] ||= []).push(it);
  }
  // 基于原始 categories 顺序，只保留当前有条目的分类 (隐藏空分类)。如果搜索导致全部被过滤，fallback 显示“无结果”。
  const allCategories = categories.filter((c) => grouped[c]?.length); // 已有分类且非空
  if (grouped['uncategorized']?.length && !allCategories.includes('uncategorized')) allCategories.push('uncategorized');
  const hasAny = allCategories.length > 0;

  const toggleCollapse = (cat: string): void => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }));

  return (
    <div className={className}>
      <div className="flex justify-between items-center px-2 mb-4">
        <div className="text-sm text-muted-foreground">已注册动画：{list.length}</div>
        <div className="flex gap-2 items-center">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 (名称 / ID / 分类 / 标签)" className="h-8 w-48" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-40 justify-between">
                {globalCat || '未分类'}
                <span className="opacity-60 text-xs">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[460px]">
              <DropdownMenuItem onClick={() => setGlobalCat('')}>未分类</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>消息语义</DropdownMenuLabel>
              {Object.entries(SpriteEventGroups).map(([group, items]) => (
                <DropdownMenuSub key={group}>
                  <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {items.map((ev) => (
                      <DropdownMenuItem key={ev} onClick={() => setGlobalCat(ev)}>
                        {ev}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>扩展动画</DropdownMenuLabel>
              {Object.entries(AdditionalSpriteEventGroups).map(([group, items]) => (
                <DropdownMenuSub key={group}>
                  <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {items.map((ev) => (
                      <DropdownMenuItem key={ev} onClick={() => setGlobalCat(ev)}>
                        {ev}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setGlobalCat('')}>清除选择</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => onImport(globalCat || undefined)} disabled={!!addingMap[globalCat || '']}>
            {addingMap[globalCat || ''] ? '导入中…' : '导入视频'}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            刷新
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <TbTools />
                工具
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImageRemoveBgOpen(true)}>AI 图片抠背景</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setToolOpen(true)}>转码为 WebM（含透明通道）</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGreenScreenToolOpen(true)}>绿幕抠图（导出 MOV）</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* 转码工具弹窗 */}
      <Dialog open={toolOpen} onOpenChange={setToolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>视频转码为 WebM（含透明通道）</DialogTitle>
            <DialogDescription>选择输入视频文件（如 mov/mp4 等），然后选择输出路径与文件名（.webm）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const pick = await window.YUA.file['file:pickFile']({
                    filters: [
                      { name: 'Videos', extensions: ['mov', 'mp4', 'mkv', 'avi', 'webm', 'm4v', 'ogg', 'ogv'] },
                      { name: 'All Files', extensions: ['*'] }
                    ],
                    multi: false
                  });
                  if (!pick.canceled && pick.path) {
                    setInputPath(pick.path);
                    // 如果未选择过输出，自动建议同目录同名 .webm
                    try {
                      const suggested = pick.path.replace(/\.[^.\\/]+$/i, '') + '.webm';
                      if (!outputPath) setOutputPath(suggested);
                    } catch {
                      /* noop */
                    }
                  }
                }}
              >
                选择输入视频
              </Button>
              <Input className="flex-1" placeholder="未选择" value={inputPath} readOnly />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const save = await window.YUA.file['file:saveFile']({
                    filters: [{ name: 'WebM', extensions: ['webm'] }],
                    defaultPath: outputPath || (inputPath ? inputPath.replace(/\.[^.\\/]+$/i, '') + '.webm' : undefined),
                    title: '保存为 WebM 文件'
                  });
                  if (!save.canceled && save.path) setOutputPath(save.path);
                }}
              >
                选择输出位置
              </Button>
              <Input className="flex-1" placeholder="未选择" value={outputPath} readOnly />
            </div>
            {convertMsg && <div className="text-xs text-muted-foreground">{convertMsg}</div>}
          </div>
          <DialogFooter>
            <div className="flex items-center gap-2 w-full justify-end">
              <Button variant="ghost" onClick={() => setToolOpen(false)} disabled={converting}>
                关闭
              </Button>
              <Button
                onClick={async () => {
                  if (!inputPath || !outputPath) {
                    setConvertMsg('请先选择输入与输出路径');
                    return;
                  }
                  setConverting(true);
                  setConvertMsg('开始转码…');
                  try {
                    const ret = await window.YUA.ffmpeg.convertMovToWebmWithAlpha({ inputPath, outputPath });
                    setConvertMsg(ret || '转码完成');
                    // 打开目标文件所在文件夹
                    const parent = dirName(outputPath);
                    if (parent) {
                      await window.YUA.file['file:openPath'](parent);
                    }
                  } catch (e: any) {
                    setConvertMsg('转码失败：' + (e?.message || String(e)));
                  } finally {
                    setConverting(false);
                  }
                }}
                disabled={converting || !inputPath || !outputPath}
              >
                {converting ? '转码中…' : '开始转码'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 绿幕抠图工具弹窗 */}
      <Dialog open={greenScreenToolOpen} onOpenChange={setGreenScreenToolOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>视频抠图并导出 MOV（含透明通道）</DialogTitle>
            <DialogDescription>
              {useAIModel ? '使用 AI 模型进行背景移除，无需绿幕，效果更好但处理速度较慢。首次使用需要下载模型（约 100MB）。' : '使用 FFmpeg 的 chromakey 滤镜进行绿幕抠图，速度快但需要纯色背景。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="space-y-0.5">
                <Label htmlFor="use-ai">使用 AI 模型（推荐）</Label>
                <div className="text-xs text-muted-foreground">{useAIModel ? '使用 AI 模型，无需绿幕，效果更好' : '使用 FFmpeg chromakey，需要绿幕背景'}</div>
              </div>
              <Switch id="use-ai" checked={useAIModel} onCheckedChange={setUseAIModel} />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const pick = await window.YUA.file['file:pickFile']({
                    filters: [
                      { name: 'Videos', extensions: ['mov', 'mp4', 'mkv', 'avi', 'webm', 'm4v', 'ogg', 'ogv'] },
                      { name: 'All Files', extensions: ['*'] }
                    ],
                    multi: false
                  });
                  if (!pick.canceled && pick.path) {
                    setGreenScreenInputPath(pick.path);
                    // 如果未选择过输出，自动建议同目录同名 .mov
                    try {
                      const suggested = pick.path.replace(/\.[^.\\/]+$/i, '') + '.mov';
                      if (!greenScreenOutputPath) setGreenScreenOutputPath(suggested);
                    } catch {
                      /* noop */
                    }
                  }
                }}
              >
                选择输入视频
              </Button>
              <Input className="flex-1" placeholder="未选择" value={greenScreenInputPath} readOnly />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const save = await window.YUA.file['file:saveFile']({
                    filters: [{ name: 'MOV', extensions: ['mov'] }],
                    defaultPath: greenScreenOutputPath || (greenScreenInputPath ? greenScreenInputPath.replace(/\.[^.\\/]+$/i, '') + '.mov' : undefined),
                    title: '保存为 MOV 文件'
                  });
                  if (!save.canceled && save.path) setGreenScreenOutputPath(save.path);
                }}
              >
                选择输出位置
              </Button>
              <Input className="flex-1" placeholder="未选择" value={greenScreenOutputPath} readOnly />
            </div>

            {!useAIModel && (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-2">
                  <Label htmlFor="color">抠除颜色</Label>
                  <div className="flex items-center gap-2">
                    <Input id="color" type="text" value={greenScreenColor} onChange={(e) => setGreenScreenColor(e.target.value)} placeholder="0x00ff00" className="flex-1" />
                    <div className="w-12 h-8 rounded border border-border" style={{ backgroundColor: greenScreenColor.replace('0x', '#') }} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setGreenScreenColor('0x00ff00')}>
                      绿色
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGreenScreenColor('0x0000ff')}>
                      蓝色
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGreenScreenColor('0xff0000')}>
                      红色
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="similarity">相似度阈值: {greenScreenSimilarity.toFixed(2)}</Label>
                  <Input
                    id="similarity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={greenScreenSimilarity}
                    onChange={(e) => setGreenScreenSimilarity(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground">值越大，去除的颜色范围越广（推荐：0.1-0.5）</div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="blend">边缘混合: {greenScreenBlend.toFixed(2)}</Label>
                  <Input id="blend" type="range" min="0" max="1" step="0.01" value={greenScreenBlend} onChange={(e) => setGreenScreenBlend(parseFloat(e.target.value))} className="w-full" />
                  <div className="text-xs text-muted-foreground">值越大，边缘过渡越柔和（推荐：0.0-0.2）</div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="codec">视频编码器</Label>
                  <Select value={greenScreenCodec} onValueChange={(v: 'prores_ks' | 'qtrle') => setGreenScreenCodec(v)}>
                    <SelectTrigger id="codec">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prores_ks">Apple ProRes 4444（高质量，推荐）</SelectItem>
                      <SelectItem value="qtrle">QuickTime Animation（无损压缩）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {greenScreenConvertMsg && <div className="text-xs text-muted-foreground">{greenScreenConvertMsg}</div>}
          </div>
          <DialogFooter>
            <div className="flex items-center gap-2 w-full justify-end">
              <Button variant="ghost" onClick={() => setGreenScreenToolOpen(false)} disabled={greenScreenConverting}>
                关闭
              </Button>
              <Button
                onClick={async () => {
                  if (!greenScreenInputPath || !greenScreenOutputPath) {
                    setGreenScreenConvertMsg('请先选择输入与输出路径');
                    return;
                  }
                  setGreenScreenConverting(true);
                  setGreenScreenConvertMsg(useAIModel ? '开始 AI 抠图（首次使用需要下载模型，请耐心等待）…' : '开始抠图…');
                  try {
                    let ret: string;
                    if (useAIModel) {
                      ret = await window.YUA.ffmpeg.removeBackgroundWithAI({
                        inputPath: greenScreenInputPath,
                        outputPath: greenScreenOutputPath
                      });
                    } else {
                      ret = await window.YUA.ffmpeg.removeGreenScreenToMov({
                        inputPath: greenScreenInputPath,
                        outputPath: greenScreenOutputPath,
                        color: greenScreenColor,
                        similarity: greenScreenSimilarity,
                        blend: greenScreenBlend,
                        codec: greenScreenCodec
                      });
                    }
                    setGreenScreenConvertMsg(ret || '抠图完成');
                    // 打开目标文件所在文件夹
                    const parent = dirName(greenScreenOutputPath);
                    if (parent) {
                      await window.YUA.file['file:openPath'](parent);
                    }
                  } catch (e: any) {
                    setGreenScreenConvertMsg('抠图失败：' + (e?.message || String(e)));
                  } finally {
                    setGreenScreenConverting(false);
                  }
                }}
                disabled={greenScreenConverting || !greenScreenInputPath || !greenScreenOutputPath}
              >
                {greenScreenConverting ? '抠图中…' : '开始抠图'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 单张图片 AI 抠背景工具弹窗 */}
      <Dialog open={imageRemoveBgOpen} onOpenChange={setImageRemoveBgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 图片抠背景</DialogTitle>
            <DialogDescription>使用 AI 模型自动移除图片背景，无需绿幕。支持导出 PNG 格式（含透明通道）。首次使用需要下载模型（约 100MB）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const pick = await window.YUA.file['file:pickFile']({
                    filters: [
                      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
                      { name: 'All Files', extensions: ['*'] }
                    ],
                    multi: false
                  });
                  if (!pick.canceled && pick.path) {
                    setImageRemoveBgInputPath(pick.path);
                    // 如果未选择过输出，自动建议同目录同名 .png
                    try {
                      const suggested = pick.path.replace(/\.[^.\\/]+$/i, '') + '_nobg.png';
                      if (!imageRemoveBgOutputPath) setImageRemoveBgOutputPath(suggested);
                    } catch {
                      /* noop */
                    }
                  }
                }}
              >
                选择输入图片
              </Button>
              <Input className="flex-1" placeholder="未选择" value={imageRemoveBgInputPath} readOnly />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const save = await window.YUA.file['file:saveFile']({
                    filters: [{ name: 'PNG', extensions: ['png'] }],
                    defaultPath: imageRemoveBgOutputPath || (imageRemoveBgInputPath ? imageRemoveBgInputPath.replace(/\.[^.\\/]+$/i, '') + '_nobg.png' : undefined),
                    title: '保存为 PNG 文件'
                  });
                  if (!save.canceled && save.path) setImageRemoveBgOutputPath(save.path);
                }}
              >
                选择输出位置
              </Button>
              <Input className="flex-1" placeholder="未选择" value={imageRemoveBgOutputPath} readOnly />
            </div>

            {imageRemoveBgMsg && <div className="text-xs text-muted-foreground p-2 bg-muted rounded">{imageRemoveBgMsg}</div>}
          </div>
          <DialogFooter>
            <div className="flex items-center gap-2 w-full justify-end">
              <Button variant="ghost" onClick={() => setImageRemoveBgOpen(false)} disabled={imageRemoveBgProcessing}>
                关闭
              </Button>
              <Button
                onClick={async () => {
                  if (!imageRemoveBgInputPath || !imageRemoveBgOutputPath) {
                    setImageRemoveBgMsg('请先选择输入与输出路径');
                    return;
                  }
                  setImageRemoveBgProcessing(true);
                  setImageRemoveBgMsg('开始处理（首次使用需要下载模型，请耐心等待）…');
                  try {
                    const ret = await window.YUA.ffmpeg.removeBackgroundFromImage({
                      inputPath: imageRemoveBgInputPath,
                      outputPath: imageRemoveBgOutputPath
                    });
                    setImageRemoveBgMsg('处理完成！');
                    // 打开目标文件所在文件夹
                    const parent = dirName(imageRemoveBgOutputPath);
                    if (parent) {
                      await window.YUA.file['file:openPath'](parent);
                    }
                  } catch (e: any) {
                    setImageRemoveBgMsg('处理失败：' + (e?.message || String(e)));
                  } finally {
                    setImageRemoveBgProcessing(false);
                  }
                }}
                disabled={imageRemoveBgProcessing || !imageRemoveBgInputPath || !imageRemoveBgOutputPath}
              >
                {imageRemoveBgProcessing ? '处理中…' : '开始处理'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 防止窗口增高时 Grid 行被平均拉伸：content-start(items-start) 让多余空间留在容器底部 */}
      <div className="pr-1">
        {hasAny ? (
          allCategories.map((cat) => (
            <div key={cat} className="mb-4 last:mb-0 border border-border/40 rounded-md">
              <div className="flex items-center justify-between px-2 py-1 bg-muted/40 rounded-t-md">
                <div className="flex items-center gap-2">
                  <Button size={'icon'} className="w-8 h-8" onClick={() => toggleCollapse(cat)} aria-label={collapsed[cat] ? '展开分类' : '折叠分类'} variant={'outline'}>
                    {collapsed[cat] ? '+' : '-'}
                  </Button>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat === 'uncategorized' ? '未分类' : cat}</div>
                  <div className="text-[10px] text-muted-foreground/70">({grouped[cat]?.length || 0})</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => onImport(cat)} disabled={addingMap[cat]}>
                    {addingMap[cat] ? '导入中…' : '添加'}
                  </Button>
                </div>
              </div>
              {!collapsed[cat] && (
                <div className="p-2">
                  <div className="grid gap-4 content-start items-start justify-items-center" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {grouped[cat]?.map((item) => {
                      const src = item.source?.localPath ? makeResSrc(item.source.localPath) : item.source?.src || '';
                      const type = item.source?.type || 'video/webm';
                      const PW = 180,
                        PH = 240; // 基础预览尺寸（列最小宽 200 时刚好贴合）
                      return (
                        <div key={item.meta.id} className="group bg-card border border-border rounded-lg flex flex-col gap-2 w-full max-w-[240px] shadow-sm hover:shadow-md transition-shadow">
                          <div className="relative rounded-md overflow-hidden flex justify-center">
                            {src ? <SpritePreview src={src} type={type} width={PW} height={PH} /> : <div style={{ width: PW, height: PH }} className="rounded-md bg-muted" />}
                            {/* 顶部右上角删除按钮（hover 显示） */}
                            <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {!item.meta.eventType && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      分类
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="top" align="start">
                                    <DropdownMenuLabel>消息语义</DropdownMenuLabel>
                                    {Object.entries(SpriteEventGroups).map(([group, items]) => (
                                      <DropdownMenuSub key={group}>
                                        <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          {items.map((ev) => (
                                            <DropdownMenuItem
                                              key={ev}
                                              onClick={async () => {
                                                await window.YUA.sprite.updateMeta(item.meta.id, { eventType: ev as SpriteEventType });
                                                await refresh();
                                              }}
                                            >
                                              {ev}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>扩展动画</DropdownMenuLabel>
                                    {Object.entries(AdditionalSpriteEventGroups).map(([group, items]) => (
                                      <DropdownMenuSub key={group}>
                                        <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          {items.map((ev) => (
                                            <DropdownMenuItem
                                              key={ev}
                                              onClick={async () => {
                                                await window.YUA.sprite.updateMeta(item.meta.id, { eventType: ev as SpriteEventType });
                                                await refresh();
                                              }}
                                            >
                                              {ev}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {item.meta.deletable !== false && (
                                <Button size="icon" variant="destructive" className="w-8 h-8" onClick={() => onRemove(item.meta.id)}>
                                  <TbTrash className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {/* 信息覆盖层：默认显示，hover 隐藏 */}
                            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent text-white opacity-100 group-hover:opacity-0 transition-opacity duration-200">
                              <div className="text-sm font-semibold truncate"> {item.meta.title || item.meta.id} </div>
                              <div className="text-[10px] opacity-80 truncate">ID: {item.meta.id}</div>
                              <div className="text-[10px] opacity-80 truncate">
                                {item.width}x{item.height} · {item.source?.type}
                              </div>
                              {item.meta.eventType && <div className="mt-1 text-[10px] inline-block px-1 py-[1px] rounded bg-primary/70 text-white w-fit">{item.meta.eventType}</div>}
                              {/* 结束覆盖层 */}
                            </div>
                            {/* 结束相对容器 */}
                          </div>
                        </div>
                      );
                    })}
                    {/* 分类尾部添加卡片 */}
                    <Button className="h-[240px] w-[180px]" onClick={() => onImport(cat)} disabled={addingMap[cat]} variant="ghost">
                      + 添加
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center text-xs text-muted-foreground py-8">无匹配结果</div>
        )}
      </div>
    </div>
  );
}
