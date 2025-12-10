/* eslint-disable react-hooks/rules-of-hooks */
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import { TbChevronDown, TbChevronRight, TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { NodeSpec } from '@/types/workflow';

import type { NodeData } from './types';

const invoke = window.ipcRenderer.invoke;

type ConfigSchema = NonNullable<NodeSpec['config']>[number];

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

  // 动态配置状态
  const [dynamicConfig, setDynamicConfig] = useState<ConfigSchema[] | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [lastConfigStr, setLastConfigStr] = useState<string>('');

  // 从 spec 中获取是否支持动态配置的标记
  const hasDynamicConfig = spec.hasDynamicConfig === true;

  // 获取动态配置
  const fetchDynamicConfig = React.useCallback(
    async (currentConfig?: Record<string, any>) => {
      // 如果节点不支持动态配置，直接返回
      if (!hasDynamicConfig) {
        return;
      }

      try {
        setLoadingConfig(true);
        const result = await invoke('wf:getNodeConfig', {
          nodeId: spec.id,
          config: currentConfig || data.config || {}
        });
        if (result?.ok && Array.isArray(result.config)) {
          const newConfig = result.config as ConfigSchema[];
          setDynamicConfig(newConfig);

          // 验证并修正配置值：如果某个 select 字段的值不在新选项中，重置为默认值
          const currentConfigObj = currentConfig || data.config || {};
          const needsUpdate: Record<string, any> = {};
          let hasInvalidValue = false;

          newConfig.forEach((field) => {
            if (field.inputType === 'select' && field.options && currentConfigObj[field.key] !== undefined) {
              // 扁平化选项列表（处理分组选项）
              const flatOptions: Array<{ value: string; label: string }> = [];
              field.options.forEach((opt) => {
                if ('value' in opt && 'label' in opt) {
                  flatOptions.push(opt as { value: string; label: string });
                } else if ('group' in opt && 'options' in opt) {
                  flatOptions.push(...(opt.options || []));
                }
              });

              // 检查当前值是否在新的选项列表中
              const currentValue = currentConfigObj[field.key];
              const isValid = flatOptions.some((opt) => opt.value === currentValue);
              if (!isValid && currentValue !== undefined && currentValue !== null && currentValue !== '') {
                // 如果值无效，使用默认值或第一个选项的值
                const newValue = field.default ?? flatOptions[0]?.value ?? '';
                if (newValue !== currentValue) {
                  needsUpdate[field.key] = newValue;
                  hasInvalidValue = true;
                }
              }
            }
          });

          // 如果有无效值需要修正，更新配置
          if (hasInvalidValue) {
            onChange((prev) => ({
              config: { ...prev.config, ...needsUpdate }
            }));
          }
        } else {
          // 如果获取失败，使用静态配置
          setDynamicConfig(null);
        }
      } catch (error) {
        console.warn('[NodePropertyEditor] Failed to fetch dynamic config:', error);
        setDynamicConfig(null);
      } finally {
        setLoadingConfig(false);
      }
    },
    [spec.id, hasDynamicConfig, data.config, onChange]
  );

  // 初始加载时获取动态配置（仅当节点支持动态配置时）
  useEffect(() => {
    if (hasDynamicConfig) {
      fetchDynamicConfig(data.config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, hasDynamicConfig]); // 只在节点类型变化或动态配置标记变化时重新获取

  // 当配置值变化时，重新获取动态配置（用于联动效果）
  // 使用配置对象的序列化来判断是否变化，不硬编码字段名
  useEffect(() => {
    // 如果节点不支持动态配置，不需要重新获取
    if (!hasDynamicConfig) {
      return;
    }

    const currentConfigStr = JSON.stringify(data.config || {});
    if (currentConfigStr !== lastConfigStr) {
      setLastConfigStr(currentConfigStr);
      // 延迟一下，确保配置已经更新
      const timer = setTimeout(() => {
        fetchDynamicConfig(data.config);
      }, 150);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.config, hasDynamicConfig]);

  // 使用动态配置或静态配置
  const effectiveConfig = useMemo(() => {
    return dynamicConfig || spec.config || [];
  }, [dynamicConfig, spec.config]);

  // 根据节点定义初始化展开状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (spec.configGroups) {
      Object.entries(spec.configGroups).forEach(([groupName, groupDef]) => {
        if (groupDef.defaultExpanded) {
          initial.add(groupName);
        }
      });
    }
    return initial;
  });

  // 通用字段渲染函数
  const renderField = (field: ConfigSchema | NodeSpec['inputs'][number], currentValue: any, onValueChange: (val: any) => void): React.ReactNode => {
    const label = field.label || field.key;
    const rawValue = currentValue ?? field.default;

    // 检查是否是 boolean 类型
    const isBoolean = field.type === 'boolean' || (Array.isArray(field.type) && field.type.includes('boolean'));

    // 如果是 boolean 类型，使用 Switch 组件
    if (isBoolean) {
      const boolValue = typeof rawValue === 'boolean' ? rawValue : rawValue === 'true' || rawValue === true || rawValue === '1';
      return (
        <div key={field.key} className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-xs">{label}</label>
            {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
          </div>
          <Switch checked={boolValue} onCheckedChange={onValueChange} />
        </div>
      );
    }

    // 检查是否是数值类型
    const isNumber = field.type === 'number' || (Array.isArray(field.type) && field.type.includes('number')) || field.inputType === 'number';

    // 如果是数值类型，使用左右结构
    if (isNumber) {
      const numValue = typeof rawValue === 'number' ? rawValue : rawValue === '' || rawValue === null || rawValue === undefined ? '' : Number(rawValue);
      return (
        <div key={field.key} className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-xs">{label}</label>
            {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
          </div>
          <Input
            type="number"
            value={numValue}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              onValueChange(val);
            }}
            placeholder={field.description || ''}
            className="h-8 w-24 text-xs"
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
        <div key={field.key} className="space-y-1">
          <label className="block text-xs">{label}</label>
          {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
          <div className="space-y-1.5 mt-1.5">
            {flatOptions.map((opt) => {
              const isChecked = selectedValues.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-accent/50 rounded px-1.5 py-1">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const newValues = e.target.checked ? [...selectedValues, opt.value] : selectedValues.filter((v) => v !== opt.value);
                      onValueChange(newValues);
                    }}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                  />
                  <span className="text-xs">{opt.label}</span>
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
          <div key={field.key} className="space-y-1">
            <label className="block text-xs">{label}</label>
            <Select value={value} onValueChange={onValueChange}>
              <SelectTrigger className="h-8 text-xs">
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
        <div key={field.key} className="space-y-1">
          <label className="block text-xs">{label}</label>
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="h-8 text-xs">
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

      const addPort = () => {
        const newPort = {
          key: `input_${Math.random().toString(36).substring(2, 7)}`,
          label: `输入 ${ports.length + 1}`
        };
        onValueChange([...ports, newPort]);
      };

      const updatePort = (index: number, updates: Partial<(typeof ports)[0]>) => {
        const newPorts = [...ports];
        newPorts[index] = { ...newPorts[index], ...updates };
        onValueChange(newPorts);
      };

      const removePort = (index: number) => {
        const newPorts = ports.filter((_, i) => i !== index);
        onValueChange(newPorts);
      };

      return (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">{label}</label>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addPort}>
              <TbPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {ports.map((port, index) => (
              <div key={port.key} className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
                <Input value={port.key} onChange={(e) => updatePort(index, { key: e.target.value })} placeholder="Key" className="h-7 text-xs w-1/3" />
                <Input value={port.label} onChange={(e) => updatePort(index, { label: e.target.value })} placeholder="Label" className="h-7 text-xs flex-1" />
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removePort(index)}>
                  <TbTrash className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {ports.length === 0 && <div className="text-xs text-muted-foreground text-center py-2">暂无端口，点击 + 添加</div>}
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
      const availableInputs = (data.config?.inputs || [{ key: 'input', label: '默认输入' }]) as Array<{ key: string; label: string }>;

      const addCondition = () => {
        const newCondition = {
          id: Math.random().toString(36).substring(2, 9),
          name: `分支 ${conditions.length + 1}`,
          operator: 'eq',
          value: '',
          targetInput: availableInputs[0]?.key || 'input'
        };
        onValueChange([...conditions, newCondition]);
      };

      const updateCondition = (index: number, updates: Partial<(typeof conditions)[0]>) => {
        const newConditions = [...conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        onValueChange(newConditions);
      };

      const removeCondition = (index: number) => {
        const newConditions = conditions.filter((_, i) => i !== index);
        onValueChange(newConditions);
      };

      return (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">{label}</label>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addCondition}>
              <TbPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {conditions.map((cond, index) => (
              <div key={cond.id} className="flex flex-col gap-2 rounded-md border p-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Input value={cond.name} onChange={(e) => updateCondition(index, { name: e.target.value })} placeholder="分支名称" className="h-7 text-xs flex-1" />
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCondition(index)}>
                    <TbTrash className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={cond.targetInput || availableInputs[0]?.key} onValueChange={(val) => updateCondition(index, { targetInput: val })}>
                    <SelectTrigger className="h-7 text-xs w-[120px]">
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
                    <SelectTrigger className="h-7 text-xs w-[100px]">
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
                  <Input value={cond.value} onChange={(e) => updateCondition(index, { value: e.target.value })} placeholder="值" className="h-7 text-xs w-full" />
                )}
              </div>
            ))}
            {conditions.length === 0 && <div className="text-xs text-muted-foreground text-center py-2">暂无条件，点击 + 添加</div>}
          </div>
        </div>
      );
    }

    // 检查是否是 textarea 类型
    if (field.inputType === 'textarea') {
      return (
        <div key={field.key} className="space-y-1">
          <label className="block text-xs">{label}</label>
          <Textarea value={value} onChange={(e) => onValueChange(e.target.value)} placeholder={field.description || ''} className="min-h-[80px] text-xs resize-y box-border" />
        </div>
      );
    }

    // 默认使用 Input
    return (
      <div key={field.key} className="space-y-1">
        <label className="block text-xs">{label}</label>
        <Input value={value} onChange={(e) => onValueChange(e.target.value)} placeholder={field.description || ''} className="h-8 text-xs" />
      </div>
    );
  };

  // 将配置项按组分类（使用动态配置）
  const groupedConfigs = React.useMemo(() => {
    const groups: Record<string, ConfigSchema[]> = {};
    const ungrouped: ConfigSchema[] = [];

    effectiveConfig.forEach((c) => {
      if (c.group) {
        if (!groups[c.group]) {
          groups[c.group] = [];
        }
        groups[c.group].push(c);
      } else {
        ungrouped.push(c);
      }
    });

    return { groups, ungrouped };
  }, [effectiveConfig]);

  // 切换组的展开/收起状态
  const toggleGroup = (groupName: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // 获取组的显示标签
  const getGroupLabel = (groupName: string): string => {
    return spec.configGroups?.[groupName]?.label || groupName;
  };

  return (
    <>
      <div className="bg-background p-2">
        <div className="text-sm font-semibold">{spec.label}</div>
        <div className="text-xs text-muted-foreground">ID: {node.id}</div>
      </div>
      <div className="bg-muted p-2 max-h-[80vh] overflow-auto">
        {effectiveConfig && effectiveConfig.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase opacity-70">配置</div>
              {loadingConfig && <div className="text-xs text-muted-foreground">加载中...</div>}
            </div>

            {/* 渲染未分组的配置项 */}
            {groupedConfigs.ungrouped.map((c) => renderField(c, (data.config || {})[c.key], (val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))))}

            {/* 渲染分组的配置项 */}
            {(() => {
              // 按照 configGroups 定义的顺序渲染分组
              const groupOrder = spec.configGroups ? Object.keys(spec.configGroups) : [];
              const allGroups = Object.keys(groupedConfigs.groups);

              // 先渲染在 configGroups 中定义的分组（按定义顺序）
              const definedGroups = groupOrder.filter((name) => allGroups.includes(name));
              // 再渲染未在 configGroups 中定义的分组
              const undefinedGroups = allGroups.filter((name) => !groupOrder.includes(name));

              return [...definedGroups, ...undefinedGroups].map((groupName) => {
                const configs = groupedConfigs.groups[groupName];
                const isExpanded = expandedGroups.has(groupName);
                return (
                  <div key={groupName} className="space-y-2">
                    <button type="button" onClick={() => toggleGroup(groupName)} className="flex items-center gap-1 w-full text-xs font-medium opacity-70 hover:opacity-100 transition-opacity">
                      {isExpanded ? <TbChevronDown className="w-4 h-4" /> : <TbChevronRight className="w-4 h-4" />}
                      <span>{getGroupLabel(groupName)}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="pl-4 space-y-2">
                            {configs.map((c) => renderField(c, (data.config || {})[c.key], (val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              });
            })()}
          </div>
        )}
        {spec.inputs && spec.inputs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase opacity-70">输入默认值</div>
            {spec.inputs.map((inp) => renderField(inp, (data.inputDefaults || {})[inp.key], (val) => onChange((prev) => ({ inputDefaults: { ...prev.inputDefaults, [inp.key]: val } }))))}
          </div>
        )}
      </div>
    </>
  );
};

export default NodePropertyEditor;
