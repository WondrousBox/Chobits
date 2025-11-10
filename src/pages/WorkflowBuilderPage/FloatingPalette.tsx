import React, { useMemo, useState } from 'react';
import { TbCategory, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NodeSpec } from '@/types/workflow';

interface FloatingPaletteProps {
  specs: NodeSpec[];
  onAdd: (spec: NodeSpec) => void;
}

const FloatingPalette: React.FC<FloatingPaletteProps> = ({ specs, onAdd }) => {
  const [open, setOpen] = useState(true);
  const grouped = useMemo(() => {
    const map = new Map<string, NodeSpec[]>();
    for (const s of specs) {
      const key = s.category || '其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // sort groups alphabetically and items by label
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => [cat, items.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''))] as [string, NodeSpec[]]);
  }, [specs]);
  return (
    <div className="absolute top-1/2 left-2 z-20 -translate-y-1/2 backdrop-blur-sm border border-solid border-ring rounded-md overflow-hidden">
      <div className="bg-background flex items-center gap-2 justify-between p-2">
        {open && <Input placeholder="搜索节点" className="h-8" />}
        <Button size="icon" className="w-8 h-8 shrink-0" variant={'outline'} onClick={() => setOpen((o) => !o)}>
          {open ? <TbX /> : <TbCategory />}
        </Button>
      </div>
      {open && (
        <div style={{ maxHeight: '80vh', borderTopStyle: 'solid' }} className="p-2 space-y-2 overflow-auto bg-muted border-t border-t-ring">
          <div className="space-y-2">
            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <div className="px-1">{cat}</div>
                <div className="space-y-1">
                  {items.map((s) => (
                    <Button className="w-full" variant={'outline'} key={s.id} onClick={() => onAdd(s)}>
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingPalette;
