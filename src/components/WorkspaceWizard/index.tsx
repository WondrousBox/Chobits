import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { TbArrowRight, TbFolder, TbX } from 'react-icons/tb'
import { Input } from '../ui/input'

const WorkspaceWizard: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const defaultWorkspace = useMemo(() => workspaces.find(w => w.isDefault === 1 && !w.deletedAt), [workspaces])
  const [pickedPath, setPickedPath] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>('')
  const [suggested, setSuggested] = useState<string>('')

  useEffect(() => {
    let mounted = true
    window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 } as any, limit: 100, offset: 0 }).then(list => { if (mounted) setWorkspaces(list) })
      ; (async () => {
        const res = await window.YUA.window.suggestWorkspacePath().catch(() => null)
        if (mounted && res?.ok && res.path) setSuggested(res.path)
      })()
    return () => { mounted = false }
  }, [])

  const onPickDir = async () => {
    setHint('')
    const pick = await window.YUA.workspace['workspace:pickDir']()
    if (pick.canceled || !pick.path) return
    setPickedPath(pick.path)
    if (!name) setName(pick.path.split('/').pop() || 'Workspace')
  }

  const createWith = async (rootPath: string, wsName?: string) => {
    if (!rootPath) { setHint('请选择或输入一个有效的路径'); return }
    setBusy(true)
    setHint('')
    try {
      const id = (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const wsName2 = (wsName || name || (rootPath.split('/').pop() || 'Workspace')).trim()
      if (!wsName2) { setHint('名称不能为空'); return }
      await window.YUA.workspace['workspace:add']({ workspace: { id, name: wsName2, rootPath, isDefault: workspaces.length ? 0 : 1, status: 'active' } })
      if (workspaces.length === 0) await window.YUA.workspace['workspace:setDefault']({ id })
      await window.YUA.workspace['workspace:ensureDir']({ id })
      window.ipcRenderer?.send('menu-command', 'close-workspace-wizard')
    } catch (e) {
      setHint('创建失败，请更换路径或稍后再试')
    } finally { setBusy(false) }
  }

  const onCreate = async () => createWith(pickedPath)

  const onQuickCreate = async () => {
    if (!suggested) return onPickDir()
    const quickName = suggested.split('/').pop() || 'Chobits'
    await createWith(suggested, quickName)
  }

  const onUseDefault = async () => {
    if (!defaultWorkspace) return
    setBusy(true)
    try {
      await window.YUA.workspace['workspace:ensureDir']({ id: defaultWorkspace.id })
      window.ipcRenderer?.send('menu-command', 'close-workspace-wizard')
    } finally { setBusy(false) }
  }

  return (
    <div className='w-full h-full flex items-center justify-center'>
      <div className='fade-in-scale w-[520px] rounded-2xl bg-background text-foreground'>
        <div className='drag-region flex items-center justify-between p-4'>
          <div className='text-base font-bold'>
            <div>🗂 工作空间</div>
            <div className='text-xs text-muted-foreground'>为你的数据选择一个本地文件夹，用于集中存放与索引。</div>
          </div>
          <Button className='no-drag' size={"icon"} variant={'outline'} onClick={() => window.ipcRenderer?.send('menu-command', 'close-workspace-wizard')}>
            <TbX />
          </Button>
        </div>
        <div className='flex flex-col gap-3 px-4'>
          {
            !!defaultWorkspace ? (
              <div className='p-2.5 rounded-[10px] border border-emerald-500/30 bg-emerald-500/15'>
                <div className='font-semibold'>检测到已有默认空间</div>
                <div className='text-[12px] opacity-85'>{defaultWorkspace.rootPath}</div>
                <div className='mt-2'>
                  <Button size="sm" disabled={busy} onClick={onUseDefault}>使用它</Button>
                </div>
              </div>
            ) : <div className='p-8 text-center'>
              <Button size="sm" onClick={onQuickCreate} disabled={busy}>快速开始 {suggested ? '' : '…'} <TbArrowRight /></Button>
            </div>
          }

          <div className='flex flex-col gap-2 bg-muted p-2'>
            <div className='flex gap-2 items-center'>
              <Input value={pickedPath} placeholder='请选择工作空间文件夹…' readOnly />
              <Button className='shrink-0' variant={"outline"} size={"icon"} disabled={busy} onClick={onPickDir}>
                <TbFolder />
              </Button>
            </div>
            <div className='flex gap-2 items-center'>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder='空间名称（可选）' />
            </div>
            <div className='flex gap-2'>
              <Button size="sm" onClick={onCreate} disabled={!pickedPath || busy}>创建工作空间</Button>
            </div>
          </div>
          <div className='pb-2'>
            {hint && <div className='text-red-500 text-xs'>{hint}</div>}
            <div className='text-xs text-muted-foreground'>提示：向导可在首次启动时自动弹出，也可在菜单中再次打开。</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorkspaceWizard
