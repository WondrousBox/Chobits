import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';

import { getDatasetAttribute } from '../utils';
import { TimestampWrapper } from './wrappers/TimestampWrapper';

type ITimestampAttrs = {
  nid?: string;
  href?: string;
  time?: string;
  target?: string;
};

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    timestamp: {
      setTimestamp: (arg: ITimestampAttrs) => ReturnType;
    };
  }
}

export const Timestamp = Node.create({
  name: 'timestamp',
  group: 'inline',
  inline: true,
  selectable: false,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      nid: {
        default: '',
        parseHTML: getDatasetAttribute('nid')
      },
      time: {
        default: '',
        parseHTML: getDatasetAttribute('time')
      },
      href: {
        default: '',
        parseHTML: getDatasetAttribute('href')
      },
      target: {
        default: '_blank',
        parseHTML: getDatasetAttribute('target')
      }
    };
  },

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'timestamp'
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a.timestamp'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), HTMLAttributes.time];
  },

  addCommands() {
    return {
      setTimestamp: (options) => {
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
    return ReactNodeViewRenderer(TimestampWrapper);
  }
});
