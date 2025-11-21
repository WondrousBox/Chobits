import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import { TbGripVertical } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { MasonryLayoutConfig, ResourceItem } from '@/types';

import { addResourcesToGroup, createDefaultLayoutConfig, createGroup, loadMasonryLayout, renameGroup, saveMasonryLayout, setGroupLayout, setResourceFullWidth } from '../utils/masonryLayout';
import { AddToGroupDialog } from './AddToGroupDialog';
import FullWidthTextResource from './FullWidthTextResource';
import { MasonryContextMenu } from './MasonryContextMenu';
import ResourceGalleryItem from './ResourceGalleryItem';
import { ResourceGroup } from './ResourceGroup';

const ResponsiveGridLayout = WidthProvider(Responsive);

// 常量定义
const ROW_HEIGHT = 30; // 行高
const MARGIN: [number, number] = [16, 16]; // 间距 [x, y]
const COLS = { lg: 6, md: 6, sm: 6, xs: 6, xxs: 6 }; // 列数配置

interface FreeLayoutItemProps {
  id: string;
  children: React.ReactNode;
  onHeightChange: (id: string, height: number) => void;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

// 自动计算高度的包装组件
const FreeLayoutItem = React.forwardRef<HTMLDivElement, FreeLayoutItemProps>(({ id, children, onHeightChange, className, style, onMouseDown, onMouseUp, onTouchEnd, ...props }, ref) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // 监听内容高度变化
  useEffect(() => {
    if (!contentRef.current) return;

    const observer = new ResizeObserver(
      debounce((entries) => {
        for (const entry of entries) {
          onHeightChange(id, entry.contentRect.height);
        }
      }, 100)
    );

    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [id, onHeightChange]);

  // 合并 ref
  const combinedRef = useCallback(
    (node: HTMLDivElement) => {
      // @ts-ignore: Assigning to current is valid for MutableRefObject
      contentRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as any).current = node;
    },
    [ref]
  );

  return (
    <div
      ref={combinedRef}
      className={`${className} group/item bg-card rounded-lg border shadow-sm overflow-hidden relative`}
      style={{ ...style, display: 'flex', flexDirection: 'column' }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
      {...props}
    >
      {/* 拖拽手柄 - 悬停显示 */}
      <Button variant="ghost" size="icon" className="drag-handle absolute top-1 left-1 z-50 cursor-move opacity-0 group-hover/item:opacity-100 transition-opacity">
        <TbGripVertical />
      </Button>

      <div className="h-full w-full">{children}</div>
    </div>
  );
});

FreeLayoutItem.displayName = 'FreeLayoutItem';

export interface ExplorerFreeLayoutProps {
  items: ResourceItem[];
  folderId?: string;
  selectedItems: Set<string>;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onPreview?: (item: ResourceItem, index: number, list: ResourceItem[]) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: ResourceItem, selectedIds: string[]) => void;
}

