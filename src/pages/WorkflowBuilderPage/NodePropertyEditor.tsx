/* eslint-disable react-hooks/rules-of-hooks */
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';

import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import type { NodeData, NodeSpec } from './types';

const invoke = window.ipcRenderer.invoke;

type ConfigSchema = NonNullable<NodeSpec['config']>[number];

interface NodePropertyEditorProps {
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
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
            if ((field.inputType === 'select' || field.inputType === 'select-menu') && field.options && currentConfigObj[field.key] !== undefined) {
              // 扁平化选项列表（处理分组选项和子菜单）
              const flatOptions: Array<{ value: string; label: string }> = [];

              field.options.forEach((opt) => {
                if ('value' in opt && 'label' in opt) {
                  const anyOpt: any = opt;
                  // 如果有 children，则只把 children 作为可选值
                  if (Array.isArray(anyOpt.children) && anyOpt.children.length > 0) {
                    anyOpt.children.forEach((child: any) => {
                      if (child && typeof child.value === 'string' && typeof child.label === 'string') {
                        flatOptions.push({ value: String(child.value), label: String(child.label) });
                      }
                    });
                  } else {
                    flatOptions.push({ value: String(anyOpt.value), label: String(anyOpt.label) });
                  }
                } else if ('group' in opt && 'options' in opt) {
                  const groupAny: any = opt;
                  (groupAny.options || []).forEach((gOpt: any) => {
                    if (gOpt && typeof gOpt.value === 'string' && typeof gOpt.label === 'string') {
                      if (Array.isArray(gOpt.children) && gOpt.children.length > 0) {
                        gOpt.children.forEach((child: any) => {
                          if (child && typeof child.value === 'string' && typeof child.label === 'string') {
                            flatOptions.push({ value: String(child.value), label: String(child.label) });
                          }
                        });
                      } else {
                        flatOptions.push({ value: String(gOpt.value), label: String(gOpt.label) });
                      }
                    }
                  });
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
    <div className="h-full flex flex-col">
      {/* 头部：节点信息 */}
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-primary">{spec.label?.charAt(0) || 'N'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{spec.label}</div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">{node.id}</div>
          </div>
        </div>
      </div>

      {/* 配置内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {effectiveConfig && effectiveConfig.length > 0 && (
          <div className="p-3">
            {/* 配置标题 */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-muted-foreground">配置</div>
              {loadingConfig && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-3 h-3 rounded-full border border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                  加载中
                </div>
              )}
            </div>

            <div className="space-y-3">
              {/* 渲染未分组的配置项 */}
              {groupedConfigs.ungrouped.map((c) => (
                <ConfigFieldRenderer key={c.key} field={c} value={(data.config || {})[c.key]} onChange={(val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))} nodeData={data} />
              ))}

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
                    <div key={groupName} className="rounded-md border bg-muted/20">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupName)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? <TbChevronDown className="w-3.5 h-3.5" /> : <TbChevronRight className="w-3.5 h-3.5" />}
                        <span>{getGroupLabel(groupName)}</span>
                      </button>
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div className="px-3 pb-3 space-y-3">
                              {configs.map((c) => (
                                <ConfigFieldRenderer
                                  key={c.key}
                                  field={c}
                                  value={(data.config || {})[c.key]}
                                  onChange={(val) => onChange((prev) => ({ config: { ...prev.config, [c.key]: val } }))}
                                  nodeData={data}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* 输入默认值区域 */}
        {spec.inputs && spec.inputs.length > 0 && (
          <div className="p-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-3">输入默认值</div>
            <div className="space-y-3">
              {spec.inputs.map((inp) => (
                <ConfigFieldRenderer
                  key={inp.key}
                  field={inp}
                  value={(data.inputDefaults || {})[inp.key]}
                  onChange={(val) => onChange((prev) => ({ inputDefaults: { ...prev.inputDefaults, [inp.key]: val } }))}
                  nodeData={data}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodePropertyEditor;
