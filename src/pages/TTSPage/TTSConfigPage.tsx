import { PluginDefinition } from '@packages/plugins/types';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import React, { useEffect, useState } from 'react';
import { TbLoader2, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TTSModel extends PluginDefinition {
  isInstalled: boolean;
}

// 推荐模型ID列表
const RECOMMENDED_MODEL_IDS = ['kokoro-multi-lang-v1_0', 'kokoro-v1_0-zh', 'kokoro-v1_0-en'];

const TTSConfigPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [ttsModels, setTTSModels] = useState<TTSModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // 加载 TTS 模型列表
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

        // 筛选出 sherpa 的 TTS 模型
        const ttsModelDefinitions = supported.filter((plugin: PluginDefinition) => plugin.pluginId === 'plugin:sherpa-onnx' && plugin.type === 'model' && plugin.category === 'tts');

        // 创建已安装资源的 ID 集合
        const installedResources = installed.filter((r: any) => r.status === 'installed');
        const installedIds = new Set<string>();
        installedResources.forEach((r: any) => {
          if (r.resourceId) installedIds.add(r.resourceId);
          if (r.id) installedIds.add(r.id);
          if (r.name) installedIds.add(r.name);
        });

        // 合并模型信息和安装状态
        const modelsWithStatus: TTSModel[] = ttsModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 按显示名称排序
        modelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));

        setTTSModels(modelsWithStatus);

        // 默认选择第一个已安装的推荐模型
        const recommendedModels = modelsWithStatus.filter((m) => RECOMMENDED_MODEL_IDS.includes(m.id));
        if (recommendedModels.length > 0) {
          const firstInstalledRecommended = recommendedModels.find((m) => m.isInstalled);
          if (firstInstalledRecommended) {
            setSelectedModel(firstInstalledRecommended.id);
          } else {
            setSelectedModel(recommendedModels[0].id);
          }
        } else if (modelsWithStatus.length > 0) {
          const firstInstalled = modelsWithStatus.find((m) => m.isInstalled);
          if (firstInstalled) {
            setSelectedModel(firstInstalled.id);
          } else {
            setSelectedModel(modelsWithStatus[0].id);
          }
        }
      } catch (error) {
        console.error('加载 TTS 模型列表失败:', error);
      } finally {
        if (mounted) setLoadingModels(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 启动 TTS 服务并打开测试页面
  const handleStartTTS = async (): Promise<void> => {
    if (isLoading || !selectedModel) return;

    // 检查模型是否已安装
    const selectedModelInfo = ttsModels.find((m) => m.id === selectedModel);
    if (!selectedModelInfo) {
      console.error('未找到选中的模型');
      return;
    }
    if (!selectedModelInfo.isInstalled) {
      console.error('模型未安装，请先在插件管理中安装');
      return;
    }

    setIsLoading(true);

    try {
      // 启动 TTS 服务
      const result = await window.YUA.sherpa.ttsCreateInstance({
        model: selectedModel,
        numThreads: 2,
        maxNumSentences: 1
      });

      if (!result.success) {
        console.error('启动 TTS 失败:', result.error);
        setIsLoading(false);
        return;
      }

      // 启动成功后，打开测试页面并关闭配置页面
      window.YUA.window['window:open']('tts', {
        model: selectedModel
      });
      window.YUA.window['window:close']('ttsConfig');
    } catch (error) {
      console.error('启动 TTS 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full box-border rounded-lg bg-background drag-region">
      <div className="p-4 box-border border-b">
        <h2 className="text-lg font-semibold">TTS 语音合成配置</h2>
        <p className="text-sm text-muted-foreground">选择要使用的语音合成模型</p>
      </div>

      <ScrollArea className="space-y-4 flex-1 overflow-y-auto px-4 py-4 no-drag">
        {/* 模型选择 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="no-drag" htmlFor="model">
              TTS 模型
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={loadingModels}>
              <SelectTrigger className="no-drag" id="model">
                <SelectValue placeholder={loadingModels ? '加载中...' : '请选择模型'}>
                  {(() => {
                    const selectedModelInfo = selectedModel ? ttsModels.find((m) => m.id === selectedModel) : null;
                    if (!selectedModelInfo) return null;
                    return (
                      <div className="flex items-center gap-2">
                        <span>{selectedModelInfo.displayName || selectedModelInfo.name}</span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-md no-drag">
                {ttsModels.length === 0 && !loadingModels && (
                  <SelectItem value="__no_models__" disabled>
                    暂无可用模型
                  </SelectItem>
                )}
                {ttsModels.map((model) => {
                  const isRecommended = RECOMMENDED_MODEL_IDS.includes(model.id);
                  return (
                    <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                      <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium break-words">{model.displayName || model.name}</span>
                          {isRecommended && <span className="text-xs text-primary shrink-0">推荐</span>}
                          {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                        </div>
                        {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedModel && !ttsModels.find((m) => m.id === selectedModel)?.isInstalled && <div className="text-xs text-amber-600 dark:text-amber-400">该模型未安装，请先在插件管理中安装</div>}
          </div>

          {/* 模型说明卡片 */}
          {selectedModel && (
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">模型信息</CardTitle>
              </CardHeader>
              <div className="px-4 pb-4 space-y-2 text-sm text-muted-foreground">
                {(() => {
                  const model = ttsModels.find((m) => m.id === selectedModel);
                  if (!model) return null;

                  return (
                    <>
                      <div>
                        <span className="font-medium text-foreground">名称：</span>
                        {model.displayName || model.name}
                      </div>
                      {model.description && (
                        <div>
                          <span className="font-medium text-foreground">描述：</span>
                          {model.description}
                        </div>
                      )}
                      {model.languages && model.languages.length > 0 && (
                        <div>
                          <span className="font-medium text-foreground">支持语言：</span>
                          {model.languages.join(', ')}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t p-2 px-4">
        <Button variant="outline" className="flex-1 no-drag" onClick={() => window.YUA.window['window:close']('ttsConfig')}>
          取消
        </Button>
        <Button disabled={isLoading || !selectedModel || !ttsModels.find((m) => m.id === selectedModel)?.isInstalled} onClick={handleStartTTS} className="flex-1 no-drag">
          {isLoading ? (
            <>
              <TbLoader2 className="animate-spin" />
              启动中...
            </>
          ) : (
            <>
              启动
              <TbPlayerPlay />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default TTSConfigPage;
