import type { CreateProjectInput, ProjectCandidate } from '@packages/ai/services/project-tracking-types';
import { useCallback, useEffect, useState } from 'react';
import { TbFolderPlus, TbLoader2, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ProjectCandidatePromptProps {
  conversationId?: string;
  onProjectCreated?: () => void;
  refreshKey?: number;
}

export function ProjectCandidatePrompt({ conversationId, onProjectCreated, refreshKey = 0 }: ProjectCandidatePromptProps): JSX.Element | null {
  const [candidate, setCandidate] = useState<ProjectCandidate | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCandidate = useCallback(async () => {
    if (!conversationId) {
      setCandidate(null);
      return;
    }
    const candidates = await window.YUA.projectTracking.listCandidates({
      conversationId,
      limit: 1,
      status: ['pending']
    });
    const next = candidates[0] || null;
    setCandidate(next);
    setName(next?.proposedName || '');
    setGoal(next?.proposedGoal || '');
  }, [conversationId]);

  useEffect(() => {
    void loadCandidate().catch(() => undefined);
  }, [loadCandidate, refreshKey]);

  if (!candidate) return null;

  const confirm = async (): Promise<void> => {
    setLoading(true);
    try {
      const overrides: Partial<CreateProjectInput> = {
        goal: goal.trim() || candidate.proposedGoal,
        name: name.trim() || candidate.proposedName
      };
      const result = await window.YUA.projectTracking.confirmCandidate(candidate.id, overrides);
      if (!result.ok) throw new Error(result.error || 'confirm failed');
      toast.success('已创建项目跟踪');
      setCandidate(null);
      onProjectCreated?.();
    } catch (error) {
      console.error(error);
      toast.error('创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  const dismiss = async (): Promise<void> => {
    setLoading(true);
    try {
      await window.YUA.projectTracking.dismissCandidate(candidate.id);
      setCandidate(null);
    } catch (error) {
      console.error(error);
      toast.error('忽略候选失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!candidate} onOpenChange={(open) => !open && void dismiss()}>
      <DialogContent className="w-[420px] max-w-[calc(100vw-32px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TbFolderPlus />
            检测到项目候选
          </DialogTitle>
          <DialogDescription>这段对话看起来像一个可以持续跟进的项目。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">项目名</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">目标</label>
            <Input value={goal} onChange={(event) => setGoal(event.target.value)} />
          </div>
          {candidate.evidenceSummary && <p className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">{candidate.evidenceSummary}</p>}
          {candidate.suggestedMilestones.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">建议里程碑</div>
              <ul className="space-y-1 text-sm">
                {candidate.suggestedMilestones.map((item, index) => (
                  <li key={`${item.title}-${index}`}>- {item.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button disabled={loading} variant="outline" onClick={() => void dismiss()}>
            <TbX />
            不是项目
          </Button>
          <Button disabled={loading} onClick={() => void confirm()}>
            {loading ? <TbLoader2 className="animate-spin" /> : <TbFolderPlus />}
            创建项目
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
