import React, { useEffect, useState } from 'react';
import { TbDatabase, TbFolderOpen, TbBrain, TbCpu, TbBox, TbFile3D, TbMoodKid, TbFolder, TbMessage2, TbKeyboard, TbFileText } from 'react-icons/tb';
import AiSettings from './components/AiSettings';
import EmbeddingJobsPanel from '../../components/EmbeddingJobs';
import DragAbleTitle from '../../components/common/DragAbleTitle';
import { Button } from '../../components/ui/button';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '../../components/ui/sidebar';
import Workspace from './components/Workspace';
import ModelPage from '../ModelPage/ModelPage';
import SpriteManager from './components/SpriteManager';
import PromptSetting from './components/PromptSetting';
import ShortcutsSettings from './components/ShortcutsSettings';
import GeneralSettings from './components/GeneralSettings';

// 设置分类类型
type SettingsCategory = 'folder' | 'embedding' | 'ai' | 'prompt' | 'general' | 'workspace' | 'model' | 'sprites' | 'shortcuts';

// 设置分类配置
const settingsCategories: { id: SettingsCategory; label: string; icon: React.ElementType; description: string }[] = [
  {
    id: 'general',
    label: '常规设置',
    icon: TbFile3D,
    description: '视频下载和外部资源设置'
  },
  {
    id: 'shortcuts',
    label: '快捷键',
    icon: TbKeyboard,
    description: '全局快捷键设置'
  },

  {
    id: 'folder',
    label: '文件夹',
    icon: TbFolder,
    description: '文件夹相关设置'
  },
  {
    id: 'embedding',
    label: '嵌入任务',
    icon: TbBrain,
    description: '向量嵌入任务管理'
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
    id: 'workspace',
    label: '工作空间',
    icon: TbFolderOpen,
    description: '工作空间管理与默认空间设置'
  },
  {
    id: 'model',
    label: '模型管理',
    icon: TbBox,
    description: '下载与管理本地模型文件'
  },
  {
    id: 'sprites',
    label: '精灵管理',
    icon: TbMoodKid,
    description: '导入/删除动画，设为当前精灵'
  }
];

export const SettingsPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');
  const [initialAiProviderId, setInitialAiProviderId] = useState<string | null>(null);
  // external resource settings are handled inside ExternalResourceSettings component
  useEffect(() => {
    // 读取窗口打开时传入的 payload，用于直接跳转到指定分类/AI 提供商
    (async () => {
      try {
        const payload = await window.YUA.window['window:payload:get']('settings' as any);
        if (payload?.category && settingsCategories.some((c) => c.id === payload.category)) setActiveCategory(payload.category);
        if (payload?.aiProviderId) setInitialAiProviderId(payload.aiProviderId);
      } catch {
        // ignore
      }
    })();
  }, []);

  const openDatabaseLocation = async (): Promise<void> => {
    window.YUA.system['database:openLocation']();
  };

  const openLogsLocation = async (): Promise<void> => {
    window.YUA.system['logs:openLocation']();
  };

  // 外部资源设置由 ExternalResourceSettings 组件渲染

  // 根据当前分类渲染对应内容
  const renderCurrentCategoryContent = (): JSX.Element => {
    switch (activeCategory) {
      case 'folder':
        return (
          <div className="px-2">
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="flex items-center text-foreground gap-1">
                <TbDatabase /> 数据库
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">用户数据目录/data/</div>
                <Button variant="outline" onClick={openDatabaseLocation}>
                  <TbFolderOpen />
                  打开位置
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-2 mt-3">
              <div className="flex items-center text-foreground gap-1">
                <TbFileText /> 日志
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">应用日志目录/logs/</div>
                <Button variant="outline" onClick={openLogsLocation}>
                  <TbFolderOpen />
                  打开位置
                </Button>
              </div>
            </div>
          </div>
        );
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
      case 'model':
        return (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="h-[70vh]">
                <ModelPage hideTitleBar />
              </div>
            </div>
          </div>
        );
      case 'ai':
        return <AiSettings initialProviderId={initialAiProviderId || undefined} />;
      case 'prompt':
        return <PromptSetting />;
      case 'sprites':
        return <SpriteManager />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'general':
        return <GeneralSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="h-full w-full bg-background">
      <DragAbleTitle title={<span>⚙️ 设置</span>} />
      <SidebarProvider>
        <Sidebar className="top-9 h-[calc(100vh-36px)]">
          <SidebarContent>
            <SidebarGroup className="box-border">
              <SidebarGroupContent>
                <SidebarMenu className="pl-0">
                  {settingsCategories.map((category) => {
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
              const currentCategory = settingsCategories.find((cat) => cat.id === activeCategory);
              const Icon = currentCategory?.icon;
              return Icon ? (
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
              ) : null;
            })()}
            <div>
              <div className="text-xl font-bold text-foreground">{settingsCategories.find((cat) => cat.id === activeCategory)?.label}</div>
              <div className="text-muted-foreground text-sm">{settingsCategories.find((cat) => cat.id === activeCategory)?.description}</div>
            </div>
          </div>

          <div className="w-full overflow-y-auto overflow-x-hidden h-[calc(100%-72px)]">{renderCurrentCategoryContent()}</div>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default SettingsPage;
