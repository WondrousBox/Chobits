import React, { useCallback, useEffect, useState } from 'react';
import { TbLoader2, TbSearch, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface IconSelectorProps {
  value: string;
  onChange: (svg: string) => void;
}

interface IconifyIcon {
  name: string;
  prefix: string;
}

const IconSelector: React.FC<IconSelectorProps> = ({ value, onChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [icons, setIcons] = useState<IconifyIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [manualSvg, setManualSvg] = useState(value || '');

  // 当 value 变化时同步 manualSvg
  useEffect(() => {
    setManualSvg(value || '');
  }, [value]);

  // 搜索图标
  const searchIcons = useCallback(async (query: string) => {
    if (!query.trim()) {
      setIcons([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefixes=tabler&limit=100`);
      const data = await response.json();
      if (data.icons && Array.isArray(data.icons)) {
        setIcons(
          data.icons.map((iconName: string) => ({
            name: iconName.replace('tabler:', ''),
            prefix: 'tabler'
          }))
        );
      } else {
        setIcons([]);
      }
    } catch (error) {
      console.error('搜索图标失败:', error);
      setIcons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      searchIcons(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchIcons]);

  // 获取图标 SVG
  const fetchIconSvg = useCallback(async (iconName: string): Promise<string | null> => {
    try {
      const response = await fetch(`https://api.iconify.design/tabler/${iconName}.svg`);
      if (response.ok) {
        const svg = await response.text();
        return svg;
      }
    } catch (error) {
      console.error('获取图标 SVG 失败:', error);
    }
    return null;
  }, []);

  // 选择图标
  const handleSelectIcon = useCallback(
    async (iconName: string) => {
      setSelectedIcon(iconName);
      const svg = await fetchIconSvg(iconName);
      if (svg) {
        onChange(svg);
        setManualSvg(svg);
      } else {
        toast.error('获取图标失败', { description: `无法获取图标: ${iconName}` });
      }
    },
    [fetchIconSvg, onChange]
  );

  // 清除选择
  const handleClear = useCallback(() => {
    setSelectedIcon(null);
    setManualSvg('');
    onChange('');
  }, [onChange]);

  return (
    <Tabs defaultValue="iconify" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="iconify">从 Iconify 选择</TabsTrigger>
        <TabsTrigger value="manual">手动输入 SVG</TabsTrigger>
      </TabsList>
      <TabsContent value="iconify" className="space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <TbSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索图标（例如：photo, image, camera）" className="pl-8" />
          </div>
          {selectedIcon && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>已选择: {selectedIcon}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={handleClear}>
                <TbX className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <ScrollArea className="h-[300px] border rounded">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <TbLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : icons.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">{searchQuery ? '未找到图标' : '输入关键词搜索图标'}</div>
          ) : (
            <div className="grid grid-cols-8 gap-2 p-4">
              {icons.map((icon) => {
                const iconUrl = `https://api.iconify.design/${icon.prefix}/${icon.name}.svg`;
                return (
                  <button
                    key={`${icon.prefix}:${icon.name}`}
                    onClick={() => handleSelectIcon(icon.name)}
                    className={`flex items-center justify-center aspect-square border rounded hover:bg-accent transition-colors ${selectedIcon === icon.name ? 'border-primary bg-primary/10' : ''}`}
                    title={icon.name}
                  >
                    <img
                      src={iconUrl}
                      alt={icon.name}
                      className="w-5 h-5"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="manual" className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">SVG 图标代码</label>
          <textarea
            value={manualSvg}
            onChange={(e) => {
              setManualSvg(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="粘贴 SVG 代码，例如：<svg>...</svg>"
            className="min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono box-border resize-y"
          />
        </div>
        {manualSvg.trim() && (
          <div className="space-y-2">
            <label className="text-sm font-medium">预览</label>
            <div className="border rounded p-4 bg-muted flex items-center justify-center min-h-[100px]" dangerouslySetInnerHTML={{ __html: manualSvg }} />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default IconSelector;
