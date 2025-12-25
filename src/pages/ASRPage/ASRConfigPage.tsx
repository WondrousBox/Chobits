import { PluginDefinition } from '@packages/plugins/types';
import { AllModels } from '@packages/sherpa/common';
import React, { useEffect, useState } from 'react';
import { TbLoader2, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const ASRConfigPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [language, setLanguage] = useState('zh');
  const [selectedPunctuationModel, setSelectedPunctuationModel] = useState<string>('');
  const [sherpaModels, setSherpaModels] = useState<SherpaModel[]>([]);
  const [punctuationModels, setPunctuationModels] = useState<SherpaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

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

  // 启动ASR服务并打开测试页面
  const handleStartASR = async (): Promise<void> => {
    if (isLoading || !selectedModel) return;

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
      // 启动 ASR 服务
      const success = await window.YUA.sherpa.createInstance({
        model: selectedModel as AllModels,
        language: language,
        punctuationModel: selectedPunctuationModel || undefined
      });

      if (!success) {
        setIsLoading(false);
        return;
      }

      // 启动成功后，打开测试页面并关闭配置页面
      window.YUA.window['window:open']('asr');
      window.YUA.window['window:close']('asrConfig');
    } catch (error) {
      console.error('启动 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto box-border drag-region rounded-lg bg-background">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="no-drag" htmlFor="model">
              模型
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={loadingModels}>
              <SelectTrigger className="no-drag" id="model">
                <SelectValue placeholder={loadingModels ? '加载中...' : '请选择模型'}>
                  {(() => {
                    const selectedModelInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : null;
                    if (!selectedModelInfo) return null;
                    const isStreaming = selectedModelInfo.id.toLowerCase().includes('stream');
                    return (
                      <div className="flex items-center gap-2">
                        <span>{selectedModelInfo.displayName || selectedModelInfo.name}</span>
                        {isStreaming && <span className="text-xs text-primary shrink-0">流式</span>}
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-md no-drag">
                {sherpaModels.length === 0 && !loadingModels && (
                  <SelectItem value="" disabled>
                    暂无可用模型
                  </SelectItem>
                )}
                {sherpaModels.map((model) => {
                  const isStreaming = model.id.toLowerCase().includes('stream');
                  return (
                    <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                      <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium break-words">{model.displayName || model.name}</span>
                          {isStreaming && <span className="text-xs text-primary shrink-0">流式</span>}
                          {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                        </div>
                        {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                      </div>
                    </SelectItem>
                  );
                })}
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
                <Label className="no-drag" htmlFor="language">
                  语言
                </Label>
                <Select value={language} onValueChange={setLanguage} disabled={!selectedModel || loadingModels}>
                  <SelectTrigger className="no-drag" id="language">
                    <SelectValue placeholder={!selectedModel ? '请先选择模型' : '请选择语言'} />
                  </SelectTrigger>
                  <SelectContent className="no-drag">
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
            <div className="space-y-2">
              <Label className="no-drag" htmlFor="punctuationModel">
                标点符号模型（可选）
              </Label>
              <Select value={selectedPunctuationModel || '__none__'} onValueChange={(value) => setSelectedPunctuationModel(value === '__none__' ? '' : value)} disabled={loadingModels}>
                <SelectTrigger className="no-drag" id="punctuationModel">
                  <SelectValue placeholder="不启用标点符号">
                    {selectedPunctuationModel
                      ? punctuationModels.find((m) => m.id === selectedPunctuationModel)?.displayName || punctuationModels.find((m) => m.id === selectedPunctuationModel)?.name
                      : '不使用标点符号'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-md no-drag">
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
        </div>

        <div className="flex gap-2 border-t">
          <Button variant="outline" className="flex-1 no-drag" onClick={() => window.YUA.window['window:close']('asrConfig')}>
            取消
          </Button>
          <Button disabled={isLoading || !selectedModel || !sherpaModels.find((m) => m.id === selectedModel)?.isInstalled} onClick={handleStartASR} className="flex-1 no-drag">
            {isLoading ? (
              <>
                <TbLoader2 className="animate-spin" />
                启动中...
              </>
            ) : (
              <>
                <TbPlayerPlay />
                启动
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
};

export default ASRConfigPage;
