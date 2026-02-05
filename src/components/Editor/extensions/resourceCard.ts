import type { Editor } from '@tiptap/react';
import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';

import { ResourceCardWrapper } from './wrappers/ResourceCardWrapper';

export type ResourceCardStatus = 'uploading' | 'ready' | 'processing' | 'new' | 'archived' | 'error';

export interface ResourceCardData {
  resourceId?: string;
  title?: string;
  description?: string;
  type?: string;
  sizeBytes?: number;
  filePath?: string;
  previewUrl?: string;
  thumbnailPath?: string;
  mimeType?: string;
  status?: ResourceCardStatus;
  errorMessage?: string;
}

export type ResourceUploadHandler = (file: File) => Promise<ResourceCardData | null | undefined>;

type ResourceCardAttrs = ResourceCardData & {
  tempId?: string;
};

const RESOURCE_CARD_JSON_ATTR = 'data-resource-card-json';

const buildPayload = (attrs: ResourceCardAttrs): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    payload[key] = value;
  });
  return payload;
};

const encodePayload = (attrs: ResourceCardAttrs): string => {
  try {
    return encodeURIComponent(JSON.stringify(buildPayload(attrs)));
  } catch {
    return '';
  }
};

const decodePayload = (element: HTMLElement): Record<string, unknown> => {
  const raw = element.getAttribute(RESOURCE_CARD_JSON_ATTR);
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return {};
  }
};

const getPayloadValue = (element: HTMLElement, key: keyof ResourceCardAttrs): unknown => {
  const payload = decodePayload(element);
  if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
    return payload[key];
  }
  const attrKey = String(key);
  return element.getAttribute(attrKey) ?? element.getAttribute(attrKey.toLowerCase());
};

const parseNumberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    resourceCard: {
      setResourceCard: (attrs: ResourceCardAttrs) => ReturnType;
    };
  }
}

const STORAGE_KEY_UPLOAD = 'resourceUploadHandler';

export const ResourceCard = Node.create({
  name: 'resourceCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'resource-card'
      }
    };
  },

  addAttributes() {
    return {
      tempId: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'tempId') || ''
      },
      resourceId: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'resourceId') || ''
      },
      title: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'title') || ''
      },
      description: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'description') || ''
      },
      type: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'type') || ''
      },
      sizeBytes: {
        default: 0,
        parseHTML: (element) => parseNumberValue(getPayloadValue(element, 'sizeBytes')) || 0
      },
      filePath: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'filePath') || ''
      },
      previewUrl: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'previewUrl') || ''
      },
      thumbnailPath: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'thumbnailPath') || ''
      },
      mimeType: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'mimeType') || ''
      },
      status: {
        default: 'ready',
        parseHTML: (element) => (getPayloadValue(element, 'status') as string) || 'ready'
      },
      errorMessage: {
        default: '',
        parseHTML: (element) => getPayloadValue(element, 'errorMessage') || ''
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-resource-card]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const payload = encodePayload(HTMLAttributes as ResourceCardAttrs);
    return [
      'div',
      mergeAttributes(
        {
          'data-resource-card': 'true',
          ...(payload ? { [RESOURCE_CARD_JSON_ATTR]: payload } : {})
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      )
    ];
  },

  addStorage() {
    return {
      [STORAGE_KEY_UPLOAD]: undefined as ResourceUploadHandler | undefined,
      markdown: {
        serialize(state: any, node: any) {
          if (!this.editor.storage.markdown?.options?.html) {
            state.write(`[resource-card:${node.attrs?.title || ''}]`);
            state.closeBlock(node);
            return;
          }
          const payload = encodePayload(node.attrs || {});
          const attrs = payload ? ` ${RESOURCE_CARD_JSON_ATTR}="${payload}"` : '';
          state.write(`<div data-resource-card="true"${attrs}></div>`);
          state.closeBlock(node);
        },
        parse: {
          // handled by markdown-it
        }
      }
    };
  },

  addCommands() {
    return {
      setResourceCard:
        (attrs) =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs
            })
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceCardWrapper);
  }
});

export const setResourceUploadHandler = (editor: Editor, handler?: ResourceUploadHandler): void => {
  if (editor.storage['resourceCard']) {
    editor.storage['resourceCard'][STORAGE_KEY_UPLOAD] = handler;
  }
};

export const getResourceUploadHandler = (editor: Editor): ResourceUploadHandler | undefined => {
  return editor.storage['resourceCard']?.[STORAGE_KEY_UPLOAD];
};

const updateResourceCardByTempId = (editor: Editor, tempId: string, attrs: Partial<ResourceCardAttrs>): void => {
  const { doc } = editor.state;
  let foundPos: number | null = null;
  let foundAttrs: ResourceCardAttrs | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name === 'resourceCard' && node.attrs?.tempId === tempId) {
      foundPos = pos;
      foundAttrs = node.attrs as ResourceCardAttrs;
      return false;
    }
    return true;
  });

  if (foundPos === null || !foundAttrs) {
    return;
  }

  editor.view.dispatch(editor.state.tr.setNodeMarkup(foundPos, undefined, { ...foundAttrs, ...attrs }));
};

export const insertResourceCardFromFile = async (editor: Editor, file: File): Promise<void> => {
  const handler = getResourceUploadHandler(editor);
  const tempId = `resource-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'resourceCard',
      attrs: {
        tempId,
        title: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        status: 'uploading'
      }
    })
    .run();

  if (!handler) {
    updateResourceCardByTempId(editor, tempId, { status: 'error', errorMessage: '未配置上传处理' });
    return;
  }

  try {
    const resource = await handler(file);
    if (!resource) {
      updateResourceCardByTempId(editor, tempId, { status: 'error', errorMessage: '上传失败' });
      return;
    }
    updateResourceCardByTempId(editor, tempId, {
      status: resource.status ?? 'ready',
      tempId: '',
      ...resource
    });
  } catch (error) {
    updateResourceCardByTempId(editor, tempId, { status: 'error', errorMessage: error instanceof Error ? error.message : '上传失败' });
  }
};

export default ResourceCard;
