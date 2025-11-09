import React, { useState } from 'react';

import type { NodeSpec } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { TbArrowLeft, TbArrowRight } from 'react-icons/tb';

interface FloatingPaletteProps {
  width: number;
  specs: NodeSpec[];
  onAdd: (spec: NodeSpec) => void;
}

const FloatingPalette: React.FC<FloatingPaletteProps> = ({ width, specs, onAdd }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="absolute top-1/2 left-2 z-20 -translate-y-1/2">
      <Button size="icon" variant={"outline"} onClick={() => setOpen((o) => !o)}>
        {open ? <TbArrowLeft /> : <TbArrowRight />}
      </Button>
      <div className='bg-background shadow-md rounded-md p-2' style={{ width, maxHeight: '80vh', display: open ? 'block' : 'none' }} >
        <div>节点库</div>
        {specs.map((s: NodeSpec) => (
          <Button size="sm" key={s.id} onClick={() => onAdd(s)}>
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default FloatingPalette;
