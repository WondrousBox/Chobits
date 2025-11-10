import React, { useMemo, useState } from 'react';
import { TbArrowLeft, TbArrowRight } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import type { NodeSpec } from '@/types/workflow';

interface FloatingPaletteProps {
  width: number;
  specs: NodeSpec[];
  onAdd: (spec: NodeSpec) => void;
}

const FloatingPalette: React.FC<FloatingPaletteProps> = ({ width, specs, onAdd }) => {
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
    <div className="absolute top-1/2 left-2 z-20 -translate-y-1/2">
      <Button size="icon" variant={'outline'} onClick={() => setOpen((o) => !o)}>
        {open ? <TbArrowLeft /> : <TbArrowRight />}
      </Button>
      <div
        style={{ width, maxHeight: '80vh' }}
        className={`transition-all duration-200 ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'} bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded shadow-lg p-2 space-y-2 overflow-auto`}
      >
        <div className="text-xs uppercase font-bold opacity-70">节点库</div>
        <div className="space-y-2">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[11px] uppercase opacity-60 px-1 py-0.5">{cat}</div>
              <div>
                {items.map((s) => (
                  <button key={s.id} className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-neutral-700" onClick={() => onAdd(s)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FloatingPalette;
