/**
 * TTS 播放器（纯 JS/TS，非 React 组件）
 *
 * 基于 history JSON 播放 orderList 中的 TTS 音频，支持：
 * - play / pause / seek / playbackRate / currentTime / duration
 * - 按需加载音频，不一次性加载全部
 * - seek 到未加载区域时加载附近片段
 * - st/et 与 trimmedDuration 不一致时按倍率播放（加速/减速）
 * - 用户倍速与片段倍率相乘
 * - 片段之间的时间间隔（gap）不播放声音，仅计时，到下一段 st 继续播放
 */

/** 解析 SRT 时间字符串为秒数（HH:MM:SS,mmm 或 HH:MM:SS.mmm） */
function parseTimeToSeconds(timeStr: string | undefined): number {
  if (timeStr == null || timeStr === '') return 0;
  const normalized = String(timeStr).replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    const sec = parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
    return Number.isFinite(sec) ? sec : 0;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    const sec = parseFloat(m) * 60 + parseFloat(s);
    return Number.isFinite(sec) ? sec : 0;
  }
  const sec = parseFloat(parts[0]);
  return Number.isFinite(sec) ? sec : 0;
}

/** 播放器可接受的 history 结构（与 BatchTTSHistory 兼容） */
export interface TTSPlayerHistory {
  orderList: string[];
  segmentInfoMap: Record<string, { st?: string; et?: string; duration?: number; trimmedDuration?: number }>;
  trimmedAudioMap: Record<string, string>;
}

/** 内部时间轴片段 */
interface TTSPlayerSegment {
  md5: string;
  st: number;
  et: number;
  slotDuration: number;
  trimmedDurationSec: number;
  /** 片段内播放倍率 = 实际音频时长 / 槽时长，≠1 时需加速或减速 */
  segmentPlaybackRate: number;
  /** 用于加载的路径（相对或绝对，由 resolveAudioUrl 解析） */
  audioPath: string;
  index: number;
}

export interface TTSPlayerOptions {
  /** 将 history 中的相对路径解析为可播放的 URL（如 res://、file://） */
  resolveAudioUrl: (relativePath: string) => string;
  /** 预加载当前片段后几个片段，默认 1 */
  preloadAhead?: number;
  /** 距离当前时间超过多少秒的片段可卸载，默认 60 */
  unloadAfterSec?: number;
}

type TTSPlayerEventType = 'play' | 'pause' | 'timeupdate' | 'ended' | 'error';

type TTSPlayerEventListener = (e: { type: TTSPlayerEventType; currentTime?: number; duration?: number; error?: Error }) => void;

export class TTSPlayer {
  private options: Required<Omit<TTSPlayerOptions, 'resolveAudioUrl'>> & Pick<TTSPlayerOptions, 'resolveAudioUrl'>;
  private segments: TTSPlayerSegment[] = [];
  private _duration = 0;
  private _currentTime = 0;
  private _playbackRate = 1;
  private _paused = true;
  private audioEl: HTMLAudioElement | null = null;
  private currentSegmentIndex: number | null = null;
  private rafId: number | null = null;
  private lastWallTime = 0;
  private listeners: TTSPlayerEventListener[] = [];
  /** 已加载的音频：md5 -> Audio（用于预加载与复用） */
  private audioPool: Map<string, HTMLAudioElement> = new Map();
  /** 最近使用时间：md5 -> timestamp，用于决定是否卸载 */
  private lastUsedAt: Map<string, number> = new Map();

  constructor(history: TTSPlayerHistory, options: TTSPlayerOptions) {
    this.options = {
      resolveAudioUrl: options.resolveAudioUrl,
      preloadAhead: options.preloadAhead ?? 1,
      unloadAfterSec: options.unloadAfterSec ?? 60
    };
    this.loadHistory(history);
  }

