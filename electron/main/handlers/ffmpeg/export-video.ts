// 我的资源预览界面搭搭配字幕时间轴的预览效果和截图类似。现在我的字幕时间轴已经支持原视频的音轨展示，转录出来的字幕轨道展示，更多额外的翻译字幕展示，以及给字幕合成的语音轨道展示等等。现在，我需要做一个导出功能，在用户选择导出的时候，把这些轨道列表展示近导出弹窗，让用户勾选确认要导出哪些轨道。导出的过程是：
// 1. 根据勾选的轨道，将每个轨道的内容导出来，比如字幕轨道导出字幕文件，音频轨道导出音频文件等等。
// 2. 导出的文件都放在资源文件夹的导出目录暂存
// 3. 最终将导出的字幕，音频等，合并成一个视频文件导出。
// 4. 按照主流的导出格式让用户可以选择清晰度等等信息。
// 5. 使用的都是ffmpeg的命令来实现字幕嵌入，转码，音视频拼接等等信息。
// 6 从截图是可以看到，音频合成的轨道有很多空白，这种空白是需要用ffmpeg填充静音的，并且导出的音频时长是界面展示的总时长，不能只做简单的音频拼接。
// 7 音频存在加速，减速等功能，要理性分析轨道的配置信息，结果TTS合成的音频信息实现。

/**
 * 视频导出 FFmpeg 处理器
 *
 * 功能：
 * - 导出字幕文件（SRT/ASS）
 * - 处理TTS音频（填充静音、调速、拼接为完整音轨）
 * - 合并视频+字幕+音频
 * - 支持硬字幕/软字幕/外挂字幕
 * - 支持多种清晰度和编码格式
 */
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

// ---------- 类型定义（与渲染进程共享） ----------

interface ExportConfig {
  selectedTrackIds: string[];
  subtitleEmbedMode: 'hardcode' | 'softcode' | 'external';
  videoCodec: 'h264' | 'h265' | 'vp9';
  container: 'mp4' | 'mkv' | 'webm';
  qualityPreset: 'original' | '4k' | '1080p' | '720p' | '480p';
  crf: number;
  audioBitrate: number;
}

interface ExportSubtitleTrack {
  trackId: string;
  label: string;
  languageCode?: string;
  srtContent: string;
  assContent?: string;
}

interface ExportTTSAudioTrack {
  trackId: string;
  label: string;
  segments: ExportTTSSegment[];
}

interface ExportTTSSegment {
  index: number;
  audioPath: string;
  startTime: number;
  endTime: number;
  originalDuration: number;
  trimmedDuration?: number;
  playbackRate?: number;
}

interface ExportRequest {
  videoPath: string;
  duration: number;
  config: ExportConfig;
  subtitleTracks: ExportSubtitleTrack[];
  ttsAudioTracks: ExportTTSAudioTrack[];
  resourceId: string;
  workspaceId?: string;
  folderId?: string;
}

interface ExportedFileInfo {
  label: string;
  fileName: string;
  filePath: string;
  type: 'subtitle' | 'tts-audio' | 'video';
}

interface ExportProgress {
  stage: 'preparing' | 'exporting-tracks' | 'encoding' | 'done' | 'error';
  stageLabel: string;
  progress: number;
  totalProgress: number;
  error?: string;
  exportedFiles?: ExportedFileInfo[];
  exportDir?: string;
}

const QUALITY_PRESETS: Record<string, { width?: number; height?: number; bitrate?: string }> = {
  original: {},
  '4k': { width: 3840, height: 2160, bitrate: '20M' },
  '1080p': { width: 1920, height: 1080, bitrate: '8M' },
  '720p': { width: 1280, height: 720, bitrate: '5M' },
  '480p': { width: 854, height: 480, bitrate: '2.5M' }
};

// ESM-safe __dirname
const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

