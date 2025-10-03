import React, { useEffect, useMemo, useState } from 'react'
import EmbeddingJobsPanel from '../EmbeddingJobs'
import DragAbleTitle from '../common/DragAbleTitle';
import { Button } from '../ui/button';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel, 
  SidebarHeader, 
  SidebarInset, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider 
} from '../ui/sidebar';
import { TbDatabase, TbFolderOpen, TbSettings, TbBrain, TbCpu } from 'react-icons/tb';

// Include assistantPadding in type
type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }

// 设置分类类型
type SettingsCategory = 'movement' | 'database' | 'embedding'

// 设置分类配置
const settingsCategories = [
  {
    id: 'movement' as SettingsCategory,
    label: '移动参数',
    icon: TbSettings,
    description: '角色移动相关设置'
  },
  {
    id: 'database' as SettingsCategory,
    label: '数据库',
    icon: TbDatabase,
    description: '数据库相关设置'
  },
  {
    id: 'embedding' as SettingsCategory,
    label: '嵌入任务',
    icon: TbBrain,
    description: '向量嵌入任务管理'
  }
]

export const SettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<MovementConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('movement')
  useEffect(() => {
    let mounted = true
    window.YUA.window.getMovementConfig().then((c: MovementConfig) => { if (mounted) setConfig(c) })
    const listener = (_: any, c: MovementConfig) => setConfig(c)
    window.ipcRenderer?.on('movement-config-updated', listener)
    return () => { mounted = false; window.ipcRenderer?.off('movement-config-updated', listener as any) }
  }, [])

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
  const renderEmbeddingSettings = () => (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-lg p-6'>
        <div className='flex items-center gap-2 mb-4'>
          <TbBrain className='w-5 h-5 text-primary' />
          <h3 className='text-lg font-semibold text-foreground'>嵌入任务管理</h3>
        </div>
        <p className='text-sm text-muted-foreground mb-6'>
          管理向量嵌入任务，包括任务状态、进度监控和结果查看。
        </p>
        <EmbeddingJobsPanel />
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
      default:
        return renderMovementSettings()
    }
  }

  if (!config) return <div className='settings-wrapper'>加载中...</div>

  return (
    <SidebarProvider>
      <div className='h-full w-full bg-background fade-in-scale'>
        <DragAbleTitle title={
          <span>⚙️ 设置</span>
        } />
        
        <div className='flex h-[calc(100vh-36px)]'>
          {/* 左侧 Sidebar */}
          <Sidebar variant="inset" className='border-r bg-gradient-to-b from-sidebar to-sidebar/80'>
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

          {/* 右侧内容区域 */}
          <SidebarInset className='flex-1 bg-gradient-to-br from-background to-muted/20'>
            <div className='p-8 h-full overflow-auto'>
              <div className='mb-8'>
                <div className='flex items-center gap-4 mb-3'>
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
                    <div className='text-muted-foreground text-sm mt-1'>
                      {settingsCategories.find(cat => cat.id === activeCategory)?.description}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className='max-w-5xl'>
                {renderCurrentCategoryContent()}
              </div>
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default SettingsPanel
