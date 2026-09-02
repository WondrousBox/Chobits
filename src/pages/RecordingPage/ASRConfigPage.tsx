import { PluginDefinition } from '@packages/plugins/types';
import { CommonConfig, SherpaModel as SherpaModelId } from '@packages/sherpa/common';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import React, { useCallback, useEffect, useState } from 'react';
import { TbChevronDown, TbChevronUp, TbLoader2, TbPlayerPlay, TbPlayerStop } from 'react-icons/tb';
import { toast } from 'sonner';

import { ModelInstallCard } from '@/components/common/ModelInstallCard';
import { ProviderModelSelect, ProviderModelSelectRef } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePluginModelInstall } from '@/hooks/usePluginModelInstall';
import { resolveModelFirstSelection } from '@/lib/ai-model-first';

interface SherpaModelItem extends PluginDefinition {
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

// 推荐模型ID列表
const RECOMMENDED_MODEL_IDS = [
  'sherpa-onnx-streaming-zipformer-ctc-multi-zh-hans-2023-12-13',
  'sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18',
  'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20'
];

// 场景配置类型
interface SceneConfig {
  id: string;
  name: string;
  description: string;
  recommendedModelIds: string[]; // 推荐模型ID列表（按优先级排序）
  defaultLanguage: string;
  translationEnabled: boolean;
  targetLanguage?: string; // 如果启用翻译，目标语言
  recommendedPunctuationModelId?: string; // 推荐的标点符号模型ID（如果为空则不启用）
  commonConfig?: CommonConfig; // 场景特定的 common 配置
}

// 场景配置列表
const SCENE_CONFIGS: SceneConfig[] = [
  {
    id: 'meeting',
    name: '会议',
    description: '适用于中文会议场景，自动识别中文语音',
    recommendedModelIds: ['sherpa-onnx-streaming-zipformer-ctc-multi-zh-hans-2023-12-13'],
    defaultLanguage: 'zh',
    translationEnabled: false,
    recommendedPunctuationModelId: 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8', // 中英文标点
    commonConfig: {
      enableEndpoint: true
      // 会议场景：使用默认配置，保持较短的静音检测以便快速响应
    }
  },
  {
    id: 'english-learning',
    name: '英语学习',
    description: '适用于英语学习场景，自动识别英语语音',
    recommendedModelIds: ['sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18'],
    defaultLanguage: 'en',
    translationEnabled: true,
    targetLanguage: 'zh', // 翻译成中文
    recommendedPunctuationModelId: 'sherpa-onnx-online-punct-en-2024-08-06', // 英文标点
    commonConfig: {
      enableEndpoint: true,
      rule3MinUtteranceLength: 10
    }
  },
  {
    id: 'english',
    name: '英语',
    description: '适用于中英双语场景，自动识别中英文混合语音',
    recommendedModelIds: ['sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20'],
    defaultLanguage: 'zh',
    translationEnabled: false,
    recommendedPunctuationModelId: 'sherpa-onnx-online-punct-en-2024-08-06', // 中英文标点
    commonConfig: {
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20
    }
  },
  {
    id: 'chinese',
    name: '中英',
    description: '适用于中英双语场景，自动识别中英文混合语音',
    recommendedModelIds: ['sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20'],
    defaultLanguage: 'zh',
    translationEnabled: false,
    recommendedPunctuationModelId: 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8', // 中英文标点
    commonConfig: {
      enableEndpoint: true
      // 双语场景：使用默认配置
    }
  },
  {
    id: 'multilingual',
    name: '简繁中文',
    description: '适用于多语言场景，支持多种语言识别',
    recommendedModelIds: ['sherpa-onnx-streaming-zipformer-ctc-multi-zh-hans-2023-12-13'],
    defaultLanguage: 'zh',
    translationEnabled: false,
    recommendedPunctuationModelId: 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8', // 中英文标点
    commonConfig: {
      enableEndpoint: true
      // 多语言场景：使用默认配置
    }
  }
];

const ASRConfigPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [selectedScene, setSelectedScene] = useState<string>('meeting');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [language, setLanguage] = useState('zh');
  const [selectedPunctuationModel, setSelectedPunctuationModel] = useState<string>('');
  const [sherpaModels, setSherpaModels] = useState<SherpaModelItem[]>([]);
  const [punctuationModels, setPunctuationModels] = useState<SherpaModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [cloudProviderId, setCloudProviderId] = useState<string>('');
  const [cloudProviderPresetId, setCloudProviderPresetId] = useState<string>('');
  const [cloudModelId, setCloudModelId] = useState<string>('');
  const [availableCloudProviderIds, setAvailableCloudProviderIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('local');
  const [isAdvancedSettingsVisible, setIsAdvancedSettingsVisible] = useState(false);
  // 麦克风授权状态(macOS/Windows 需要系统授权;该状态同时是「麦克风录音」能力的激活信号)
  const [micStatus, setMicStatus] = useState<string>('unknown');
  const cloudProviderSelectRef = React.useRef<ProviderModelSelectRef>(null);

  // 选中的未安装模型的一键安装引导（安装成功后视为已安装，无需刷新列表）
  const selectedInstalledInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : undefined;
  const { state: installState, install: installModel, cancel: cancelInstall } = usePluginModelInstall(selectedModel || undefined);
  const isSelectedInstalled = (selectedInstalledInfo?.isInstalled ?? false) || installState.status === 'installed';

  // 场景推荐的标点模型同样纳入一键安装（未选择标点模型时无需安装）
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
    void cancelInstall();
    void cancelPunctInstall();
  };

