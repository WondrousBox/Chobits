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
  validateResult: any;
  isPreset?: boolean;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({ onValidate, onSave, onRun, onLayout, onShowJson, saving, running, validateResult, isPreset }) => {
  return (
    <div className="flex flex-col items-end space-y-2">
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
      {validateResult && (
        <div className="text-xs px-2 py-1 rounded bg-neutral-900/90 border border-neutral-700 shadow max-w-xs">
          {validateResult.ok ? (
            <div className="text-green-400">校验通过</div>
          ) : (
            <div className="text-red-400 space-y-1">
              {(validateResult.errors || []).map((e: string) => (
                <div key={e}>{e}</div>
              ))}
              {(validateResult.missingPlugins || []).map((m: any) => (
                <div key={m.id}>缺少插件: {m.id}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingActions;
