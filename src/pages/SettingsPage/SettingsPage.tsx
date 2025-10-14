import React, { useEffect, useState } from 'react'
import { TbDatabase, TbFolderOpen, TbSettings, TbBrain, TbCpu, TbBox, TbFile3D, TbMoodKid } from 'react-icons/tb'
import EmbeddingJobsPanel from '../../components/EmbeddingJobs'
import DragAbleTitle from '../../components/common/DragAbleTitle'
import { Button } from '../../components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '../../components/ui/sidebar'
import Workspace from './components/Workspace'
import ModelPage from '../ModelPage/ModelPage'
import SpriteManager from './components/SpriteManager'

// Include assistantPadding in type
type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }

// 设置分类类型
type SettingsCategory = 'movement' | 'database' | 'embedding' | 'external-resource' | 'workspace' | 'model' | 'sprites'

// 设置分类配置
const settingsCategories: { id: SettingsCategory; label: string; icon: React.ElementType; description: string }[] = [
  {
    id: 'movement',
    label: '移动参数',
    icon: TbSettings,
    description: '角色移动相关设置'
  },
  {
    id: 'database',
    label: '数据库',
    icon: TbDatabase,
    description: '数据库相关设置'
  },
  {
    id: 'embedding',
    label: '嵌入任务',
    icon: TbBrain,
    description: '向量嵌入任务管理'
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
  },
  {
    id: 'external-resource',
    label: '外部资源',
    icon: TbFile3D,
    description: '视频下载和外部资源设置'
  }
]

// 外部资源设置类型
type ExternalResourceSettings = {
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
};

