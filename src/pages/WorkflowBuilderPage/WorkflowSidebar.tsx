import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import { TbArrowsSplit, TbLine, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { getIconComponent, getTextColorClass } from './nodeUtils';
import type { NodeSpec } from './types';

interface WorkflowSidebarProps {
  specs: NodeSpec[];
  onAdd: (spec: NodeSpec) => void;
}

const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ specs, onAdd }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSpecs = useMemo(() => {
    return specs.filter((s) => s.id !== 'core/start' && s.id !== 'core/end');
  }, [specs]);

  const grouped = useMemo(() => {
    const map = new Map<string, NodeSpec[]>();
    for (const s of filteredSpecs) {
      const key = s.category || '其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // sort groups alphabetically and items by label
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => [cat, items.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''))] as [string, NodeSpec[]]);
  }, [filteredSpecs]);

  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const query = searchQuery.toLowerCase();
    return (
      grouped
        .map(([cat, items]) => [cat, items.filter((s) => s.label?.toLowerCase().includes(query) || s.id?.toLowerCase().includes(query))] as [string, NodeSpec[]])
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_, items]) => items.length > 0)
    );
  }, [grouped, searchQuery]);

  const handleAddNode = (spec: NodeSpec): void => {
    onAdd(spec);
    setPaletteOpen(false);
    setSearchQuery('');
  };

  return (
    <>
      <div className="fixed left-0 top-9 bottom-0 w-12 bg-background border-r border-border z-30 flex flex-col items-center py-2 gap-2">
        <Button size="icon" variant={paletteOpen ? 'secondary' : 'ghost'} className={cn('w-8 h-8', paletteOpen && 'bg-accent')} onClick={() => setPaletteOpen((prev) => !prev)} title="节点库">
          <TbLine />
        </Button>
        <Button size="icon" variant="ghost" className="w-8 h-8" title="链接">
          <TbArrowsSplit />
        </Button>
      </div>

      {/* 节点库面板 - 覆盖在画布上 */}
      {paletteOpen && (
        <div className="fixed left-12 top-9 bottom-0 w-96 bg-background border-r border-border z-40 shadow-lg flex flex-col">
          <div className="flex items-center gap-2 justify-between p-2 border-b border-border">
            <Input placeholder="搜索节点" className="h-8 flex-1" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Button size="icon" className="w-8 h-8 shrink-0" variant="ghost" onClick={() => setPaletteOpen(false)}>
              <TbX className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            <div className="space-y-2">
              {filteredGrouped.map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-1 text-sm font-medium text-muted-foreground mb-1">{cat}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((s) => {
                      const IconComponent = getIconComponent(s.icon);
                      const iconColorClass = getTextColorClass(s.backgroundColor);

                      return (
                        <Button className="w-full justify-start gap-2 relative overflow-hidden" variant="outline" key={s.id} onClick={() => handleAddNode(s)}>
                          {IconComponent && (
                            <div
                              className={clsx('rounded-full p-1 w-5 h-5 flex items-center justify-center shrink-0', !s.backgroundColor && 'bg-muted')}
                              style={{ backgroundColor: s.backgroundColor || undefined }}
                            >
                              <IconComponent className={clsx('w-3.5 h-3.5', iconColorClass)} />
                            </div>
                          )}
                          <span className="flex-1 text-left truncate">{s.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WorkflowSidebar;
