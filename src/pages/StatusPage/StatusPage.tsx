import React, { useEffect, useMemo, useState } from 'react'
import EmbeddingJobsPanel from '@/components/EmbeddingJobs'

type RoleProfile = {
  name: string
  mood?: string
  level?: number
  favor?: number
  description?: string
}

type Overview = {
  ok: boolean
  database: { path: string; dir: string }
  workspace: { id: string; name: string; rootPath: string; sizeBytes?: number; fileCount?: number; lastScanAt?: number } | null
  resources: { total: number; totalSizeBytes: number; byType: Array<{ type: string; count: number; size: number }>; thumbnails: { withThumb: number; withoutThumb: number } }
  documents: { total: number; withEmbedding: number; byDocType: Array<{ docType: string | null; count: number }> }
  vectors: { enabled: boolean; total: number }
  recycleBin: { total: number }
  system: { userDataDir: string }
}

const fmtBytes = (n?: number) => {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(2)} ${units[i]}`
}

export const StatusPage: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [role, setRole] = useState<RoleProfile | null>(null)
  const [sprites, setSprites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const [ov, roleRes, spr] = await Promise.all([
          (window as any).YUA.status['status:getOverview'](),
          (window as any).YUA.status['status:getRole'](),
          (window as any).YUA.sprite['sprite:list'](),
        ])
        if (!mounted) return
        setOverview(ov)
        setRole(roleRes?.role)
        setSprites(Array.isArray(spr) ? spr : [])
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const spriteGroups = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const s of sprites) {
      const key = s?.meta?.eventType || 'unknown'
      groups[key] = (groups[key] || 0) + 1
    }
    return groups
  }, [sprites])

  if (loading) return <div className='p-6 text-muted-foreground'>加载中...</div>

  return (
    <div className="w-full h-full p-6 overflow-auto">
      <div className='text-xl font-semibold mb-4'>状态总览</div>

      {/* Workspace & system */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-6'>
        <div className='border rounded-lg p-4'>
          <div className='font-medium mb-2'>工作空间</div>
          {overview?.workspace ? (
            <div className='text-sm'>
              <div>名称：<span className='font-mono'>{overview.workspace.name}</span></div>
              <div>路径：<span className='font-mono break-all'>{overview.workspace.rootPath}</span></div>
              <div>文件数：{overview.workspace.fileCount ?? '-'}</div>
              <div>占用：{fmtBytes(overview.workspace.sizeBytes)}</div>
              <div className='mt-2'>数据库：<span className='font-mono break-all'>{overview.database.path}</span></div>
              <div className='mt-3 flex gap-2'>
                <button
                  className='px-3 py-1.5 text-xs rounded bg-primary text-white hover:opacity-90'
                  onClick={async () => {
                    if (!overview?.workspace?.id) return
                    try {
                      await (window as any).YUA.workspace['workspace:scanStats']({ id: overview.workspace.id })
                      const ov = await (window as any).YUA.status['status:getOverview']()
                      setOverview(ov)
                    } catch {}
                  }}
                >重新扫描</button>
                <button
                  className='px-3 py-1.5 text-xs rounded border hover:bg-accent'
                  onClick={async () => { try { await (window as any).YUA.workspace['workspace:open']({ id: overview!.workspace!.id }) } catch {} }}
                >打开空间</button>
                <button
                  className='px-3 py-1.5 text-xs rounded border hover:bg-accent'
                  onClick={async () => { try { await (window as any).YUA.database['database:openLocation']() } catch {} }}
                >打开数据库目录</button>
              </div>
            </div>
          ) : <div className='text-sm text-muted-foreground'>未配置工作空间</div>}
        </div>

        <div className='border rounded-lg p-4'>
          <div className='font-medium mb-2'>角色档案</div>
          {role ? (
            <div className='text-sm'>
              <div>名字：{role.name}</div>
              <div>心情：{role.mood || '—'}</div>
              <div>等级：{role.level ?? '—'}</div>
              <div className='flex items-center gap-2'>
                <span>好感：{role.favor ?? 0}</span>
                <button
                  className='px-2 py-0.5 text-xs rounded border hover:bg-accent'
                  onClick={async () => { const next = Math.min(100, (role.favor ?? 0) + 1); const r = await (window as any).YUA.status['status:updateRole']({ patch: { favor: next } }); setRole(r.role) }}
                >+1</button>
                <button
                  className='px-2 py-0.5 text-xs rounded border hover:bg-accent'
                  onClick={async () => { const next = Math.max(0, (role.favor ?? 0) - 1); const r = await (window as any).YUA.status['status:updateRole']({ patch: { favor: next } }); setRole(r.role) }}
                >-1</button>
              </div>
              {role.description && <div className='mt-1 text-muted-foreground break-all'>{role.description}</div>}
            </div>
          ) : <div className='text-sm text-muted-foreground'>暂无角色信息</div>}
        </div>
      </div>

      {/* Resources & documents */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-6'>
        <div className='border rounded-lg p-4'>
          <div className='font-medium mb-2'>资源统计</div>
          <div className='text-sm grid grid-cols-2 gap-2'>
            <div>总数：{overview?.resources.total ?? 0}</div>
            <div>总大小：{fmtBytes(overview?.resources.totalSizeBytes)}</div>
            <div>缩略图：有 {overview?.resources.thumbnails.withThumb ?? 0} / 无 {overview?.resources.thumbnails.withoutThumb ?? 0}</div>
          </div>
          {overview?.resources.byType?.length ? (
            <div className='mt-2'>
              <div className='text-xs text-muted-foreground mb-1'>按类型</div>
              <div className='text-sm grid grid-cols-2 gap-1'>
                {overview.resources.byType.map((t) => (
                  <div key={t.type} className='flex items-center justify-between'>
                    <span>{t.type || 'other'}</span>
                    <span className='text-muted-foreground'>{t.count} • {fmtBytes(t.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className='border rounded-lg p-4'>
          <div className='font-medium mb-2'>文档/向量</div>
          <div className='text-sm grid grid-cols-2 gap-2'>
            <div>文档总数：{overview?.documents.total ?? 0}</div>
            <div>已嵌入：{overview?.documents.withEmbedding ?? 0}</div>
            <div>向量启用：{overview?.vectors.enabled ? '是' : '否'}</div>
            <div>向量条目：{overview?.vectors.total ?? 0}</div>
            <div>回收站：{overview?.recycleBin.total ?? 0}</div>
          </div>
          {overview?.documents.byDocType?.length ? (
            <div className='mt-2'>
              <div className='text-xs text-muted-foreground mb-1'>按 docType</div>
              <div className='text-sm grid grid-cols-2 gap-1'>
                {overview.documents.byDocType.map((t, i) => (
                  <div key={`${t.docType}-${i}`} className='flex items-center justify-between'>
                    <span>{t.docType || 'default'}</span>
                    <span className='text-muted-foreground'>{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sprites */}
      <div className='border rounded-lg p-4 mb-6'>
        <div className='font-medium mb-2'>精灵动画</div>
        <div className='text-sm mb-2'>总数：{sprites.length}</div>
        {Object.keys(spriteGroups).length ? (
          <div className='text-sm grid grid-cols-2 md:grid-cols-4 gap-1'>
            {Object.entries(spriteGroups).map(([k, v]) => (
              <div key={k} className='flex items-center justify-between'>
                <span className='truncate'>{k}</span>
                <span className='text-muted-foreground'>{v}</span>
              </div>
            ))}
          </div>
        ) : <div className='text-sm text-muted-foreground'>暂无分类</div>}
      </div>

      {/* Usage panel: show embedding jobs for now */}
      <div className='border rounded-lg p-4'>
        <div className='font-medium mb-2'>使用与处理面板</div>
        <div className='text-sm text-muted-foreground mb-2'>展示最近的嵌入任务进度，后续可扩展为问题处理统计、调用用量等。</div>
        <EmbeddingJobsPanel />
      </div>
    </div>
  )
}

export default StatusPage
