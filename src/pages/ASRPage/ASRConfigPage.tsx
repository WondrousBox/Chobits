import { PluginDefinition } from '@packages/plugins/types';
import { CommonConfig, SherpaModel as SherpaModelId } from '@packages/sherpa/common';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbLoader2, TbPlayerPlay, TbPlayerStop } from 'react-icons/tb';
import { toast } from 'sonner';

import { ModelInstallCard } from '@/components/common/ModelInstallCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePluginModelInstall } from '@/hooks/usePluginModelInstall';

interface SherpaModelItem extends PluginDefinition {
  isInstalled: boolean;
}

// 随安装包内置的 SenseVoice 模型（与 packages/sherpa/model-seed.ts 的 BUNDLED_ASR_MODEL_NAME 保持一致）
const BUNDLED_SENSE_VOICE_MODEL_ID = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17';

// 推荐模型ID列表（仅内置 SenseVoice,新装用户开箱即用）
const RECOMMENDED_MODEL_IDS = [BUNDLED_SENSE_VOICE_MODEL_ID];

// 本地识别固定使用 meeting 场景的端点检测配置（场景选择 UI 已移除,配置结构保留 scene 字段以兼容已有配置）
const DEFAULT_SCENE_ID = 'meeting';
const DEFAULT_COMMON_CONFIG: CommonConfig = {
  enableEndpoint: true
};