  /** 从 history 构建时间轴片段列表 */
  loadHistory(history: TTSPlayerHistory): void {
    const { orderList, segmentInfoMap, trimmedAudioMap } = history;
    const segments: TTSPlayerSegment[] = [];
    let maxEt = 0;
    orderList.forEach((md5, index) => {
      const info = segmentInfoMap[md5];
      const pathRel = trimmedAudioMap[md5];
      if (!info || pathRel == null) return;
      const st = parseTimeToSeconds(info.st);
      const et = parseTimeToSeconds(info.et);
      const trimmedMs = info.trimmedDuration ?? info.duration ?? 0;
      const trimmedDurationSec = trimmedMs / 1000;
      const slotDuration = Math.max(et - st, 0.001);
      const segmentPlaybackRate = trimmedDurationSec / slotDuration;
      maxEt = Math.max(maxEt, et);
      segments.push({
        md5,
        st,
        et,
        slotDuration,
        trimmedDurationSec,
        segmentPlaybackRate,
        audioPath: pathRel,
        index
      });
    });
    this.segments = segments;
    this._duration = maxEt;
    this.currentSegmentIndex = null;
    this.audioPool.forEach((a) => {
      a.pause();
      a.src = '';
    });
    this.audioPool.clear();
    this.lastUsedAt.clear();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
  }

  get currentTime(): number {
    return this._currentTime;
  }

  set currentTime(value: number) {
    const t = Math.max(0, Math.min(value, this._duration));
    this._currentTime = t;
    this.lastWallTime = performance.now() / 1000;
    this.syncToTime(t);
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = Math.max(0.25, Math.min(4, value));
    if (this.audioEl) this.audioEl.playbackRate = this.getEffectivePlaybackRate();
  }

  get paused(): boolean {
    return this._paused;
  }

  get totalDuration(): number {
    return this._duration;
  }

  /** 与 HTMLMediaElement 一致：总时长（秒） */
  get duration(): number {
    return this._duration;
  }

  /** 当前片段的有效播放倍率 = 片段倍率 × 用户倍率 */
  private getEffectivePlaybackRate(): number {
    const seg = this.getSegmentAtTime(this._currentTime);
    if (!seg) return this._playbackRate;
    return seg.segment.segmentPlaybackRate * this._playbackRate;
  }

  private getSegmentAtTime(time: number): { segment: TTSPlayerSegment; localTime: number } | null {
    for (const segment of this.segments) {
      if (time >= segment.st && time < segment.et) {
        return { segment, localTime: time - segment.st };
      }
    }
    return null;
  }

