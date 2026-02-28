/**
 * PersonaStatusPanel - 精灵状态面板组件
 *
 * 显示精灵的等级、经验进度、心情和好感度
 * 用于状态窗口中展示角色信息
 */
import React from 'react';
import { TbHeartFilled, TbStarFilled } from 'react-icons/tb';

interface PersonaState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  mood: number;
  affection: number;
}

interface PersonaStatusPanelProps {
  persona: PersonaState | null;
}

const PersonaStatusPanel: React.FC<PersonaStatusPanelProps> = ({ persona }) => {
  if (!persona) return null;

  const xpProgress = persona.xpToNextLevel > 0 ? Math.min(100, (persona.xp / persona.xpToNextLevel) * 100) : 0;

  return (
    <div className="px-2 py-1.5 border-b border-border bg-muted/30">
      <div className="flex items-center gap-3">
        {/* 等级徽章 */}
        <div className="flex items-center gap-1.5">
          <TbStarFilled className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold">Lv.{persona.level}</span>
        </div>

        {/* 经验进度条 */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300" style={{ width: `${xpProgress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {persona.xp}/{persona.xpToNextLevel}
          </span>
        </div>
      </div>

      {/* 心情和好感度 */}
      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>心情:</span>
          <span className="font-mono">{persona.mood}</span>
        </div>
        <div className="flex items-center gap-1">
          <TbHeartFilled className="w-3 h-3 text-red-400" />
          <span className="font-mono">{persona.affection}</span>
        </div>
      </div>
    </div>
  );
};

export default PersonaStatusPanel;
