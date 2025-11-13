import React from 'react';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { NodeSpec } from '@/types/workflow';

import type { NodeData } from './types';

interface NodePropertyEditorProps {
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
}

// 类型守卫：判断是否是分组选项
function isOptionGroup(option: { value?: string; label?: string; group?: string; options?: any[] }): option is { group: string; options: Array<{ value: string; label: string }> } {
  return 'group' in option && 'options' in option;
}

const NodePropertyEditor: React.FC<NodePropertyEditorProps> = ({ node, onChange }) => {
  if (!node) return null;
  const data = node.data as NodeData;
  const spec: NodeSpec = data.spec;

  // 渲染配置字段
  const renderConfigField = (c: NonNullable<NodeSpec['config']>[number]): React.ReactNode => {
    const label = c.label || c.key;
    const rawValue = (data.config || {})[c.key] ?? c.default;

    // 检查是否是 boolean 类型
    const isBoolean = c.type === 'boolean' || (Array.isArray(c.type) && c.type.includes('boolean'));

    // 如果是 boolean 类型，使用 Switch 组件
    if (isBoolean) {
      const boolValue = typeof rawValue === 'boolean' ? rawValue : rawValue === 'true' || rawValue === true || rawValue === '1';
      return (
        <div key={c.key} className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-xs">{label}</label>
            {c.description && <span className="text-xs opacity-70">{c.description}</span>}
          </div>
          <Switch checked={boolValue} onCheckedChange={(checked) => onChange((prev) => ({ config: { ...prev.config, [c.key]: checked } }))} />
        </div>
      );
    }

    const value = String(rawValue ?? '');

    // 根据 inputType 渲染不同的输入控件
    if (c.inputType === 'select' && c.options && c.options.length > 0) {
      // 检查第一个选项是否是分组结构
      const hasGroups = c.options.some((opt) => isOptionGroup(opt));

      if (hasGroups) {
        // 分组显示
        const groups = c.options.filter(isOptionGroup);
        return (
          <div key={c.key} className="space-y-1">
            <label className="block text-xs">{label}</label>
            <Select value={value} onValueChange={(val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={c.description || `选择${label}`} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group, index) => (
                  <React.Fragment key={group.group}>
                    {index > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel>{group.group}</SelectLabel>
                      {group.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }

      // 普通的下拉选择（扁平结构）
      const flatOptions = c.options.filter((opt): opt is { value: string; label: string } => !isOptionGroup(opt));
      return (
        <div key={c.key} className="space-y-1">
          <label className="block text-xs">{label}</label>
          <Select value={value} onValueChange={(val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={c.description || `选择${label}`} />
            </SelectTrigger>
            <SelectContent>
              {flatOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // 默认使用 Input
    return (
      <div key={c.key} className="space-y-1">
        <label className="block text-xs">{label}</label>
        <Input value={value} onChange={(e) => onChange((prev) => ({ config: { ...prev.config, [c.key]: e.target.value } }))} placeholder={c.description || ''} className="h-8 text-xs" />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{spec.label}</div>
      <div className="text-xs opacity-70">ID: {node.id}</div>
      {spec.config && spec.config.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">配置</div>
          {spec.config.map(renderConfigField)}
        </div>
      )}
      {spec.inputs && spec.inputs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">输入默认值</div>
          {spec.inputs.map((inp) => (
            <div key={inp.key} className="space-y-1">
              <label className="block text-xs">{inp.key}</label>
              <Input
                value={String((data.inputDefaults || {})[inp.key] ?? '')}
                onChange={(e) => onChange((prev) => ({ inputDefaults: { ...prev.inputDefaults, [inp.key]: e.target.value } }))}
                placeholder={inp.description || ''}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NodePropertyEditor;
