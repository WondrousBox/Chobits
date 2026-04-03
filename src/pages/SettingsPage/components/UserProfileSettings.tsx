import React, { useCallback, useEffect, useState } from 'react';
import { TbLoader2, TbRefresh, TbUser } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/time';

import { SettingGroup, SettingItem } from './SettingComponents';

// ━━ 维度中文映射 ━━

const DIMENSION_LABELS: Record<string, { label: string; icon: string }> = {
  basic: { label: '基本信息', icon: '👤' },
  preference: { label: '偏好与品味', icon: '💡' },
  goal: { label: '目标与动力', icon: '🎯' },
  personality: { label: '性格与沟通', icon: '💬' },
  decision: { label: '决策风格', icon: '⚖️' },
  activity: { label: '近期动态', icon: '📝' },
  recent: { label: '近期变化', icon: '🔄' }
};

// ━━ 简易 Markdown 解析 ━━

interface PersonaSection {
  dimension: string;
  heading: string;
  facts: string[];
}

function parsePersonaSections(markdown: string): { snapshot: string; sections: PersonaSection[] } {
  const lines = markdown.split('\n');
  let snapshot = '';
  const sections: PersonaSection[] = [];
  let currentSection: PersonaSection | null = null;
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (line.startsWith('## Snapshot')) {
      currentSection = null;
      // Next non-empty line is the snapshot
      continue;
    }

    if (line.startsWith('## ')) {
      const heading = line.replace('## ', '').trim();
      // Map heading to dimension
      const dimensionMap: Record<string, string> = {
        'Basic Info': 'basic',
        'Preferences & Taste': 'preference',
        'Goals & Motivation': 'goal',
        'Personality & Communication': 'personality',
        'Decision Style & Boundaries': 'decision',
        'Current Activities': 'activity',
        'Recent Shift': 'recent'
      };
      const dimension = dimensionMap[heading] || heading.toLowerCase();
      currentSection = { dimension, heading, facts: [] };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith('> ') && !currentSection) {
      // Snapshot line
      snapshot = line.replace('> ', '').trim();
      continue;
    }

    if (line.startsWith('- ') && currentSection) {
      currentSection.facts.push(line.replace('- ', '').trim());
    }
  }

  return { snapshot, sections };
}

// ━━ 状态标签 ━━

function StatusBadge({ status }: { status: string }): JSX.Element {
  switch (status) {
    case 'running':
      return (
        <Badge variant="outline" className="text-blue-500 border-blue-500/30 text-xs">
          <TbLoader2 className="h-3 w-3 animate-spin mr-1" />
          更新中
        </Badge>
      );
    case 'queued':
      return (
        <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
          排队中
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
          更新失败
        </Badge>
      );
    default:
      return <></>;
  }
}

// ━━ 主组件 ━━

const UserProfileSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    exists: boolean;
    updatedAt: number;
    charCount: number;
    itemCount: number;
    compressionRound: number;
    snapshot: string;
    fullMarkdown?: string;
  } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ status: string; error?: string } | null>(null);
  const [parsedSections, setParsedSections] = useState<{ snapshot: string; sections: PersonaSection[] } | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const ws = await window.YUA.workspace['workspace:getDefault']();
      if (!ws?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const [data, status] = await Promise.all([window.YUA.userProfile.get({ workspaceId: ws.id, includeFull: true }), window.YUA.userProfile.getUpdateStatus({ workspaceId: ws.id })]);

      setProfile(data);
      setUpdateStatus(status);

      if (data?.exists && data.fullMarkdown) {
        setParsedSections(parsePersonaSections(data.fullMarkdown));
      } else {
        setParsedSections(null);
      }
    } catch (e: any) {
      console.error('[UserProfile] Load error:', e);
      toast.error('加载用户画像失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // 刷新
  const handleRefresh = useCallback(async () => {
    await loadProfile();
    toast.success('已刷新');
  }, [loadProfile]);

  // ━━ 渲染 ━━

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center py-12 text-muted-foreground">
        <TbLoader2 className="h-5 w-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* 概览 */}
      <SettingGroup title="用户画像">
        <SettingItem
          title="画像状态"
          description={profile?.exists ? `${profile.itemCount} 条信息 · ${profile.charCount} 字符 · 压缩 ${profile.compressionRound} 轮` : '尚未生成画像，对话一段时间后会自动生成'}
          action={
            <div className="flex items-center gap-2">
              {updateStatus && <StatusBadge status={updateStatus.status} />}
              <Button size="sm" variant="outline" onClick={handleRefresh}>
                <TbRefresh className="h-4 w-4 mr-1" />
                刷新
              </Button>
            </div>
          }
        />

        {profile?.exists && profile.updatedAt > 0 && <SettingItem title="最近更新" description={formatRelativeTime(profile.updatedAt)} />}

        {updateStatus?.error && <SettingItem title="错误信息" description={updateStatus.error} />}
      </SettingGroup>

      {/* 画像内容 */}
      {profile?.exists && parsedSections && (
        <>
          {/* Snapshot */}
          {parsedSections.snapshot && (
            <SettingGroup title="快照">
              <div className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <TbUser className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">{parsedSections.snapshot}</p>
                </div>
              </div>
            </SettingGroup>
          )}

          {/* 各个维度 */}
          {parsedSections.sections.map((section) => {
            const meta = DIMENSION_LABELS[section.dimension];
            if (!meta || section.facts.length === 0) return null;

            return (
              <SettingGroup key={section.dimension} title={`${meta.icon} ${meta.label}`}>
                {section.facts.map((fact, i) => (
                  <FactItem key={i} fact={fact} />
                ))}
              </SettingGroup>
            );
          })}
        </>
      )}

      {/* 空态 */}
      {!profile?.exists && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <TbUser className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">暂无画像数据</p>
          <p className="text-xs mt-1">与 AI 对话一段时间后，系统会自动从对话中提取您的偏好并生成画像</p>
        </div>
      )}
    </div>
  );
};

// ━━ 子组件 ━━

/** 解析行内 confidence/stability/recency 标记 */
function parseFactMeta(fact: string): { text: string; confidence?: number; stability?: number; recency?: number } {
  // 格式: "statement [c=0.9 s=0.8 r=0.7 n=3]"
  const match = fact.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
  if (!match) return { text: fact };

  const text = match[1].trim();
  const meta = match[2];
  const conf = meta.match(/c=([\d.]+)/);
  const stab = meta.match(/s=([\d.]+)/);
  const rec = meta.match(/r=([\d.]+)/);

  return {
    text,
    confidence: conf ? parseFloat(conf[1]) : undefined,
    stability: stab ? parseFloat(stab[1]) : undefined,
    recency: rec ? parseFloat(rec[1]) : undefined
  };
}

function FactItem({ fact }: { fact: string }): JSX.Element {
  const { text, confidence, stability } = parseFactMeta(fact);

  return (
    <div className="px-4 py-2.5 flex items-start gap-2">
      <span className="text-muted-foreground mt-1 text-xs">•</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed">{text}</p>
      </div>
      {(confidence != null || stability != null) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 flex-shrink-0">
                {confidence != null && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                    {Math.round(confidence * 100)}%
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <div className="text-xs space-y-0.5">
                {confidence != null && <div>置信度: {Math.round(confidence * 100)}%</div>}
                {stability != null && <div>稳定性: {Math.round(stability * 100)}%</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default UserProfileSettings;
