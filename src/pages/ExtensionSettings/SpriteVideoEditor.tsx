/**
 * 精灵视频编辑器
 *
 * 用于处理用户上传的精灵视频：
 * 1. 视频预览 + 时间轴
 * 2. 片段标记（开始、循环开始、循环结束、结束）
 * 3. 背景抠图（色度键）
 * 4. 转码为 WebM（含透明通道）
 */

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type { SpriteAnimationCondition, SpriteAnimationTrigger, SpriteMovementConfig, SpriteMovementDirection, SpriteMovementMode, SpriteMovementTrigger } from '@packages/sprite-core/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbPlayerPause, TbPlayerPlay, TbX, TbZoomIn, TbZoomOut } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ensureSpriteCapabilityAccessible, SpriteCapabilityLockedNotice } from '@/features/sprite-assistant/capability-ui';

import { createSpriteAnimationMetaDraft, formatSpriteAnimationConditionInput, formatSpriteTriggerAliasesInput, parseSpriteAnimationConditionInput } from './components/sprite-animation-meta-utils';
import SpriteAnimationConditionBuilder from './components/SpriteAnimationConditionBuilder';
import SpriteTriggerPicker from './components/SpriteTriggerPicker';
import { hasLoopSegment, isTimeInTrimmedSegment, normalizeSegmentMarkers, type SegmentMarkerKey, type SegmentMarkers, updateSegmentMarker } from './sprite-video-segments';

export type { SegmentMarkers } from './sprite-video-segments';

// 三段预览阶段
type PreviewPhase = 'idle' | 'intro' | 'loop' | 'outro';

// 片段倍速设置
export interface SegmentSpeeds {
  intro: number; // 开始片段倍速 (1.0 = 原速)
  loop: number; // 循环片段倍速
  outro: number; // 结束片段倍速
}

// 背景抠图设置
export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // 十六进制颜色值，如 "#00ff00"
  similarity: number; // 相似度阈值 0-100
  blend: number; // 混合/边缘羽化 1-100
}

// 输出设置
export interface OutputSettings {
  fps: number; // 帧率
  width: number; // 输出宽度
  height: number; // 输出高度
}

// 默认输出设置
const DEFAULT_OUTPUT: OutputSettings = { fps: 8, width: 360, height: 480 };
const DEFAULT_SEGMENTS: SegmentMarkers = { start: 0, loopStart: 0, loopEnd: 0, end: 0 };
const DEFAULT_CHROMA_KEY: ChromaKeySettings = { enabled: false, color: '#00ff00', similarity: 40, blend: 15 };
const DEFAULT_SPEEDS: SegmentSpeeds = { intro: 1, loop: 1, outro: 1 };
const DEFAULT_PLAYBACK_SCALE = 1;
const DEFAULT_PADDING = 100;
const DEFAULT_MOVEMENT: SpriteMovementConfig = { enabled: false, mode: 'direction', direction: 'random', speed: 60 };
const SPRITE_VIDEO_EDITOR_FORM_STORAGE_KEY = 'sprite-video-editor-form-settings:v1';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SPRITE_MOVEMENT_MODE_SET = new Set<SpriteMovementMode>(['direction', 'walkTo']);
const SPRITE_MOVEMENT_DIRECTION_SET = new Set<SpriteMovementDirection>(['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right', 'random']);
const SPRITE_MOVEMENT_TRIGGER_SET = new Set<SpriteMovementTrigger>(['animation', 'behavior']);
const VIDEO_READY_STATE_HAVE_CURRENT_DATA = 2;

type SpriteVideoEditorStoredFormSettings = {
  chromaKey?: ChromaKeySettings;
  speeds?: SegmentSpeeds;
  output?: OutputSettings;
  playbackScale?: number;
  padding?: number;
  movement?: SpriteMovementConfig;
  autoIdle?: boolean;
  loopWholeClip?: boolean;
  primaryTrigger?: SpriteAnimationTrigger | '';
  triggerAliasesInput?: string;
  priorityInput?: string;
  conditionInput?: string;
};

function normalizePlaybackScale(scale?: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_PLAYBACK_SCALE;
  return Math.max(1, scale ?? DEFAULT_PLAYBACK_SCALE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clampNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsed = readNumber(value) ?? fallback;
  const minBounded = min === undefined ? parsed : Math.max(min, parsed);
  return max === undefined ? minBounded : Math.min(max, minBounded);
}

function normalizeChromaKeySettings(value: unknown): ChromaKeySettings {
  if (!isRecord(value)) return { ...DEFAULT_CHROMA_KEY };
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_CHROMA_KEY.enabled,
    color: typeof value.color === 'string' && HEX_COLOR_PATTERN.test(value.color) ? value.color : DEFAULT_CHROMA_KEY.color,
    similarity: clampNumber(value.similarity, DEFAULT_CHROMA_KEY.similarity, 1, 100),
    blend: clampNumber(value.blend, DEFAULT_CHROMA_KEY.blend, 1, 50)
  };
}

function normalizeSegmentSpeeds(value: unknown): SegmentSpeeds {
  if (!isRecord(value)) return { ...DEFAULT_SPEEDS };
  return {
    intro: clampNumber(value.intro, DEFAULT_SPEEDS.intro, 0.1, 10),
    loop: clampNumber(value.loop, DEFAULT_SPEEDS.loop, 0.1, 10),
    outro: clampNumber(value.outro, DEFAULT_SPEEDS.outro, 0.1, 10)
  };
}

function normalizeOutputSettings(value: unknown): OutputSettings {
  if (!isRecord(value)) return { ...DEFAULT_OUTPUT };
  return {
    fps: clampNumber(value.fps, DEFAULT_OUTPUT.fps, 1, 60),
    width: clampNumber(value.width, DEFAULT_OUTPUT.width, 1),
    height: clampNumber(value.height, DEFAULT_OUTPUT.height, 1)
  };
}

function normalizeMovementSettings(value: unknown): SpriteMovementConfig {
  if (!isRecord(value)) return { ...DEFAULT_MOVEMENT };

  const mode = typeof value.mode === 'string' && SPRITE_MOVEMENT_MODE_SET.has(value.mode as SpriteMovementMode) ? (value.mode as SpriteMovementMode) : DEFAULT_MOVEMENT.mode;
  const direction =
    typeof value.direction === 'string' && SPRITE_MOVEMENT_DIRECTION_SET.has(value.direction as SpriteMovementDirection) ? (value.direction as SpriteMovementDirection) : DEFAULT_MOVEMENT.direction;
  const trigger = typeof value.trigger === 'string' && SPRITE_MOVEMENT_TRIGGER_SET.has(value.trigger as SpriteMovementTrigger) ? (value.trigger as SpriteMovementTrigger) : undefined;
  const next: SpriteMovementConfig = {
    ...DEFAULT_MOVEMENT,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_MOVEMENT.enabled,
    mode,
    direction,
    speed: clampNumber(value.speed, DEFAULT_MOVEMENT.speed ?? 60, 1)
  };

  if (trigger) {
    next.trigger = trigger;
  }

  if (value.verticalRange !== undefined) {
    next.verticalRange = clampNumber(value.verticalRange, 0.1, 0.01, 1);
  }

  if (isRecord(value.behaviorSchedule)) {
    const type = value.behaviorSchedule.type === 'interval' ? 'interval' : 'random';
    next.behaviorSchedule = {
      type,
      intervalMs: clampNumber(value.behaviorSchedule.intervalMs, 15000, 1000),
      minMs: clampNumber(value.behaviorSchedule.minMs, 10000, 1000),
      maxMs: clampNumber(value.behaviorSchedule.maxMs, 25000, 1000),
      probability: clampNumber(value.behaviorSchedule.probability, 0.8, 0, 1),
      minIdleMs: clampNumber(value.behaviorSchedule.minIdleMs, 5000, 0)
    };
  }

  return next;
}

