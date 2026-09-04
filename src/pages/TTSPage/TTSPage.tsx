import type { TTSResultPayload } from '@packages/sherpa/ipc-renderer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbChevronDown, TbDownload, TbLoader2, TbPlayerPlay, TbPlayerStop, TbVolume, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

// Kokoro 说话人列表（仅支持英文和中文）
const KOKORO_SPEAKERS = [
  // American Female (af_)
  { id: 0, name: 'af_alloy', label: 'Alloy', group: 'American Female' },
  { id: 1, name: 'af_aoede', label: 'Aoede', group: 'American Female' },
  { id: 2, name: 'af_bella', label: 'Bella', group: 'American Female' },
  { id: 3, name: 'af_heart', label: 'Heart', group: 'American Female' },
  { id: 4, name: 'af_jessica', label: 'Jessica', group: 'American Female' },
  { id: 5, name: 'af_kore', label: 'Kore', group: 'American Female' },
  { id: 6, name: 'af_nicole', label: 'Nicole', group: 'American Female' },
  { id: 7, name: 'af_nova', label: 'Nova', group: 'American Female' },
  { id: 8, name: 'af_river', label: 'River', group: 'American Female' },
  { id: 9, name: 'af_sarah', label: 'Sarah', group: 'American Female' },
  { id: 10, name: 'af_sky', label: 'Sky', group: 'American Female' },
  // American Male (am_)
  { id: 11, name: 'am_adam', label: 'Adam', group: 'American Male' },
  { id: 12, name: 'am_echo', label: 'Echo', group: 'American Male' },
  { id: 13, name: 'am_eric', label: 'Eric', group: 'American Male' },
  { id: 14, name: 'am_fenrir', label: 'Fenrir', group: 'American Male' },
  { id: 15, name: 'am_liam', label: 'Liam', group: 'American Male' },
  { id: 16, name: 'am_michael', label: 'Michael', group: 'American Male' },
  { id: 17, name: 'am_onyx', label: 'Onyx', group: 'American Male' },
  { id: 18, name: 'am_puck', label: 'Puck', group: 'American Male' },
  { id: 19, name: 'am_santa', label: 'Santa', group: 'American Male' },
  // British Female (bf_)
  { id: 20, name: 'bf_alice', label: 'Alice', group: 'British Female' },
  { id: 21, name: 'bf_emma', label: 'Emma', group: 'British Female' },
  { id: 22, name: 'bf_isabella', label: 'Isabella', group: 'British Female' },
  { id: 23, name: 'bf_lily', label: 'Lily', group: 'British Female' },
  // British Male (bm_)
  { id: 24, name: 'bm_daniel', label: 'Daniel', group: 'British Male' },
  { id: 25, name: 'bm_fable', label: 'Fable', group: 'British Male' },
  { id: 26, name: 'bm_george', label: 'George', group: 'British Male' },
  { id: 27, name: 'bm_lewis', label: 'Lewis', group: 'British Male' },
  // Chinese Female (zf_)
  { id: 45, name: 'zf_xiaobei', label: '小贝', group: 'Chinese Female' },
  { id: 46, name: 'zf_xiaoni', label: '小妮', group: 'Chinese Female' },
  { id: 47, name: 'zf_xiaoxiao', label: '晓晓', group: 'Chinese Female' },
  { id: 48, name: 'zf_xiaoyi', label: '晓伊', group: 'Chinese Female' },
  // Chinese Male (zm_)
  { id: 49, name: 'zm_yunjian', label: '云健', group: 'Chinese Male' },
  { id: 50, name: 'zm_yunxi', label: '云希', group: 'Chinese Male' },
  { id: 51, name: 'zm_yunxia', label: '云夏', group: 'Chinese Male' },
  { id: 52, name: 'zm_yunyang', label: '云扬', group: 'Chinese Male' }
];