// ffmpeg/ffprobe 路径
const ffmpegPath = path.join(__dirname2, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const ffprobePath = path.join(__dirname2, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

/**
 * 发送导出进度给渲染进程
 */
function sendProgress(win: BrowserWindow, progress: ExportProgress): void {
  win.webContents.send('export-progress', progress);
}

/**
 * 转义 ffmpeg filter 中的路径字符串
 * ffmpeg filter parser 对以下字符有特殊含义：
 *   ' (单引号) → 字符串定界符
 *   \ (反斜杠) → 转义符
 *   : (冒号)   → 选项分隔符
 *   [ ] ; ,     → filter graph 语法
 *
 * 策略：用单引号包裹，并在内部转义 \ → \\ 和 ' → '\'' 和 : → \:
 */
function escapeFilterPath(p: string): string {
  const escaped = p
    .replace(/\\/g, '/') // 统一路径分隔符
    .replace(/'/g, "'\\''") // 转义单引号: ' → '\''
    .replace(/:/g, '\\:'); // 转义冒号（Windows 盘符 C: 等）
  return `'${escaped}'`;
}

/**
 * 执行 ffmpeg 命令（Promise化），带完整日志
 */
function runFfmpegCommand(args: string[], label?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tag = label ? `[export-ffmpeg][${label}]` : '[export-ffmpeg]';
    console.log(`${tag} 执行: ${ffmpegPath}`);
    console.log(`${tag} 参数: ${JSON.stringify(args)}`);

    const proc = execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stderr) {
        // ffmpeg 正常日志也输出到 stderr，仅在出错时打印完整 stderr
        console.log(`${tag} stderr (最后 500 字符): ${stderr.slice(-500)}`);
      }
      if (error) {
        const errorMsg = `${tag} 失败 (exit code ${(error as any).code ?? 'unknown'})\n命令: ${ffmpegPath} ${args.join(' ')}\nstderr:\n${stderr?.slice(-2000) || '(无)'}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      } else {
        console.log(`${tag} 完成`);
        resolve(stdout);
      }
    });

    // 安全检查：如果 proc 没有成功创建
    if (!proc) {
      reject(new Error(`${tag} 无法启动 ffmpeg 子进程`));
    }
  });
}

/**
 * 使用 ffprobe 获取媒体信息
 */
function getMediaInfo(inputPath: string): Promise<{ duration: number; width?: number; height?: number; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    ffmpeg.setFfprobePath(ffprobePath);
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata.format.duration || 0;
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
      resolve({
        duration,
        width: videoStream?.width,
        height: videoStream?.height,
        hasAudio: !!audioStream
      });
    });
  });
}

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 安全文件名：移除不合法字符
 */
function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'untitled';
}

/**
 * Step 2: 处理单个TTS音频片段
 * 根据 playbackRate 调速，使音频时长匹配时间轴槽位时长
 */
async function processTTSSegment(segment: ExportTTSSegment, tempDir: string): Promise<string> {
  const slotDuration = segment.endTime - segment.startTime;
  if (slotDuration <= 0) return segment.audioPath;

  const audioDuration = segment.trimmedDuration ?? segment.originalDuration;
  const rate = segment.playbackRate ?? audioDuration / slotDuration;

  // 如果速率接近 1.0（±5%），不需要调速
  if (Math.abs(rate - 1.0) < 0.05) {
    return segment.audioPath;
  }

  // 使用 atempo 滤镜调速
  // atempo 范围: 0.5 ~ 100.0; 低于 0.5 需要串联多个 atempo
  const outPath = path.join(tempDir, `tts_segment_${segment.index}_adjusted.wav`);

  const atempoFilters: string[] = [];
  let remainingRate = rate;

  // atempo 每个实例范围 0.5 ~ 100.0
  while (remainingRate > 100.0) {
    atempoFilters.push('atempo=100.0');
    remainingRate /= 100.0;
  }
  while (remainingRate < 0.5) {
    atempoFilters.push('atempo=0.5');
    remainingRate /= 0.5;
  }
  atempoFilters.push(`atempo=${remainingRate.toFixed(4)}`);

  const filterStr = atempoFilters.join(',');

  await runFfmpegCommand(['-y', '-i', segment.audioPath, '-af', filterStr, '-ar', '44100', '-ac', '1', outPath], `atempo-seg-${segment.index}`);

  return outPath;
}

/**
 * Step 3: 将多个TTS片段拼接为完整时长的音频轨
 * 在片段之间填充静音，使最终音频时长 = duration
 *
 * 实现方式：使用 ffmpeg 的 adelay + amix 方式
 * 更可靠的方式：先生成总时长静音轨，再把每个片段 overlay 上去
 */
async function buildTTSAudioTrack(track: ExportTTSAudioTrack, duration: number, tempDir: string, trackIndex: number): Promise<string> {
  const segments = track.segments.filter((s) => s.startTime >= 0 && s.endTime > s.startTime);
  if (segments.length === 0) {
    // 返回全静音音轨
    const silentPath = path.join(tempDir, `tts_track_${trackIndex}_silent.wav`);
    await runFfmpegCommand(['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', duration.toFixed(3), '-ar', '44100', '-ac', '1', silentPath], `silent-track-${trackIndex}`);
    return silentPath;
  }

  // Step 3a: 处理每个片段（调速）
  const processedSegments: { path: string; startTime: number; endTime: number }[] = [];
  for (const seg of segments) {
    const processed = await processTTSSegment(seg, tempDir);
    processedSegments.push({ path: processed, startTime: seg.startTime, endTime: seg.endTime });
  }

  // Step 3b: 使用 ffmpeg 的 filter_complex 将所有片段定位到正确时间位置
  // 先生成一条静音底轨，再用 overlay (amix) 叠加各片段
  const silentBasePath = path.join(tempDir, `tts_track_${trackIndex}_base.wav`);
  await runFfmpegCommand(['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', duration.toFixed(3), '-ar', '44100', '-ac', '1', silentBasePath], `silent-base-${trackIndex}`);

  // 如果只有一个片段，直接 overlay
  if (processedSegments.length === 1) {
    const seg = processedSegments[0];
    const outputPath = path.join(tempDir, `tts_track_${trackIndex}_mixed.wav`);
    const delayMs = Math.round(seg.startTime * 1000);
    const slotDuration = seg.endTime - seg.startTime;

    // adelay 将片段延迟到正确位置，atrim 截取槽位时长
    await runFfmpegCommand([
      '-y',
      '-i',
      silentBasePath,
      '-i',
      seg.path,
      '-filter_complex',
      `[1:a]atrim=0:${slotDuration.toFixed(3)},apad=whole_dur=${slotDuration.toFixed(3)},adelay=${delayMs}|${delayMs}[delayed];[0:a][delayed]amix=inputs=2:duration=first:dropout_transition=0[out]`,
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-ac',
      '1',
      outputPath
    ]);
    return outputPath;
  }

  // 多个片段：逐个叠加
  let currentBase = silentBasePath;
  for (let i = 0; i < processedSegments.length; i++) {
    const seg = processedSegments[i];
    const outputPath = path.join(tempDir, `tts_track_${trackIndex}_step_${i}.wav`);
    const delayMs = Math.round(seg.startTime * 1000);
    const slotDuration = seg.endTime - seg.startTime;

    await runFfmpegCommand([
      '-y',
      '-i',
      currentBase,
      '-i',
      seg.path,
      '-filter_complex',
      `[1:a]atrim=0:${slotDuration.toFixed(3)},apad=whole_dur=${slotDuration.toFixed(3)},adelay=${delayMs}|${delayMs}[delayed];[0:a][delayed]amix=inputs=2:duration=first:dropout_transition=0[out]`,
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-ac',
      '1',
      outputPath
    ]);

    // 清理上一步中间文件（保留原始静音底轨和最终结果）
    if (currentBase !== silentBasePath && fs.existsSync(currentBase)) {
      try {
        fs.unlinkSync(currentBase);
      } catch {
        /* ignore */
      }
    }
    currentBase = outputPath;
  }

  return currentBase;
}

/**
 * Step 4: 最终合并——将视频+字幕+TTS音频合成为输出文件
 *
 * filter 图构建策略:
 * - 有 TTS 音频时必须使用 -filter_complex（多路输入混音）
 * - 仅有硬字幕/缩放时使用 -vf 即可
 * - 硬字幕(ASS) + 缩放：filter chain = scale→pad→ass
 * - 软字幕：添加为额外的字幕流（在所有 -i 之后追加）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function encodeOutput(
  win: BrowserWindow,
  request: ExportRequest,
  subtitleFiles: { srtPaths: string[]; assPaths: string[] },
  ttsAudioPaths: string[],
  _tempDir: string,
  outputPath: string
): Promise<void> {
  const { videoPath, config, duration } = request;

  console.log('[export-encode] 开始构建编码命令');
  console.log('[export-encode] 输入:', videoPath);
  console.log('[export-encode] 输出:', outputPath);
  console.log('[export-encode] 配置:', JSON.stringify(config));
  console.log('[export-encode] TTS音轨数:', ttsAudioPaths.length);
  console.log('[export-encode] 字幕文件:', JSON.stringify(subtitleFiles));

  const args: string[] = ['-y'];

  // --- 输入 ---
  args.push('-i', videoPath);
  for (const ttsPath of ttsAudioPaths) {
    args.push('-i', ttsPath);
  }

  // --- 视频 filter chain 片段 ---
  const vfParts: string[] = [];

  // 缩放
  const preset = QUALITY_PRESETS[config.qualityPreset] || {};
  if (preset.width && preset.height) {
    const w = preset.width;
    const h = preset.height;
    // scale + pad 保持宽高比并居中
    vfParts.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    vfParts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
  }

  // 硬字幕
  if (config.subtitleEmbedMode === 'hardcode' && subtitleFiles.assPaths.length > 0) {
    const escapedPath = escapeFilterPath(subtitleFiles.assPaths[0]);
    vfParts.push(`ass=${escapedPath}`);
  }

  const videoFilterStr = vfParts.join(',');

  // --- 构建 args 中的 filter / map ---
  const hasTTS = ttsAudioPaths.length > 0;
  const inputCount = 1 + ttsAudioPaths.length;

  if (hasTTS) {
    // 多路输入 → 必须使用 -filter_complex
    const filterParts: string[] = [];

    // 视频滤镜链
    if (videoFilterStr) {
      filterParts.push(`[0:v]${videoFilterStr}[vout]`);
    }

    // 音频混合：原音频(0:a?) + 所有 TTS 音轨
    const audioLabels: string[] = [];
    // 使用 anullsrc 作为 fallback 以防原视频无音频
    // 直接引用 0:a；如果原视频无音频，后面会处理
    audioLabels.push('[0:a]');
    for (let i = 0; i < ttsAudioPaths.length; i++) {
      audioLabels.push(`[${i + 1}:a]`);
    }
    filterParts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[aout]`);

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', videoFilterStr ? '[vout]' : '0:v');
    args.push('-map', '[aout]');
  } else {
    // 无 TTS → 简单模式
    if (videoFilterStr) {
      args.push('-vf', videoFilterStr);
    }
    args.push('-map', '0:v');
    args.push('-map', '0:a?');
  }

  // --- 软字幕流 ---
  if (config.subtitleEmbedMode === 'softcode' && subtitleFiles.srtPaths.length > 0) {
    for (const srtPath of subtitleFiles.srtPaths) {
      args.push('-i', srtPath);
    }
    for (let i = 0; i < subtitleFiles.srtPaths.length; i++) {
      args.push('-map', `${inputCount + i}:s`);
    }
    args.push('-c:s', config.container === 'mp4' ? 'mov_text' : 'srt');

    for (let i = 0; i < request.subtitleTracks.length; i++) {
      const track = request.subtitleTracks[i];
      if (track.languageCode) {
        args.push(`-metadata:s:s:${i}`, `language=${track.languageCode}`);
      }
      args.push(`-metadata:s:s:${i}`, `title=${track.label}`);
    }
  }

  // --- 编码器 ---
  switch (config.videoCodec) {
    case 'h264':
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(config.crf));
      break;
    case 'h265':
      args.push('-c:v', 'libx265', '-preset', 'medium', '-crf', String(config.crf), '-tag:v', 'hvc1');
      break;
    case 'vp9':
      args.push('-c:v', 'libvpx-vp9', '-crf', String(config.crf), '-b:v', '0');
      break;
  }

  args.push('-c:a', 'aac', '-b:a', `${config.audioBitrate}k`);
  args.push('-t', duration.toFixed(3));
  args.push(outputPath);

  console.log('[export-encode] 最终命令参数:', JSON.stringify(args));

  await runFfmpegCommand(args, 'encode');
}

