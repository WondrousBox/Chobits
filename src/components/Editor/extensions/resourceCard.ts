import type { Editor } from '@tiptap/react';
import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react';

import { ResourceCardWrapper } from './wrappers/ResourceCardWrapper';

export type ResourceCardStatus = 'uploading' | 'ready' | 'error';

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
        default: ''
      },
      resourceId: {
        default: ''
      },
      title: {
        default: ''
      },
      description: {
        default: ''
      },
      type: {
        default: ''
      },
      sizeBytes: {
        default: 0
      },
      filePath: {
        default: ''
      },
      previewUrl: {
        default: ''
      },
      thumbnailPath: {
        default: ''
      },
      mimeType: {
        default: ''
      },
      status: {
        default: 'ready'
      },
      errorMessage: {
        default: ''
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
    return ['div', mergeAttributes({ 'data-resource-card': 'true' }, this.options.HTMLAttributes, HTMLAttributes)];
  },

  addStorage() {
    return {
      [STORAGE_KEY_UPLOAD]: undefined as ResourceUploadHandler | undefined
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