export const SettingsPage: React.FC = () => {
  const [config, setConfig] = useState<MovementConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('movement')
  const [externalSettings, setExternalSettings] = useState<ExternalResourceSettings>({
    externalResourceMode: "1",
    externalResourceCookies: false,
    preferredBrowser: "chrome"
  })
  useEffect(() => {
    let mounted = true
    window.YUA.window.getMovementConfig().then((c: MovementConfig) => { if (mounted) setConfig(c) })
    const listener = (_: any, c: MovementConfig) => setConfig(c)
    window.ipcRenderer?.on('movement-config-updated', listener)

    // 加载外部资源设置
    loadExternalSettings()

    return () => { mounted = false; window.ipcRenderer?.off('movement-config-updated', listener as any) }
  }, [])

  const loadExternalSettings = async () => {
    try {
      const settings = await (window.YUA as any).videoDownloader['getExternalResourceSettings']();
      if (settings) {
        setExternalSettings(settings);
      }
    } catch (error) {
      console.warn('加载外部资源设置失败:', error);
    }
  }

  const saveExternalSettings = async () => {
    try {
      await (window.YUA as any).videoDownloader['setExternalResourceSettings'](externalSettings);
    } catch (error) {
      console.error('保存外部资源设置失败:', error);
    }
  }

  const update = (partial: Partial<MovementConfig>) => {
    if (!config) return
    const next = { ...config, ...partial }
    setConfig(next)
  }

  const persist = async () => {
    if (!config) return
    setSaving(true)
    await window.YUA.window.updateMovementConfig(config)
    setSaving(false)
  }

  const close = () => window.YUA.window.closeWindow('settings')

  const openDatabaseLocation = async () => {
    try {
      const result = await (window.YUA as any).database['database:openLocation']();
      if (!result.ok) {
        console.error('打开数据库位置失败:', result.error);
      }
    } catch (error) {
      console.error('打开数据库位置失败:', error);
    }
  }

  // 渲染移动参数设置
  const renderMovementSettings = () => (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>行走速度 (px/s)</label>
            <input
              type='number'
              value={config?.walkSpeed || 0}
              onChange={e => update({ walkSpeed: +e.target.value })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>FPS 限制</label>
            <input
              type='number'
              value={config?.fpsLimit || 0}
              onChange={e => update({ fpsLimit: +e.target.value })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>移动模式</label>
            <select
              value={config?.movementMode || 'stepped'}
              onChange={e => update({ movementMode: e.target.value as any })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            >
              <option value='stepped'>离散步进</option>
              <option value='smooth'>平滑</option>
            </select>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>步进网格 (px)</label>
            <input
              type='number'
              value={config?.stepGrid || 0}
              onChange={e => update({ stepGrid: +e.target.value })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>路径弯曲系数</label>
            <input
              type='number'
              step='0.01'
              value={config?.pathCurveFactor || 0}
              onChange={e => update({ pathCurveFactor: +e.target.value })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>角色内边距 (px)</label>
            <input
              type='number'
              value={config?.assistantPadding || 0}
              onChange={e => update({ assistantPadding: +e.target.value })}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
            />
          </div>
        </div>
      </div>

      <div className='flex justify-end pt-4 border-t border-border'>
        <Button
          onClick={persist}
          disabled={saving}
          className='px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
        >
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </div>
    </div>
  )

  // 渲染数据库设置
  const renderDatabaseSettings = () => (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-lg p-6'>
        <div className='flex items-start justify-between'>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <TbDatabase className='w-5 h-5 text-primary' />
              <h3 className='text-lg font-semibold text-foreground'>数据库位置</h3>
            </div>
            <p className='text-sm text-muted-foreground max-w-md'>
              数据库文件存储在应用的用户数据目录中。点击下方按钮可以在文件管理器中打开数据库所在目录。
            </p>
          </div>
          <Button
            variant="outline"
            onClick={openDatabaseLocation}
            className='flex items-center gap-2 px-4 py-2 border-border hover:bg-accent hover:text-accent-foreground transition-colors'
          >
            <TbFolderOpen className='w-4 h-4' />
            打开位置
          </Button>
        </div>
      </div>

      <div className='bg-card border border-border rounded-lg p-6'>
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <TbCpu className='w-5 h-5 text-primary' />
            <h3 className='text-lg font-semibold text-foreground'>数据库信息</h3>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>数据库类型</label>
              <div className='px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground'>
                SQLite
              </div>
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>存储位置</label>
              <div className='px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground'>
                用户数据目录/data/app.db
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // 渲染嵌入任务设置
  const renderEmbeddingSettings = () => <EmbeddingJobsPanel />

  // 渲染外部资源设置
  const renderExternalResourceSettings = () => (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-lg p-6'>
        <div className='space-y-6'>
          {/* Cookie 设置 */}
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-foreground'>使用浏览器 Cookie</h4>
                <p className='text-xs text-muted-foreground mt-1'>
                  启用后将从浏览器获取 Cookie 以访问需要登录的内容
                </p>
              </div>
              <label className='relative inline-flex items-center cursor-pointer'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={externalSettings.externalResourceCookies}
                  onChange={(e) => setExternalSettings(prev => ({ ...prev, externalResourceCookies: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* 浏览器选择 */}
          {externalSettings.externalResourceCookies && (
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>首选浏览器</label>
              <select
                className='w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
                value={externalSettings.preferredBrowser}
                onChange={(e) => setExternalSettings(prev => ({ ...prev, preferredBrowser: e.target.value }))}
              >
                <option value='chrome'>Chrome</option>
                <option value='firefox'>Firefox</option>
                <option value='edge'>Edge</option>
                <option value='safari'>Safari</option>
              </select>
              <p className='text-xs text-muted-foreground'>
                如果首选浏览器不可用，将自动尝试其他浏览器
              </p>
            </div>
          )}

          {/* 下载模式 */}
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>下载模式</label>
            <select
              className='w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
              value={externalSettings.externalResourceMode}
              onChange={(e) => setExternalSettings(prev => ({ ...prev, externalResourceMode: e.target.value }))}
            >
              <option value='1'>高质量（默认）</option>
              <option value='2'>限制质量（480p 以下）</option>
            </select>
            <p className='text-xs text-muted-foreground'>
              选择下载视频的质量限制
            </p>
          </div>

          {/* 保存按钮 */}
          <div className='flex justify-end pt-4'>
            <Button onClick={saveExternalSettings} size='sm'>
              保存设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // 渲染工作空间（内嵌）
  const renderWorkspaceSettings = () => (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-lg overflow-hidden'>
        <div className='h-[70vh]'>
          <Workspace />
        </div>
      </div>
    </div>
  )

  // 渲染模型管理（内嵌）
  const renderModelSettings = () => (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-lg overflow-hidden'>
        <div className='h-[70vh]'>
          <ModelPage />
        </div>
      </div>
    </div>
  )

  // 根据当前分类渲染对应内容
  const renderCurrentCategoryContent = () => {
    switch (activeCategory) {
      case 'movement':
        return renderMovementSettings()
      case 'database':
        return renderDatabaseSettings()
      case 'embedding':
        return renderEmbeddingSettings()
      case 'workspace':
        return renderWorkspaceSettings()
      case 'model':
        return renderModelSettings()
      case 'sprites':
        return <SpriteManager />
      case 'external-resource':
        return renderExternalResourceSettings()
      default:
        return renderMovementSettings()
    }
  }

  if (!config) return <div className='settings-wrapper'>加载中...</div>

  return (
    <div className='h-full w-full bg-background'>
      <DragAbleTitle title={<span>⚙️ 设置</span>} />
      <SidebarProvider>
        <Sidebar className='top-9 h-[calc(100vh-36px)]'>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className='pl-0'>
                  {settingsCategories.map((category) => {
                    const Icon = category.icon
                    return (
                      <SidebarMenuItem className='pl-0 list-none' key={category.id}>
                        <SidebarMenuButton
                          isActive={activeCategory === category.id}
                          onClick={() => setActiveCategory(category.id)}
                        >
                          <Icon />
                          {category.label}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <div className='flex-1 h-[calc(100vh-36px)]'>
          {/* 右侧内容区域 */}
          <div className='flex items-center gap-4 p-2'>
            {(() => {
              const currentCategory = settingsCategories.find(cat => cat.id === activeCategory)
              const Icon = currentCategory?.icon
              return Icon ? (
                <div className='p-3 bg-primary/10 rounded-xl'>
                  <Icon className='w-7 h-7 text-primary' />
                </div>
              ) : null
            })()}
            <div>
              <div className='text-xl font-bold text-foreground'>
                {settingsCategories.find(cat => cat.id === activeCategory)?.label}
              </div>
              <div className='text-muted-foreground text-sm'>
                {settingsCategories.find(cat => cat.id === activeCategory)?.description}
              </div>
            </div>
          </div>

          <div className='w-full overflow-y-auto overflow-x-hidden h-[calc(100%-72px)]'>
            {renderCurrentCategoryContent()}
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default SettingsPage
