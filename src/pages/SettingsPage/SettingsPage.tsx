import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { TbAdjustments, TbBook, TbCpu, TbFolderOpen, TbKeyboard, TbMessage2, TbNetwork, TbPlug, TbUser } from 'react-icons/tb';

import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';

import DragAbleTitle from '../../components/common/DragAbleTitle';
import AiSettings from './components/AiSettings';
import GlossarySettings from './components/glossary/GlossarySettings';
import PreferencesSettings from './components/PreferencesSettings';
import PromptSetting from './components/PromptSetting';
import ProxySettings from './components/ProxySettings';
import ShortcutsSettings from './components/ShortcutsSettings';
import UserProfileSettings from './components/UserProfileSettings';
import Workspace from './components/Workspace';
import PluginPage from './PluginPage';

export type DefaultSettingsCategory = 'preferences' | 'workspace' | 'ai' | 'user-profile' | 'prompt' | 'glossary' | 'plugins' | 'shortcuts' | 'proxy';

export type SettingsCategory = DefaultSettingsCategory | (string & {});

export interface SettingsCategoryDef {
  id: SettingsCategory;
  label: string;
  icon: React.ElementType;
  description: string;
  component?: React.ReactNode;
}

// 默认设置分类配置
const defaultCategories: SettingsCategoryDef[] = [
  {
    id: 'preferences',
    label: '偏好设置',
    icon: TbAdjustments,
    description: '主题外观和文件夹设置'
  },
  {
    id: 'workspace',
    label: '工作空间',
    icon: TbFolderOpen,
    description: '工作空间管理与默认空间设置'
  },
  {
    id: 'ai',
    label: '对话设置',
    icon: TbMessage2,
    description: 'AI 提供商、API Key、对话参数'
  },
  {
    id: 'user-profile',
    label: '用户画像',
    icon: TbUser,
    description: '查看 AI 自动提取的用户偏好画像'
  },
  {
    id: 'prompt',
    label: '提示词管理',
    icon: TbCpu,
    description: '提示词管理与设置'
  },
  {
    id: 'glossary',
    label: '翻译术语',
    icon: TbBook,
    description: '翻译术语表管理'
  },
  {
    id: 'plugins',
    label: '插件管理',
    icon: TbPlug,
    description: '插件管理'
  },
  {
    id: 'shortcuts',
    label: '快捷键',
    icon: TbKeyboard,
    description: '全局快捷键设置'
  },
  {
    id: 'proxy',
    label: '代理设置',
    icon: TbNetwork,
    description: '配置网络代理以访问受限资源'
  }
];

const EMPTY_EXTRA_CATEGORIES: SettingsCategoryDef[] = [];

interface SettingsPageProps {
  extraCategories?: SettingsCategoryDef[];
  hideTitleBar?: boolean;
  defaultCategory?: SettingsCategory;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ extraCategories = EMPTY_EXTRA_CATEGORIES, hideTitleBar = false, defaultCategory }) => {
  // 合并分类，将扩展分类放在偏好设置之后 (index 1)
  const allCategories = React.useMemo(() => {
    const cats = [...defaultCategories];
    if (extraCategories.length > 0) {
      cats.splice(1, 0, ...extraCategories);
    }
    return cats;
  }, [extraCategories]);

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(defaultCategory || allCategories[0]?.id || 'preferences');
  const [initialAiProviderId, setInitialAiProviderId] = useState<string | null>(null);
  const [initialAiPresetId, setInitialAiPresetId] = useState<string | null>(null);
  const [aiPayloadRevision, setAiPayloadRevision] = useState(0);

  // 当 defaultCategory 变化时，更新 activeCategory
  useEffect(() => {
    if (defaultCategory) {
      setActiveCategory(defaultCategory);
    }
  }, [defaultCategory]);

  const applyWindowPayload = React.useCallback(
    (payload: any): void => {
      if (!payload || typeof payload !== 'object') return;

      const hasAiTarget = typeof payload.aiProviderId === 'string' || typeof payload.aiPresetId === 'string';
      if (payload.category && allCategories.some((c) => c.id === payload.category)) {
        setActiveCategory(payload.category as SettingsCategory);
      } else if (hasAiTarget && allCategories.some((c) => c.id === 'ai')) {
        setActiveCategory('ai');
      }

      if (hasAiTarget) {
        setInitialAiProviderId(typeof payload.aiProviderId === 'string' ? payload.aiProviderId : null);
        setInitialAiPresetId(typeof payload.aiPresetId === 'string' ? payload.aiPresetId : null);
        setAiPayloadRevision((prev) => prev + 1);
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
    const ipcHandler = (_event: any, payload: any): void => handlePayload(payload);

    window.ipcRenderer?.on('on:window:open:ready', ipcHandler);

    // 读取窗口打开时传入的 payload，用于直接跳转到指定分类/AI 提供商。
    // 如果 settings 窗口已存在，后续 createOrShow 会走上面的 IPC 事件重新定位。
    (async () => {
      try {
        const payload = await window.YUA.window['window:payload:get']('settings' as any);
        handlePayload(payload);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
      window.ipcRenderer?.off('on:window:open:ready', ipcHandler);
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
      case 'workspace':
        return <Workspace />;
      case 'plugins':
        return <PluginPage />;
      case 'ai':
        return <AiSettings initialProviderId={initialAiProviderId || undefined} initialPresetId={initialAiPresetId || undefined} focusRevision={aiPayloadRevision} />;
      case 'user-profile':
        return <UserProfileSettings />;
      case 'prompt':
        return <PromptSetting />;
      case 'glossary':
        return <GlossarySettings />;
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
      {!hideTitleBar && <DragAbleTitle title={<span>⚙️ 设置</span>} />}
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
