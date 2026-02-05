import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Color } from '@tiptap/extension-color';
// import Document from '@tiptap/extension-document'
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
// import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import type { AnyExtension } from '@tiptap/react';
import { InputRule, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
// import css from 'highlight.js/lib/languages/css'
// import js from 'highlight.js/lib/languages/javascript'
// import ts from 'highlight.js/lib/languages/typescript'
// import html from 'highlight.js/lib/languages/xml'
// load all highlight.js languages
import { lowlight } from 'lowlight';

import { Countdown } from './countdown';
// lowlight.registerLanguage('html', html)
// lowlight.registerLanguage('css', css)
// lowlight.registerLanguage('js', js)
// lowlight.registerLanguage('ts', ts)
import SlashCommand from './SlashCommand';
import { Status } from './status';
import { Timestamp } from './timestamp';
import CodeBlockComponent from './wrappers/CodeBlockComponent';
import type { MentionItem } from './wrappers/mentionItems';
import { createSuggestion } from './wrappers/suggestion';

// const CustomDocument = Document.extend({
//   content: 'heading block*',
// })

/**
 * 创建完整的编辑器扩展配置
 * @param mentionItems 自定义 mention 项列表
 * @returns 扩展数组
 */
export const createFullExtensions = (mentionItems?: MentionItem[]): AnyExtension[] => {
  const suggestionConfig = createSuggestion(mentionItems);

  return [
    // CustomDocument,
    Color.configure({
      // types: [TextStyle.name, ListItem.name]
    }),
    TextStyle.configure({
      // types: [ListItem.name]
    }),
    SlashCommand,
    StarterKit.configure({
      // document: false,
      // bulletList: {
      //   keepMarks: true,
      //   keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
      // },
      // orderedList: {
      //   keepMarks: true,
      //   keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
      // },
      bulletList: {
        HTMLAttributes: {
          class: 'list-disc list-outside leading-3'
        }
      },
      orderedList: {
        HTMLAttributes: {
          class: 'list-decimal list-outside leading-3'
        }
      },
      listItem: {
        HTMLAttributes: {
          class: 'leading-normal'
        }
      },
      blockquote: {
        HTMLAttributes: {
          class: 'border-l-4 border-secondary pl-2'
        }
      },
      codeBlock: false,
      // codeBlock: {
      //   HTMLAttributes: {
      //     class:
      //       "rounded-sm bg-stone-100 p-5 font-mono font-medium text-stone-800",
      //   },
      // },
      code: {
        HTMLAttributes: {
          class: 'rounded-md bg-stone-200 px-1.5 py-1 font-mono font-medium text-black'
        }
      },
      horizontalRule: false,
      dropcursor: {
        color: '#DBEAFE',
        width: 4
      },
      gapcursor: false
    }),
    Mention.configure({
      HTMLAttributes: {
        class: 'mention'
      },
      suggestion: suggestionConfig,
      renderLabel({ options, node }) {
        return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
      }
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          return '输入标题';
        }

        return `输入 '/' 打开命令`;
      }
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: 'rounded-lg border border-stone-200'
      }
    }),

    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockComponent);
      }
    }).configure({ lowlight, defaultLanguage: 'javascript' }),
    Underline,
    // patch to fix horizontal rule bug: https://github.com/ueberdosis/tiptap/pull/3859#issuecomment-1536799740
    HorizontalRule.extend({
      addInputRules() {
        return [
          new InputRule({
            find: /^(?:---|—-|___\s|\*\*\*\s)$/,
            handler: ({ state, range }) => {
              const attributes = {};

              const { tr } = state;
              const start = range.from;
              const end = range.to;

              tr.insert(start - 1, this.type.create(attributes)).delete(tr.mapping.map(start), tr.mapping.map(end));
            }
          })
        ];
      }
    }).configure({
      HTMLAttributes: {
        class: 'mt-4 mb-6 border-t border-stone-300'
      }
    }),
    Link.configure({
      HTMLAttributes: {
        class: 'text-stone-400 underline underline-offset-[3px] hover:text-stone-600 transition-colors cursor-pointer'
      }
    }),
    TaskList.configure({
      HTMLAttributes: {
        class: 'not-prose pl-2'
      }
    }),
    TaskItem.configure({
      HTMLAttributes: {
        class: 'flex items-start mb-2'
      }
    }),
    Countdown,
    Status,
    Timestamp
  ];
};

// 导出默认扩展配置（使用默认 mention 项）
export const extensions = createFullExtensions();
