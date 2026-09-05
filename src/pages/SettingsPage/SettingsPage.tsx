import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbAdjustments, TbCpu, TbKeyboard, TbMessage2, TbNetwork, TbPlug, TbToggleLeft } from 'react-icons/tb';

import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';

import DraggableTitle from '../../components/common/DraggableTitle';
import AISettings from './components/AISettings';
import FeatureFlagsSettings from './components/FeatureFlagsSettings';
import PreferencesSettings from './components/PreferencesSettings';
import PromptSetting from './components/PromptSetting';
import ProxySettings from './components/ProxySettings';
import ShortcutsSettings from './components/ShortcutsSettings';
import PluginPage from './PluginPage';

export type DefaultSettingsCategory = 'preferences' | 'ai' | 'prompt' | 'shortcuts' | 'proxy' | 'features' | 'plugins';

export type SettingsCategory = DefaultSettingsCategory | (string & {});

export interface SettingsCategoryDef {
  id: SettingsCategory;
  label: string;
  icon: React.ElementType;
  description: string;
  component?: React.ReactNode;
}

const EMPTY_EXTRA_CATEGORIES: SettingsCategoryDef[] = [];

interface SettingsPageProps {
  extraCategories?: SettingsCategoryDef[];
  hideTitleBar?: boolean;
  defaultCategory?: SettingsCategory;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ extraCategories = EMPTY_EXTRA_CATEGORIES, hideTitleBar = false, defaultCategory }) => {
  const { t } = useTranslation('settings');

  // 默认设置分类配置
  const defaultCategories = React.useMemo<SettingsCategoryDef[]>(
    () => [
      {
        id: 'preferences',
        label: t('nav.preferences.label'),
        icon: TbAdjustments,
        description: t('nav.preferences.description')
      },
      {
        id: 'ai',
        label: t('nav.ai.label'),
        icon: TbMessage2,
        description: t('nav.ai.description')
      },
      {
        id: 'prompt',
        label: t('nav.prompt.label'),
        icon: TbCpu,
        description: t('nav.prompt.description')
      },
      {
        id: 'features',
        label: t('nav.features.label'),
        icon: TbToggleLeft,
        description: t('nav.features.description')
      },
      {
        id: 'plugins',
        label: t('nav.plugins.label'),
        icon: TbPlug,
        description: t('nav.plugins.description')
      },
      {
        id: 'shortcuts',
        label: t('nav.shortcuts.label'),
        icon: TbKeyboard,
        description: t('nav.shortcuts.description')
      },
      {
        id: 'proxy',
        label: t('nav.proxy.label'),
        icon: TbNetwork,
        description: t('nav.proxy.description')
      }
    ],
    [t]
  );
  // 合并分类，将扩展分类放在偏好设置之后 (index 1)
  const allCategories = React.useMemo(() => {
    const cats = [...defaultCategories];
    if (extraCategories.length > 0) {
      cats.splice(1, 0, ...extraCategories);
    }
    return cats;
  }, [defaultCategories, extraCategories]);

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(defaultCategory || allCategories[0]?.id || 'preferences');
  const [initialAIProviderId, setInitialAIProviderId] = useState<string | null>(null);
  const [initialAIPresetId, setInitialAIPresetId] = useState<string | null>(null);
  const [aiPayloadRevision, setAIPayloadRevision] = useState(0);

  // 当 defaultCategory 变化时，更新 activeCategory
  useEffect(() => {
    if (defaultCategory) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部指定默认分类时同步选中,有意跟随 prop
      setActiveCategory(defaultCategory);
    }
  }, [defaultCategory]);

  const applyWindowPayload = React.useCallback(
    (payload: any): void => {
      if (!payload || typeof payload !== 'object') return;

      const hasAITarget = typeof payload.aiProviderId === 'string' || typeof payload.aiPresetId === 'string';
      if (payload.category && allCategories.some((c) => c.id === payload.category)) {
        setActiveCategory(payload.category as SettingsCategory);
      } else if (hasAITarget && allCategories.some((c) => c.id === 'ai')) {
        setActiveCategory('ai');
      }

      if (hasAITarget) {
        setInitialAIProviderId(typeof payload.aiProviderId === 'string' ? payload.aiProviderId : null);
        setInitialAIPresetId(typeof payload.aiPresetId === 'string' ? payload.aiPresetId : null);
        setAIPayloadRevision((prev) => prev + 1);
      }
    },
    [allCategories]
  );

  useEffect(() => {
    let mounted = true;
    const handlePayload = (payload: any): void => {
      if (!mounted) return;
      applyWindowPayload(payload);
    };

    const unsubscribeOpenReady = window.chobits.window.onOpenReady(handlePayload);

    // 读取窗口打开时传入的 payload，用于直接跳转到指定分类/AI 提供商。
    // 如果 settings 窗口已存在，后续 createOrShow 会走上面的 IPC 事件重新定位。
    (async () => {
      try {
        const payload = await window.chobits.window['window:payload:get']('settings' as any);
        handlePayload(payload);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
      unsubscribeOpenReady();
    };
  }, [applyWindowPayload]);

  // 根据当前分类渲染对应内容
  const renderCurrentCategoryContent = (): JSX.Element => {
    // 优先检查 extraCategories
    const extra = extraCategories.find((c) => c.id === activeCategory);
    if (extra && extra.component) {
      return <>{extra.component}</>;
    }

    switch (activeCategory) {
      case 'preferences':
        return <PreferencesSettings />;
      case 'features':
        return <FeatureFlagsSettings />;
      case 'plugins':
        return <PluginPage />;
      case 'ai':
        return <AISettings initialProviderId={initialAIProviderId || undefined} initialPresetId={initialAIPresetId || undefined} focusRevision={aiPayloadRevision} />;
      case 'prompt':
        return <PromptSetting />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'proxy':
        return <ProxySettings />;
      default:
        return <div></div>;
    }
  };

  return (
    <div className="h-full w-full bg-background">
      {!hideTitleBar && <DraggableTitle title={<span>⚙️ {t('title')}</span>} />}
      <SidebarProvider className="w-full h-full min-h-[unset]">
        <Sidebar>
          <SidebarContent className="gap-0">
            <SidebarGroup className="px-2 !py-0 !pt-[12px]">
              <SidebarGroupContent>
                <SidebarMenu>
                  {allCategories.map((category) => {
                    const Icon = category.icon;
                    return (
                      <SidebarMenuItem className="pl-0 list-none" key={category.id}>
                        <SidebarMenuButton isActive={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>
                          <Icon />
                          {category.label}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <div className={clsx(['flex-1', hideTitleBar ? 'h-full' : 'h-[calc(100vh-36px)]'])}>
          {/* 右侧内容区域 - 简洁头部 */}
          <div className="px-4 py-3 border-b border-border">
            <h1 className="text-lg font-semibold text-foreground">{allCategories.find((cat) => cat.id === activeCategory)?.label}</h1>
          </div>

          <div className="w-full overflow-y-auto overflow-x-hidden h-[calc(100%-49px)]">{renderCurrentCategoryContent()}</div>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default SettingsPage;