  private findSegmentIndexAtTime(time: number): number {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (time >= seg.st && time < seg.et) return i;
    }
    return -1;
  }

  /** 根据时间轴时间同步：若在片段内则播放对应音频并同步 offset；若在 gap 则静音 */
  private syncToTime(time: number): void {
    const entry = this.getSegmentAtTime(time);
    const newIndex = this.findSegmentIndexAtTime(time);
    if (entry) {
      const { segment, localTime } = entry;
      const audioOffsetSec = localTime * segment.segmentPlaybackRate;
      const segmentChanged = this.currentSegmentIndex !== segment.index;
      if (segmentChanged) {
        this.currentSegmentIndex = segment.index;
        this.lastUsedAt.set(segment.md5, Date.now());
        const audio = this.getOrLoadAudio(segment);
        if (audio) {
          if (this.audioEl && this.audioEl !== audio) {
            this.audioEl.pause();
          }
          this.audioEl = audio;
          const setPositionAndPlay = (): void => {
            if (this.audioEl !== audio) return;
            audio.currentTime = audioOffsetSec;
            audio.playbackRate = segment.segmentPlaybackRate * this._playbackRate;
            const onEnded = (): void => {
              audio.removeEventListener('ended', onEnded);
              this._currentTime = segment.et;
              this.lastWallTime = performance.now() / 1000;
              this.syncToTime(segment.et);
            };
            audio.removeEventListener('ended', onEnded);
            audio.addEventListener('ended', onEnded);
            if (!this._paused) audio.play().catch(() => {});
          };
          if (audio.readyState >= 2) {
            setPositionAndPlay();
          } else {
            const onReady = (): void => {
              audio.removeEventListener('canplaythrough', onReady);
              setPositionAndPlay();
            };
            audio.addEventListener('canplaythrough', onReady);
          }
        }
      } else if (this.audioEl) {
        this.audioEl.playbackRate = segment.segmentPlaybackRate * this._playbackRate;
        if (this._paused) this.audioEl.currentTime = audioOffsetSec;
      }
    } else {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      this.currentSegmentIndex = null;
      this.audioEl = null;
    }
    this.maybeUnloadFarSegments(time);
    this.maybePreloadAhead(newIndex >= 0 ? newIndex : this.nextSegmentIndex(time));
  }

  private nextSegmentIndex(afterTime: number): number {
    for (let i = 0; i < this.segments.length; i++) {
      if (this.segments[i].st >= afterTime) return i;
    }
    return this.segments.length;
  }

  private getOrLoadAudio(segment: TTSPlayerSegment): HTMLAudioElement | null {
    let audio = this.audioPool.get(segment.md5);
    if (audio) return audio;
    const url = this.options.resolveAudioUrl(segment.audioPath);
    if (!url) return null;
    audio = new Audio(url);
    this.audioPool.set(segment.md5, audio);
    audio.addEventListener('error', () => this.emit({ type: 'error', error: new Error('Audio load failed') }));
    return audio;
  }

  private maybePreloadAhead(fromIndex: number): void {
    const n = this.options.preloadAhead;
    for (let i = fromIndex; i < Math.min(fromIndex + n + 1, this.segments.length); i++) {
      const seg = this.segments[i];
      if (!this.audioPool.has(seg.md5)) {
        const a = this.getOrLoadAudio(seg);
        if (a) a.load();
      }
    }
  }

  private maybeUnloadFarSegments(currentTime: number): void {
    const threshold = this.options.unloadAfterSec;
    const now = Date.now();
    for (const [md5, el] of this.audioPool.entries()) {
      if (el === this.audioEl) continue;
      const seg = this.segments.find((s) => s.md5 === md5);
      if (!seg) continue;
      const dist = Math.min(Math.abs(seg.st - currentTime), Math.abs(seg.et - currentTime));
      if (dist > threshold) {
        const used = this.lastUsedAt.get(md5) ?? 0;
        if (now - used > 15000) {
          el.pause();
          el.src = '';
          this.audioPool.delete(md5);
          this.lastUsedAt.delete(md5);
        }
      }
    }
  }

  private tick = (): void => {
    if (this._paused) return;
    const now = performance.now() / 1000;
    const elapsed = now - this.lastWallTime;
    this.lastWallTime = now;
    this._currentTime = Math.min(this._currentTime + elapsed * this._playbackRate, this._duration);
    this.syncToTime(this._currentTime);
    this.emit({ type: 'timeupdate', currentTime: this._currentTime, duration: this._duration });
    if (this._currentTime >= this._duration) {
      this._paused = true;
      if (this.audioEl) this.audioEl.pause();
      this.emit({ type: 'ended', currentTime: this._currentTime, duration: this._duration });
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  play(): void {
    if (this._duration <= 0) return;
    this._paused = false;
    this.lastWallTime = performance.now() / 1000;
    this.syncToTime(this._currentTime);
    if (this.audioEl) this.audioEl.play().catch(() => {});
    this.emit({ type: 'play', currentTime: this._currentTime, duration: this._duration });
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this._paused = true;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioEl) this.audioEl.pause();
    this.emit({ type: 'pause', currentTime: this._currentTime, duration: this._duration });
  }

  addEventListener(cb: TTSPlayerEventListener): void {
    this.listeners.push(cb);
  }

  removeEventListener(cb: TTSPlayerEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  private emit(e: { type: TTSPlayerEventType; currentTime?: number; duration?: number; error?: Error }): void {
    this.listeners.forEach((l) => l(e));
  }

  destroy(): void {
    this.pause();
    this.audioEl = null;
    this.currentSegmentIndex = null;
    this.audioPool.forEach((a) => {
      a.pause();
      a.src = '';
    });
    this.audioPool.clear();
    this.lastUsedAt.clear();
    this.listeners = [];
  }
}
