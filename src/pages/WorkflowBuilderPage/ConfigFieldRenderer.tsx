import React from 'react';
import { TbFolder, TbLoader2, TbPlus, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { NodeData, NodeSpec } from './types';

type ConfigSchema = NonNullable<NodeSpec['config']>[number];

interface ConfigFieldRendererProps {
  field: ConfigSchema | NodeSpec['inputs'][number];
  value: any;
  onChange: (value: any) => void;
  nodeData?: NodeData;
  mode?: 'default' | 'compact';
  folderList?: Array<{ id: string; name: string }>;
  loadingFolders?: boolean;
}

// 类型守卫：判断是否是分组选项
function isOptionGroup(option: { value?: string; label?: string; group?: string; options?: any[] }): option is { group: string; options: Array<{ value: string; label: string }> } {
  return 'group' in option && 'options' in option;
}

export const ConfigFieldRenderer: React.FC<ConfigFieldRendererProps> = ({
  field,
  value: currentValue,
  onChange: onValueChange,
  nodeData,
  mode = 'default',
  folderList = [],
  loadingFolders = false
}) => {
  const label = field.label || field.key;
  const rawValue = currentValue ?? field.default;
  const isCompact = mode === 'compact';

  // 样式定义
  const labelClass = isCompact ? 'text-[10px] font-medium' : 'text-xs font-medium';
  const descClass = isCompact ? 'text-[10px] text-muted-foreground' : 'text-xs text-muted-foreground';
  const containerClass = isCompact ? 'space-y-0.5' : 'space-y-1';
  const inputHeightClass = isCompact ? 'h-7 text-[11px]' : 'h-8 text-xs';
  const textareaClass = isCompact ? 'min-h-[60px] text-[11px] leading-snug' : 'min-h-[80px] text-xs';

  // 检查是否是 boolean 类型
  const isBoolean = field.type === 'boolean' || (Array.isArray(field.type) && field.type.includes('boolean'));

  // 如果是 boolean 类型，使用 Switch 组件
  if (isBoolean) {
    const boolValue = typeof rawValue === 'boolean' ? rawValue : rawValue === 'true' || rawValue === true || rawValue === '1';
    return (
      <div className={`flex items-center justify-between ${isCompact ? 'py-1' : ''}`}>
        <div className="flex flex-col">
          <label className={labelClass}>{label}</label>
          {field.description && !isCompact && <span className={descClass}>{field.description}</span>}
        </div>
        <Switch checked={boolValue} onCheckedChange={onValueChange} className={isCompact ? 'scale-75 origin-right' : ''} />
      </div>
    );
  }

  // 检查是否是数值类型
  const isNumber = field.type === 'number' || (Array.isArray(field.type) && field.type.includes('number')) || field.inputType === 'number';

  // 如果是数值类型，使用左右结构
  if (isNumber) {
    const numValue = typeof rawValue === 'number' ? rawValue : rawValue === '' || rawValue === null || rawValue === undefined ? '' : Number(rawValue);
    return (
      <div className={`flex items-center justify-between ${isCompact ? 'gap-2' : ''}`}>
        <div className="flex flex-col">
          <label className={labelClass}>{label}</label>
          {field.description && !isCompact && <span className={descClass}>{field.description}</span>}
        </div>
        <Input
          type="number"
          value={numValue}
          onChange={(e) => {
            e.stopPropagation();
            const val = e.target.value === '' ? undefined : Number(e.target.value);
            onValueChange(val);
          }}
          placeholder={field.description || ''}
          className={`${inputHeightClass} w-24`}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  // 检查是否是数组类型（多选）
  const isArrayType = field.type === 'array' || (Array.isArray(field.type) && field.type.includes('array'));
  const isMultipleSelect = field.inputType === 'select-multiple' || (isArrayType && field.inputType === 'select');

  // 处理多选的情况
  if (isMultipleSelect && field.options && field.options.length > 0) {
    const selectedValues = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
    const flatOptions = field.options.filter((opt): opt is { value: string; label: string } => !isOptionGroup(opt));

    return (
      <div className={containerClass}>
        <label className={`block ${labelClass}`}>{label}</label>
        {field.description && !isCompact && <span className={descClass}>{field.description}</span>}
        <div className="space-y-1.5 mt-1.5">
          {flatOptions.map((opt) => {
            const isChecked = selectedValues.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-accent/50 rounded px-1.5 py-1">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    const newValues = e.target.checked ? [...selectedValues, opt.value] : selectedValues.filter((v) => v !== opt.value);
                    onValueChange(newValues);
                  }}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <span className={isCompact ? 'text-[10px]' : 'text-xs'}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  const value = String(rawValue ?? '');

  // 根据 inputType 渲染不同的输入控件
  if (field.inputType === 'select' && field.options && field.options.length > 0) {
    // 检查第一个选项是否是分组结构
    const hasGroups = field.options.some((opt) => isOptionGroup(opt));

    if (hasGroups) {
      // 分组显示
      const groups = field.options.filter(isOptionGroup);
      return (
        <div className={containerClass}>
          <label className={`block ${labelClass}`}>{label}</label>
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className={inputHeightClass} onMouseDown={(e) => e.stopPropagation()}>
              <SelectValue placeholder={field.description || `选择${label}`} />
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
    const flatOptions = field.options.filter((opt): opt is { value: string; label: string } => !isOptionGroup(opt));
    return (
      <div className={containerClass}>
        <label className={`block ${labelClass}`}>{label}</label>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className={inputHeightClass} onMouseDown={(e) => e.stopPropagation()}>
            <SelectValue placeholder={field.description || `选择${label}`} />
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

  // 检查是否是 port-list 类型
  if (field.inputType === 'port-list') {
    const ports = (Array.isArray(rawValue) ? rawValue : []) as Array<{
      key: string;
      label: string;
    }>;

    const addPort = (): void => {
      const newPort = {
        key: `input_${Math.random().toString(36).substring(2, 7)}`,
        label: `输入 ${ports.length + 1}`
      };
      onValueChange([...ports, newPort]);
    };

    const updatePort = (index: number, updates: Partial<(typeof ports)[0]>): void => {
      const newPorts = [...ports];
      newPorts[index] = { ...newPorts[index], ...updates };
      onValueChange(newPorts);
    };

    const removePort = (index: number): void => {
      const newPorts = ports.filter((_, i) => i !== index);
      onValueChange(newPorts);
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={`${labelClass}`}>{label}</label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addPort} onMouseDown={(e) => e.stopPropagation()}>
            <TbPlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {ports.map((port, index) => (
            <div key={port.key} className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
              <Input
                value={port.key}
                onChange={(e) => {
                  e.stopPropagation();
                  updatePort(index, { key: e.target.value });
                }}
                placeholder="Key"
                className={`${inputHeightClass} w-1/3`}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <Input
                value={port.label}
                onChange={(e) => {
                  e.stopPropagation();
                  updatePort(index, { label: e.target.value });
                }}
                placeholder="Label"
                className={`${inputHeightClass} flex-1`}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removePort(index)} onMouseDown={(e) => e.stopPropagation()}>
                <TbTrash className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {ports.length === 0 && <div className={`${descClass} text-center py-2`}>暂无端口，点击 + 添加</div>}
        </div>
      </div>
    );
  }

  // 检查是否是 condition-list 类型
  if (field.inputType === 'condition-list') {
    const conditions = (Array.isArray(rawValue) ? rawValue : []) as Array<{
      id: string;
      name: string;
      operator: string;
      value: string;
      targetInput?: string;
    }>;

    // 获取可用的输入端口列表
    const availableInputs = (nodeData?.config?.inputs || [{ key: 'input', label: '默认输入' }]) as Array<{ key: string; label: string }>;

    const addCondition = (): void => {
      const newCondition = {
        id: Math.random().toString(36).substring(2, 9),
        name: `分支 ${conditions.length + 1}`,
        operator: 'eq',
        value: '',
        targetInput: availableInputs[0]?.key || 'input'
      };
      onValueChange([...conditions, newCondition]);
    };

    const updateCondition = (index: number, updates: Partial<(typeof conditions)[0]>): void => {
      const newConditions = [...conditions];
      newConditions[index] = { ...newConditions[index], ...updates };
      onValueChange(newConditions);
    };

    const removeCondition = (index: number): void => {
      const newConditions = conditions.filter((_, i) => i !== index);
      onValueChange(newConditions);
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={`${labelClass}`}>{label}</label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addCondition} onMouseDown={(e) => e.stopPropagation()}>
            <TbPlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {conditions.map((cond, index) => (
            <div key={cond.id} className="flex flex-col gap-2 rounded-md border p-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  value={cond.name}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateCondition(index, { name: e.target.value });
                  }}
                  placeholder="分支名称"
                  className={`${inputHeightClass} flex-1`}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCondition(index)} onMouseDown={(e) => e.stopPropagation()}>
                  <TbTrash className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={cond.targetInput || availableInputs[0]?.key} onValueChange={(val) => updateCondition(index, { targetInput: val })}>
                  <SelectTrigger className={`${inputHeightClass} w-[120px]`} onMouseDown={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="选择输入" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInputs.map((input) => (
                      <SelectItem key={input.key} value={input.key}>
                        {input.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cond.operator} onValueChange={(val) => updateCondition(index, { operator: val })}>
                  <SelectTrigger className={`${inputHeightClass} w-[100px]`} onMouseDown={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">等于</SelectItem>
                    <SelectItem value="neq">不等于</SelectItem>
                    <SelectItem value="contains">包含</SelectItem>
                    <SelectItem value="not_contains">不包含</SelectItem>
                    <SelectItem value="starts_with">开头是</SelectItem>
                    <SelectItem value="ends_with">结尾是</SelectItem>
                    <SelectItem value="gt">大于</SelectItem>
                    <SelectItem value="lt">小于</SelectItem>
                    <SelectItem value="gte">大于等于</SelectItem>
                    <SelectItem value="lte">小于等于</SelectItem>
                    <SelectItem value="empty">为空</SelectItem>
                    <SelectItem value="not_empty">不为空</SelectItem>
                    <SelectItem value="regex">正则</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cond.operator !== 'empty' && cond.operator !== 'not_empty' && (
                <Input
                  value={cond.value}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateCondition(index, { value: e.target.value });
                  }}
                  placeholder="值"
                  className={`${inputHeightClass} w-full`}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              )}
            </div>
          ))}
          {conditions.length === 0 && <div className={`${descClass} text-center py-2`}>暂无条件，点击 + 添加</div>}
        </div>
      </div>
    );
  }

  // 检查是否是 file 类型
  if (field.inputType === 'file') {
    const handlePickFile = async (): Promise<void> => {
      try {
        const result = await window.YUA.file['file:pickFile']();
        if (!result.canceled && result.path) {
          onValueChange(result.path);
        }
      } catch (err: any) {
        toast.error('文件选择失败', { description: err?.message || String(err) });
      }
    };

    return (
      <div className={containerClass}>
        <label className={labelClass}>{label}</label>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={field.description || '请选择文件或输入文件路径'}
            className={`flex-1 ${inputHeightClass}`}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <Button variant="outline" size="sm" className={inputHeightClass} onClick={handlePickFile} onMouseDown={(e) => e.stopPropagation()}>
            选择文件
          </Button>
        </div>
      </div>
    );
  }

  // 检查是否是 folder 类型
  if (field.inputType === 'folder') {
    return (
      <div className={containerClass}>
        <label className={labelClass}>{label}</label>
        {loadingFolders ? (
          <div className="flex items-center py-2">
            <TbLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">加载文件夹列表...</span>
          </div>
        ) : (
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className={`w-full ${inputHeightClass}`} onMouseDown={(e) => e.stopPropagation()}>
              <SelectValue placeholder={field.description || '请选择文件夹'} />
            </SelectTrigger>
            <SelectContent>
              {folderList.length === 0 ? (
                <div className="py-2 text-center text-xs text-muted-foreground">暂无可用文件夹</div>
              ) : (
                folderList.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center gap-2">
                      <TbFolder className="h-3 w-3" />
                      <span>{folder.name}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }

  // 检查是否是 textarea 类型
  if (field.inputType === 'textarea') {
    return (
      <div className={containerClass}>
        <label className={`block ${labelClass}`}>{label}</label>
        <Textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={field.description || ''}
          className={`${textareaClass} resize-y box-border`}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  // 默认使用 Input
  return (
    <div className={containerClass}>
      <label className={`block ${labelClass}`}>{label}</label>
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={field.description || ''}
        className={inputHeightClass}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
};