function loadSpriteVideoEditorStoredFormSettings(): SpriteVideoEditorStoredFormSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SPRITE_VIDEO_EDITOR_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    return {
      chromaKey: parsed.chromaKey === undefined ? undefined : normalizeChromaKeySettings(parsed.chromaKey),
      speeds: parsed.speeds === undefined ? undefined : normalizeSegmentSpeeds(parsed.speeds),
      output: parsed.output === undefined ? undefined : normalizeOutputSettings(parsed.output),
      playbackScale: parsed.playbackScale === undefined ? undefined : normalizePlaybackScale(readNumber(parsed.playbackScale)),
      padding: parsed.padding === undefined ? undefined : clampNumber(parsed.padding, DEFAULT_PADDING, 0),
      movement: parsed.movement === undefined ? undefined : normalizeMovementSettings(parsed.movement),
      autoIdle: typeof parsed.autoIdle === 'boolean' ? parsed.autoIdle : undefined,
      loopWholeClip: typeof parsed.loopWholeClip === 'boolean' ? parsed.loopWholeClip : undefined,
      primaryTrigger: typeof parsed.primaryTrigger === 'string' ? (parsed.primaryTrigger as SpriteAnimationTrigger | '') : undefined,
      triggerAliasesInput: typeof parsed.triggerAliasesInput === 'string' ? parsed.triggerAliasesInput : undefined,
      priorityInput: typeof parsed.priorityInput === 'string' ? parsed.priorityInput : undefined,
      conditionInput: typeof parsed.conditionInput === 'string' ? parsed.conditionInput : undefined
    };
  } catch {
    return null;
  }
}

function saveSpriteVideoEditorStoredFormSettings(settings: SpriteVideoEditorStoredFormSettings): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SPRITE_VIDEO_EDITOR_FORM_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota/privacy mode failures; the editor should keep working.
  }
}

function getPlaybackDimension(outputSize: number, playbackScale: number): number {
  return Math.max(1, Math.round(outputSize / normalizePlaybackScale(playbackScale)));
}

// 编辑器配置
export interface SpriteVideoConfig {
  inputPath: string;
  segments: SegmentMarkers;
  chromaKey: ChromaKeySettings;
  speeds: SegmentSpeeds;
  output: OutputSettings;
  playbackScale: number;
  padding: number;
  movement: SpriteMovementConfig;
  autoIdle: boolean;
  loop: boolean;
  condition?: SpriteAnimationCondition;
  primaryTrigger?: SpriteAnimationTrigger;
  triggerAliases?: SpriteAnimationTrigger[];
  priority?: number;
  title?: string;
}

type SpriteVideoConfigInput = Partial<SpriteVideoConfig> & {
  /** 兼容旧输入，等价于 primaryTrigger */
  eventType?: SpriteAnimationTrigger;
};

// 将文件路径转换为 res:// 协议URL
function pathToResUrl(filePath: string): string {
  return `res://local/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
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

// 根据百分比位置计算边缘对齐的 transform
function getEdgeAwareTransform(percent: number): string {
  if (percent < 0.08) return 'translateX(0)';
  if (percent > 0.92) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

// 倍速预设
const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

// 片段倍速选择行
function SpeedRow({ label, color, originalDuration, speed, onChange }: { label: string; color: string; originalDuration: number; speed: number; onChange: (speed: number) => void }): JSX.Element {
  const adjusted = originalDuration > 0 ? originalDuration / speed : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] font-medium w-8 shrink-0 ${color}`}>{label}</span>
      <div className="flex gap-0.5">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${speed === preset ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent text-muted-foreground'}`}
            onClick={() => onChange(preset)}
          >
            {preset}x
          </button>
        ))}
      </div>
      {originalDuration > 0 && speed !== 1 && (
        <span className="text-[10px] text-muted-foreground">
          {formatTime(originalDuration)} → {formatTime(adjusted)}
        </span>
      )}
    </div>
  );
}

// 计算拖拽时光标的透明度（拖拽时其他光标降低透明度）
function getMarkerOpacity(markerKey: SegmentMarkerKey, draggingMarker: SegmentMarkerKey | null): number {
  if (!draggingMarker) return 1;
  return markerKey === draggingMarker ? 1 : 0.3;
}

interface SpriteVideoEditorProps {
  assetAuthoringCapability?: SpriteCapabilityState | null;
  initialConfig?: SpriteVideoConfigInput;
  onConfigChange?: (config: SpriteVideoConfig) => void;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
  onProcess?: (config: SpriteVideoConfig) => Promise<void>;
  onImportComplete?: () => void;
  isProcessing?: boolean;
}

