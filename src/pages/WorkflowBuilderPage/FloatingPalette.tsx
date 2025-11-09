import React, { useState } from 'react';

import type { NodeSpec } from '@/types/workflow';

interface FloatingPaletteProps {
  width: number;
  specs: NodeSpec[];
  onAdd: (spec: NodeSpec) => void;
}

const FloatingPalette: React.FC<FloatingPaletteProps> = ({ width, specs, onAdd }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="absolute top-2 left-2 z-20">
      <button onClick={() => setOpen((o) => !o)} className="mb-2 px-2 py-1 rounded bg-neutral-800 text-xs border border-neutral-600 hover:bg-neutral-700">
        {open ? '收起节点库' : '展开节点库'}
      </button>
      <div
        style={{ width, maxHeight: '80vh' }}
        className={`transition-all duration-200 ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'} bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded shadow-lg p-2 space-y-2 overflow-auto`}
      >
        <div className="text-xs uppercase font-bold opacity-70">节点库</div>
        {specs.map((s: NodeSpec) => (
          <button key={s.id} className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-neutral-700" onClick={() => onAdd(s)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FloatingPalette;