const ASRConfigPage: React.FC = () => {
  const { t } = useTranslation('asr');
  // 语言代码到显示名称（复用 plugins namespace 的 language.* 文案，未知代码回退为大写代码）
  const getLanguageName = useCallback((code: string): string => t(`plugins:language.${code}`, { defaultValue: code.toUpperCase() }), [t]);
  const [isLoading, setIsLoading] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [language, setLanguage] = useState('zh');
  const [selectedPunctuationModel, setSelectedPunctuationModel] = useState<string>('');
  const [sherpaModels, setSherpaModels] = useState<SherpaModelItem[]>([]);
  const [punctuationModels, setPunctuationModels] = useState<SherpaModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  // 麦克风授权状态(macOS/Windows 需要系统授权;该状态同时是「麦克风录音」能力的激活信号)
  const [micStatus, setMicStatus] = useState<string>('unknown');

  // 选中的未安装模型的一键安装引导（安装成功后视为已安装，无需刷新列表）
  const selectedInstalledInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : undefined;
  const { state: installState, install: installModel, cancel: cancelInstall } = usePluginModelInstall(selectedModel || undefined);
  const isSelectedInstalled = (selectedInstalledInfo?.isInstalled ?? false) || installState.status === 'installed';

  // 标点模型同样纳入一键安装（未选择标点模型时无需安装）
  const selectedPunctuationInfo = selectedPunctuationModel ? punctuationModels.find((m) => m.id === selectedPunctuationModel) : undefined;
  const { state: punctInstallState, install: installPunctModel, cancel: cancelPunctInstall } = usePluginModelInstall(selectedPunctuationModel || undefined);
  const isPunctInstalled = !selectedPunctuationModel || (selectedPunctuationInfo?.isInstalled ?? false) || punctInstallState.status === 'installed';

  // 待安装项（ASR 模型 + 标点模型，只包含尚未安装的）
  const installItems = [
    ...(selectedInstalledInfo && !isSelectedInstalled
      ? [{ id: selectedInstalledInfo.id, name: selectedInstalledInfo.displayName || selectedInstalledInfo.name, sizeBytes: selectedInstalledInfo.platforms?.[0]?.sizeBytes, state: installState }]
      : []),
    ...(selectedPunctuationInfo && !isPunctInstalled
      ? [
          {
            id: selectedPunctuationInfo.id,
            name: selectedPunctuationInfo.displayName || selectedPunctuationInfo.name,
            sizeBytes: selectedPunctuationInfo.platforms?.[0]?.sizeBytes,
            state: punctInstallState
          }
        ]
      : [])
  ];

  const handleInstallAll = (): void => {
    if (selectedInstalledInfo && !isSelectedInstalled) void installModel();
    if (selectedPunctuationInfo && !isPunctInstalled) void installPunctModel();
  };

  const handleCancelAll = (): void => {
    if (selectedInstalledInfo && !isSelectedInstalled) void cancelInstall();
    if (selectedPunctuationInfo && !isPunctInstalled) void cancelPunctInstall();
  };

  // 加载运行状态、已保存配置与模型列表，一次性确定默认选择
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingModels(true);
        const [status, savedConfigResult, supported, installed] = await Promise.all([
          window.chobits.sherpa.getStatus(),
          window.chobits.sherpa.getASRConfig(),
          window.chobits.pluginResource['plugin-resource:list-supported'](),
          window.chobits.pluginResource['plugin-resource:list']({
            pluginId: 'plugin:sherpa-onnx',
            type: 'model'
          })
        ]);
        if (!mounted) return;

        setIsASRRunning(!!(status.ok && status.running));

        // 用保存的配置作为默认值
        const savedConfig = savedConfigResult.ok ? savedConfigResult.config : undefined;
        if (savedConfig) {
          if (savedConfig.local?.language) setLanguage(savedConfig.local.language);
          if (savedConfig.local?.model) setSelectedModel(savedConfig.local.model);
          if (savedConfig.local?.punctuationModel) setSelectedPunctuationModel(savedConfig.local.punctuationModel);
        }

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

        // 合并模型信息和安装状态
        const modelsWithStatus: SherpaModelItem[] = sherpaModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        const punctuationModelsWithStatus: SherpaModelItem[] = punctuationModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 按显示名称排序
        modelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
        punctuationModelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));

        setSherpaModels(modelsWithStatus);
        setPunctuationModels(punctuationModelsWithStatus);

        // 无已保存模型时，默认选择第一个已安装的推荐模型（内置 SenseVoice 优先）
        const savedModelId = savedConfig?.local?.model;
        if (!savedModelId || !modelsWithStatus.some((m) => m.id === savedModelId)) {
          const recommendedModels = modelsWithStatus.filter((m) => RECOMMENDED_MODEL_IDS.includes(m.id));
          const firstInstalledRecommended = recommendedModels.find((m) => m.isInstalled);
          const firstInstalled = modelsWithStatus.find((m) => m.isInstalled);
          const fallback = firstInstalledRecommended || recommendedModels[0] || firstInstalled || modelsWithStatus[0];
          if (fallback) {
            setSelectedModel(fallback.id);
          }
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

  // 查询麦克风授权状态(macOS/Windows;Linux 无系统级授权,不显示横幅)
  useEffect(() => {
    if (!window.chobits.isMac && !window.chobits.isWindows) return;
    window.chobits.system['system:microphone:get-status']()
      .then((res) => {
        if (res.ok && res.status) setMicStatus(res.status);
      })
      .catch(() => undefined);
  }, []);

  const handleRequestMicAccess = useCallback(async (): Promise<void> => {
    const res = await window.chobits.system['system:microphone:request-access']();
    if (res.ok && res.isGranted) {
      setMicStatus('granted');
      toast.success(t('micPermission.granted'));
    } else {
      setMicStatus('denied');
      toast.error(t('micPermission.denied'));
    }
  }, [t]);

  // 当模型改变时，检查并重置语言选择
  const [prevLanguageInputs, setPrevLanguageInputs] = useState({ selectedModel, sherpaModels, language });
  if (prevLanguageInputs.selectedModel !== selectedModel || prevLanguageInputs.sherpaModels !== sherpaModels || prevLanguageInputs.language !== language) {
    setPrevLanguageInputs({ selectedModel, sherpaModels, language });
    const selectedModelInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : undefined;
    if (selectedModel && selectedModelInfo) {
      const supportedLanguages = selectedModelInfo.languages || [];
      // 如果模型支持 multi，则支持所有语言，不需要重置
      if (!supportedLanguages.includes('multi')) {
        // 如果只有一种语言，自动设置为该语言
        if (supportedLanguages.length === 1) {
          setLanguage(supportedLanguages[0]);
        } else if (supportedLanguages.length > 0 && !supportedLanguages.includes(language)) {
          // 如果当前选择的语言不在支持列表中，重置为第一个支持的语言
          setLanguage(supportedLanguages[0]);
        }
        // 如果没有指定语言，保持当前选择
      }
    }
  }

  // 停止 ASR 服务
  const handleStopASR = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const destroyResult = await window.chobits.sherpa.destroyInstance();
      if (!destroyResult.ok) throw new Error(destroyResult.error);
      const saveResult = await window.chobits.sherpa.saveASRConfig({ enabled: false });
      if (!saveResult.ok) throw new Error(saveResult.error);
      setIsASRRunning(false);
    } catch (error) {
      console.error('停止 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 启动ASR服务
  const handleStartASR = async (): Promise<void> => {
    if (isLoading || !selectedModel) return;

    // 检查模型是否已安装（含一键安装刚完成的场景）
    if (!selectedInstalledInfo) {
      console.error('未找到选中的模型');
      return;
    }
    if (!isSelectedInstalled) {
      // 模型未安装时给出可跳转的提示，避免用户卡在死路
      toast.error(t('toast.modelNotInstalled'));
      return;
    }

    // 如果选择了标点模型，检查是否已安装（含一键安装刚完成的场景）
    if (selectedPunctuationModel && !isPunctInstalled) {
      toast.error(t('toast.punctuationNotInstalled'));
      return;
    }

    setIsLoading(true);

    try {
      // 启动 ASR 服务
      const createResult = await window.chobits.sherpa.createInstance({
        model: selectedModel as SherpaModelId,
        language: language,
        punctuationModel: selectedPunctuationModel || undefined,
        commonConfig: DEFAULT_COMMON_CONFIG
      });
      if (!createResult.ok) {
        console.error('启动 ASR 失败:', createResult.error);
        setIsLoading(false);
        return;
      }

      // 启动成功后保存配置并更新状态
      const saveResult = await window.chobits.sherpa.saveASRConfig({
        enabled: true,
        backend: 'local',
        local: {
          scene: DEFAULT_SCENE_ID,
          model: selectedModel,
          language,
          punctuationModel: selectedPunctuationModel
        }
      });
      if (!saveResult.ok) throw new Error(saveResult.error);

      // 打开识别测试窗口并关闭配置页面（与 TTS 流程一致）
      window.chobits.window['window:open']('asrTest' as any, { model: selectedModel, language });
      window.chobits.window['window:close']('asrConfig');
      setIsASRRunning(true);
    } catch (error) {
      console.error('启动 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full box-border rounded-lg bg-background drag-region">
      <ScrollArea className="space-y-4 flex-1 overflow-y-auto px-4 py-4 no-drag">
        {/* macOS/Windows 需要系统麦克风授权,未授权时给出引导(语音识别能力树依赖该授权信号) */}
        {micStatus !== 'granted' && micStatus !== 'unknown' && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            <span>{t('micPermission.banner')}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleRequestMicAccess}>
              {t('micPermission.grant')}
            </Button>
          </div>
        )}

        {/* 模型选择 */}
        <div className="space-y-2">
          <Label className="no-drag" htmlFor="model">
            {t('local.model')}
          </Label>
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={loadingModels}>
            <SelectTrigger className="no-drag" id="model">
              <SelectValue placeholder={loadingModels ? t('local.loading') : t('local.selectModel')}>
                {(() => {
                  const selectedModelInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : null;
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
              {sherpaModels.length === 0 && !loadingModels && (
                <SelectItem value="__no_models__" disabled>
                  {t('local.noModels')}
                </SelectItem>
              )}
              {sherpaModels.map((model) => {
                const isRecommended = RECOMMENDED_MODEL_IDS.includes(model.id);
                const supportedLanguages = model.languages || [];
                const languageDisplay = supportedLanguages.includes('multi') ? getLanguageName('multi') : supportedLanguages.map((lang) => getLanguageName(lang)).join('、');
                return (
                  <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                    <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium break-words">{model.displayName || model.name}</span>
                        {isRecommended && <span className="text-xs text-primary shrink-0">{t('local.recommended')}</span>}
                        {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">{t('local.notInstalled')}</span>}
                      </div>
                      {supportedLanguages.length > 0 && <div className="text-xs text-muted-foreground">{t('local.supportedLanguages', { languages: languageDisplay })}</div>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* 选中模型（含标点模型）未安装时的一键安装引导 */}
        {installItems.length > 0 && <ModelInstallCard items={installItems} onInstall={handleInstallAll} onCancel={handleCancelAll} />}

        {/* 语言选择（模型只支持单一语言时不显示） */}
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
                {t('local.language')}
              </Label>
              <Select value={language} onValueChange={setLanguage} disabled={!selectedModel || loadingModels}>
                <SelectTrigger className="no-drag" id="language">
                  <SelectValue placeholder={!selectedModel ? t('local.selectModelFirst') : t('local.selectLanguage')} />
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
                        {t('local.noLanguagesSpecified')}
                      </SelectItem>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
          );
        })()}

        {/* 标点符号模型（默认不使用） */}
        {punctuationModels.length > 0 && (
          <div className="space-y-2">
            <Label className="no-drag" htmlFor="punctuationModel">
              {t('local.punctuationModel')}
            </Label>
            <Select value={selectedPunctuationModel || '__none__'} onValueChange={(value) => setSelectedPunctuationModel(value === '__none__' ? '' : value)} disabled={loadingModels}>
              <SelectTrigger className="no-drag" id="punctuationModel">
                <SelectValue placeholder={t('local.noPunctuation')}>
                  {selectedPunctuationModel
                    ? punctuationModels.find((m) => m.id === selectedPunctuationModel)?.displayName || punctuationModels.find((m) => m.id === selectedPunctuationModel)?.name
                    : t('local.punctuationDisabled')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-md no-drag">
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">{t('local.noPunctuation')}</span>
                </SelectItem>
                {punctuationModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-start box-border" textValue={model.displayName || model.name}>
                    <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium break-words">{model.displayName || model.name}</span>
                        {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">{t('local.notInstalled')}</span>}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2 border-t p-2 px-4">
        <Button variant="outline" className="flex-1 no-drag" onClick={() => window.chobits.window['window:close']('asrConfig')}>
          {t('action.close')}
        </Button>
        {isASRRunning ? (
          <Button variant="destructive" disabled={isLoading} onClick={handleStopASR} className="flex-1 no-drag">
            {isLoading ? (
              <>
                <TbLoader2 className="animate-spin" />
                {t('action.stopping')}
              </>
            ) : (
              <>
                {t('action.stop')}
                <TbPlayerStop />
              </>
            )}
          </Button>
        ) : (
          <Button disabled={isLoading || !selectedModel || !sherpaModels.find((m) => m.id === selectedModel)?.isInstalled} onClick={handleStartASR} className="flex-1 no-drag">
            {isLoading ? (
              <>
                <TbLoader2 className="animate-spin" />
                {t('action.starting')}
              </>
            ) : (
              <>
                {t('action.start')}
                <TbPlayerPlay />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ASRConfigPage;