/**
 * 主导出流程
 *
 * 分两阶段：
 * Phase 1: 将每个轨道导出为独立文件到 {资源目录}/export/
 *   - 字幕轨道 → .srt + .ass 文件
 *   - TTS音频轨道 → .wav 文件（完整时长、填充静音、调速）
 *   - 视频/音频轨道 → 跳过（原文件即可）
 * Phase 2: 合并轨道为最终视频文件
 */
export async function executeExport(win: BrowserWindow, request: ExportRequest): Promise<string> {
  const { videoPath, duration, config, subtitleTracks, ttsAudioTracks, resourceId } = request;

  console.log('[export] ========== 开始导出 ==========');
  console.log('[export] videoPath:', videoPath);
  console.log('[export] duration:', duration);
  console.log('[export] 字幕轨数:', subtitleTracks.length);
  console.log('[export] TTS音轨数:', ttsAudioTracks.length);
  console.log('[export] 配置:', JSON.stringify(config));

  // 验证输入文件存在
  if (!fs.existsSync(videoPath)) {
    throw new Error(`输入文件不存在: ${videoPath}`);
  }

  // 验证 ffmpeg 可执行文件存在
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`ffmpeg 不存在: ${ffmpegPath}`);
  }

  // 导出目录 = 资源文件夹 / export
  const resourceDir = path.dirname(videoPath);
  const exportDir = path.join(resourceDir, 'export');
  ensureDir(exportDir);

  // 临时工作目录（用于中间文件，完成后清除）
  const tempId = crypto.createHash('md5').update(`${resourceId}-${Date.now()}`).digest('hex').slice(0, 12);
  const tempDir = path.join(exportDir, `.temp-${tempId}`);
  ensureDir(tempDir);

  const exportedFiles: ExportedFileInfo[] = [];

  try {
    // ===== Stage 1: 准备 =====
    sendProgress(win, {
      stage: 'preparing',
      stageLabel: '准备导出...',
      progress: 0,
      totalProgress: 0,
      exportDir
    });

    // 获取原视频信息
    console.log('[export] 获取媒体信息...');
    const mediaInfo = await getMediaInfo(videoPath);
    console.log('[export] 媒体信息:', JSON.stringify(mediaInfo));
    const totalDuration = duration || mediaInfo.duration;

    // 计算进度权重
    const totalTracks = subtitleTracks.length + ttsAudioTracks.length;
    const hasVideoMerge = config.selectedTrackIds.includes('video-original') && totalTracks > 0;
    const trackExportWeight = hasVideoMerge ? 60 : 90; // 合并占 30%；无合并则轨道导出占 90%
    let completedTracks = 0;

    // ===== Phase 1: 导出各轨道为独立文件 =====

    // ----- 导出字幕轨道 -----
    const subtitleFileMap: { srtPaths: string[]; assPaths: string[] } = { srtPaths: [], assPaths: [] };

    for (const track of subtitleTracks) {
      const safeName = safeFileName(track.label);

      // SRT 文件
      const srtPath = path.join(exportDir, `${safeName}.srt`);
      fs.writeFileSync(srtPath, track.srtContent, 'utf-8');
      subtitleFileMap.srtPaths.push(srtPath);
      exportedFiles.push({ label: `${track.label}.srt`, fileName: `${safeName}.srt`, filePath: srtPath, type: 'subtitle' });

      // ASS 文件
      if (track.assContent) {
        const assPath = path.join(exportDir, `${safeName}.ass`);
        fs.writeFileSync(assPath, track.assContent, 'utf-8');
        subtitleFileMap.assPaths.push(assPath);
        exportedFiles.push({ label: `${track.label}.ass`, fileName: `${safeName}.ass`, filePath: assPath, type: 'subtitle' });
      }

      completedTracks++;
      const trackProgress = totalTracks > 0 ? Math.round((completedTracks / totalTracks) * trackExportWeight) : 0;

      sendProgress(win, {
        stage: 'exporting-tracks',
        stageLabel: `已导出字幕: ${track.label}`,
        progress: Math.round((completedTracks / totalTracks) * 100),
        totalProgress: 5 + trackProgress,
        exportedFiles: [...exportedFiles],
        exportDir
      });

      console.log(`[export] 字幕轨导出完成: ${track.label} → ${srtPath}`);
    }

    // ----- 导出TTS音频轨道 -----
    const ttsExportPaths: string[] = [];

    for (let i = 0; i < ttsAudioTracks.length; i++) {
      const track = ttsAudioTracks[i];

      sendProgress(win, {
        stage: 'exporting-tracks',
        stageLabel: `处理语音轨: ${track.label} (${i + 1}/${ttsAudioTracks.length})`,
        progress: Math.round((completedTracks / totalTracks) * 100),
        totalProgress: 5 + Math.round((completedTracks / totalTracks) * trackExportWeight),
        exportedFiles: [...exportedFiles],
        exportDir
      });

      // 构建完整时长的 TTS 音频轨道（通过临时目录处理中间文件）
      const rawAudioPath = await buildTTSAudioTrack(track, totalDuration, tempDir, i);

      // 复制到导出目录
      const safeName = safeFileName(track.label);
      const exportAudioPath = path.join(exportDir, `${safeName}.wav`);
      fs.copyFileSync(rawAudioPath, exportAudioPath);
      ttsExportPaths.push(exportAudioPath);

      exportedFiles.push({ label: `${track.label}.wav`, fileName: `${safeName}.wav`, filePath: exportAudioPath, type: 'tts-audio' });

      completedTracks++;
      const trackProgress = totalTracks > 0 ? Math.round((completedTracks / totalTracks) * trackExportWeight) : 0;

      sendProgress(win, {
        stage: 'exporting-tracks',
        stageLabel: `已导出语音轨: ${track.label}`,
        progress: Math.round((completedTracks / totalTracks) * 100),
        totalProgress: 5 + trackProgress,
        exportedFiles: [...exportedFiles],
        exportDir
      });

      console.log(`[export] TTS音轨 ${i} 导出完成: ${exportAudioPath}`);
    }

    // ===== Phase 2: 合并轨道为最终视频 =====
    if (hasVideoMerge) {
      sendProgress(win, {
        stage: 'encoding',
        stageLabel: '正在合并轨道为视频...',
        progress: 0,
        totalProgress: 70,
        exportedFiles: [...exportedFiles],
        exportDir
      });

      const mergedFileName = `output.${config.container}`;
      const mergedPath = path.join(exportDir, mergedFileName);
      await encodeOutput(win, request, subtitleFileMap, ttsExportPaths, tempDir, mergedPath);

      exportedFiles.push({ label: `合并视频.${config.container}`, fileName: mergedFileName, filePath: mergedPath, type: 'video' });

      sendProgress(win, {
        stage: 'encoding',
        stageLabel: '视频合并完成',
        progress: 100,
        totalProgress: 95,
        exportedFiles: [...exportedFiles],
        exportDir
      });

      console.log(`[export] 合并视频导出完成: ${mergedPath}`);
    }

    // ===== 完成 =====
    sendProgress(win, {
      stage: 'done',
      stageLabel: '导出完成',
      progress: 100,
      totalProgress: 100,
      exportedFiles: [...exportedFiles],
      exportDir
    });

    // 清理临时目录（保留 export 目录中的最终文件）
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      console.warn('[export] 清理临时目录失败:', tempDir);
    }

    console.log(`[export] ========== 导出完成 ==========`);
    console.log(`[export] 导出目录: ${exportDir}`);
    console.log(`[export] 导出文件数: ${exportedFiles.length}`);

    return exportDir;
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || '未知错误';
    console.error('[export] 导出失败:', errorMessage);

    // 确保进度事件即使 sendProgress 自身出错也不影响错误传递
    try {
      sendProgress(win, {
        stage: 'error',
        stageLabel: '导出失败',
        progress: 0,
        totalProgress: 0,
        error: errorMessage,
        exportedFiles: [...exportedFiles],
        exportDir
      });
    } catch (progressErr) {
      console.error('[export] 发送错误进度事件本身也失败:', progressErr);
    }

    // 清理临时目录（保留已导出的文件）
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    // 将完整错误信息通过 IPC rejection 返回给渲染进程
    throw new Error(errorMessage);
  }
}
