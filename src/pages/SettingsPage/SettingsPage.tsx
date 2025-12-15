import React, { useEffect, useState } from 'react';
import { TbAdjustments, TbBrain, TbCpu, TbFolderOpen, TbKeyboard, TbMessage2, TbNetwork, TbPlug } from 'react-icons/tb';

import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';

import DragAbleTitle from '../../components/common/DragAbleTitle';
import EmbeddingJobsPanel from '../../components/EmbeddingJobs';
import PluginPage from '../PluginPage/PluginPage';
import AiSettings from './components/AiSettings';
import PreferencesSettings from './components/PreferencesSettings';
import PromptSetting from './components/PromptSetting';
import ProxySettings from './components/ProxySettings';
import ShortcutsSettings from './components/ShortcutsSettings';
import Workspace from './components/Workspace';

export type DefaultSettingsCategory = 'preferences' | 'workspace' | 'ai' | 'prompt' | 'plugins' | 'shortcuts' | 'embedding' | 'proxy';

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
    id: 'prompt',
    label: '提示词管理',
    icon: TbCpu,
    description: '提示词管理与设置'
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
    id: 'embedding',
    label: '嵌入任务',
    icon: TbBrain,
    description: '向量嵌入任务管理'
  },
  {
    id: 'proxy',
    label: '代理设置',
    icon: TbNetwork,
    description: '配置网络代理以访问受限资源'
  }
];

interface SettingsPageProps {
  extraCategories?: SettingsCategoryDef[];
  hideTitleBar?: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ extraCategories = [], hideTitleBar = false }) => {
  // 合并分类，将扩展分类放在偏好设置之后 (index 1)
  const allCategories = React.useMemo(() => {
    const cats = [...defaultCategories];
    if (extraCategories.length > 0) {
      cats.splice(1, 0, ...extraCategories);
    }
    return cats;
  }, [extraCategories]);

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(allCategories[0]?.id || 'preferences');
  const [initialAiProviderId, setInitialAiProviderId] = useState<string | null>(null);

  useEffect(() => {
    // 读取窗口打开时传入的 payload，用于直接跳转到指定分类/AI 提供商
    (async () => {
      try {
        const payload = await window.YUA.window['window:payload:get']('settings' as any);
        if (payload?.category && allCategories.some((c) => c.id === payload.category)) {
          setActiveCategory(payload.category as SettingsCategory);
        }
        if (payload?.aiProviderId) setInitialAiProviderId(payload.aiProviderId);
      } catch {
        // ignore
      }
    })();
  }, [allCategories]);

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
      case 'embedding':
        return <EmbeddingJobsPanel />;
      case 'workspace':
        return (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="h-[70vh]">
                <Workspace />
              </div>
            </div>
          </div>
        );
      case 'plugins':
        return (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="h-[70vh]">
                <PluginPage hideTitleBar />
              </div>
            </div>
          </div>
        );
      case 'ai':
        return <AiSettings initialProviderId={initialAiProviderId || undefined} />;
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
      {!hideTitleBar && <DragAbleTitle title={<span>⚙️ 设置</span>} />}
      <SidebarProvider>
        <Sidebar className="top-9 h-[calc(100vh-36px)]">
          <SidebarContent>
            <SidebarGroup className="box-border">
              <SidebarGroupContent>
                <SidebarMenu className="pl-0 my-0">
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
        <div className="flex-1 h-[calc(100vh-36px)]">
          {/* 右侧内容区域 */}
          <div className="flex items-center gap-4 p-2">
            {(() => {
              const currentCategory = allCategories.find((cat) => cat.id === activeCategory);
              const Icon = currentCategory?.icon;
              return Icon ? (
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
              ) : null;
            })()}
            <div>
              <div className="text-xl font-bold text-foreground">{allCategories.find((cat) => cat.id === activeCategory)?.label}</div>
              <div className="text-muted-foreground text-sm">{allCategories.find((cat) => cat.id === activeCategory)?.description}</div>
            </div>
          </div>

          <div className="w-full overflow-y-auto overflow-x-hidden h-[calc(100%-72px)]">{renderCurrentCategoryContent()}</div>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default SettingsPage;
