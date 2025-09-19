import React, { useEffect, useMemo, useState } from 'react'
import { TbArrowLeft, TbArrowRight, TbFolderOpen } from 'react-icons/tb'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

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
      const wsName2 = (wsName || name || (rootPath.split('/').pop() || 'Workspace')).trim()
      if (!wsName2) { setHint('名称不能为空'); return }
      const res = await window.YUA.workspace['workspace:add']({
        workspace: {
          name: wsName2,
          rootPath,
          isDefault: workspaces.length ? 0 : 1,
          status: 'active'
        }
      })
      console.log(res);
      if (res.success && res.data) {
        if (workspaces.length === 0) await window.YUA.workspace['workspace:setDefault']({ id: res.data.id })
        window.YUA.window.closeWindow("workspaceWizard")
      }

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
    const quickName = suggested.split('/').pop() || 'Chobits Workspace'
    await createWith(suggested, quickName)
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
      <div className='drag-region h-32'></div>
      <div className='drag-region text-center'>
        <div className='text-xl mb-2'>🗂 创建工作空间</div>
        <div className='text-xs text-muted-foreground'>选择一个本地文件夹用于集中存放数据</div>
        {
          !!defaultWorkspace ? null : (
            !showCreateForm && (
              <div className='mt-6 w-80 no-drag flex flex-col gap-2 mx-auto'>
                <Button onClick={onQuickCreate} disabled={busy}>快速开始 {suggested ? '' : '…'} <TbArrowRight /></Button>
                <Button variant="outline" disabled={busy} onClick={onCreateNew}>创建新空间</Button>
              </div>
            )
          )
        }
        {
          showCreateForm && (
            <div className='mt-6 w-80 no-drag flex flex-col gap-2 mx-auto'>
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder='空间名称' />
              <div className='flex items-center gap-2'>
                <Button size="icon" variant={'outline'} disabled={busy} onClick={onBack}><TbArrowLeft /></Button>
                <Button className='flex-1' onClick={onCreate} disabled={busy || !name.trim()}><TbFolderOpen /> 创建空间</Button>
              </div>
              <div className='pb-2'>
                {hint && <div className='text-red-500 text-xs'>{hint}</div>}
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}

export default WorkspaceWizard
