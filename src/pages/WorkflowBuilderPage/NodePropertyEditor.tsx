/* eslint-disable react-hooks/rules-of-hooks */
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';

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
            {c.description && <span className="text-xs text-muted-foreground">{c.description}</span>}
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

  // 将配置项按组分类
  const groupedConfigs = React.useMemo(() => {
    const groups: Record<string, NonNullable<NodeSpec['config']>> = {};
    const ungrouped: NonNullable<NodeSpec['config']> = [];

    spec.config?.forEach((c) => {
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
  }, [spec.config]);

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
        {spec.config && spec.config.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase opacity-70">配置</div>

            {/* 渲染未分组的配置项 */}
            {groupedConfigs.ungrouped.map(renderConfigField)}

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
                          <div className="pl-4 space-y-2">{configs.map(renderConfigField)}</div>
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
    </>
  );
};

export default NodePropertyEditor;
