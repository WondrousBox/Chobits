import React from 'react';
import { TbCheck, TbCode, TbDisc, TbLayoutBottombar, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface FloatingActionsProps {
  onValidate: () => void;
  onSave: () => void;
  onRun: () => void;
  onLayout?: () => void;
  onShowJson?: () => void;
  saving: boolean;
  running: boolean;
  isPreset?: boolean;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({ onValidate, onSave, onRun, onLayout, onShowJson, saving, running, isPreset }) => {
  return (
    <div className="flex gap-2">
      {onLayout && (
        <Button variant="ghost" size="sm" onClick={onLayout} title="美化布局">
          <TbLayoutBottombar />
        </Button>
      )}
      {onShowJson && (
        <Button variant="ghost" size="sm" onClick={onShowJson} title="查看 JSON">
          <TbCode />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onValidate}>
        <TbCheck />
        校验
      </Button>
      <Button variant="ghost" size="sm" onClick={onSave} disabled={saving || isPreset} title={isPreset ? '预设工作流不允许修改' : ''}>
        <TbDisc />
        保存
      </Button>
      <Button size="sm" onClick={onRun} disabled={running}>
        <TbPlayerPlay />
        运行示例
      </Button>
    </div>
  );
};

export default FloatingActions;
