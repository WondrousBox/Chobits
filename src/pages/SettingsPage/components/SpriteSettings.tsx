import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import { TbChevronDown, TbMoodKid } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import SpriteManager from './SpriteManager';

type SpriteSettingsProps = {
  expanded: boolean;
  onExpand: () => void;
};

const SpriteSettings: React.FC<SpriteSettingsProps> = ({ expanded, onExpand }) => {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbMoodKid className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">精灵管理</div>
              <div className="text-sm text-muted-foreground">导入/删除动画，设为当前精灵</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className={`w-8 h-8 transition-transform ${expanded ? 'rotate-180' : ''}`} onClick={onExpand}>
              <TbChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="sprite-settings-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <SpriteManager />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SpriteSettings;
