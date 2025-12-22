import { utils } from '@aim-packages/subtitle';
import { PluginDefinition } from '@packages/plugins/types';
import { AllModels } from '@packages/sherpa/common';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RecognizedSegment {
  text: string;
  start: number;
  end: number;
}

interface SherpaModel extends PluginDefinition {
  isInstalled: boolean;
}

// 语言代码到中文名称的映射
const getLanguageName = (code: string): string => {
  const languageMap: Record<string, string> = {
    multi: '多语言',
    en: '英语',
    zh: '中文',
    ja: '日语',
    ko: '韩语',
    yue: '粤语',
    de: '德语',
    es: '西班牙语',
    ru: '俄语',
    fr: '法语',
    pt: '葡萄牙语',
    tr: '土耳其语',
    pl: '波兰语',
    ca: '加泰罗尼亚语',
    nl: '荷兰语',
    ar: '阿拉伯语',
    sv: '瑞典语',
    it: '意大利语',
    id: '印尼语',
    hi: '印地语',
    fi: '芬兰语',
    vi: '越南语',
    he: '希伯来语',
    uk: '乌克兰语',
    el: '希腊语',
    ms: '马来语',
    cs: '捷克语',
    ro: '罗马尼亚语',
    da: '丹麦语',
    hu: '匈牙利语',
    ta: '泰米尔语',
    no: '挪威语',
    th: '泰语',
    ur: '乌尔都语',
    hr: '克罗地亚语',
    bg: '保加利亚语',
    lt: '立陶宛语',
    la: '拉丁语',
    mi: '毛利语',
    ml: '马拉雅拉姆语',
    cy: '威尔士语',
    sk: '斯洛伐克语',
    te: '泰卢固语',
    fa: '波斯语',
    lv: '拉脱维亚语',
    bn: '孟加拉语',
    sr: '塞尔维亚语',
    az: '阿塞拜疆语',
    sl: '斯洛文尼亚语',
    kn: '卡纳达语',
    et: '爱沙尼亚语',
    mk: '马其顿语',
    br: '布列塔尼语',
    eu: '巴斯克语',
    is: '冰岛语',
    hy: '亚美尼亚语',
    ne: '尼泊尔语',
    mn: '蒙古语',
    bs: '波斯尼亚语',
    kk: '哈萨克语',
    sq: '阿尔巴尼亚语',
    sw: '斯瓦希里语',
    gl: '加利西亚语',
    mr: '马拉地语',
    pa: '旁遮普语',
    si: '僧伽罗语',
    km: '高棉语',
    sn: '绍纳语',
    yo: '约鲁巴语',
    so: '索马里语',
    af: '南非荷兰语',
    oc: '奥克西唐语',
    ka: '格鲁吉亚语',
    be: '白俄罗斯语',
    tg: '塔吉克语',
    sd: '信德语'
  };
  return languageMap[code] || code.toUpperCase();
};

const ASRTestPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [language, setLanguage] = useState('zh');
  const [selectedPunctuationModel, setSelectedPunctuationModel] = useState<string>('');
  const [recognizedSegments, setRecognizedSegments] = useState<RecognizedSegment[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [progressStart, setProgressStart] = useState<number>(0);
  const [progressEnd, setProgressEnd] = useState<number>(0);
  const [sherpaModels, setSherpaModels] = useState<SherpaModel[]>([]);
  const [punctuationModels, setPunctuationModels] = useState<SherpaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 加载 sherpa 模型列表
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingModels(true);
        // 获取所有支持的插件
        const supported = await window.YUA.pluginResource['plugin-resource:listSupported']();
        // 获取已安装的资源
        const installed = await window.YUA.pluginResource['plugin-resource:list']({
          pluginId: 'plugin:sherpa-onnx',
          type: 'model'
        });

        if (!mounted) return;

        // 筛选出 sherpa 的 ASR 模型（排除标点符号模型）
        const sherpaModelDefinitions = supported.filter((plugin: PluginDefinition) => plugin.pluginId === 'plugin:sherpa-onnx' && plugin.type === 'model' && plugin.category === 'asr');

        // 筛选出 sherpa 的标点符号模型
        const punctuationModelDefinitions = supported.filter((plugin: PluginDefinition) => plugin.pluginId === 'plugin:sherpa-onnx' && plugin.type === 'model' && plugin.category === 'punctuation');

        // 创建已安装资源的 ID 集合（检查 resourceId、id 和 name）
        const installedResources = installed.filter((r: any) => r.status === 'installed');
        const installedIds = new Set<string>();
        installedResources.forEach((r: any) => {
          if (r.resourceId) installedIds.add(r.resourceId);
          if (r.id) installedIds.add(r.id);
          if (r.name) installedIds.add(r.name);
        });

        // 合并 ASR 模型信息和安装状态
        const modelsWithStatus: SherpaModel[] = sherpaModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 合并标点符号模型信息和安装状态
        const punctuationModelsWithStatus: SherpaModel[] = punctuationModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 按显示名称排序
        modelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
        punctuationModelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));

        setSherpaModels(modelsWithStatus);
        setPunctuationModels(punctuationModelsWithStatus);

        // 如果有已安装的模型，默认选择第一个已安装的
        const firstInstalled = modelsWithStatus.find((m) => m.isInstalled);
        if (firstInstalled && !selectedModel) {
          setSelectedModel(firstInstalled.id);
        } else if (modelsWithStatus.length > 0 && !selectedModel) {
          // 如果没有已安装的，选择第一个
          setSelectedModel(modelsWithStatus[0].id);
        }
      } catch (error) {
        console.error('加载 sherpa 模型列表失败:', error);
      } finally {
        if (mounted) setLoadingModels(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 当模型改变时，检查并重置语言选择
  useEffect(() => {
    if (!selectedModel) return;
    const selectedModelInfo = sherpaModels.find((m) => m.id === selectedModel);
    if (!selectedModelInfo) return;

    const supportedLanguages = selectedModelInfo.languages || [];
    // 如果模型支持 multi，则支持所有语言，不需要重置
    if (supportedLanguages.includes('multi')) return;

    // 如果只有一种语言，自动设置为该语言
    if (supportedLanguages.length === 1) {
      setLanguage(supportedLanguages[0]);
      return;
    }

    // 如果当前选择的语言不在支持列表中，重置为第一个支持的语言
    if (supportedLanguages.length > 0 && !supportedLanguages.includes(language)) {
      setLanguage(supportedLanguages[0]);
    } else if (supportedLanguages.length === 0) {
      // 如果没有指定语言，保持当前选择
      return;
    }
  }, [selectedModel, sherpaModels, language]);

  // 更新录音状态 ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // 连接 WebSocket
  const connectWebSocket = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const port = 8765;
      const url = `ws://127.0.0.1:${port}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          resolve();
        };

        ws.onmessage = async (event) => {
          if (event.data instanceof Blob && isRecordingRef.current) {
            // 将 Blob 转换为 Float32Array
            const arrayBuffer = await event.data.arrayBuffer();
            const float32Array = new Float32Array(arrayBuffer);

            // 发送给 ASR 服务
            if (isASRRunning) {
              try {
                await window.YUA.sherpa.sendData({
                  uuid: 'stream',
                  data: float32Array
                });
              } catch (error) {
                console.error('发送音频数据到 ASR 失败:', error);
              }
            }
          }
        };

        ws.onclose = () => {
          setIsRecording(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          console.error(error);
          setIsRecording(false);
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }, [isASRRunning]);

  // 开始录音
  const startRecording = useCallback(async (): Promise<void> => {
    if (!isASRRunning) {
      return;
    }

    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connectWebSocket();
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('start');
        setIsRecording(true);
      }
    } catch (error) {
      console.error('开始录音失败:', error);
    }
  }, [isASRRunning, connectWebSocket]);

  // 停止录音
  const stopRecording = useCallback(async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
      }
      setIsRecording(false);
      // 不关闭 WebSocket，以便可以再次开始录音
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  }, []);

  // 监听 ASR 识别结果
  useEffect(() => {
    const handleASRMessage = (
      _event: any,
      d: {
        type: string;
        data: { text: string; isEndpoint: boolean; start: number; end: number };
      }
    ): void => {
      const data = d.data;
      if (d.type !== 'sherpa:message') return;

      if (data.text) {
        setProgressText(data.text);
        setProgressStart(data.start);
        setProgressEnd(data.end);

        if (data.isEndpoint) {
          // 如果是端点，添加到完整结果列表
          setRecognizedSegments((prev) => [
            ...prev,
            {
              text: data.text,
              start: data.start,
              end: data.end
            }
          ]);
          setProgressText('');
          setProgressStart(0);
          setProgressEnd(0);
        }
      }
    };

    window.YUA.handleMessage(handleASRMessage, 'sherpa:message');

    return () => {
      window.YUA.removeHandler('sherpa:message');
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (contentRef.current) {
      const viewport = contentRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
      }
    }
  }, [recognizedSegments, progressText]);

  // 清理
  useEffect(() => {
    return () => {
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopRecording]);

  // 启动ASR并开始录音
  const handleStartASRAndRecording = useCallback(async (): Promise<void> => {
    if (isASRRunning || isLoading || isRecording || !selectedModel) return;

    // 检查模型是否已安装
    const selectedModelInfo = sherpaModels.find((m) => m.id === selectedModel);
    if (!selectedModelInfo) {
      console.error('未找到选中的模型');
      return;
    }
    if (!selectedModelInfo.isInstalled) {
      console.error('模型未安装，请先在插件管理中安装');
      return;
    }

    // 如果选择了标点模型，检查是否已安装
    if (selectedPunctuationModel) {
      const selectedPunctuationModelInfo = punctuationModels.find((m) => m.id === selectedPunctuationModel);
      if (selectedPunctuationModelInfo && !selectedPunctuationModelInfo.isInstalled) {
        console.error('标点模型未安装，请先在插件管理中安装');
        return;
      }
    }

    setIsLoading(true);

    try {
      // 第一步：启动 ASR 服务
      const success = await window.YUA.sherpa.createInstance({
        model: selectedModel as AllModels,
        language: language,
        punctuationModel: selectedPunctuationModel || undefined
      });

      if (!success) {
        setIsLoading(false);
        return;
      }

      setIsASRRunning(true);

      // 第二步：连接 WebSocket 并开始录音
      try {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          await connectWebSocket();
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('start');
          setIsRecording(true);
        }
      } catch (error) {
        console.error('开始录音失败:', error);
        // 如果录音失败，停止 ASR 服务
        await window.YUA.sherpa.freeInstance();
        setIsASRRunning(false);
      }
    } catch (error) {
      console.error('启动 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, isRecording, selectedModel, language, selectedPunctuationModel, sherpaModels, punctuationModels, connectWebSocket]);

  // 停止录音并停止ASR服务
  const handleStopRecordingAndASR = useCallback(async (): Promise<void> => {
    if ((!isASRRunning && !isRecording) || isLoading) return;

    setIsLoading(true);

    try {
      // 第一步：如果正在录音，先停止录音
      if (isRecording) {
        try {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send('stop');
          }
          setIsRecording(false);
        } catch (error) {
          console.error('停止录音失败:', error);
        }
      }

      // 第二步：关闭 WebSocket 连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // 第三步：停止 ASR 服务
      if (isASRRunning) {
        const success = await window.YUA.sherpa.freeInstance();
        if (success) {
          setIsASRRunning(false);
        } else {
          // 即使返回 false，也更新状态，确保可以重新启动
          setIsASRRunning(false);
        }
      }
    } catch (error) {
      console.error('停止失败:', error);
      // 即使出错，也更新状态，确保可以重新启动
      setIsASRRunning(false);
      setIsRecording(false);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, isRecording]);

  return (
    <>
      <DragAbleTitle title="ASR 语音识别测试" />
      <div className="flex gap-6 px-2">
        <div>
          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={loadingModels}>
              <SelectTrigger id="model">
                <SelectValue placeholder={loadingModels ? '加载中...' : '请选择模型'}>
                  {selectedModel ? sherpaModels.find((m) => m.id === selectedModel)?.displayName || sherpaModels.find((m) => m.id === selectedModel)?.name : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-md">
                {sherpaModels.length === 0 && !loadingModels && (
                  <SelectItem value="" disabled>
                    暂无可用模型
                  </SelectItem>
                )}
                {sherpaModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                    <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium break-words">{model.displayName || model.name}</span>
                        {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                      </div>
                      {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModel && !sherpaModels.find((m) => m.id === selectedModel)?.isInstalled && <div className="text-xs text-amber-600 dark:text-amber-400">该模型未安装，请先在插件管理中安装</div>}
          </div>
          {(() => {
            const selectedModelInfo = sherpaModels.find((m) => m.id === selectedModel);
            const supportedLanguages = selectedModelInfo?.languages || [];
            // 排除 multi，计算实际支持的语言数量
            const actualLanguages = supportedLanguages.filter((lang) => lang !== 'multi');
            // 如果只有一种语言，不显示语言选择器
            const shouldShowLanguageSelect = actualLanguages.length > 1 || supportedLanguages.includes('multi');

            if (!shouldShowLanguageSelect) {
              return null;
            }

            return (
              <div className="space-y-2">
                <Label htmlFor="language">语言</Label>
                <Select value={language} onValueChange={setLanguage} disabled={!selectedModel || loadingModels}>
                  <SelectTrigger id="language">
                    <SelectValue placeholder={!selectedModel ? '请先选择模型' : '请选择语言'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // 如果模型支持 multi，显示所有常见语言
                      if (supportedLanguages.includes('multi')) {
                        const commonLanguages = ['zh', 'en', 'ja', 'ko', 'yue', 'de', 'es', 'ru', 'fr', 'pt', 'tr', 'pl', 'it', 'ar', 'hi', 'vi', 'th'];
                        return commonLanguages.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {getLanguageName(lang)}
                          </SelectItem>
                        ));
                      }

                      // 如果模型有指定支持的语言，只显示这些语言
                      if (supportedLanguages.length > 0) {
                        return supportedLanguages.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {getLanguageName(lang)}
                          </SelectItem>
                        ));
                      }

                      // 如果没有指定语言，显示提示
                      return (
                        <SelectItem value="__no_language__" disabled>
                          该模型未指定支持的语言
                        </SelectItem>
                      );
                    })()}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
          {punctuationModels.length > 0 && (
            <div className="space-y-2 mt-2">
              <Label htmlFor="punctuationModel">标点符号模型（可选）</Label>
              <Select value={selectedPunctuationModel || '__none__'} onValueChange={(value) => setSelectedPunctuationModel(value === '__none__' ? '' : value)} disabled={loadingModels}>
                <SelectTrigger id="punctuationModel">
                  <SelectValue placeholder="不启用标点符号">
                    {selectedPunctuationModel
                      ? punctuationModels.find((m) => m.id === selectedPunctuationModel)?.displayName || punctuationModels.find((m) => m.id === selectedPunctuationModel)?.name
                      : '不使用标点符号'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-md">
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">不启用标点符号</span>
                  </SelectItem>
                  {punctuationModels.map((model) => (
                    <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-start box-border" textValue={model.displayName || model.name}>
                      <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium break-words">{model.displayName || model.name}</span>
                          {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                        </div>
                        {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPunctuationModel && !punctuationModels.find((m) => m.id === selectedPunctuationModel)?.isInstalled && (
                <div className="text-xs text-amber-600 dark:text-amber-400">该标点模型未安装，请先在插件管理中安装</div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              disabled={isASRRunning || isRecording || isLoading || !selectedModel || !sherpaModels.find((m) => m.id === selectedModel)?.isInstalled}
              onClick={handleStartASRAndRecording}
              size="sm"
              className="flex-1"
            >
              {isLoading && !isASRRunning && !isRecording ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  <TbMicrophone className="w-4 h-4 mr-2" />
                  开始识别
                </>
              )}
            </Button>
            <Button disabled={(!isASRRunning && !isRecording) || isLoading} onClick={handleStopRecordingAndASR} size="sm" variant="destructive" className="flex-1">
              {isLoading && (isASRRunning || isRecording) ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  停止中...
                </>
              ) : (
                <>
                  <TbMicrophoneOff className="w-4 h-4 mr-2" />
                  停止识别
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">ASR 状态:</span>
              <span className={`text-sm ${isASRRunning ? 'text-green-500' : 'text-gray-500'}`}>{isASRRunning ? '运行中' : '已停止'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">录音状态:</span>
              <span className={`text-sm ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>{isRecording ? '录音中' : '已停止'}</span>
            </div>
          </div>
        </div>

        {/* 识别结果 */}
        <div className="space-y-4 flex-1 min-w-[500px]">
          <div className="flex items-center justify-between">
            <Label>识别结果</Label>
            <Button
              onClick={() => {
                setRecognizedSegments([]);
                setProgressText('');
                setProgressStart(0);
                setProgressEnd(0);
              }}
              size="sm"
              variant="outline"
            >
              清空结果
            </Button>
          </div>
          <ScrollArea className="h-[600px] w-full border rounded-md">
            <div className="px-4 py-3" ref={contentRef}>
              {/* 已识别的完整结果 */}
              {recognizedSegments.map((segment, index) => (
                <div key={index} className="flex items-start justify-center gap-2 relative pl-4 group mb-2">
                  <div className="select-none pt-3 cursor-pointer text-muted-foreground text-xs hover:text-primary w-20 text-center relative">
                    <span className="text-xs absolute left-1/2 -translate-x-1/2 -top-1 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">#{index + 1}</span>
                    <div className="text-[10px] leading-tight">
                      <div>{utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}</div>
                    </div>
                  </div>
                  <div className="p-2 flex-1 outline-none break-words border-none text-base text-foreground" style={{ whiteSpace: 'pre-wrap' }}>
                    {segment.text || '\u200b'}
                  </div>
                </div>
              ))}

              {/* 最新的识别内容（置灰显示） */}
              {progressText && (
                <div className="flex items-start justify-center gap-2 relative pl-4 group mb-2">
                  <div className="select-none pt-3 cursor-pointer text-muted-foreground/60 text-xs hover:text-primary w-20 text-center relative">
                    <div className="text-[10px] leading-tight text-muted-foreground/60">
                      <div>{utils.cleanTimeDisplay(utils.formatTime(progressStart / 1000))}</div>
                    </div>
                  </div>
                  <div className="p-2 flex-1 outline-none break-words border-none text-base text-muted-foreground/60" style={{ whiteSpace: 'pre-wrap' }}>
                    {progressText || '\u200b'}
                  </div>
                </div>
              )}

              {recognizedSegments.length === 0 && !progressText && <div className="text-center text-muted-foreground py-8">识别结果将显示在这里...</div>}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
};

export default ASRTestPage;