export const ExplorerFreeLayout: React.FC<ExplorerFreeLayoutProps> = ({ items, folderId, selectedItems, onItemClick, onToggleFavorite, onToggleVisibility, onPreview, draggable = true }) => {
  const [layoutConfig, setLayoutConfig] = useState<MasonryLayoutConfig | null>(null);
  const [currentLayout, setCurrentLayout] = useState<Layout[]>([]);
  const [loading, setLoading] = useState(true);

  // 状态管理
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);

  // 生成初始布局
  const generateInitialLayout = useCallback((resources: ResourceItem[], config: MasonryLayoutConfig): Layout[] => {
    const layout: Layout[] = [];

    // 1. 先处理 items
    resources.forEach((item, i) => {
      const configItem = config.items.find((ci) => ci.resourceId === item.id);
      // 如果在分组里，跳过（分组会单独处理）
      if (configItem?.groupId) return;

      const isFullWidth = configItem?.fullWidth || item.type === 'text'; // 文本默认全宽
      const w = isFullWidth ? 12 : 3;

      layout.push({
        i: `resource-${item.id}`,
        x: (i * 3) % 12,
        y: Infinity, // 让 RGL 自动堆叠
        w: w,
        h: 4 // 初始高度，后续会自动调整
      });
    });

    // 2. 处理分组
    config.groups?.forEach((group) => {
      layout.push({
        i: `group-${group.id}`,
        x: 0,
        y: Infinity,
        w: 12, // 分组默认全宽
        h: 6
      });
    });

    return layout;
  }, []);

  // 初始化加载
  useEffect(() => {
    const loadLayout = async (): Promise<void> => {
      if (!folderId) {
        const defaultConfig = createDefaultLayoutConfig(items.map((i) => i.id));
        setLayoutConfig(defaultConfig);
        setLoading(false);
        return;
      }

      setLoading(true);
      const config = await loadMasonryLayout(folderId);
      if (config) {
        setLayoutConfig(config);
        // 如果有保存的 gridLayout，直接使用
        if (config.gridLayout && config.gridLayout.length > 0) {
          // 同步 layout：处理新增或移除的资源
          const existingLayoutIds = new Set(config.gridLayout.map((l: any) => l.i));
          const validLayout = config.gridLayout.filter((l: any) => {
            if (l.i.startsWith('group-')) {
              const gid = l.i.replace('group-', '');
              return config.groups?.some((g) => g.id === gid);
            }
            const rid = l.i.replace('resource-', '');
            // 只有当资源确实存在于 items 中，或者它在某个 group 中（但这里是 layout，layout只包含 standalone items 和 group containers）
            // 如果它被移到了 group 中，这里应该就没有它的 layout 了
            // 但为防万一，我们只保留 standalone items 和 groups
            const isStandalone = items.some((i) => i.id === rid) && !config.groups?.some((g) => g.resourceIds.includes(rid));
            return isStandalone;
          });

          const newLayouts: Layout[] = [];
          // 检查是否有未在 layout 中且未在 group 中的 items
          items.forEach((item, i) => {
            const inGroup = config.groups?.some((g) => g.resourceIds.includes(item.id));
            if (inGroup) return;

            const key = `resource-${item.id}`;
            if (!existingLayoutIds.has(key)) {
              newLayouts.push({
                i: key,
                x: (i * 3) % 12,
                y: Infinity,
                w: item.type === 'text' ? 12 : 3,
                h: 4
              });
            }
          });

          setCurrentLayout([...validLayout, ...newLayouts] as Layout[]);
        } else {
          // 否则生成初始布局
          const initialLayout = generateInitialLayout(items, config);
          setCurrentLayout(initialLayout);
        }
      } else {
        const defaultConfig = createDefaultLayoutConfig(items.map((i) => i.id));
        setLayoutConfig(defaultConfig);
        setCurrentLayout(generateInitialLayout(items, defaultConfig));
      }
      setLoading(false);
    };

    loadLayout();
  }, [folderId, items, generateInitialLayout]); // items 变化时可能需要合并新项

  // 保存布局
  const saveLayout = useCallback(
    async (newLayout: Layout[], newConfig: MasonryLayoutConfig) => {
      if (!folderId) return;
      const configToSave = {
        ...newConfig,
        gridLayout: newLayout
      };
      await saveMasonryLayout(folderId, configToSave);
      setLayoutConfig(configToSave);
      setCurrentLayout(newLayout);
    },
    [folderId]
  );

  // 处理高度变化
  const handleHeightChange = useCallback((id: string, height: number): void => {
    setCurrentLayout((prev) => {
      const index = prev.findIndex((l) => l.i === id);
      if (index === -1) return prev;

      const item = prev[index];
      // 计算所需的行数: (高度 + margin) / (行高 + margin)
      const h = Math.ceil((height + MARGIN[1]) / (ROW_HEIGHT + MARGIN[1]));

      if (item.h === h) return prev; // 高度未变

      const newLayout = [...prev];
      newLayout[index] = { ...item, h };
      return newLayout;
    });
  }, []);

  // RGL 布局改变回调
  const onLayoutChange = (layout: Layout[]): void => {
    if (!layoutConfig) return;

    // 过滤掉高度为 1 的异常情况（有时候初始化会这样）
    // 同时保留旧的高度，除非 RGL 确实改变了位置（RGL不会改变高度，除非是 resize handle，我们禁用了）
    const validLayout = layout.map((l) => ({
      ...l,
      h: currentLayout.find((cl) => cl.i === l.i)?.h || l.h
    }));

    setCurrentLayout(validLayout);
    saveLayout(validLayout, layoutConfig);
  };

  const handleRenameGroupInline = useCallback(
    (groupId: string, name: string): void => {
      if (!layoutConfig) return;
      const updatedConfig = renameGroup(layoutConfig, groupId, name);
      saveLayout(currentLayout, updatedConfig);
    },
    [layoutConfig, currentLayout, saveLayout]
  );

  const handleGroupLayoutQuickChange = useCallback(
    (groupId: string, layout: 'grid' | 'list'): void => {
      if (!layoutConfig) return;
      const updatedConfig = setGroupLayout(layoutConfig, groupId, layout);
      saveLayout(currentLayout, updatedConfig);
    },
    [layoutConfig, currentLayout, saveLayout]
  );

  const handleAddToGroup = (groupId: string): void => {
    if (!layoutConfig) return;
    const updatedConfig = addResourcesToGroup(layoutConfig, groupId, selectedForGroup);

    // 移除已加入分组的 items 的 layout
    const idsToRemove = selectedForGroup.map((id) => `resource-${id}`);
    const nextLayout = currentLayout.filter((l) => !idsToRemove.includes(l.i));

    saveLayout(nextLayout, updatedConfig);
    setAddToGroupOpen(false);
    setSelectedForGroup([]);
  };

  // 组织渲染数据
  const renderItems = useMemo(() => {
    if (!layoutConfig) return [];

    const elements: React.ReactNode[] = [];
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // 1. 渲染独立资源
    layoutConfig.items.forEach((layoutItem) => {
      if (layoutItem.groupId) return; // 属于分组的不在此渲染

      const item = itemMap.get(layoutItem.resourceId);
      if (!item) return;

      const key = `resource-${item.id}`;
      const isFullWidth = layoutItem.fullWidth || item.type === 'text';

      let content;
      if (item.type === 'text' && isFullWidth) {
        content = <FullWidthTextResource item={item} onPreview={() => onPreview?.(item, items.indexOf(item), items)} />;
      } else {
        content = (
          <ResourceGalleryItem
            item={item}
            selected={selectedItems.has(item.id)}
            onClick={onItemClick}
            onToggleFavorite={onToggleFavorite}
            onToggleVisibility={onToggleVisibility}
            onPreview={() => onPreview?.(item, items.indexOf(item), items)}
            draggable={false} // 禁用内部拖拽，使用 RGL 的拖拽
          />
        );
      }

      elements.push(
        <div key={key} data-grid={currentLayout.find((l) => l.i === key)}>
          <FreeLayoutItem id={key} onHeightChange={handleHeightChange}>
            <MasonryContextMenu
              item={item}
              selectedItems={selectedItems}
              isFullWidth={isFullWidth}
              onSetFullWidth={(fw) => {
                const updated = setResourceFullWidth(layoutConfig, item.id, fw);
                // 全宽 = 12, 否则 = 3
                const newW = fw ? 12 : 3;
                const newLayout = currentLayout.map((l) => (l.i === key ? { ...l, w: newW } : l));
                saveLayout(newLayout, updated);
              }}
              onCreateGroup={(ids) => {
                // 1. 创建 Group Config
                const updatedConfig = createGroup(layoutConfig, ids);
                const newGroup = updatedConfig.groups![updatedConfig.groups!.length - 1];

                // 2. 更新 Layout: 移除被合并的 item layout，添加 group layout
                const idsToRemove = ids.map((id) => `resource-${id}`);
                const nextLayout = currentLayout.filter((l) => !idsToRemove.includes(l.i));

                // 找到被合并项的第一个位置作为分组位置
                const firstItem = currentLayout.find((l) => idsToRemove.includes(l.i));

                nextLayout.push({
                  i: `group-${newGroup.id}`,
                  x: firstItem?.x || 0,
                  y: firstItem?.y || 0,
                  w: 12,
                  h: 6
                });

                saveLayout(nextLayout, updatedConfig);
              }}
              onAddToGroup={(ids) => {
                setSelectedForGroup(ids);
                setAddToGroupOpen(true);
              }}
            >
              {content}
            </MasonryContextMenu>
          </FreeLayoutItem>
        </div>
      );
    });

    // 2. 渲染分组
    layoutConfig.groups?.forEach((group) => {
      const groupItems = group.resourceIds.map((id) => itemMap.get(id)).filter(Boolean) as ResourceItem[];

      const key = `group-${group.id}`;

      elements.push(
        <div key={key} data-grid={currentLayout.find((l) => l.i === key)}>
          <FreeLayoutItem id={key} onHeightChange={handleHeightChange}>
            <ResourceGroup
              group={group}
              resources={groupItems}
              selectedItems={selectedItems}
              onItemClick={onItemClick}
              onToggleFavorite={onToggleFavorite}
              onToggleVisibility={onToggleVisibility}
              onPreview={onPreview as any}
              draggable={false}
              onRenameGroup={handleRenameGroupInline}
              onEditGroupLayout={handleGroupLayoutQuickChange}
              onDeleteGroup={async (gid) => {
                // 删除分组：资源释放回顶层
                const updatedGroups = layoutConfig.groups?.filter((g) => g.id !== gid) || [];
                const updatedItems = layoutConfig.items.map((i) => (i.groupId === gid ? { ...i, groupId: undefined } : i));

                const updatedConfig = { ...layoutConfig, groups: updatedGroups, items: updatedItems };

                // 更新 Layout: 移除 group layout, 添加 items layout
                const groupLayout = currentLayout.find((l) => l.i === key);
                const nextLayout = currentLayout.filter((l) => l.i !== key);

                // 将释放的 items 放到原来 group 的位置下面
                const startY = groupLayout?.y || Infinity;

                group.resourceIds.forEach((rid, idx) => {
                  nextLayout.push({
                    i: `resource-${rid}`,
                    x: (idx * 3) % 12,
                    y: startY, // RGL 会自动修正重叠
                    w: 3,
                    h: 4
                  });
                });

                saveLayout(nextLayout, updatedConfig);
              }}
            />
          </FreeLayoutItem>
        </div>
      );
    });

    return elements;
  }, [layoutConfig, currentLayout, items, selectedItems, handleHeightChange, saveLayout, onPreview, onItemClick, onToggleFavorite, onToggleVisibility]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="w-full relative">
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: currentLayout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={MARGIN}
        isDraggable={draggable}
        draggableHandle=".drag-handle"
        isResizable={true}
        onLayoutChange={onLayoutChange}
        useCSSTransforms={true}
      >
        {renderItems}
      </ResponsiveGridLayout>

      <AddToGroupDialog open={addToGroupOpen} onOpenChange={setAddToGroupOpen} groups={layoutConfig?.groups || []} onAdd={handleAddToGroup} />
    </div>
  );
};

export default ExplorerFreeLayout;
