import { ReactRenderer } from '@tiptap/react';
import { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { type Instance } from 'tippy.js';

import { MentionList } from './MentionList';

const suggestion: Omit<SuggestionOptions, 'editor'> = {
  items: ({ query }) => {
    return [
      {
        value: 'timestamp',
        label: '视频时间'
      },
      {
        value: 'screenshot',
        label: '视频截图'
      }
    ].filter((item) => item.label.toLowerCase().startsWith(query.toLowerCase()));
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

export default suggestion;
