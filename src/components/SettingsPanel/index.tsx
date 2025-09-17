import React, { useEffect, useMemo, useState } from 'react'
import './settings.css'
import EmbeddingJobsPanel from '../EmbeddingJobs'

// Include assistantPadding in type
type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }

export const SettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<MovementConfig | null>(null)
  const [saving, setSaving] = useState(false)
  // Workspaces state
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const defaultWorkspace = useMemo(()=> workspaces.find(w=>w.isDefault===1 && !w.deletedAt), [workspaces])

  useEffect(() => {
    let mounted = true
    window.YUA.window.getMovementConfig().then((c: MovementConfig) => { if (mounted) setConfig(c) })
    const listener = (_: any, c: MovementConfig) => setConfig(c)
    window.ipcRenderer?.on('movement-config-updated', listener)
    // load workspaces
    window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 }).then(list => { if (mounted) setWorkspaces(list) })
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
        <div className='settings-topbar drag-region' data-drag-region>
          <span className='settings-title'>⚙️ 移动参数设置</span>
          <button className='close-btn' data-no-drag onClick={close}>✕</button>
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
        {/* Workspace Management */}
        <div className='settings-group mt-4'>
          <div className='settings-title'>🗂 工作空间</div>
          <div className='flex gap-2'>
            <button onClick={async()=>{
              const pick = await window.YUA.workspace['workspace:pickDir']()
              if (pick.canceled || !pick.path) return
              const id = (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
              const name = pick.path.split('/').pop() || 'Workspace'
              await window.YUA.workspace['workspace:add']({ workspace: { id, name, rootPath: pick.path, isDefault: workspaces.length?0:1, status: 'active' }})
              if (workspaces.length===0) await window.YUA.workspace['workspace:setDefault']({ id })
              const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 })
              setWorkspaces(list)
            }}>选择文件夹并创建</button>
            <button disabled={!defaultWorkspace} onClick={async()=>{
              if (!defaultWorkspace) return
              await window.YUA.workspace['workspace:open']({ id: defaultWorkspace.id })
            }}>打开默认空间</button>
            <button disabled={!defaultWorkspace} onClick={async()=>{
              if (!defaultWorkspace) return
              await window.YUA.workspace['workspace:reveal']({ id: defaultWorkspace.id })
            }}>在访达中显示</button>
          </div>
          <div className='mt-2 flex flex-col gap-2'>
            {workspaces.map(w=> (
              <div key={w.id} className='flex items-center justify-between bg-white/10 px-2.5 py-2 rounded-[10px]'>
                <div className='flex flex-col'>
                  <div className='font-semibold'>
                    {w.name} {w.isDefault===1 && <span className='font-normal text-xs opacity-80'>(默认)</span>}
                  </div>
                  <div className='text-xs opacity-80'>{w.rootPath}</div>
                  {(w.sizeBytes || w.fileCount || w.lastScanAt) && (
                    <div className='text-xs opacity-80 mt-1'>
                      {typeof w.fileCount==='number' ? `文件数: ${w.fileCount} ` : ''}
                      {typeof w.sizeBytes==='number' ? `大小: ${(w.sizeBytes/1024/1024).toFixed(2)} MB ` : ''}
                      {typeof w.lastScanAt==='number' ? `（${new Date(w.lastScanAt).toLocaleString()}）` : ''}
                    </div>
                  )}
                </div>
                <div className='flex gap-2'>
                  {w.isDefault===1 ? (
                    <button disabled>已设为默认</button>
                  ) : (
                    <button onClick={async()=>{ await window.YUA.workspace['workspace:setDefault']({ id: w.id }); const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 }); setWorkspaces(list) }}>设为默认</button>
                  )}
                  <button onClick={async()=>{ await window.YUA.workspace['workspace:open']({ id: w.id }) }}>打开</button>
                  <button onClick={async()=>{ await window.YUA.workspace['workspace:reveal']({ id: w.id }) }}>显示</button>
                  <button onClick={async()=>{ await window.YUA.workspace['workspace:scanStats']({ id: w.id }); const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 }); setWorkspaces(list) }}>刷新统计</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className='mt-4'>
          <EmbeddingJobsPanel />
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
