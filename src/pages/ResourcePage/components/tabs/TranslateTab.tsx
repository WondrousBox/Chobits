import React, { useEffect, useState } from 'react';
import { TbLanguage, TbRefresh } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useResourceTabContext } from './ResourceTabContext';

interface TranslationRecord {
  id: string;
  language?: string;
  title?: string;
  filePath?: string;
  segments?: Array<{ index: number; text: string }>;
  createdAt?: number;
  updatedAt?: number;
}

// 语言代码到中文名称的映射
const languageNames: Record<string, string> = {
  en: '英语',
  zh: '中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  ja: '日语',
  ko: '韩语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  fr: '法语',
  pt: '葡萄牙语',
  it: '意大利语',
  ar: '阿拉伯语',
  hi: '印地语',
  vi: '越南语',
  th: '泰语',
  tr: '土耳其语',
  nl: '荷兰语',
  pl: '波兰语',
  id: '印尼语',
  ms: '马来语'
};

/**
 * 获取语言的显示名称
 */
const getLanguageLabel = (code?: string): string => {
  if (!code) return '未知语言';
  return languageNames[code] || code;
};

/**
 * 翻译 Tab 组件
 * 用于显示资源的所有翻译历史记录
 */
const TranslateTab: React.FC = () => {
  const { resource, activeSubtitle } = useResourceTabContext();
  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 优先使用 activeSubtitle，如果没有则使用 resource
  const targetResource = activeSubtitle || resource;

  // 加载所有翻译历史（不筛选）
  const loadTranslations = async () => {
    if (!targetResource?.id) return;

    setLoading(true);
    try {
      const result = await window.YUA.ai.getAllTranslationHistory(targetResource.id);
      setTranslations(result || []);
    } catch (error) {
      console.error('加载翻译历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTranslations();
  }, [targetResource?.id]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">加载翻译数据中...</div>;
  }

  if (translations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
        <TbLanguage className="w-12 h-12 opacity-50" />
        <p>暂无翻译记录</p>
        <p className="text-xs">请先为此资源创建翻译</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2">
          <TbLanguage className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">翻译历史</span>
          <span className="text-xs text-muted-foreground">({translations.length})</span>
        </div>
        <Button size="icon" className="w-8 h-8" variant="ghost" onClick={loadTranslations}>
          <TbRefresh />
        </Button>
      </div>

      {/* 翻译列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {translations.map((trans) => (
            <div key={trans.id} className="border rounded-lg p-2 hover:bg-accent/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 flex items-center justify-between">
                  {/* 标题和语言 */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{getLanguageLabel(trans.language)}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{trans.segments?.length || 0} 个片段</span>
                  </div>

                  {/* 时间信息 */}
                  {trans.updatedAt && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(trans.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranslateTab;
