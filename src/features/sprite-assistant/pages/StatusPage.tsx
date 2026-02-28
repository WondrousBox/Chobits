import React, { useEffect, useState } from 'react';
import { TbHeartFilled, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import PersonaStatusPanel from '../ui/PersonaStatusPanel';

type RoleProfile = {
  name: string;
  mood?: string;
  level?: number;
  favor?: number;
  description?: string;
};

type PersonaState = {
  level: number;
  xp: number;
  xpToNextLevel: number;
  mood: number;
  affection: number;
};

export const StatusPage: React.FC = () => {
  const [role, setRole] = useState<RoleProfile | null>(null);
  const [persona, setPersona] = useState<PersonaState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      try {
        const [roleRes, personaRes] = await Promise.all([window.YUA.status['status:getRole'](), window.YUA.persona.getState()]);

        if (!mounted) return;
        setRole(roleRes?.role);
        if (personaRes?.ok && personaRes.state) {
          setPersona(personaRes.state);
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

      {/* 精灵状态面板 */}
      <PersonaStatusPanel persona={persona} />
    </div>
  );
};

export default StatusPage;
