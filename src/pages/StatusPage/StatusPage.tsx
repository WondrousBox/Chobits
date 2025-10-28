import React, { useEffect, useState } from 'react';
import EmbeddingJobsPanel from '@/components/EmbeddingJobs';
import { Button } from '@/components/ui/button';
import { TbFolderOpen, TbHeartFilled, TbRefresh, TbX } from 'react-icons/tb';
import prettyBytes from 'pretty-bytes';

type RoleProfile = {
  name: string;
  mood?: string;
  level?: number;
  favor?: number;
  description?: string;
};

type Overview = {
  ok: boolean;
  workspace: { id: string; name: string; rootPath: string; sizeBytes?: number; fileCount?: number; lastScanAt?: number } | null;
  resources: { total: number; totalSizeBytes: number; byType: Array<{ type: string; count: number; size: number }>; thumbnails: { withThumb: number; withoutThumb: number } };
  documents: { total: number; withEmbedding: number; byDocType: Array<{ docType: string | null; count: number }> };
  vectors: { enabled: boolean; total: number };
  recycleBin: { total: number };
  system: { userDataDir: string };
};

export const StatusPage: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [role, setRole] = useState<RoleProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      try {
        const [ov, roleRes] = await Promise.all([(window as any).YUA.status['status:getOverview'](), (window as any).YUA.status['status:getRole']()]);
        console.log(ov);

        if (!mounted) return;
        setOverview(ov);
        setRole(roleRes?.role);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <div className="w-full h-full">
      <div className="flex p-1 items-center bg-background">
        <div className="flex-1 pl-1">
          {role && (
            <div className="text-sm flex items-center gap-4">
              <span>
                {role.name} <span className="text-muted-foreground text-xs ml-1">Lv.{role.level ?? '—'}</span>
              </span>
              <div className="flex items-center gap-1">
                <TbHeartFilled color="red" size={16} />
                <span className="font-mono text-xs text-muted-foreground">{role.favor ?? 0}</span>
              </div>
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant={'outline'}
          className="w-8 h-8"
          onClick={() => {
            window.YUA.window['window:close']('status');
          }}
        >
          <TbX />
        </Button>
      </div>
      <div className="w-full h-full p-2 overflow-auto border border-ring box-border bg-background" style={{ height: 'calc(100% - 40px)' }}>
        {/* Workspace & system */}
        {overview?.workspace && (
          <div className="text-sm">
            <div>
              当前空间: <span className="font-mono">{overview.workspace.name}</span>
            </div>
            <div>文件数：{overview.workspace.fileCount ?? '-'}</div>
            <div>占用：{prettyBytes(overview.workspace.sizeBytes || 0)}</div>
            <div className="mt-3 flex gap-2">
              <Button
                className="h-8"
                variant={'outline'}
                onClick={async () => {
                  if (!overview?.workspace?.id) return;
                  await (window as any).YUA.workspace['workspace:scanStats']({ id: overview.workspace.id });
                  const ov = await (window as any).YUA.status['status:getOverview']();
                  setOverview(ov);
                }}
              >
                <TbRefresh />
                重新扫描
              </Button>
              <Button
                size={'icon'}
                variant={'outline'}
                className="w-8 h-8"
                onClick={async () => {
                  window.YUA.workspace['workspace:open']({ id: overview!.workspace!.id });
                }}
              >
                <TbFolderOpen />
              </Button>
            </div>
          </div>
        )}

        {/* Resources & documents */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="border rounded-lg p-4">
            <div className="font-medium mb-2">资源统计</div>
            <div className="text-sm grid grid-cols-2 gap-2">
              <div>总数：{overview?.resources.total ?? 0}</div>
              <div>总大小：{prettyBytes(overview?.resources.totalSizeBytes || 0)}</div>
              <div>
                缩略图：有 {overview?.resources.thumbnails.withThumb ?? 0} / 无 {overview?.resources.thumbnails.withoutThumb ?? 0}
              </div>
            </div>
            {overview?.resources.byType?.length ? (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground mb-1">按类型</div>
                <div className="text-sm grid grid-cols-2 gap-1">
                  {overview.resources.byType.map((t) => (
                    <div key={t.type} className="flex items-center justify-between">
                      <span>{t.type || 'other'}</span>
                      <span className="text-muted-foreground">
                        {t.count} • {prettyBytes(t.size || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="border rounded-lg p-4">
            <div className="font-medium mb-2">文档/向量</div>
            <div className="text-sm grid grid-cols-2 gap-2">
              <div>文档总数：{overview?.documents.total ?? 0}</div>
              <div>已嵌入：{overview?.documents.withEmbedding ?? 0}</div>
              <div>向量启用：{overview?.vectors.enabled ? '是' : '否'}</div>
              <div>向量条目：{overview?.vectors.total ?? 0}</div>
              <div>回收站：{overview?.recycleBin.total ?? 0}</div>
            </div>
            {overview?.documents.byDocType?.length ? (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground mb-1">按 docType</div>
                <div className="text-sm grid grid-cols-2 gap-1">
                  {overview.documents.byDocType.map((t, i) => (
                    <div key={`${t.docType}-${i}`} className="flex items-center justify-between">
                      <span>{t.docType || 'default'}</span>
                      <span className="text-muted-foreground">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <EmbeddingJobsPanel />
      </div>
    </div>
  );
};

export default StatusPage;
