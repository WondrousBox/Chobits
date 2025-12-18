import React from 'react';
import { TbCheck, TbCode, TbLayout, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface FloatingActionsProps {
  onValidate: () => void;
  onSave: () => void;
  onRun?: () => void;
  onLayout?: () => void;
  onShowJson?: () => void;
  saving: boolean;
  running: boolean;
  isPreset?: boolean;
  renderRunButton?: () => React.ReactNode;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({ onValidate, onSave, onRun, onLayout, onShowJson, saving, running, isPreset, renderRunButton }) => {
  return (
    <div className="flex gap-2">
      {onLayout && (
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onLayout} title="美化布局">
          <TbLayout />
        </Button>
      )}
      {onShowJson && (
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onShowJson} title="查看 JSON">
          <TbCode />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onValidate}>
        <TbCheck />
        校验
      </Button>
      <Button variant="outline" size="sm" onClick={onSave} disabled={saving || isPreset} title={isPreset ? '预设工作流不允许修改' : ''}>
        保存
      </Button>
      {renderRunButton ? (
        renderRunButton()
      ) : (
        <Button size="sm" onClick={onRun} disabled={running}>
          <TbPlayerPlay />
          试运行
        </Button>
      )}
    </div>
  );
};

export default FloatingActions;
