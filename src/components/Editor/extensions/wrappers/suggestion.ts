import { ReactRenderer } from '@tiptap/react';
import { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance } from 'tippy.js';

import { defaultMentionItems, type MentionItem } from './mentionItems';
import { MentionList } from './MentionList';

/**
 * 创建一个可配置的 suggestion 配置
 * @param items 自定义 mention 项列表，如果不传则使用默认列表
 */
export const createSuggestion = (items?: MentionItem[]): Omit<SuggestionOptions, 'editor'> => {
  const mentionItems = items || defaultMentionItems;

  return {
    items: ({ query }) => {
      return mentionItems.filter((item) => item.label.toLowerCase().startsWith(query.toLowerCase()));
    },

    render: () => {
      let reactRenderer: ReactRenderer;
      let popup: Instance[] | undefined;

      return {
        onStart: (props) => {
          reactRenderer = new ReactRenderer(MentionList, {
            props,
            editor: props.editor
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start'
          });
        },

        onUpdate(props) {
          reactRenderer.updateProps(props);

          if (!props.clientRect || !popup) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect
          });
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            popup?.[0].hide();

            return true;
          }

          return (reactRenderer.ref as any)?.onKeyDown(props);
        },

        onExit() {
          popup?.[0].destroy();
          reactRenderer.destroy();
        }
      };
    }
  };
};

// 默认导出使用默认 mention 项
const suggestion = createSuggestion();

export default suggestion;
