import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbChevronDown, TbLoader2, TbPlayerPause, TbPlayerPlay, TbPlayerStop, TbVolume, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

interface TTSResult {
  requestId: string;
  samples?: number[];
  sampleRate?: number;
  duration?: number;
  outputPath?: string;
  elapsedSeconds?: number;
  rtf?: number;
  error?: string;
}

// Kokoro 说话人列表
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
  // European Female (ef_)
  { id: 28, name: 'ef_dora', label: 'Dora', group: 'European Female' },
  // European Male (em_)
  { id: 29, name: 'em_alex', label: 'Alex', group: 'European Male' },
  // French Female (ff_)
  { id: 30, name: 'ff_siwis', label: 'Siwis', group: 'French Female' },
  // Hindi Female (hf_)
  { id: 31, name: 'hf_alpha', label: 'Alpha', group: 'Hindi Female' },
  { id: 32, name: 'hf_beta', label: 'Beta', group: 'Hindi Female' },
  // Hindi Male (hm_)
  { id: 33, name: 'hm_omega', label: 'Omega', group: 'Hindi Male' },
  { id: 34, name: 'hm_psi', label: 'Psi', group: 'Hindi Male' },
  // Italian Female (if_)
  { id: 35, name: 'if_sara', label: 'Sara', group: 'Italian Female' },
  // Italian Male (im_)
  { id: 36, name: 'im_nicola', label: 'Nicola', group: 'Italian Male' },
  // Japanese Female (jf_)
  { id: 37, name: 'jf_alpha', label: 'Alpha', group: 'Japanese Female' },
  { id: 38, name: 'jf_gongitsune', label: 'Gongitsune', group: 'Japanese Female' },
  { id: 39, name: 'jf_nezumi', label: 'Nezumi', group: 'Japanese Female' },
  { id: 40, name: 'jf_tebukuro', label: 'Tebukuro', group: 'Japanese Female' },
  // Japanese Male (jm_)
  { id: 41, name: 'jm_kumo', label: 'Kumo', group: 'Japanese Male' },
  // Portuguese Female (pf_)
  { id: 42, name: 'pf_dora', label: 'Dora', group: 'Portuguese Female' },
  // Portuguese Male (pm_)
  { id: 43, name: 'pm_alex', label: 'Alex', group: 'Portuguese Male' },
  { id: 44, name: 'pm_santa', label: 'Santa', group: 'Portuguese Male' },
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
  const [text, setText] = useState('你好，这是一个语音合成测试。Hello, this is a TTS test.');
  const [speakerId, setSpeakerId] = useState(48); // 默认选择中文女声 zf_xiaoyi
  const [speed, setSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioData, setAudioData] = useState<{ samples: Float32Array; sampleRate: number } | null>(null);
  const [result, setResult] = useState<TTSResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const requestIdRef = useRef<string>('');

  // 按组分类说话人
  const speakerGroups = useMemo(() => {
    const groups: Record<string, typeof KOKORO_SPEAKERS> = {};
    KOKORO_SPEAKERS.forEach((speaker) => {
      if (!groups[speaker.group]) {
        groups[speaker.group] = [];
      }
      groups[speaker.group].push(speaker);
    });
    // 按照语言分大类
    const organized: Record<string, Record<string, typeof KOKORO_SPEAKERS>> = {
      English: {},
      Chinese: {},
      Other: {}
    };
    
    Object.entries(groups).forEach(([groupName, speakers]) => {
      if (groupName.includes('American') || groupName.includes('British')) {
        organized.English[groupName] = speakers;
      } else if (groupName.includes('Chinese')) {
        organized.Chinese[groupName] = speakers;
      } else {
        organized.Other[groupName] = speakers;
      }
    });
    
    return organized;
  }, []);

  // 获取当前选中的说话人信息
  const currentSpeaker = useMemo(() => {
    return KOKORO_SPEAKERS.find((s) => s.id === speakerId) || KOKORO_SPEAKERS[0];
  }, [speakerId]);

  // 监听 TTS 结果
  useEffect(() => {
    const handleMessage = (_event: any, message: { type: string; data: TTSResult }): void => {
      if (message.type === 'sherpa:tts:message') {
        const data = message.data;
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

          // 如果返回了音频数据，保存起来
          if (data.samples && data.sampleRate) {
            const floatSamples = new Float32Array(data.samples);
            setAudioData({ samples: floatSamples, sampleRate: data.sampleRate });
          }
        }
      }
    };

    window.ipcRenderer?.on('renderer-message', handleMessage);
    return () => {
      window.ipcRenderer?.off('renderer-message', handleMessage);
    };
  }, []);

  // 生成语音
  const handleGenerate = useCallback(async () => {
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
      const response = await window.YUA.sherpa.ttsGenerate({
        text: text.trim(),
        sid: speakerId,
        speed,
        requestId
      });

      if (!response.success) {
        setError(response.error || '生成失败');
        setIsGenerating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      setIsGenerating(false);
    }
  }, [text, speakerId, speed, isGenerating]);

  // 播放音频
  const handlePlay = useCallback(async () => {
    if (!audioData) return;

    try {
      // 如果正在播放，暂停/停止
      if (isPlaying && sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
        setIsPlaying(false);
        return;
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
      const audioBuffer = audioContext.createBuffer(1, audioData.samples.length, audioData.sampleRate);
      audioBuffer.getChannelData(0).set(audioData.samples);

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
      console.error('播放失败:', err);
      setError(err instanceof Error ? err.message : '播放失败');
    }
  }, [audioData, isPlaying]);

  // 停止播放
  const handleStop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // 关闭页面时释放资源
  const handleClose = useCallback(() => {
    handleStop();
    window.YUA.sherpa.ttsFreeInstance();
    window.YUA.window['window:close']('tts');
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
        {/* 文本输入 */}
        <div className="space-y-2">
          <Label htmlFor="text">输入文本</Label>
          <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="请输入要合成的文本..." className="min-h-[100px] resize-none" disabled={isGenerating} />
        </div>

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
                {/* English 分组 */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>🇬🇧 English</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                    {Object.entries(speakerGroups.English).map(([groupName, speakers], groupIndex) => (
                      <React.Fragment key={groupName}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-xs">{groupName}</DropdownMenuLabel>
                        {speakers.map((speaker) => (
                          <DropdownMenuItem key={speaker.id} onClick={() => setSpeakerId(speaker.id)} className={speakerId === speaker.id ? 'bg-accent' : ''}>
                            <span className="flex-1">{speaker.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{speaker.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Chinese 分组 */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>🇨🇳 Chinese</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                    {Object.entries(speakerGroups.Chinese).map(([groupName, speakers], groupIndex) => (
                      <React.Fragment key={groupName}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-xs">{groupName}</DropdownMenuLabel>
                        {speakers.map((speaker) => (
                          <DropdownMenuItem key={speaker.id} onClick={() => setSpeakerId(speaker.id)} className={speakerId === speaker.id ? 'bg-accent' : ''}>
                            <span className="flex-1">{speaker.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{speaker.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Other Languages 分组 */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span>🌍 Other Languages</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                    {Object.entries(speakerGroups.Other).map(([groupName, speakers], groupIndex) => (
                      <React.Fragment key={groupName}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-xs">{groupName}</DropdownMenuLabel>
                        {speakers.map((speaker) => (
                          <DropdownMenuItem key={speaker.id} onClick={() => setSpeakerId(speaker.id)} className={speakerId === speaker.id ? 'bg-accent' : ''}>
                            <span className="flex-1">{speaker.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{speaker.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 语速 */}
          <div className="space-y-2">
            <Label htmlFor="speed">语速: {speed.toFixed(1)}x</Label>
            <Slider id="speed" value={[speed]} onValueChange={(v) => setSpeed(v[0])} min={0.5} max={2.0} step={0.1} disabled={isGenerating} />
          </div>
        </div>

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
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 border-t p-3">
        {/* 播放控制 */}
        {audioData && (
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 no-drag" onClick={handlePlay} disabled={isGenerating}>
              {isPlaying ? <TbPlayerPause className="h-4 w-4" /> : <TbPlayerPlay className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 no-drag" onClick={handleStop} disabled={isGenerating || !isPlaying}>
              <TbPlayerStop className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex-1" />

        {/* 生成按钮 */}
        <Button className="no-drag" onClick={handleGenerate} disabled={!text.trim() || isGenerating}>
          {isGenerating ? (
            <>
              <TbLoader2 className="animate-spin mr-1" />
              生成中...
            </>
          ) : (
            <>
              <TbVolume className="mr-1" />
              生成语音
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default TTSPage;
