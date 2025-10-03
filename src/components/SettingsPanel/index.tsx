import React, { useEffect, useMemo, useState } from 'react'
import EmbeddingJobsPanel from '../EmbeddingJobs'
import DragAbleTitle from '../common/DragAbleTitle';
import { Button } from '../ui/button';
import { TbDatabase, TbFolderOpen } from 'react-icons/tb';

// Include assistantPadding in type
type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }

export const SettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<MovementConfig | null>(null)
  const [saving, setSaving] = useState(false)
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

  if (!config) return <div className='settings-wrapper'>加载中...</div>

  return (
    <div className='h-full w-full bg-background fade-in-scale'>
      <DragAbleTitle title={
        <span>⚙️ 设置</span>
      } />
      <div className='settings-card glassy'>
        <span className='settings-title'>⚙️ 移动参数设置</span>
        <div className='settings-scroll'>
          <div className='settings-group'>
            <label>行走速度(px/s)
              <input type='number' value={config.walkSpeed} onChange={e => update({ walkSpeed: +e.target.value })} />
            </label>
            <label>FPS 限制
              <input type='number' value={config.fpsLimit} onChange={e => update({ fpsLimit: +e.target.value })} />
            </label>
            <label>移动模式
              <select value={config.movementMode} onChange={e => update({ movementMode: e.target.value as any })}>
                <option value='stepped'>离散步进</option>
                <option value='smooth'>平滑</option>
              </select>
            </label>
            <label>步进网格(px)
              <input type='number' value={config.stepGrid} onChange={e => update({ stepGrid: +e.target.value })} />
            </label>
            <label>路径弯曲系数
              <input type='number' step='0.01' value={config.pathCurveFactor} onChange={e => update({ pathCurveFactor: +e.target.value })} />
            </label>
            <label>角色内边距(px)
              <input type='number' value={config.assistantPadding} onChange={e => update({ assistantPadding: +e.target.value })} />
            </label>
          </div>
        </div>
        <Button onClick={persist} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
        <div className='mt-4'>
          <EmbeddingJobsPanel />
        </div>
      </div>
      
      {/* 数据库设置 */}
      <div className='settings-card glassy mt-4'>
        <span className='settings-title'>
          <TbDatabase className='inline mr-2' />
          数据库设置
        </span>
        <div className='settings-scroll'>
          <div className='settings-group'>
            <div className='flex items-center justify-between'>
              <div>
                <label className='block text-sm font-medium mb-1'>数据库位置</label>
                <p className='text-xs text-muted-foreground'>打开数据库文件所在目录</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={openDatabaseLocation}
                className='flex items-center gap-2'
              >
                <TbFolderOpen className='w-4 h-4' />
                打开位置
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
