import type { SpritePurposeDailyRetrospective } from '@packages/sprite-core/purpose';
import React, { useEffect, useState } from 'react';
import { TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import PurposeRetrospectivePanel from '../ui/PurposeRetrospectivePanel';

type CharacterHeaderProfile = {
  name: string;
  tagline?: string;
};

export const StatusPage: React.FC = () => {
  const [profile, setProfile] = useState<CharacterHeaderProfile | null>(null);
  const [purposeRetrospective, setPurposeRetrospective] = useState<SpritePurposeDailyRetrospective | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      try {
        const [characterInfo, profileRes, activePackRes, purposeRes] = await Promise.all([
          window.chobits.character.getCharacterInfo().catch((error) => {
            console.warn('[StatusPage] failed to load character info', error);
            return null;
          }),
          window.chobits.status['sprite:character:get-profile']().catch((error) => {
            console.warn('[StatusPage] failed to load character profile', error);
            return null;
          }),
          window.chobits.character.getActiveCharacterPack().catch((error) => {
            console.warn('[StatusPage] failed to load active character pack', error);
            return null;
          }),
          window.chobits.sprite.getPurposeDailyRetrospective({ limit: 4 }).catch((error) => {
            console.warn('[StatusPage] failed to load purpose retrospective', error);
            return null;
          })
        ]);

        if (!mounted) return;
        setProfile(characterInfo ?? (activePackRes ? { name: activePackRes.name, tagline: activePackRes.description } : null) ?? profileRes?.profile ?? null);
        setPurposeRetrospective(purposeRes);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    // 订阅角色切换事件（含编辑器保存同 id 角色），收到后重新拉取角色信息
    const unsubscribe = window.chobits.character.onCharacterSwitched(() => {
      void load();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (isLoading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl bg-background">
      <div className="flex shrink-0 items-center p-1">
        <div className="flex-1 pl-1">{profile && <div className="text-sm flex items-center gap-4">{profile.name}</div>}</div>
        <Button
          size="icon"
          variant={'outline'}
          className="w-8 h-8 rounded-full"
          onClick={() => {
            window.chobits.window['window:close']('status');
          }}
        >
          <TbX />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* 今日目的复盘 */}
        <PurposeRetrospectivePanel retrospective={purposeRetrospective} />
      </div>
    </div>
  );
};

export default StatusPage;
