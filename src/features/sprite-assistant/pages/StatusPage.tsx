import type { PersonaSnapshot } from '@packages/sprite-core/types';
import React, { useEffect, useState } from 'react';
import { TbHeartFilled, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import PersonaStatusPanel from '../ui/PersonaStatusPanel';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      try {
        const [roleRes, personaRes, dimsRes] = await Promise.all([window.YUA.status['status:getRole'](), window.YUA.persona.getState(), window.YUA.persona.getDimensions()]);

        if (!mounted) return;
        setRole(roleRes?.role);
        if (personaRes?.ok && personaRes.state) {
          setPersona(personaRes.state);
        }
        if (dimsRes) {
          setDimensions(dimsRes);
        }
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
        <div className="flex-1 pl-1">
          {role && (
            <div className="text-sm flex items-center gap-4">
              <span>
                {role.name} <span className="text-muted-foreground text-xs ml-1">Lv.{persona?.level ?? '—'}</span>
              </span>
              <div className="flex items-center gap-1">
                <TbHeartFilled color="red" size={16} />
                <span className="font-mono text-xs text-muted-foreground">{persona?.favor ?? 0}</span>
              </div>
            </div>
          )}
        </div>
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

      {/* 维度雷达图 */}
      {dimensions && dimensions.length >= 3 && (
        <div className="flex flex-col items-center px-2 py-3">
          <h3 className="text-xs font-medium text-muted-foreground mb-2">能力维度</h3>
          <RadarChart dimensions={dimensions} className="w-full" />
        </div>
      )}
    </div>
  );
};

export default StatusPage;