  // 查询 ASR 引擎当前运行状态 & 加载上次保存的配置
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [status, savedConfig] = await Promise.all([window.chobits.sherpa.getStatus(), window.chobits.sherpa.getASRConfig()]);
        if (!mounted) return;
        setIsASRRunning(status.running);
        // 用保存的配置作为默认值
        if (savedConfig) {
          if (savedConfig.backend) setActiveTab(savedConfig.backend);
          if (savedConfig.local?.scene) setSelectedScene(savedConfig.local.scene);
          if (savedConfig.local?.language) setLanguage(savedConfig.local.language);
          if (savedConfig.local?.model) setSelectedModel(savedConfig.local.model);
          if (savedConfig.local?.punctuationModel) setSelectedPunctuationModel(savedConfig.local.punctuationModel);
          if (savedConfig.cloud?.providerId) setCloudProviderId(savedConfig.cloud.providerId);
          if (savedConfig.cloud?.providerPresetId) setCloudProviderPresetId(savedConfig.cloud.providerPresetId);
          if (savedConfig.cloud?.modelId) setCloudModelId(savedConfig.cloud.modelId);
        }
      } catch (error) {
        console.error('查询 ASR 状态失败:', error);
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
      toast.success('麦克风授权成功');
    } else {
      setMicStatus('denied');
      toast.error('麦克风授权被拒绝，请在系统设置中允许访问麦克风');
    }
  }, []);

  // 加载 sherpa 模型列表
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingModels(true);
        // 获取所有支持的插件
        const supported = await window.chobits.pluginResource['plugin-resource:list-supported']();
        // 获取已安装的资源
        const installed = await window.chobits.pluginResource['plugin-resource:list']({
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
        const modelsWithStatus: SherpaModelItem[] = sherpaModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 合并标点符号模型信息和安装状态
        const punctuationModelsWithStatus: SherpaModelItem[] = punctuationModelDefinitions.map((model: PluginDefinition) => ({
          ...model,
          isInstalled: installedIds.has(model.id) || installedIds.has(model.name)
        }));

        // 按显示名称排序
        modelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
        punctuationModelsWithStatus.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));

        setSherpaModels(modelsWithStatus);
        setPunctuationModels(punctuationModelsWithStatus);

        // 根据场景自动选择模型和标点符号模型
        if (selectedScene) {
          const sceneConfig = SCENE_CONFIGS.find((s) => s.id === selectedScene);
          if (sceneConfig) {
            // 按优先级查找推荐模型
            let foundModel = null;
            for (const modelId of sceneConfig.recommendedModelIds) {
              const model = modelsWithStatus.find((m) => m.id === modelId);
              if (model && model.isInstalled) {
                foundModel = model;
                break;
              }
            }
            // 如果推荐模型都未安装，选择第一个推荐模型
            if (!foundModel && sceneConfig.recommendedModelIds.length > 0) {
              const model = modelsWithStatus.find((m) => m.id === sceneConfig.recommendedModelIds[0]);
              if (model) {
                foundModel = model;
              }
            }
            // 如果还是没找到，回退到原来的逻辑
            if (!foundModel) {
              const recommendedModels = modelsWithStatus.filter((m) => RECOMMENDED_MODEL_IDS.includes(m.id));
              if (recommendedModels.length > 0) {
                const firstInstalledRecommended = recommendedModels.find((m) => m.isInstalled);
                foundModel = firstInstalledRecommended || recommendedModels[0];
              } else if (modelsWithStatus.length > 0) {
                const firstInstalled = modelsWithStatus.find((m) => m.isInstalled);
                foundModel = firstInstalled || modelsWithStatus[0];
              }
            }
            if (foundModel) {
              setSelectedModel(foundModel.id);
            }

            // 根据场景选择推荐标点符号模型
            if (sceneConfig.recommendedPunctuationModelId && punctuationModelsWithStatus.length > 0) {
              const punctuationModel = punctuationModelsWithStatus.find((m) => m.id === sceneConfig.recommendedPunctuationModelId);
              if (punctuationModel) {
                // 优先选择已安装的标点模型
                if (punctuationModel.isInstalled) {
                  setSelectedPunctuationModel(punctuationModel.id);
                } else {
                  // 如果推荐模型未安装，尝试查找同类型的已安装模型
                  const alternativeModel = punctuationModelsWithStatus.find((m) => m.isInstalled && m.languages?.some((lang) => punctuationModel.languages?.includes(lang)));
                  if (alternativeModel) {
                    setSelectedPunctuationModel(alternativeModel.id);
                  } else {
                    // 如果都没有安装，仍然选择推荐的模型（用户会看到提示）
                    setSelectedPunctuationModel(punctuationModel.id);
                  }
                }
              }
            } else if (!sceneConfig.recommendedPunctuationModelId) {
              // 如果场景没有推荐标点模型，清空选择
              setSelectedPunctuationModel('');
            }
          }
        } else if (!selectedModel) {
          // 如果没有选择场景，使用原来的逻辑
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当场景改变时，自动应用场景配置（render 期间用 prev 对比调整状态，避免在 effect 中同步 setState）
  const [prevSceneInputs, setPrevSceneInputs] = useState({ selectedScene, sherpaModels, punctuationModels });
  if (prevSceneInputs.selectedScene !== selectedScene || prevSceneInputs.sherpaModels !== sherpaModels || prevSceneInputs.punctuationModels !== punctuationModels) {
    setPrevSceneInputs({ selectedScene, sherpaModels, punctuationModels });
    const sceneConfig = SCENE_CONFIGS.find((s) => s.id === selectedScene);
    if (sceneConfig) {
      // 设置语言
      setLanguage(sceneConfig.defaultLanguage);

      // 翻译配置现在由 ASR 页面的 AI 面板控制

      // 根据场景选择推荐模型
      if (sherpaModels.length > 0) {
        let foundModel = null;
        for (const modelId of sceneConfig.recommendedModelIds) {
          const model = sherpaModels.find((m) => m.id === modelId);
          if (model && model.isInstalled) {
            foundModel = model;
            break;
          }
        }
        if (!foundModel && sceneConfig.recommendedModelIds.length > 0) {
          const model = sherpaModels.find((m) => m.id === sceneConfig.recommendedModelIds[0]);
          if (model) {
            foundModel = model;
          }
        }
        if (foundModel) {
          setSelectedModel(foundModel.id);
        }
      }

      // 根据场景选择推荐标点符号模型
      if (punctuationModels.length > 0 && sceneConfig.recommendedPunctuationModelId) {
        const punctuationModel = punctuationModels.find((m) => m.id === sceneConfig.recommendedPunctuationModelId);
        if (punctuationModel) {
          // 优先选择已安装的标点模型
          if (punctuationModel.isInstalled) {
            setSelectedPunctuationModel(punctuationModel.id);
          } else {
            // 如果推荐模型未安装，尝试查找同类型的已安装模型
            const alternativeModel = punctuationModels.find((m) => m.isInstalled && m.languages?.some((lang) => punctuationModel.languages?.includes(lang)));
            if (alternativeModel) {
              setSelectedPunctuationModel(alternativeModel.id);
            } else {
              // 如果都没有安装，仍然选择推荐的模型（用户会看到提示）
              setSelectedPunctuationModel(punctuationModel.id);
            }
          }
        }
      } else if (!sceneConfig.recommendedPunctuationModelId) {
        // 如果场景没有推荐标点模型，清空选择
        setSelectedPunctuationModel('');
      }
    }
  }

  // 当模型改变时，检查并重置语言选择（仅在高级设置中手动修改时生效）
  const [prevLanguageInputs, setPrevLanguageInputs] = useState({ selectedModel, sherpaModels, language, isAdvancedSettingsVisible });
  if (
    prevLanguageInputs.selectedModel !== selectedModel ||
    prevLanguageInputs.sherpaModels !== sherpaModels ||
    prevLanguageInputs.language !== language ||
    prevLanguageInputs.isAdvancedSettingsVisible !== isAdvancedSettingsVisible
  ) {
    setPrevLanguageInputs({ selectedModel, sherpaModels, language, isAdvancedSettingsVisible });
    const selectedModelInfo = selectedModel ? sherpaModels.find((m) => m.id === selectedModel) : undefined;
    if (selectedModel && isAdvancedSettingsVisible && selectedModelInfo) {
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

  // 云端服务商列表变化后，若当前选择已不可用则清空
  const [prevCloudInputs, setPrevCloudInputs] = useState({ availableCloudProviderIds, cloudProviderId });
  if (prevCloudInputs.availableCloudProviderIds !== availableCloudProviderIds || prevCloudInputs.cloudProviderId !== cloudProviderId) {
    setPrevCloudInputs({ availableCloudProviderIds, cloudProviderId });
    if (cloudProviderId && availableCloudProviderIds.length > 0 && !availableCloudProviderIds.includes(cloudProviderId)) {
      setCloudProviderId('');
      setCloudProviderPresetId('');
      setCloudModelId('');
    }
  }

  const handleOpenCloudProviderConfig = useCallback(async (): Promise<void> => {
    try {
      if (!cloudProviderId) {
        await window.chobits.window['window:open']('settings' as any, { category: 'ai' });
        return;
      }
      cloudProviderSelectRef.current?.openConfig(cloudProviderId, cloudProviderPresetId);
    } catch (error) {
      console.error('打开云端转写预设配置失败:', error);
    }
  }, [cloudProviderId, cloudProviderPresetId]);

  const resolveCloudSelection = useCallback(async () => {
    if (!cloudProviderId || !cloudModelId) {
      return null;
    }

    const isConfigured = await cloudProviderSelectRef.current?.checkConfig(cloudProviderId, cloudProviderPresetId);
    if (!isConfigured) {
      cloudProviderSelectRef.current?.openConfig(cloudProviderId, cloudProviderPresetId);
      return null;
    }

    const resolvedSelection = await resolveModelFirstSelection({
      providerId: cloudProviderId,
      modelId: cloudModelId,
      preferredPresetId: cloudProviderPresetId
    });
    if (!resolvedSelection) {
      cloudProviderSelectRef.current?.openConfig(cloudProviderId, cloudProviderPresetId);
      return null;
    }

    if (resolvedSelection.providerPresetId !== cloudProviderPresetId) {
      setCloudProviderPresetId(resolvedSelection.providerPresetId);
    }

    return resolvedSelection;
  }, [cloudModelId, cloudProviderId, cloudProviderPresetId]);

  // 停止 ASR 服务
  const handleStopASR = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await window.chobits.sherpa.destroyInstance();
      await window.chobits.sherpa.saveASRConfig({ enabled: false });
      setIsASRRunning(false);
    } catch (error) {
      console.error('停止 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 启动ASR服务
  const handleStartASR = async (): Promise<void> => {
    let resolvedCloudSelection: {
      providerId: string;
      providerPresetId: string;
      modelId: string;
    } | null = null;

    if (activeTab === 'cloud') {
      resolvedCloudSelection = await resolveCloudSelection();
      if (!resolvedCloudSelection) {
        return;
      }
    } else {
      if (isLoading || !selectedModel) return;

      // 检查模型是否已安装（含一键安装刚完成的场景）
      if (!selectedInstalledInfo) {
        console.error('未找到选中的模型');
        return;
      }
      if (!isSelectedInstalled) {
        // 模型未安装时给出可跳转的提示，避免用户卡在死路
        toast.error('模型未安装，请先使用上方一键安装');
        return;
      }

      // 如果选择了标点模型，检查是否已安装（含一键安装刚完成的场景）
      if (selectedPunctuationModel && !isPunctInstalled) {
        toast.error('标点模型未安装，请先使用上方一键安装');
        return;
      }
    }

    // 翻译配置现在由 ASR 页面的 AI 面板控制，这里不再检查

    setIsLoading(true);

    try {
      let success = false;
      if (activeTab === 'local') {
        // 获取当前场景的 commonConfig
        const sceneConfig = SCENE_CONFIGS.find((s) => s.id === selectedScene);
        const commonConfig = sceneConfig?.commonConfig;

        // 启动 ASR 服务
        success = await window.chobits.sherpa.createInstance({
          model: selectedModel as SherpaModelId,
          language: language,
          punctuationModel: selectedPunctuationModel || undefined,
          commonConfig: commonConfig
        });
      } else {
        // 启动 VAD 服务
        success = await window.chobits.sherpa.createInstance({
          type: 'vad'
        });
      }

      if (!success) {
        setIsLoading(false);
        return;
      }

      // 启动成功后保存配置并更新状态
      if (activeTab === 'local') {
        await window.chobits.sherpa.saveASRConfig({
          enabled: true,
          backend: 'local',
          local: {
            scene: selectedScene,
            model: selectedModel,
            language,
            punctuationModel: selectedPunctuationModel
          }
        });

        // 打开识别测试窗口并关闭配置页面（与 TTS 流程一致）
        window.chobits.window['window:open']('asrTest' as any, { model: selectedModel, language });
        window.chobits.window['window:close']('asrConfig');
      } else {
        await window.chobits.sherpa.saveASRConfig({
          enabled: true,
          backend: 'cloud',
          cloud: {
            providerId: resolvedCloudSelection?.providerId || cloudProviderId,
            providerPresetId: resolvedCloudSelection?.providerPresetId || cloudProviderPresetId,
            modelId: resolvedCloudSelection?.modelId || cloudModelId
          }
        });
      }
      setIsASRRunning(true);
    } catch (error) {
      console.error('启动 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full w-full box-border rounded-lg bg-background drag-region">
        <div className="p-4 box-border">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="local" className="no-drag">
                本地识别
              </TabsTrigger>
              <TabsTrigger value="cloud" disabled>
                云端转写
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="space-y-4 flex-1 overflow-y-auto px-4 no-drag">
          {/* macOS/Windows 需要系统麦克风授权,未授权时给出引导(语音识别能力树依赖该授权信号) */}
          {micStatus !== 'granted' && micStatus !== 'unknown' && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              <span>语音识别需要麦克风权限，当前未授权。</span>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleRequestMicAccess}>
                授权麦克风
              </Button>
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="local" className="space-y-4 mt-0">
              {/* 场景选择 */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  {SCENE_CONFIGS.map((scene) => (
                    <Card
                      key={scene.id}
                      className={`cursor-pointer transition-all hover:border-primary ${selectedScene === scene.id ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => !loadingModels && setSelectedScene(scene.id)}
                    >
                      <CardHeader>
                        <CardTitle>{scene.name}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>

              {/* 选中模型（含场景推荐的标点模型）未安装时的一键安装引导，不依赖展开自定义 */}
              {installItems.length > 0 && <ModelInstallCard items={installItems} onInstall={handleInstallAll} onCancel={handleCancelAll} />}

              {/* 高级设置 */}
              <div className="space-y-2 border rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsAdvancedSettingsVisible(!isAdvancedSettingsVisible)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors rounded-t-lg"
                >
                  <span className="no-drag">自定义</span>
                  {isAdvancedSettingsVisible ? <TbChevronUp className="h-4 w-4 no-drag" /> : <TbChevronDown className="h-4 w-4 no-drag" />}
                </button>
                {isAdvancedSettingsVisible && (
                  <div className="px-4 pb-4 space-y-4 border-t">
                    <div className="space-y-2 pt-4">
                      <Label className="no-drag" htmlFor="model">
                        模型
                      </Label>
                      {(() => {
                        // 分离推荐模型和其他模型
                        const recommendedModels = sherpaModels.filter((m) => RECOMMENDED_MODEL_IDS.includes(m.id));
                        const otherModels = sherpaModels.filter((m) => !RECOMMENDED_MODEL_IDS.includes(m.id));

                        return (
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
                                <SelectItem value="__no_models__" disabled>
                                  暂无可用模型
                                </SelectItem>
                              )}
                              {recommendedModels.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>推荐模型</SelectLabel>
                                  {recommendedModels.map((model) => {
                                    const isStreaming = model.id.toLowerCase().includes('stream');
                                    const supportedLanguages = model.languages || [];
                                    const languageDisplay = supportedLanguages.includes('multi') ? '多语言' : supportedLanguages.map((lang) => getLanguageName(lang)).join('、');
                                    return (
                                      <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                                        <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium break-words">{model.displayName || model.name}</span>
                                            {isStreaming && <span className="text-xs text-primary shrink-0">流式</span>}
                                            {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                                          </div>
                                          {supportedLanguages.length > 0 && <div className="text-xs text-muted-foreground">支持语言: {languageDisplay}</div>}
                                          {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectGroup>
                              )}
                              {otherModels.length > 0 && (
                                <>
                                  {recommendedModels.length > 0 && <SelectSeparator />}
                                  <SelectGroup>
                                    <SelectLabel>其他模型</SelectLabel>
                                    {otherModels.map((model) => {
                                      const isStreaming = model.id.toLowerCase().includes('stream');
                                      const supportedLanguages = model.languages || [];
                                      const languageDisplay = supportedLanguages.includes('multi') ? '多语言' : supportedLanguages.map((lang) => getLanguageName(lang)).join('、');
                                      return (
                                        <SelectItem key={model.id} value={model.id} disabled={!model.isInstalled} className="items-center box-border" textValue={model.displayName || model.name}>
                                          <div className="flex flex-col gap-0.5 py-0.5 w-full min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-medium break-words">{model.displayName || model.name}</span>
                                              {isStreaming && <span className="text-xs text-primary shrink-0">流式</span>}
                                              {!model.isInstalled && <span className="text-xs text-muted-foreground shrink-0">(未安装)</span>}
                                            </div>
                                            {supportedLanguages.length > 0 && <div className="text-xs text-muted-foreground">支持语言: {languageDisplay}</div>}
                                            {model.description && <div className="text-xs text-muted-foreground leading-relaxed break-words">{model.description}</div>}
                                          </div>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectGroup>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        );
                      })()}
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
                        <div className="flex items-center justify-between">
                          <Label className="no-drag" htmlFor="punctuationModel">
                            标点符号模型
                          </Label>
                          {(() => {
                            const sceneConfig = SCENE_CONFIGS.find((s) => s.id === selectedScene);
                            if (sceneConfig?.recommendedPunctuationModelId) {
                              const recommendedModel = punctuationModels.find((m) => m.id === sceneConfig.recommendedPunctuationModelId);
                              if (recommendedModel && selectedPunctuationModel === recommendedModel.id) {
                                return <span className="text-xs text-muted-foreground">场景推荐</span>;
                              }
                            }
                            return null;
                          })()}
                        </div>
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
                            {(() => {
                              const sceneConfig = SCENE_CONFIGS.find((s) => s.id === selectedScene);
                              const recommendedModelId = sceneConfig?.recommendedPunctuationModelId;
                              const recommendedModels = recommendedModelId ? punctuationModels.filter((m) => m.id === recommendedModelId) : [];
                              const otherModels = recommendedModelId ? punctuationModels.filter((m) => m.id !== recommendedModelId) : punctuationModels;

                              return (
                                <>
                                  {recommendedModels.length > 0 && (
                                    <SelectGroup>
                                      <SelectLabel>场景推荐</SelectLabel>
                                      {recommendedModels.map((model) => (
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
                                    </SelectGroup>
                                  )}
                                  {otherModels.length > 0 && (
                                    <>
                                      {recommendedModels.length > 0 && <SelectSeparator />}
                                      <SelectGroup>
                                        <SelectLabel>其他模型</SelectLabel>
                                        {otherModels.map((model) => (
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
                                      </SelectGroup>
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="cloud" className="space-y-4 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="no-drag">服务商与模型</Label>
                    {cloudProviderId && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 no-drag" onClick={() => void handleOpenCloudProviderConfig()}>
                          配置
                        </Button>
                      </div>
                    )}
                  </div>
                  <ProviderModelSelect
                    ref={cloudProviderSelectRef}
                    providerId={cloudProviderId}
                    presetId={cloudProviderPresetId}
                    modelId={cloudModelId}
                    onChange={(providerId, modelId) => {
                      setCloudProviderId((prevProviderId) => {
                        if (prevProviderId && prevProviderId !== providerId) {
                          setCloudProviderPresetId('');
                        }
                        return providerId;
                      });
                      setCloudModelId(modelId);
                    }}
                    providerFilter={(provider) => !!provider.capabilities?.transcribe}
                    modelTypes={['audio', 'realtime', 'stt']}
                    onProvidersLoaded={(providers) => {
                      setAvailableCloudProviderIds(providers.map((provider) => provider.id));
                    }}
                    placeholder="请选择云端转写模型"
                    buttonVariant="outline"
                    buttonSize="default"
                    className="w-full justify-between rounded-md no-drag"
                  />
                  {!cloudModelId && <div className="text-xs text-amber-600 dark:text-amber-400">请选择一个支持转写的模型后再启动云端转写</div>}
                </div>

                <p className="text-xs text-muted-foreground">仅展示当前声明了转写能力的 AI 服务商和模型</p>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        <div className="flex gap-2 border-t p-2 px-4">
          <Button variant="outline" className="flex-1 no-drag" onClick={() => window.chobits.window['window:close']('asrConfig')}>
            关闭
          </Button>
          {isASRRunning ? (
            <Button variant="destructive" disabled={isLoading} onClick={handleStopASR} className="flex-1 no-drag">
              {isLoading ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  停止中...
                </>
              ) : (
                <>
                  停止识别
                  <TbPlayerStop />
                </>
              )}
            </Button>
          ) : (
            <Button
              disabled={
                isLoading ||
                (activeTab === 'local' && (!selectedModel || !sherpaModels.find((m) => m.id === selectedModel)?.isInstalled)) ||
                (activeTab === 'cloud' && (!cloudProviderId || !cloudModelId))
              }
              onClick={handleStartASR}
              className="flex-1 no-drag"
            >
              {isLoading ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  启动语音识别
                  <TbPlayerPlay />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default ASRConfigPage;
