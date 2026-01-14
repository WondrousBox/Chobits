import React, { useState } from 'react';
import { TbBinaryTree } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import DailyCareSettings from './DailyCareSettings';
import MovementSettings from './MovementSettings';
import RecorderSettings from './RecorderSettings';
import SpriteSettings from './SpriteSettings';

type ExtensionPanel = 'movement' | 'dailyCare' | 'sprite' | 'recorder' | null;

const ExtensionSettings: React.FC = () => {
  const [activePanel, setActivePanel] = useState<ExtensionPanel>('movement');

  const handleExpand = (panel: ExtensionPanel): void => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const handleOpenSkillTree = async (): Promise<void> => {
    try {
      await window.YUA.window['window:open']('skillTree');
    } catch (error) {
      console.error('打开技能树窗口失败:', error);
    }
  };

  return (
    <div className="space-y-3 px-2">
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <TbBinaryTree className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">技能天赋</div>
                <div className="text-sm text-muted-foreground">查看和管理角色的技能树</div>
              </div>
            </div>
            <Button onClick={handleOpenSkillTree} variant="default">
              打开技能树
            </Button>
          </div>
        </div>
      </div>
      <MovementSettings expanded={activePanel === 'movement'} onExpand={() => handleExpand('movement')} />
      <DailyCareSettings expanded={activePanel === 'dailyCare'} onExpand={() => handleExpand('dailyCare')} />
      <SpriteSettings expanded={activePanel === 'sprite'} onExpand={() => handleExpand('sprite')} />
      <RecorderSettings expanded={activePanel === 'recorder'} onExpand={() => handleExpand('recorder')} />
    </div>
  );
};

export default ExtensionSettings;
