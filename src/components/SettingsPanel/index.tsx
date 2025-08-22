import React, { useEffect, useState } from 'react'
import './settings.css'

type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number }

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

  if (!config) return <div className='settings-wrapper'>加载中...</div>

  return (
    <div className='settings-wrapper'>
      <div className='settings-card glassy'>
        <div className='settings-title'>⚙️ 移动参数设置</div>
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
        </div>
        <div className='settings-actions'>
          <button onClick={persist} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
