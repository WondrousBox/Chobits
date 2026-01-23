import { EditorProps } from '@tiptap/pm/view';

export const handleImageUpload = (
  file: File
  // view: EditorView,
  // event: ClipboardEvent | DragEvent | Event,
) => {
  // check if the file is an image
  if (!file.type.includes('image/')) {
    alert('File type not supported.');

    // check if the file size is less than 50MB
  } else if (file.size / 1024 / 1024 > 50) {
    alert('File size too big (max 50MB).');
  } else {
  }
};

export const TiptapEditorProps: EditorProps = {
  attributes: {
    class: 'prose-lg prose-headings:font-display focus:outline-none'
  },
  handleDOMEvents: {
    keydown: (_view, event) => {
      // prevent default event listeners from firing when slash command is active
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
        const slashCommand = document.querySelector('#slash-command');
        if (slashCommand) {
          return true;
        }
      }
    }
  },
  handlePaste: (view, event) => {
    console.log(view);

    if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
      event.preventDefault();
      const file = event.clipboardData.files[0];

      return handleImageUpload(
        file
        // view, event
      );
    }
    return false;
  },
  handleDrop: (view, event, _slice, moved) => {
    console.log(view);
    if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      return handleImageUpload(
        file
        // view, event
      );
    }
    return false;
  }
};
