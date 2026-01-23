import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';

import { getDatasetAttribute } from '../utils';
import { STATUS_COLORS, StatusWrapper } from './wrappers/StatusWrapper';

type IStatusAttrs = {
  color?: string;
  text?: string;
};

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    status: {
      setStatus: (arg: IStatusAttrs) => ReturnType;
    };
  }
}

export const Status = Node.create({
  name: 'status',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      defaultShowPicker: {
        default: false
      },
      color: {
        default: STATUS_COLORS[0][1],
        parseHTML: getDatasetAttribute('color')
      },
      bgcolor: {
        default: STATUS_COLORS[0][2],
        parseHTML: getDatasetAttribute('bgcolor')
      },
      borderColor: {
        default: STATUS_COLORS[0][3],
        parseHTML: getDatasetAttribute('borderColor')
      },
      text: {
        default: '',
        parseHTML: getDatasetAttribute('text')
      }
    };
  },

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'status'
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.status'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addCommands() {
    return {
      setStatus: (options) => {
        return ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options
          });
        };
      }
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatusWrapper);
  }
});
