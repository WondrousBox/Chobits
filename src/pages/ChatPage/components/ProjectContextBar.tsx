import type { ProjectSnapshot, TrackedProject } from '@packages/ai/services/project-tracking-types';
import { useCallback, useEffect, useState } from 'react';
import { TbBriefcase, TbLoader2 } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';

interface ProjectContextBarProps {
  conversationId?: string;
  refreshKey?: number;
}

interface LinkedProjectState {
  project: TrackedProject;
  snapshot: ProjectSnapshot | null;
}

export function ProjectContextBar({ conversationId, refreshKey = 0 }: ProjectContextBarProps): JSX.Element | null {
  const [linked, setLinked] = useState<LinkedProjectState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProject = useCallback(async () => {
    if (!conversationId) {
      setLinked(null);
      return;
    }
    setLoading(true);
    try {
      const links = await window.YUA.projectTracking.listLinksByTarget({
        limit: 1,
        targetId: conversationId,
        targetType: 'conversation'
      });
      const projectId = (links[0] as any)?.projectId;
      if (!projectId) {
        setLinked(null);
        return;
      }
      const detail = await window.YUA.projectTracking.getProject(projectId);
      setLinked(detail ? { project: detail.project, snapshot: detail.snapshot } : null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadProject().catch(() => undefined);
  }, [loadProject, refreshKey]);

  if (!linked && !loading) return null;

  return (
    <div className="mx-auto mt-2 flex w-[min(760px,calc(100%-32px))] items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-sm shadow-sm">
      {loading ? <TbLoader2 className="animate-spin text-muted-foreground" /> : <TbBriefcase className="text-muted-foreground" />}
      {linked ? (
        <>
          <span className="min-w-0 flex-1 truncate">正在跟进：{linked.project.name}</span>
          <Badge variant="outline">{linked.snapshot?.status || linked.project.status}</Badge>
          {linked.snapshot?.openTasks?.length ? <Badge variant="secondary">{linked.snapshot.openTasks.length} 个开放事项</Badge> : null}
        </>
      ) : (
        <span className="text-muted-foreground">加载项目状态...</span>
      )}
    </div>
  );
}
