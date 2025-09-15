import React, { useEffect, useState } from 'react'
import './settings.css'
import EmbeddingJobsPanel from '../EmbeddingJobs'

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

  const close = () => window.ipcRenderer?.send('menu-command','close-settings')

  if (!config) return <div className='settings-wrapper'>加载中...</div>

  return (
    <div className='settings-wrapper fade-in-scale'>
      <div className='settings-card glassy'>
        <div className='settings-topbar' data-drag-region>
          <span className='settings-title'>⚙️ 移动参数设置</span>
          <button className='close-btn' onClick={close}>✕</button>
        </div>
        <div className='settings-scroll'>
          <div className='settings-group'>
            <label>行走速度(px/s)
              <input type='number' value={config.walkSpeed} onChange={e=>update({ walkSpeed: +e.target.value })} />
            </label>
            <label>FPS 限制
              <input type='number' value={config.fpsLimit} onChange={e=>update({ fpsLimit: +e.target.value })} />
            </label>
            <label>移动模式
              <select value={config.movementMode} onChange={e=>update({ movementMode: e.target.value as any })}>
                <option value='stepped'>离散步进</option>
                <option value='smooth'>平滑</option>
              </select>
            </label>
            <label>步进网格(px)
              <input type='number' value={config.stepGrid} onChange={e=>update({ stepGrid: +e.target.value })} />
            </label>
            <label>路径弯曲系数
              <input type='number' step='0.01' value={config.pathCurveFactor} onChange={e=>update({ pathCurveFactor: +e.target.value })} />
            </label>
            <label>角色内边距(px)
              <input type='number' value={config.assistantPadding} onChange={e=>update({ assistantPadding: +e.target.value })} />
            </label>
          </div>
        </div>
        <div className='settings-actions'>
          <button onClick={persist} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
        <div style={{ marginTop: 16 }}>
          <EmbeddingJobsPanel />
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