export function SpriteVideoEditor({ assetAuthoringCapability, initialConfig, onConfigChange, onCapabilityBlocked, onProcess, onImportComplete, isProcessing }: SpriteVideoEditorProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const storedFormSettings = useMemo(() => loadSpriteVideoEditorStoredFormSettings(), []);

  // 视频状态
  const [inputPath, setInputPath] = useState<string>(initialConfig?.inputPath || '');
  const [videoResourceVersion, setVideoResourceVersion] = useState(0);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // 片段标记
  const [segments, setSegments] = useState<SegmentMarkers>(initialConfig?.segments || { ...DEFAULT_SEGMENTS });

  // 背景抠图设置
  const [chromaKey, setChromaKey] = useState<ChromaKeySettings>(initialConfig?.chromaKey || storedFormSettings?.chromaKey || { ...DEFAULT_CHROMA_KEY });

  // 片段倍速
  const [speeds, setSpeeds] = useState<SegmentSpeeds>(initialConfig?.speeds || storedFormSettings?.speeds || { ...DEFAULT_SPEEDS });

  // 输出设置
  const [output, setOutput] = useState<OutputSettings>(initialConfig?.output || storedFormSettings?.output || { ...DEFAULT_OUTPUT });
  const [playbackScale, setPlaybackScale] = useState<number>(normalizePlaybackScale(initialConfig?.playbackScale ?? storedFormSettings?.playbackScale));

  // 元数据
  const [primaryTrigger, setPrimaryTrigger] = useState<SpriteAnimationTrigger | ''>(initialConfig?.primaryTrigger ?? initialConfig?.eventType ?? storedFormSettings?.primaryTrigger ?? '');
  const [triggerAliasesInput, setTriggerAliasesInput] = useState<string>(
    initialConfig?.triggerAliases !== undefined ? formatSpriteTriggerAliasesInput(initialConfig.triggerAliases) : (storedFormSettings?.triggerAliasesInput ?? '')
  );
  const [priorityInput, setPriorityInput] = useState<string>(initialConfig?.priority !== undefined ? String(initialConfig.priority) : (storedFormSettings?.priorityInput ?? ''));
  const [conditionInput, setConditionInput] = useState<string>(
    initialConfig?.condition !== undefined ? formatSpriteAnimationConditionInput(initialConfig.condition) : (storedFormSettings?.conditionInput ?? '')
  );
  const [title, setTitle] = useState<string>(initialConfig?.title || '');

  // 窗口移动配置
  const [movement, setMovement] = useState<SpriteMovementConfig>(initialConfig?.movement || storedFormSettings?.movement || { ...DEFAULT_MOVEMENT });
  const [autoIdle, setAutoIdle] = useState<boolean>(initialConfig?.autoIdle ?? storedFormSettings?.autoIdle ?? true);
  // 精灵窗口 padding
  const [loopWholeClip, setLoopWholeClip] = useState<boolean>(initialConfig?.loop ?? storedFormSettings?.loopWholeClip ?? false);
  const [padding, setPadding] = useState<number>(initialConfig?.padding ?? storedFormSettings?.padding ?? DEFAULT_PADDING);

  const playbackWidth = getPlaybackDimension(output.width, playbackScale);
  const playbackHeight = getPlaybackDimension(output.height, playbackScale);

  // 预览模式 — 启用色度键后自动开启
  const previewChroma = chromaKey.enabled;

  // 三段预览状态
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle');
  const [loopCount, setLoopCount] = useState<number>(0);
  const previewPhaseRef = useRef<PreviewPhase>('idle');
  const loopCountRef = useRef<number>(0);
  const previewRafRef = useRef<number>(0);

  // 时间轴拖拽状态
  const [draggingMarker, setDraggingMarker] = useState<SegmentMarkerKey | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const suppressNextTimelineClickRef = useRef(false);

  // 内部处理状态
  const [internalProcessing, setInternalProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const processingFlag = isProcessing || internalProcessing;
  const canAuthorAnimations = assetAuthoringCapability?.status !== 'locked';
  const parsedCondition = useMemo(() => parseSpriteAnimationConditionInput(conditionInput), [conditionInput]);
  const animationMeta = useMemo(
    () =>
      createSpriteAnimationMetaDraft({
        conditionInput,
        primaryTrigger,
        triggerAliasesInput,
        priority: priorityInput
      }),
    [conditionInput, primaryTrigger, priorityInput, triggerAliasesInput]
  );

  // 时间轴悬停状态（用于添加循环片段）
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  // 判断是否有循环片段
  const hasLoop = hasLoopSegment(segments);
  const playbackLoop = hasLoop || loopWholeClip;

  useEffect(() => {
    saveSpriteVideoEditorStoredFormSettings({
      chromaKey,
      speeds,
      output,
      playbackScale,
      padding,
      movement,
      autoIdle,
      loopWholeClip,
      primaryTrigger,
      triggerAliasesInput,
      priorityInput,
      conditionInput
    });
  }, [autoIdle, chromaKey, conditionInput, loopWholeClip, movement, output, padding, playbackScale, primaryTrigger, priorityInput, speeds, triggerAliasesInput]);

  // 移除循环片段
  const removeLoop = useCallback(() => {
    setSegments((prev) => ({
      ...prev,
      loopStart: prev.start,
      loopEnd: prev.start
    }));
  }, []);

  // 添加循环片段（在指定位置，默认在中间）
  const addLoop = useCallback(
    (position?: number) => {
      if (position !== undefined && !isTimeInTrimmedSegment(segments, position, duration)) return;

      const loopDuration = Math.min(3000, (segments.end - segments.start) / 3); // 默认3秒或1/3时长
      const center = position ?? (segments.start + segments.end) / 2;
      const halfLoop = loopDuration / 2;
      let loopStart = Math.max(segments.start, center - halfLoop);
      let loopEnd = loopStart + loopDuration;
      if (loopEnd > segments.end) {
        loopEnd = segments.end;
        loopStart = Math.max(segments.start, loopEnd - loopDuration);
      }
      setSegments((prev) => ({
        ...prev,
        loopStart,
        loopEnd
      }));
    },
    [duration, segments]
  );

  // 更新配置
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({
        inputPath,
        segments,
        chromaKey,
        speeds,
        output,
        playbackScale,
        padding,
        movement,
        autoIdle,
        loop: playbackLoop,
        condition: animationMeta.condition,
        primaryTrigger: animationMeta.primaryTrigger,
        triggerAliases: animationMeta.triggerAliases,
        priority: animationMeta.priority,
        title
      });
    }
  }, [inputPath, segments, chromaKey, speeds, output, playbackScale, padding, movement, autoIdle, playbackLoop, animationMeta, title, onConfigChange]);

  const drawChromaPreviewFrame = useCallback((): boolean => {
    if (!previewChroma || !chromaKey.enabled) return false;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < VIDEO_READY_STATE_HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return false;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      return false;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const targetR = parseInt(chromaKey.color.slice(1, 3), 16);
    const targetG = parseInt(chromaKey.color.slice(3, 5), 16);
    const targetB = parseInt(chromaKey.color.slice(5, 7), 16);
    const threshold = (chromaKey.similarity / 100) * 255;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const distance = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);

      if (distance < threshold) {
        data[i + 3] = 0;
      } else if (distance < threshold + chromaKey.blend) {
        const alpha = ((distance - threshold) / chromaKey.blend) * 255;
        data[i + 3] = Math.min(data[i + 3], alpha);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return true;
  }, [chromaKey, previewChroma]);

  const requestChromaPreviewFrame = useCallback(() => {
    if (!previewChroma) return;
    requestAnimationFrame(() => {
      drawChromaPreviewFrame();
    });
  }, [drawChromaPreviewFrame, previewChroma]);

  // 视频加载完成
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration * 1000;
    setDuration(dur);
    // 初始化片段标记
    setSegments((prev) => normalizeSegmentMarkers(prev, dur));
    requestChromaPreviewFrame();
  }, [requestChromaPreviewFrame]);

  // 时间更新
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime * 1000);
    requestChromaPreviewFrame();
  }, [requestChromaPreviewFrame]);

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

  // 设置片段标记（带约束：start <= loopStart <= loopEnd <= end）
  const setMarker = useCallback(
    (marker: SegmentMarkerKey, value: number) => {
      setSegments((prev) => updateSegmentMarker(prev, marker, value, duration));
    },
    [duration]
  );

  // 获取文件所在目录
  const getDirPath = useCallback((filePath: string): string => {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? filePath.slice(0, lastSlash) : filePath;
  }, []);

  useEffect(() => {
    if (!inputPath) return;

    let cancelled = false;
    const dirPath = getDirPath(inputPath);

    window.YUA.sprite
      .addTempResourceRoot(dirPath)
      .catch((error) => {
        console.warn('精灵视频预览资源根注册失败:', error);
      })
      .finally(() => {
        if (cancelled) return;
        setVideoResourceVersion((version) => version + 1);
        requestAnimationFrame(() => {
          videoRef.current?.load();
        });
      });

    return () => {
      cancelled = true;
    };
  }, [getDirPath, inputPath]);

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
      // 添加到临时资源根目录（允许通过 res:// 协议访问）
      const dirPath = getDirPath(pick.path);
      await window.YUA.sprite.addTempResourceRoot(dirPath);

      setInputPath(pick.path);
      // 从文件名提取标题
      const name = pick.path.replace(/\\/g, '/').split('/').pop() || '';
      setTitle(name.replace(/\.[^.]+$/, ''));
      // 重置状态
      setSegments({ ...DEFAULT_SEGMENTS });
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [getDirPath]);

  // 色度键预览（始终跟随视频帧更新，含暂停帧）
  useEffect(() => {
    if (!previewChroma || !chromaKey.enabled || !inputPath) return;

    let animationId = 0;
    let disposed = false;
    let forceDraw = true;
    let lastTime = -1;
    let lastWidth = 0;
    let lastHeight = 0;

    const video = videoRef.current;
    const markDirty = (): void => {
      forceDraw = true;
    };

    const draw = (): void => {
      if (disposed) return;

      const currentVideo = videoRef.current;
      if (currentVideo) {
        const dimensionsChanged = currentVideo.videoWidth !== lastWidth || currentVideo.videoHeight !== lastHeight;
        const timeChanged = currentVideo.currentTime !== lastTime;

        if (forceDraw || dimensionsChanged || timeChanged) {
          const drawn = drawChromaPreviewFrame();
          if (drawn) {
            forceDraw = false;
            lastTime = currentVideo.currentTime;
            lastWidth = currentVideo.videoWidth;
            lastHeight = currentVideo.videoHeight;
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    if (video) {
      video.preload = 'auto';
      video.addEventListener('loadedmetadata', markDirty);
      video.addEventListener('loadeddata', markDirty);
      video.addEventListener('canplay', markDirty);
      video.addEventListener('seeked', markDirty);
      video.addEventListener('timeupdate', markDirty);
    }

    animationId = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      if (animationId) cancelAnimationFrame(animationId);
      if (video) {
        video.removeEventListener('loadedmetadata', markDirty);
        video.removeEventListener('loadeddata', markDirty);
        video.removeEventListener('canplay', markDirty);
        video.removeEventListener('seeked', markDirty);
        video.removeEventListener('timeupdate', markDirty);
      }
    };
  }, [chromaKey.enabled, drawChromaPreviewFrame, inputPath, previewChroma, videoResourceVersion]);

  // 停止三段预览
  const stopThreePhasePreview = useCallback(() => {
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = 0;
    }
    previewPhaseRef.current = 'idle';
    setPreviewPhase('idle');
    loopCountRef.current = 0;
    setLoopCount(0);
    // 恢复默认播放速度
    if (videoRef.current) videoRef.current.playbackRate = 1;
  }, []);

  // 预览循环动画（播放 loopStart 到 loopEnd，无限循环）
  const previewLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    stopThreePhasePreview();

    video.currentTime = segments.loopStart / 1000;
    video.playbackRate = speeds.loop;
    video.play().catch(() => {});
    setIsPlaying(true);

    const checkLoop = (): void => {
      if (video.currentTime * 1000 >= segments.loopEnd) {
        video.currentTime = segments.loopStart / 1000;
      }
      if (!video.paused) {
        requestAnimationFrame(checkLoop);
      }
    };
    requestAnimationFrame(checkLoop);
  }, [segments, speeds, stopThreePhasePreview]);

  // 预览完整动画（三段式：intro → loop×3 → outro）
  const previewFull = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    stopThreePhasePreview();

    const hasLoop = segments.loopStart < segments.loopEnd;

    video.currentTime = segments.start / 1000;
    video.playbackRate = hasLoop ? speeds.intro : speeds.intro;
    video.play().catch(() => {});
    setIsPlaying(true);

    if (!hasLoop) {
      // 无循环段：直接播放 start → end
      previewPhaseRef.current = 'intro';
      setPreviewPhase('intro');
      const checkWholeClip = (): void => {
        if (!video || video.paused) {
          stopThreePhasePreview();
          return;
        }

        if (video.currentTime * 1000 >= segments.end - 30) {
          if (loopWholeClip) {
            video.currentTime = segments.start / 1000;
            video.play().catch(() => {});
          } else {
            video.pause();
            setIsPlaying(false);
            stopThreePhasePreview();
            return;
          }
        }

        previewRafRef.current = requestAnimationFrame(checkWholeClip);
      };
      previewRafRef.current = requestAnimationFrame(checkWholeClip);
      return;
    }

    previewPhaseRef.current = 'intro';
    setPreviewPhase('intro');
    loopCountRef.current = 0;
    setLoopCount(0);

    const MAX_LOOPS = 3;
    const check = (): void => {
      if (!video || video.paused) {
        stopThreePhasePreview();
        return;
      }
      const ms = video.currentTime * 1000;
      const phase = previewPhaseRef.current;

      if (phase === 'intro' && ms >= segments.loopStart) {
        previewPhaseRef.current = 'loop';
        setPreviewPhase('loop');
        loopCountRef.current = 1;
        setLoopCount(1);
        video.playbackRate = speeds.loop;
      } else if (phase === 'loop' && ms >= segments.loopEnd - 30) {
        if (loopCountRef.current < MAX_LOOPS) {
          loopCountRef.current += 1;
          setLoopCount(loopCountRef.current);
          video.currentTime = segments.loopStart / 1000;
        } else {
          // 循环完成，进入 outro
          previewPhaseRef.current = 'outro';
          setPreviewPhase('outro');
          video.currentTime = segments.loopEnd / 1000;
          video.playbackRate = speeds.outro;
        }
      } else if (phase === 'outro' && ms >= segments.end - 30) {
        video.pause();
        setIsPlaying(false);
        stopThreePhasePreview();
        return;
      }

      previewRafRef.current = requestAnimationFrame(check);
    };
    previewRafRef.current = requestAnimationFrame(check);
  }, [loopWholeClip, segments, speeds, stopThreePhasePreview]);

  // 清理三段预览 RAF
  useEffect(() => {
    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    };
  }, []);

  // 时间轴拖拽
  const handleTimelineMouseDown = useCallback(
    (marker: SegmentMarkerKey, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      suppressNextTimelineClickRef.current = true;
      setDraggingMarker(marker);

      const onMouseMove = (ev: MouseEvent): void => {
        const tl = timelineRef.current;
        if (!tl) return;
        const rect = tl.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const ms = percent * duration;
        setMarker(marker, Math.round(ms));
        seekTo(Math.round(ms));
      };

      const onMouseUp = (): void => {
        setDraggingMarker(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.setTimeout(() => {
          suppressNextTimelineClickRef.current = false;
        }, 0);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [duration, setMarker, seekTo]
  );

  // 清空视频
  const handleClearVideo = useCallback(() => {
    stopThreePhasePreview();
    setInputPath('');
    setSegments({ ...DEFAULT_SEGMENTS });
    setCurrentTime(0);
    setIsPlaying(false);
    setTitle('');
  }, [stopThreePhasePreview]);

  // Canvas 录制导出：播放视频并实时应用色度键，通过 MediaRecorder 录制为 WebM VP9 with Alpha
  const recordCanvasWithChromaKey = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video) return reject(new Error('No video element'));

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return reject(new Error('Video dimensions not available'));

      // 创建录制用 canvas（使用输出尺寸）
      const outW = output.width || w;
      const outH = output.height || h;
      const recordCanvas = document.createElement('canvas');
      recordCanvas.width = outW;
      recordCanvas.height = outH;
      const ctx = recordCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Cannot get canvas context'));

      // 设置 MediaRecorder（VP9 支持 Alpha 通道）
      const mimeType = 'video/webm;codecs=vp9';
      if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
        return reject(new Error('MediaRecorder VP9 not supported'));
      }

      const stream = recordCanvas.captureStream(output.fps || 8);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
      recorder.onerror = () => reject(new Error('MediaRecorder error'));

      // 解析色度键参数
      const targetR = parseInt(chromaKey.color.slice(1, 3), 16);
      const targetG = parseInt(chromaKey.color.slice(3, 5), 16);
      const targetB = parseInt(chromaKey.color.slice(5, 7), 16);
      const threshold = (chromaKey.similarity / 100) * 255;
      const blendRange = chromaKey.blend;
      const hasLoopSeg = segments.loopStart < segments.loopEnd;

      // 计算预期录制总时长（墙钟时间），用于进度条
      const introDur = hasLoopSeg ? (segments.loopStart - segments.start) / speeds.intro : (segments.end - segments.start) / speeds.intro;
      const loopDur = hasLoopSeg ? (segments.loopEnd - segments.loopStart) / speeds.loop : 0;
      const outroDur = hasLoopSeg ? (segments.end - segments.loopEnd) / speeds.outro : 0;
      const expectedWallTime = introDur + loopDur + outroDur;
      const recordStartTime = Date.now();

      // 开始录制
      recorder.start(100); // 每 100ms 输出一次数据

      // 设置初始倍速并开始播放
      video.currentTime = segments.start / 1000;
      video.muted = true;
      video.playbackRate = speeds.intro;
      video.play().catch(reject);

      const drawFrame = (): void => {
        const currentMs = video.currentTime * 1000;

        // 根据当前位置动态调整倍速
        if (hasLoopSeg) {
          if (currentMs < segments.loopStart) {
            video.playbackRate = speeds.intro;
          } else if (currentMs < segments.loopEnd) {
            video.playbackRate = speeds.loop;
          } else {
            video.playbackRate = speeds.outro;
          }
        }

        if (currentMs >= segments.end - 16 || video.paused || video.ended) {
          video.pause();
          video.playbackRate = 1;
          // 延迟停止录制确保最后一帧被捕获
          setTimeout(() => recorder.stop(), 100);
          return;
        }

        // 更新进度（基于墙钟时间）
        const elapsed = Date.now() - recordStartTime;
        setProcessProgress(Math.min(1, elapsed / expectedWallTime));

        // 绘制帧并应用色度键
        ctx.drawImage(video, 0, 0, outW, outH);
        const imageData = ctx.getImageData(0, 0, outW, outH);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const distance = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);

          if (distance < threshold) {
            data[i + 3] = 0;
          } else if (distance < threshold + blendRange) {
            const alpha = ((distance - threshold) / blendRange) * 255;
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    });
  }, [chromaKey, segments, speeds, output]);

  // 处理并导入精灵动画
  const handleImport = useCallback(async () => {
    if (!inputPath || processingFlag) return;
    if (!ensureSpriteCapabilityAccessible(assetAuthoringCapability, onCapabilityBlocked)) return;
    stopThreePhasePreview();
    setInternalProcessing(true);
    setProcessProgress(0);

    try {
      const id = 'sprite-' + Math.random().toString(36).slice(2, 10);

      // 根据倍速计算调整后的时间点和持续时间
      const introDuration = hasLoop ? (segments.loopStart - segments.start) / speeds.intro : (segments.end - segments.start) / speeds.intro;
      const loopDuration = hasLoop ? (segments.loopEnd - segments.loopStart) / speeds.loop : 0;
      const outroDuration = hasLoop ? (segments.end - segments.loopEnd) / speeds.outro : 0;

      const adjustedLoopStart = hasLoop ? introDuration : undefined;
      const adjustedLoopEnd = hasLoop ? introDuration + loopDuration : undefined;
      const trimmedDuration = introDuration + loopDuration + outroDuration;

      if (chromaKey.enabled) {
        // Canvas 路径：实时录制色度键处理结果为 WebM VP9 with Alpha
        // 倍速已通过 video.playbackRate 在录制时应用
        const blob = await recordCanvasWithChromaKey();
        const arrayBuffer = await blob.arrayBuffer();
        await window.YUA.sprite.registerFromData({
          data: arrayBuffer,
          meta: {
            id,
            title: title || '自定义动画',
            primaryTrigger: animationMeta.primaryTrigger,
            triggerAliases: animationMeta.triggerAliases,
            priority: animationMeta.priority,
            condition: animationMeta.condition
          },
          loopStartMs: adjustedLoopStart,
          loopEndMs: adjustedLoopEnd,
          durationMs: trimmedDuration,
          autoIdle,
          loop: playbackLoop,
          width: playbackWidth,
          height: playbackHeight,
          padding,
          movement: movement.enabled ? movement : undefined
        });
      } else {
        // FFmpeg 路径：裁剪 + 倍速 + 转码 WebM VP9
        if (onProcess) {
          await onProcess({
            inputPath,
            segments,
            chromaKey,
            speeds,
            output,
            playbackScale,
            padding,
            movement,
            autoIdle,
            loop: playbackLoop,
            condition: animationMeta.condition,
            primaryTrigger: animationMeta.primaryTrigger,
            triggerAliases: animationMeta.triggerAliases,
            priority: animationMeta.priority,
            title
          });
          return; // onProcess 负责后续流程
        }
        // Fallback: 直接调用 FFmpeg + 注册
        const outputPath = inputPath.replace(/\.[^.\\/]+$/i, '') + '.sprite.webm';
        await window.YUA.ffmpeg.convertToSpriteAnimation({
          inputPath,
          outputPath,
          segments,
          speeds,
          output,
          chromaKey: { enabled: false, color: '#00ff00', similarity: 0, blend: 0 },
          meta: {
            title: title || '自定义动画',
            primaryTrigger: animationMeta.primaryTrigger,
            triggerAliases: animationMeta.triggerAliases,
            priority: animationMeta.priority,
            condition: animationMeta.condition
          }
        });
        await window.YUA.sprite.register({
          filePath: outputPath,
          width: playbackWidth,
          height: playbackHeight,
          padding,
          loopStartMs: adjustedLoopStart,
          loopEndMs: adjustedLoopEnd,
          durationMs: trimmedDuration,
          autoIdle,
          loop: playbackLoop,
          movement: movement.enabled ? movement : undefined,
          meta: {
            id,
            title: title || '自定义动画',
            primaryTrigger: animationMeta.primaryTrigger,
            triggerAliases: animationMeta.triggerAliases,
            priority: animationMeta.priority,
            condition: animationMeta.condition
          }
        });
      }

      onImportComplete?.();
    } catch (e: any) {
      console.error('精灵导入失败:', e);
    } finally {
      setInternalProcessing(false);
      setProcessProgress(0);
    }
  }, [
    inputPath,
    processingFlag,
    segments,
    speeds,
    output,
    chromaKey,
    animationMeta,
    title,
    hasLoop,
    padding,
    movement,
    playbackScale,
    playbackWidth,
    playbackHeight,
    autoIdle,
    playbackLoop,
    assetAuthoringCapability,
    stopThreePhasePreview,
    recordCanvasWithChromaKey,
    onCapabilityBlocked,
    onProcess,
    onImportComplete
  ]);

  return (
    <div className="h-full">
      {!inputPath && (
        // 未选择视频时显示大按钮占位符
        <button
          onClick={handleSelectFile}
          className="w-full h-48 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <div className="text-4xl text-muted-foreground/50">📁</div>
          <div className="text-sm text-muted-foreground">点击选择视频文件</div>
          <div className="text-xs text-muted-foreground/60">支持 MOV, MP4, MKV, AVI, WebM 等格式</div>
        </button>
      )}

      <div
        className="overflow-hidden overflow-y-auto"
        style={{
          height: 'calc(100% - 52px)'
        }}
      >
        {inputPath && (
          <>
            <div className="relative">
              <div className={`flex gap-2 ${previewChroma ? '' : ''}`}>
                <div className="absolute top-2 right-2 z-10">
                  <Button size="icon" onClick={handleClearVideo}>
                    <TbX />
                  </Button>
                </div>
                {/* 原始视频 */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4] max-h-[300px] flex items-center justify-center flex-1">
                  {/* 阶段指示器 */}
                  {previewPhase !== 'idle' && (
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${
                          previewPhase === 'intro' ? 'bg-green-500' : previewPhase === 'loop' ? 'bg-blue-500' : previewPhase === 'outro' ? 'bg-red-500' : 'bg-gray-500'
                        }`}
                      >
                        {previewPhase === 'intro' ? 'Intro' : previewPhase === 'loop' ? `Loop ${loopCount}/3` : previewPhase === 'outro' ? 'Outro' : ''}
                      </span>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    className="max-h-full max-w-full"
                    src={pathToResUrl(inputPath)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onLoadedData={requestChromaPreviewFrame}
                    onCanPlay={requestChromaPreviewFrame}
                    onSeeked={requestChromaPreviewFrame}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => {
                      setIsPlaying(false);
                      stopThreePhasePreview();
                    }}
                    preload="auto"
                    muted
                    playsInline
                  />
                </div>
                {/* 抠图预览（启用色度键后自动显示） */}
                {previewChroma && (
                  <div
                    className="relative rounded-lg overflow-hidden aspect-[3/4] max-h-[300px] flex items-center justify-center flex-1"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                    }}
                  >
                    <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                {/* 播放控制 */}
                <div className="flex items-center gap-2 mt-2 absolute bottom-0 left-0 right-0 p-2 bg-background/10">
                  <Button size="icon" variant="outline" className="w-8 h-8" onClick={togglePlay}>
                    {isPlaying ? <TbPlayerPause /> : <TbPlayerPlay />}
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={previewLoop} disabled={!hasLoop} title={hasLoop ? '预览循环片段（无限循环）' : '未设置循环片段'}>
                    循环预览
                  </Button>
                  <Button size="sm" variant="outline" onClick={previewFull} title={hasLoop ? '预览完整动画（循环3次后结束）' : loopWholeClip ? '预览整段循环动画' : '预览开始/结束时间内的动画'}>
                    完整预览
                  </Button>
                  {movement.enabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        window.YUA.sprite.previewMovement({
                          width: playbackWidth,
                          height: playbackHeight,
                          padding,
                          movement
                        });
                      }}
                      title="预览窗口移动效果"
                    >
                      测试移动
                    </Button>
                  )}
                  {movement.enabled && (
                    <Button size="sm" variant="ghost" onClick={() => window.YUA.sprite.stopMovementPreview()} title="停止窗口移动">
                      停止
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 时间轴 */}
            <div className="w-full">
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

              {/* 时间轴容器 */}
              <div style={{ width: `${100 * zoomLevel}%`, minWidth: '100%' }}>
                {/* 上方标签行 - 跟随光标位置 */}
                <div className="relative h-5 mb-1 overflow-visible">
                  {/* 开始标签 - 如果与循环开始相同则隐藏 */}
                  {!(hasLoop && segments.start === segments.loopStart) && (
                    <div
                      className="absolute text-[10px] text-green-600 font-medium whitespace-nowrap"
                      style={{
                        left: `${(segments.start / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.start / duration),
                        opacity: getMarkerOpacity('start', draggingMarker)
                      }}
                    >
                      开始
                    </div>
                  )}
                  {/* 循环开始标签 */}
                  {hasLoop && (
                    <div
                      className="absolute text-[10px] text-blue-600 font-medium whitespace-nowrap"
                      style={{
                        left: `${(segments.loopStart / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.loopStart / duration),
                        opacity: getMarkerOpacity('loopStart', draggingMarker)
                      }}
                    >
                      循环开始
                    </div>
                  )}
                  {/* 循环区域中间 - 删除按钮 */}
                  {hasLoop && (
                    <div
                      className="absolute flex items-center justify-center z-20"
                      style={{ left: `${((segments.loopStart + segments.loopEnd) / 2 / duration) * 100}%`, transform: 'translateX(-50%)' }}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLoop();
                        }}
                        title="移除循环片段"
                      >
                        <TbX />
                      </Button>
                    </div>
                  )}
                  {/* 循环结束标签 */}
                  {hasLoop && (
                    <div
                      className="absolute text-[10px] text-blue-600 font-medium whitespace-nowrap"
                      style={{
                        left: `${(segments.loopEnd / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.loopEnd / duration),
                        opacity: getMarkerOpacity('loopEnd', draggingMarker)
                      }}
                    >
                      循环结束
                    </div>
                  )}
                  {/* 结束标签 - 如果与循环结束相同则隐藏 */}
                  {!(hasLoop && segments.end === segments.loopEnd) && (
                    <div
                      className="absolute text-[10px] text-red-600 font-medium whitespace-nowrap"
                      style={{
                        left: `${(segments.end / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.end / duration),
                        opacity: getMarkerOpacity('end', draggingMarker)
                      }}
                    >
                      结束
                    </div>
                  )}
                </div>

                {/* 中间时间轴 */}
                <div
                  ref={timelineRef}
                  className="relative h-6 bg-muted rounded-lg overflow-visible cursor-pointer"
                  onClick={(e) => {
                    if (suppressNextTimelineClickRef.current) {
                      suppressNextTimelineClickRef.current = false;
                      return;
                    }
                    if (draggingMarker) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percent = x / rect.width;
                    // 如果没有循环片段，点击添加循环片段
                    if (!hasLoop && duration > 0) {
                      const clickTime = percent * duration;
                      if (isTimeInTrimmedSegment(segments, clickTime, duration)) {
                        addLoop(clickTime);
                      }
                    } else {
                      seekTo(percent * duration);
                    }
                  }}
                  onMouseMove={(e) => {
                    if (hasLoop) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percent = Math.max(0, Math.min(1, x / rect.width));
                    const hoverTime = percent * duration;
                    setHoverPosition(duration > 0 && isTimeInTrimmedSegment(segments, hoverTime, duration) ? percent : null);
                  }}
                  onMouseLeave={() => setHoverPosition(null)}
                >
                  {/* Intro 区域（start → loopStart）*/}
                  {duration > 0 && hasLoop && (
                    <div
                      className="absolute top-0 bottom-0 bg-green-500/10"
                      style={{
                        left: `${(segments.start / duration) * 100}%`,
                        width: `${((segments.loopStart - segments.start) / duration) * 100}%`
                      }}
                    />
                  )}
                  {/* 循环区域高亮（loopStart → loopEnd）*/}
                  {hasLoop && (
                    <div
                      className="absolute top-0 bottom-0 bg-blue-500/20"
                      style={{
                        left: `${(segments.loopStart / duration) * 100}%`,
                        width: `${((segments.loopEnd - segments.loopStart) / duration) * 100}%`
                      }}
                    />
                  )}
                  {/* Outro 区域（loopEnd → end）*/}
                  {duration > 0 && hasLoop && (
                    <div
                      className="absolute top-0 bottom-0 bg-red-500/10"
                      style={{
                        left: `${(segments.loopEnd / duration) * 100}%`,
                        width: `${((segments.end - segments.loopEnd) / duration) * 100}%`
                      }}
                    />
                  )}

                  {/* 播放进度线 */}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-10" style={{ left: `${(currentTime / duration) * 100}%` }} />

                  {/* 片段标记（可拖拽） */}
                  {/* 开始光标 - 如果与循环开始相同则隐藏 */}
                  {!(hasLoop && segments.start === segments.loopStart) && (
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-green-500 cursor-ew-resize z-20 hover:w-2"
                      style={{
                        left: `${(segments.start / duration) * 100}%`,
                        transform: 'translateX(-50%)',
                        opacity: getMarkerOpacity('start', draggingMarker)
                      }}
                      onMouseDown={(e) => handleTimelineMouseDown('start', e)}
                    />
                  )}
                  {hasLoop && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-blue-500 cursor-ew-resize z-20 hover:w-2"
                        style={{
                          left: `${(segments.loopStart / duration) * 100}%`,
                          transform: 'translateX(-50%)',
                          opacity: getMarkerOpacity('loopStart', draggingMarker)
                        }}
                        onMouseDown={(e) => handleTimelineMouseDown('loopStart', e)}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-blue-500 cursor-ew-resize z-20 hover:w-2"
                        style={{
                          left: `${(segments.loopEnd / duration) * 100}%`,
                          transform: 'translateX(-50%)',
                          opacity: getMarkerOpacity('loopEnd', draggingMarker)
                        }}
                        onMouseDown={(e) => handleTimelineMouseDown('loopEnd', e)}
                      />
                    </>
                  )}
                  {/* 结束光标 - 如果与循环结束相同则隐藏 */}
                  {!(hasLoop && segments.end === segments.loopEnd) && (
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-red-500 cursor-ew-resize z-20 hover:w-2"
                      style={{
                        left: `${(segments.end / duration) * 100}%`,
                        transform: 'translateX(-50%)',
                        opacity: getMarkerOpacity('end', draggingMarker)
                      }}
                      onMouseDown={(e) => handleTimelineMouseDown('end', e)}
                    />
                  )}

                  {/* 悬停时显示添加循环片段提示 */}
                  {!hasLoop && hoverPosition !== null && (
                    <div className="absolute -top-7 z-30 pointer-events-none" style={{ left: `${hoverPosition * 100}%`, transform: 'translateX(-50%)' }}>
                      <div className="whitespace-nowrap rounded bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">添加循环片段</div>
                    </div>
                  )}
                </div>

                {/* 下方时间输入行 - 跟随光标位置 */}
                <div className="relative h-7 mt-1 overflow-visible">
                  {/* 开始时间 - 如果与循环开始相同则隐藏 */}
                  {!(hasLoop && segments.start === segments.loopStart) && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(segments.start / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.start / duration),
                        opacity: getMarkerOpacity('start', draggingMarker)
                      }}
                    >
                      <Input value={formatTime(segments.start)} onChange={(e) => setMarker('start', parseTime(e.target.value))} className="h-6 w-16 text-[10px] font-mono text-center px-1" />
                    </div>
                  )}
                  {/* 循环开始时间 */}
                  {hasLoop && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(segments.loopStart / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.loopStart / duration),
                        opacity: getMarkerOpacity('loopStart', draggingMarker)
                      }}
                    >
                      <Input
                        value={formatTime(segments.loopStart)}
                        onChange={(e) => setMarker('loopStart', parseTime(e.target.value))}
                        className="h-6 w-16 text-[10px] font-mono text-center px-1 text-blue-600"
                      />
                    </div>
                  )}
                  {/* 循环结束时间 */}
                  {hasLoop && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(segments.loopEnd / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.loopEnd / duration),
                        opacity: getMarkerOpacity('loopEnd', draggingMarker)
                      }}
                    >
                      <Input
                        value={formatTime(segments.loopEnd)}
                        onChange={(e) => setMarker('loopEnd', parseTime(e.target.value))}
                        className="h-6 w-16 text-[10px] font-mono text-center px-1 text-blue-600"
                      />
                    </div>
                  )}
                  {/* 结束时间 - 如果与循环结束相同则隐藏 */}
                  {!(hasLoop && segments.end === segments.loopEnd) && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(segments.end / duration) * 100}%`,
                        transform: getEdgeAwareTransform(segments.end / duration),
                        opacity: getMarkerOpacity('end', draggingMarker)
                      }}
                    >
                      <Input value={formatTime(segments.end)} onChange={(e) => setMarker('end', parseTime(e.target.value))} className="h-6 w-16 text-[10px] font-mono text-center px-1 text-red-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 片段倍速设置 */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">片段倍速</Label>
              <div className="space-y-1.5">
                {hasLoop ? (
                  <>
                    {/* Intro 倍速 */}
                    {segments.loopStart > segments.start && (
                      <SpeedRow
                        label="开始"
                        color="text-green-600"
                        originalDuration={segments.loopStart - segments.start}
                        speed={speeds.intro}
                        onChange={(v) => setSpeeds((prev) => ({ ...prev, intro: v }))}
                      />
                    )}
                    {/* Loop 倍速 */}
                    <SpeedRow
                      label="循环"
                      color="text-blue-600"
                      originalDuration={segments.loopEnd - segments.loopStart}
                      speed={speeds.loop}
                      onChange={(v) => setSpeeds((prev) => ({ ...prev, loop: v }))}
                    />
                    {/* Outro 倍速 */}
                    {segments.end > segments.loopEnd && (
                      <SpeedRow
                        label="结束"
                        color="text-red-600"
                        originalDuration={segments.end - segments.loopEnd}
                        speed={speeds.outro}
                        onChange={(v) => setSpeeds((prev) => ({ ...prev, outro: v }))}
                      />
                    )}
                  </>
                ) : (
                  <SpeedRow label="全部" color="text-foreground" originalDuration={segments.end - segments.start} speed={speeds.intro} onChange={(v) => setSpeeds({ intro: v, loop: v, outro: v })} />
                )}
              </div>
            </div>

            {/* 背景抠图设置 */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">背景抠图（色度键）</Label>
                <Switch checked={chromaKey.enabled} onCheckedChange={(checked) => setChromaKey((prev) => ({ ...prev, enabled: checked }))} />
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
                        className="w-8 h-8 rounded cursor-pointer border shrink-0"
                      />
                      <Input value={chromaKey.color} onChange={(e) => setChromaKey((prev) => ({ ...prev, color: e.target.value }))} className="h-8 font-mono text-xs" />
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
                    <Slider value={[chromaKey.similarity]} onValueChange={([v]) => setChromaKey((prev) => ({ ...prev, similarity: v }))} min={1} max={100} className="mt-2" />
                  </div>

                  <div>
                    <Label className="text-xs">边缘羽化: {chromaKey.blend}%</Label>
                    <Slider value={[chromaKey.blend]} onValueChange={([v]) => setChromaKey((prev) => ({ ...prev, blend: v }))} min={1} max={50} className="mt-2" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex border-t pt-3">
              {/* 输出设置 */}
              <div className="space-y-2 border-t pt-3 flex-1">
                <Label className="text-xs">输出设置</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground shrink-0">宽</Label>
                    <Input
                      type="number"
                      value={output.width}
                      onChange={(e) => setOutput((prev) => ({ ...prev, width: Math.max(1, parseInt(e.target.value) || 0) }))}
                      className="h-7 w-16 text-xs text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground shrink-0">高</Label>
                    <Input
                      type="number"
                      value={output.height}
                      onChange={(e) => setOutput((prev) => ({ ...prev, height: Math.max(1, parseInt(e.target.value) || 0) }))}
                      className="h-7 w-16 text-xs text-center"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[11px] text-muted-foreground shrink-0">FPS</Label>
                    <Input
                      type="number"
                      value={output.fps}
                      onChange={(e) => setOutput((prev) => ({ ...prev, fps: Math.max(1, Math.min(60, parseInt(e.target.value) || 0)) }))}
                      className="h-7 w-14 text-xs text-center"
                    />
                  </div>
                </div>
              </div>

              {/* 窗口设置 */}
              <div className="space-y-3 border-t pt-3 flex-1">
                <div className="text-lg font-bold">播放设置</div>
                <div className="flex items-center gap-1">
                  <div className="text-[11px] text-muted-foreground shrink-0">视频播放倍数</div>
                  <Select value={String(playbackScale)} onValueChange={(v) => setPlaybackScale(Number(v))}>
                    <SelectTrigger className="h-8 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">@x1</SelectItem>
                      <SelectItem value="2">@x2</SelectItem>
                      <SelectItem value="3">@x3</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    Video = {output.width} x {output.height}, JSON = {playbackWidth} x {playbackHeight} Window = {playbackWidth + padding * 2} x {playbackHeight + padding * 2}
                  </span>
                  <div className="text-[11px] text-muted-foreground shrink-0">窗口设置</div>
                  <Input type="number" value={padding} onChange={(e) => setPadding(Math.max(0, parseInt(e.target.value) || 0))} className="h-7 w-16 text-xs text-center" />
                </div>

                {/* 窗口移动 */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">播放时窗口移动</Label>
                  <Switch checked={movement.enabled} onCheckedChange={(checked) => setMovement((prev) => ({ ...prev, enabled: checked }))} />
                </div>

                {movement.enabled && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground shrink-0">模式</Label>
                        <Select value={movement.mode ?? 'direction'} onValueChange={(v) => setMovement((prev) => ({ ...prev, mode: v as SpriteMovementMode }))}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="direction">方向移动</SelectItem>
                            <SelectItem value="walkTo">随机行走</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground shrink-0">速度</Label>
                        <Input
                          type="number"
                          value={movement.speed ?? 60}
                          onChange={(e) => setMovement((prev) => ({ ...prev, speed: Math.max(1, parseInt(e.target.value) || 60) }))}
                          className="h-7 w-16 text-xs text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">px/s</span>
                      </div>
                    </div>

                    {(movement.mode ?? 'direction') === 'direction' && (
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground shrink-0">方向</Label>
                        <Select value={movement.direction ?? 'random'} onValueChange={(v) => setMovement((prev) => ({ ...prev, direction: v as SpriteMovementDirection }))}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">← 向左</SelectItem>
                            <SelectItem value="right">→ 向右</SelectItem>
                            <SelectItem value="up">↑ 向上</SelectItem>
                            <SelectItem value="down">↓ 向下</SelectItem>
                            <SelectItem value="up-left">↖ 左上</SelectItem>
                            <SelectItem value="up-right">↗ 右上</SelectItem>
                            <SelectItem value="down-left">↙ 左下</SelectItem>
                            <SelectItem value="down-right">↘ 右下</SelectItem>
                            <SelectItem value="random">🎲 随机</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(movement.mode ?? 'direction') === 'walkTo' && (
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground shrink-0">竖直范围</Label>
                        <Input
                          type="number"
                          step="0.05"
                          min="0.01"
                          max="1"
                          value={movement.verticalRange ?? 0.1}
                          onChange={(e) => setMovement((prev) => ({ ...prev, verticalRange: Math.max(0.01, Math.min(1, parseFloat(e.target.value) || 0.1)) }))}
                          className="h-7 w-16 text-xs text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">屏幕比例</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Label className="text-[11px] text-muted-foreground shrink-0">触发</Label>
                        <Select value={movement.trigger ?? 'animation'} onValueChange={(v) => setMovement((prev) => ({ ...prev, trigger: v as SpriteMovementTrigger }))}>
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="animation">动画播放时</SelectItem>
                            <SelectItem value="behavior">行为调度</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {movement.trigger === 'behavior' && (
                      <div className="space-y-1 pl-2 border-l-2 border-muted">
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] text-muted-foreground shrink-0">间隔</Label>
                          <Select
                            value={movement.behaviorSchedule?.type ?? 'random'}
                            onValueChange={(v) => setMovement((prev) => ({ ...prev, behaviorSchedule: { ...prev.behaviorSchedule, type: v as 'random' | 'interval' } }))}
                          >
                            <SelectTrigger className="h-7 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="random">随机</SelectItem>
                              <SelectItem value="interval">固定</SelectItem>
                            </SelectContent>
                          </Select>
                          {(movement.behaviorSchedule?.type ?? 'random') === 'random' ? (
                            <>
                              <Input
                                type="number"
                                value={(movement.behaviorSchedule?.minMs ?? 10000) / 1000}
                                onChange={(e) =>
                                  setMovement((prev) => ({
                                    ...prev,
                                    behaviorSchedule: { ...prev.behaviorSchedule, type: prev.behaviorSchedule?.type ?? 'random', minMs: Math.max(1, parseInt(e.target.value) || 10) * 1000 }
                                  }))
                                }
                                className="h-7 w-14 text-xs text-center"
                              />
                              <span className="text-[10px] text-muted-foreground">~</span>
                              <Input
                                type="number"
                                value={(movement.behaviorSchedule?.maxMs ?? 25000) / 1000}
                                onChange={(e) =>
                                  setMovement((prev) => ({
                                    ...prev,
                                    behaviorSchedule: { ...prev.behaviorSchedule, type: prev.behaviorSchedule?.type ?? 'random', maxMs: Math.max(1, parseInt(e.target.value) || 25) * 1000 }
                                  }))
                                }
                                className="h-7 w-14 text-xs text-center"
                              />
                              <span className="text-[10px] text-muted-foreground">秒</span>
                            </>
                          ) : (
                            <>
                              <Input
                                type="number"
                                value={(movement.behaviorSchedule?.intervalMs ?? 15000) / 1000}
                                onChange={(e) =>
                                  setMovement((prev) => ({ ...prev, behaviorSchedule: { ...prev.behaviorSchedule, type: 'interval', intervalMs: Math.max(1, parseInt(e.target.value) || 15) * 1000 } }))
                                }
                                className="h-7 w-14 text-xs text-center"
                              />
                              <span className="text-[10px] text-muted-foreground">秒</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] text-muted-foreground shrink-0">概率</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={movement.behaviorSchedule?.probability ?? 0.8}
                            onChange={(e) =>
                              setMovement((prev) => ({
                                ...prev,
                                behaviorSchedule: { ...prev.behaviorSchedule, type: prev.behaviorSchedule?.type ?? 'random', probability: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.8)) }
                              }))
                            }
                            className="h-7 w-16 text-xs text-center"
                          />
                          <Label className="text-[11px] text-muted-foreground shrink-0">空闲</Label>
                          <Input
                            type="number"
                            value={(movement.behaviorSchedule?.minIdleMs ?? 5000) / 1000}
                            onChange={(e) =>
                              setMovement((prev) => ({
                                ...prev,
                                behaviorSchedule: { ...prev.behaviorSchedule, type: prev.behaviorSchedule?.type ?? 'random', minIdleMs: Math.max(0, parseInt(e.target.value) || 5) * 1000 }
                              }))
                            }
                            className="h-7 w-14 text-xs text-center"
                          />
                          <span className="text-[10px] text-muted-foreground">秒</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {/* 处理按钮 */}
      <div className="flex w-full flex-col gap-3 border-t pt-4">
        <SpriteCapabilityLockedNotice capability={assetAuthoringCapability} hint="精灵资源管理尚未解锁时，可以调整参数和预览素材，但不能把视频导入为精灵动画。" />
        {inputPath && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 shrink-0">
                <Switch checked={autoIdle} onCheckedChange={setAutoIdle} />
                <div className="leading-tight">
                  <div className="text-xs font-medium">播完回到 Idle</div>
                  <div className="text-[10px] text-muted-foreground">默认开启，关闭后会停在动画结尾</div>
                </div>
              </div>
              {!hasLoop && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 shrink-0">
                  <Switch checked={loopWholeClip} onCheckedChange={setLoopWholeClip} />
                  <div className="leading-tight">
                    <div className="text-xs font-medium">整段循环</div>
                    <div className="text-[10px] text-muted-foreground">按开始/结束时间循环截取片段</div>
                  </div>
                </div>
              )}
              <Input className="min-w-[220px] flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="动画名称" />
              <SpriteTriggerPicker value={primaryTrigger} onChange={setPrimaryTrigger} buttonClassName="w-[240px]" emptyLabel="未分类" />
              <Button variant="default" onClick={handleImport} disabled={!canAuthorAnimations || processingFlag || !inputPath || !!parsedCondition.error}>
                {processingFlag ? (chromaKey.enabled ? `录制中… ${Math.round(processProgress * 100)}%` : '处理中…') : chromaKey.enabled ? '录制并导入' : '转码并导入'}
              </Button>
            </div>
            <div className="space-y-2 rounded-md border border-dashed px-3 py-3">
              <div className="grid gap-2 md:grid-cols-[1fr_120px]">
                <div className="min-w-0">
                  <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">别名 Trigger</Label>
                  <Input
                    value={triggerAliasesInput}
                    onChange={(e) => setTriggerAliasesInput(e.target.value)}
                    placeholder="多个 trigger 用逗号或换行分隔，例如 workflow:complete, persona:daily-login"
                    className="h-8"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    实际命中：
                    {[animationMeta.primaryTrigger, ...(animationMeta.triggerAliases ?? [])].filter(Boolean).join(', ') || '未设置'}
                  </div>
                </div>
                <div className="shrink-0">
                  <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">优先级</Label>
                  <Input type="number" step="1" value={priorityInput} onChange={(e) => setPriorityInput(e.target.value)} placeholder="0" className="h-8 text-center" />
                  <div className="mt-1 text-[10px] text-muted-foreground text-center">默认 0</div>
                </div>
              </div>
              <div className="min-w-0">
                <SpriteAnimationConditionBuilder conditionInput={conditionInput} onChange={setConditionInput} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SpriteVideoEditor;
