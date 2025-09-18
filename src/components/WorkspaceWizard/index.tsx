import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { TbArrowLeft, TbArrowRight, TbFolder, TbX } from 'react-icons/tb'
import { Input } from '../ui/input'

const WorkspaceWizard: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const defaultWorkspace = useMemo(() => workspaces.find(w => w.isDefault === 1 && !w.deletedAt), [workspaces])
  const [pickedPath, setPickedPath] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>('')
  const [suggested, setSuggested] = useState<string>('')
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false)

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
      window.YUA.window.closeWindow("workspaceWizard")
    } catch (e) {
      setHint('创建失败，请更换路径或稍后再试')
    } finally { setBusy(false) }
  }

  const onCreate = async () => {
    setHint('')
    const pick = await window.YUA.workspace['workspace:pickDir']()
    if (pick.canceled || !pick.path) return
    await createWith(pick.path, name || undefined)
  }

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
      window.YUA.window.closeWindow("workspaceWizard")
    } finally { setBusy(false) }
  }

  const onCreateNew = () => {
    setPickedPath('')
    setName('')
    setHint('')
    setShowCreateForm(true)
  }

  const onBack = () => {
    setHint('')
    setShowCreateForm(false)
  }

  return (
    <div className='w-full h-full bg-background text-foreground'>
      <div className='drag-region h-24'></div>
      <div className='drag-region p-4 text-center w-96'>
        <div className='text-xl mb-2'>🗂 工作仓库</div>
        <div className='text-xs text-muted-foreground'>为你的数据选择一个本地文件夹，用于集中存放。</div>
        {
          !!defaultWorkspace ? (
            <div className='p-2.5 rounded-[10px] border border-emerald-500/30 bg-emerald-500/15'>
              <div className='font-semibold'>检测到已有默认仓库</div>
              <div className='text-[12px] opacity-85'>{defaultWorkspace.rootPath}</div>
              <div className='mt-2 no-drag'>
                <Button disabled={busy} onClick={onUseDefault}>使用它</Button>
              </div>
            </div>
          ) : (
            !showCreateForm && (
              <div className='mt-6 mb-10 text-center no-drag space-x-4'>
                <Button variant="outline" disabled={busy} onClick={onCreateNew}>创建新仓库</Button>
                <Button onClick={onQuickCreate} disabled={busy}>快速开始 {suggested ? '' : '…'} <TbArrowRight /></Button>
              </div>
            )
          )
        }
      </div>
      {showCreateForm && (
        <div className='flex flex-col gap-4 px-8 w-96 mx-auto'>
          <div className='flex gap-2 items-center'>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder='仓库名称' />
          </div>
          <div className='flex justify-between items-center gap-2'>
            <Button size="icon" variant={'outline'} disabled={busy} onClick={onBack}><TbArrowLeft /></Button>
            <Button className='flex-1' onClick={onCreate} disabled={busy || !name.trim()}>创建仓库</Button>
          </div>
          <div className='pb-2'>
            {hint && <div className='text-red-500 text-xs'>{hint}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkspaceWizard
