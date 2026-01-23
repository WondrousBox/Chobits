import { CommandProps, mergeAttributes, Node, nodeInputRule } from '@tiptap/react';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { getDatasetAttribute } from '../utils';
import { CountdownWrapper } from './wrappers/CountdownWrapper';

type ICountdownAttrs = {
  color?: string;
  date?: string;
};

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    countdown: {
      setCountdown: (attrs: ICountdownAttrs) => ReturnType;
    };
  }
}

export const Countdown = Node.create({
  name: 'countdown',
  content: '',
  marks: '',
  group: 'block',
  selectable: true,
  atom: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'countdown'
      }
    };
  },

  addAttributes() {
    return {
      title: {
        default: '倒计时⏰',
        parseHTML: getDatasetAttribute('title')
      },
      date: {
        default: Date.now().valueOf() + 60 * 1000,
        parseHTML: getDatasetAttribute('date')
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[class=countdown]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addCommands() {
    return {
      setCountdown: (options) => {
        return ({
          tr,
          commands,
          chain
          // editor
        }: CommandProps) => {
          // @ts-ignore
          if (tr.selection?.node?.type?.name == this.name) {
            return commands.updateAttributes(this.name, options);
          }

          // const { selection } = editor.state;

          return chain()
            .insertContent({
              type: this.name,
              attrs: options
            })
            .run();
        };
      }
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /^\$countdown\$$/,
        type: this.type,
        getAttributes: () => {
          return { width: '100%' };
        }
      })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CountdownWrapper);
  }
});