const TTSPage: React.FC = () => {
  // 配置状态
  const [speakerId, setSpeakerId] = useState(31); // 默认选择中文女声 zf_xiaoyi
  const [speed, setSpeed] = useState(1.0);
  const [isConfigured, setIsConfigured] = useState(false); // 是否已确认配置

  // 输入和播放状态
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioData, setAudioData] = useState<{ samples: Float32Array; sampleRate: number } | null>(null);
  const [result, setResult] = useState<TTSResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const requestIdRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 按组分类说话人（一级菜单）
  const speakerGroups = useMemo(() => {
    const groups: Record<string, typeof KOKORO_SPEAKERS> = {};
    KOKORO_SPEAKERS.forEach((speaker) => {
      if (!groups[speaker.group]) {
        groups[speaker.group] = [];
      }
      groups[speaker.group].push(speaker);
    });
    return groups;
  }, []);

  // 获取当前选中的说话人信息
  const currentSpeaker = useMemo(() => {
    return KOKORO_SPEAKERS.find((s) => s.id === speakerId) || KOKORO_SPEAKERS[0];
  }, [speakerId]);

  // 监听 TTS 结果并自动播放
  useEffect(() => {
    const handleTTSResult = async (data: TTSResultPayload): Promise<void> => {
      console.log('[TTS] Received result:', data);

      // 检查是否是当前请求
      if (data.requestId !== requestIdRef.current) {
        return;
      }

      setIsGenerating(false);

      if (data.error) {
        setError(data.error);
        setResult(null);
        setAudioData(null);
      } else {
        setError(null);
        setResult(data);

        // 如果返回了音频数据，保存并自动播放
        if (data.samples && data.sampleRate) {
          const floatSamples = new Float32Array(data.samples);
          setAudioData({ samples: floatSamples, sampleRate: data.sampleRate });

          // 自动播放
          try {
            // 停止任何可能正在播放的旧音频
            if (sourceNodeRef.current) {
              sourceNodeRef.current.stop();
              sourceNodeRef.current.onended = null; // 移除旧的 onended 回调
              sourceNodeRef.current = null;
            }

            // 创建 AudioContext（如果不存在）
            if (!audioContextRef.current) {
              audioContextRef.current = new AudioContext();
            }

            const audioContext = audioContextRef.current;

            // 确保 AudioContext 处于运行状态
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
            }

            // 创建 AudioBuffer
            const audioBuffer = audioContext.createBuffer(1, floatSamples.length, data.sampleRate);
            audioBuffer.getChannelData(0).set(floatSamples);

            // 创建 BufferSource
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            // 播放结束时的处理
            source.onended = () => {
              setIsPlaying(false);
              sourceNodeRef.current = null;
            };

            sourceNodeRef.current = source;
            source.start();
            setIsPlaying(true);
          } catch (err) {
            console.error('[TTS] 自动播放失败:', err);
            setError(err instanceof Error ? err.message : '播放失败');
          }
        }
      }
    };

    const unsubscribe = window.chobits.sherpa.onTTSResult((data) => {
      void handleTTSResult(data);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 确认配置
  const handleConfirmConfig = useCallback(() => {
    setIsConfigured(true);
    // 聚焦到文本输入框
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  // 重新配置
  const handleReconfigure = useCallback(() => {
    setIsConfigured(false);
    setText('');
    setAudioData(null);
    setResult(null);
    setError(null);
    // 停止播放
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // 生成并播放语音
  const handleGenerateAndPlay = useCallback(async () => {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setAudioData(null);

    // 停止当前播放
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);

    // 生成请求ID
    const requestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    requestIdRef.current = requestId;

    try {
      const response = await window.chobits.sherpa.ttsGenerate({
        text: text.trim(),
        sid: speakerId,
        speed,
        requestId
      });

      if (!response.ok) {
        setError(response.error || '生成失败');
        setIsGenerating(false);
      }
      // 生成成功后会自动播放（在监听器中处理）
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      setIsGenerating(false);
    }
  }, [text, speakerId, speed, isGenerating]);

  // 停止播放
  const handleStop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // 创建 WAV 文件
  const createWavFile = useCallback((samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV 文件头
    const writeString = (offset: number, string: string): void => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // 写入音频数据（转换为 16-bit PCM）
    const offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
  }, []);

  // 下载音频
  const handleDownload = useCallback(() => {
    if (!audioData) return;

    try {
      // 创建 WAV 文件
      const wavBuffer = createWavFile(audioData.samples, audioData.sampleRate);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = `tts-${currentSpeaker.name}-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 释放 URL
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('[TTS] 下载失败:', err);
      setError(err instanceof Error ? err.message : '下载失败');
    }
  }, [audioData, currentSpeaker, createWavFile]);

  // 关闭页面时释放资源
  const handleClose = useCallback(() => {
    handleStop();
    window.chobits.sherpa.ttsDestroyInstance();
    window.chobits.window['window:close']('tts');
  }, [handleStop]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full box-border rounded-lg bg-background/95 backdrop-blur drag-region">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-3 border-b">
        <h2 className="text-sm font-semibold">TTS 语音合成测试</h2>
        <Button variant="ghost" size="icon" className="h-6 w-6 no-drag" onClick={handleClose}>
          <TbX className="h-4 w-4" />
        </Button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-drag">
        {!isConfigured ? (
          // 配置阶段
          <>
            {/* 参数设置 */}
            <div className="space-y-4">
              {/* 说话人选择 */}
              <div className="space-y-2">
                <Label>说话人</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between no-drag" disabled={isGenerating}>
                      <span className="truncate">
                        {currentSpeaker.label} ({currentSpeaker.name})
                      </span>
                      <TbChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] no-drag" align="start">
                    {Object.entries(speakerGroups).map(([groupName, speakers], groupIndex) => {
                      // 转换为中文显示名称
                      let displayName = groupName;
                      if (groupName === 'American Female') {
                        displayName = '🇺🇸 美式英文女性';
                      } else if (groupName === 'American Male') {
                        displayName = '🇺🇸 美式英文男性';
                      } else if (groupName === 'British Female') {
                        displayName = '🇬🇧 英式英文女性';
                      } else if (groupName === 'British Male') {
                        displayName = '🇬🇧 英式英文男性';
                      } else if (groupName === 'Chinese Female') {
                        displayName = '🇨🇳 中文女性';
                      } else if (groupName === 'Chinese Male') {
                        displayName = '🇨🇳 中文男性';
                      }

                      return (
                        <React.Fragment key={groupName}>
                          {groupIndex > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <span>{displayName}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                              {speakers.map((speaker) => (
                                <DropdownMenuItem key={speaker.id} onClick={() => setSpeakerId(speaker.id)} className={speakerId === speaker.id ? 'bg-accent' : ''}>
                                  <span className="flex-1">{speaker.label}</span>
                                  <span className="text-xs text-muted-foreground ml-2">{speaker.name}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </React.Fragment>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* 语速 */}
              <div className="space-y-2">
                <Label htmlFor="speed">语速: {speed.toFixed(1)}x</Label>
                <Slider id="speed" value={[speed]} onValueChange={(v) => setSpeed(v[0])} min={0.5} max={2.0} step={0.1} />
              </div>

              {/* 确认按钮 */}
              <div className="pt-2">
                <Button onClick={handleConfirmConfig} className="w-full">
                  <TbVolume className="mr-2" />
                  确认配置
                </Button>
              </div>
            </div>
          </>
        ) : (
          // 输入和播放阶段
          <>
            {/* 当前配置显示 */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground">说话人: </span>
                  <span className="font-medium">{currentSpeaker.label}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReconfigure}>
                  重新配置
                </Button>
              </div>
              <div>
                <span className="text-muted-foreground">语速: </span>
                <span className="font-medium">{speed.toFixed(1)}x</span>
              </div>
            </div>

            {/* 文本输入 */}
            <div className="space-y-2">
              <Label htmlFor="text">输入文本</Label>
              <Textarea
                ref={textareaRef}
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="粘贴或输入要合成的文本..."
                className="min-h-[150px] resize-none"
                disabled={isGenerating}
              />
            </div>

            {/* 播放按钮 */}
            {text.trim() && (
              <div className="flex gap-2">
                <Button onClick={handleGenerateAndPlay} disabled={isGenerating || isPlaying} className="flex-1">
                  {isGenerating ? (
                    <>
                      <TbLoader2 className="animate-spin mr-2" />
                      生成中...
                    </>
                  ) : isPlaying ? (
                    <>
                      <TbVolume className="mr-2" />
                      播放中...
                    </>
                  ) : (
                    <>
                      <TbPlayerPlay className="mr-2" />
                      生成并播放
                    </>
                  )}
                </Button>
                {(audioData || isPlaying) && (
                  <>
                    <Button variant="outline" size="icon" onClick={handleStop} disabled={isGenerating || !isPlaying} title="停止播放">
                      <TbPlayerStop />
                    </Button>
                    {audioData && (
                      <Button variant="outline" size="icon" onClick={handleDownload} disabled={isGenerating} title="下载音频">
                        <TbDownload />
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 结果显示 */}
            {result && (
              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TbVolume className="h-4 w-4" />
                  <span>生成完成</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">时长: </span>
                    <span className="font-medium">{result.duration?.toFixed(2)}s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">耗时: </span>
                    <span className="font-medium">{result.elapsedSeconds?.toFixed(2)}s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RTF: </span>
                    <span className="font-medium">{result.rtf?.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 错误显示 */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <span className="font-medium">错误: </span>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TTSPage;
