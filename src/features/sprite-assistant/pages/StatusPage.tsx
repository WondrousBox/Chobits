import type { SpritePurposeDailyRetrospective } from '@packages/sprite-core/purpose';
import type { PersonaSnapshot } from '@packages/sprite-core/types';
import React, { useEffect, useState } from 'react';
import { TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import PersonaStatusPanel from '../ui/PersonaStatusPanel';
import PurposeRetrospectivePanel from '../ui/PurposeRetrospectivePanel';
import RadarChart, { RadarDimension } from '../ui/RadarChart';

type RoleProfile = {
  name: string;
  mood?: string;
  description?: string;
};

export const StatusPage: React.FC = () => {
  const [role, setRole] = useState<RoleProfile | null>(null);
  const [persona, setPersona] = useState<PersonaSnapshot | null>(null);
  const [dimensions, setDimensions] = useState<RadarDimension[] | null>(null);
  const [purposeRetrospective, setPurposeRetrospective] = useState<SpritePurposeDailyRetrospective | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      try {
        const [roleRes, personaRes, dimsRes, purposeRes] = await Promise.all([
          window.YUA.status['status:getRole'](),
          window.YUA.persona.getState(),
          window.YUA.persona.getDimensions(),
          window.YUA.sprite.getPurposeDailyRetrospective({ limit: 4 }).catch((error) => {
            console.warn('[StatusPage] failed to load purpose retrospective', error);
            return null;
          })
        ]);

        if (!mounted) return;
        setRole(roleRes?.role);
        if (personaRes?.ok && personaRes.state) {
          setPersona(personaRes.state);
        }
        if (dimsRes) {
          setDimensions(dimsRes);
        }
        setPurposeRetrospective(purposeRes);
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
    <div className="w-full h-full bg-background rounded-xl">
      <div className="flex p-1 items-center">
        <div className="flex-1 pl-1">{role && <div className="text-sm flex items-center gap-4">{role.name}</div>}</div>
        <Button
          size="icon"
          variant={'outline'}
          className="w-8 h-8 rounded-full"
          onClick={() => {
            window.YUA.window['window:close']('status');
          }}
        >
          <TbX />
        </Button>
      </div>

      {/* 精灵状态面板 */}
      <PersonaStatusPanel persona={persona} />

      {/* 今日目的复盘 */}
      <PurposeRetrospectivePanel retrospective={purposeRetrospective} />

      {/* 维度雷达图 */}
      {dimensions && dimensions.length >= 3 && <RadarChart dimensions={dimensions} className="w-full" />}
    </div>
  );
};

export default StatusPage;
