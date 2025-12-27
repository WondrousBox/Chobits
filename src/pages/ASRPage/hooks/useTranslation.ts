import { useCallback, useRef } from 'react';

interface UseTranslationProps {
  enableTranslation: boolean;
  targetLanguage: string;
  providerId: string;
}

export const useTranslation = ({ enableTranslation, targetLanguage, providerId }: UseTranslationProps) => {
  const translationStreamRef = useRef<{ dispose: () => void; cancel: () => Promise<any> } | null>(null);
  const translationCacheRef = useRef<Map<string, string>>(new Map());

  const translateText = useCallback(
    async (text: string, onUpdate?: (translation: string) => void): Promise<void> => {
      if (!enableTranslation || !text.trim() || !providerId) return;

      // 检查缓存
      const cacheKey = `${text}_${targetLanguage}`;
      if (translationCacheRef.current.has(cacheKey)) {
        onUpdate?.(translationCacheRef.current.get(cacheKey)!);
        return;
      }

      // 取消之前的翻译请求
      if (translationStreamRef.current) {
        try {
          await translationStreamRef.current.cancel();
          translationStreamRef.current.dispose();
        } catch (error) {
          console.error('取消翻译失败:', error);
        }
        translationStreamRef.current = null;
      }

      try {
        const languageNames: Record<string, string> = {
          en: '英语',
          zh: '中文',
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
          th: '泰语'
        };

        const targetLangName = languageNames[targetLanguage] || targetLanguage;
        const prompt = `请将以下文本翻译成${targetLangName}，只返回翻译结果，不要添加任何解释或说明：\n\n${text}`;

        let currentTranslation = '';

        const stream = await window.YUA.ai.chatStreamEphemeral(
          {
            messages: [{ role: 'user', content: prompt }],
            providerId,
            stream: true
          },
          (ev: any) => {
            if (ev.type === 'connected') {
              // 连接成功
            } else if (ev.type === 'delta' && ev.data?.text) {
              currentTranslation += ev.data.text;
              onUpdate?.(currentTranslation);
            } else if (ev.type === 'message_completed' && ev.data?.message?.content) {
              const translation = ev.data.message.content.trim();
              // 缓存翻译结果
              translationCacheRef.current.set(cacheKey, translation);
              onUpdate?.(translation);
            } else if (ev.type === 'error') {
              console.error('翻译错误:', ev.data);
            } else if (ev.type === 'done') {
              if (translationStreamRef.current) {
                translationStreamRef.current.dispose();
                translationStreamRef.current = null;
              }
            }
          }
        );

        translationStreamRef.current = stream;
      } catch (error) {
        console.error('翻译失败:', error);
      }
    },
    [enableTranslation, targetLanguage, providerId]
  );

  const cleanupTranslation = useCallback(() => {
    if (translationStreamRef.current) {
      translationStreamRef.current.dispose();
      translationStreamRef.current = null;
    }
  }, []);

  return {
    translateText,
    cleanupTranslation,
    translationCacheRef
  };
};
