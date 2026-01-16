# File Drop-Drop Menu Skill

## Overview

This skill provides comprehensive knowledge of the Chobits AI assistant's file drag-drop menu system. It enables AI assistants to understand, modify, and extend the file handling workflow.

## Skill Structure

```
.claude/skills/file-drop-menu/
├── SKILL.md          # Main skill documentation (required by Claude Code)
└── README.md         # This file
```

## What This Skill Covers

- **Core Architecture**: Component breakdown and data flow
- **File Type Detection**: How the system identifies file types
- **Action Creation**: Step-by-step guide for adding new menu actions
- **Window Configuration**: Menu window settings and behavior
- **IPC Communication**: How components communicate via Electron IPC
- **Radial Menu UI**: Customization options and navigation patterns
- **Sprite Animation**: Three-phase animation system for drag events
- **Resource Integration**: Automatic file import to database
- **Common Patterns**: Reusable code patterns and best practices

## How to Use This Skill

### For AI Assistants

When an AI assistant loads this skill, it will automatically have access to the complete knowledge base for working with the file drag-drop menu system. It can:

1. Understand the complete file drag-drop workflow
2. Add new file type detections
3. Create new menu actions for existing or new file types
4. Modify menu appearance and behavior
5. Debug issues with the file drop system
6. Integrate with workflow automation

### Example Prompts

```
Add a new action to the file menu for .txt files that opens the text editor

Create a batch operation that compresses all dropped images into a zip file

Change the radial menu radius from 140px to 180px

Fix an issue where the file actions menu doesn't open when dropping PDFs
```

## Key Concepts

### The 8-Step Flow

1. **Drag Enter**: User drags files onto sprite
2. **Animation**: Sprite plays "fileDragOver" animation
3. **File Drop**: User releases files
4. **Import**: Files are added to database
5. **Menu Open**: Radial menu appears with context-aware actions
6. **Selection**: User picks an action
7. **Execution**: Action runs (workflow or AI processing)
8. **Close**: Menu window closes

### File Type System

The system uses a simple string-based type system:

- `doc`, `audio`, `video`, `image`, `pdf`, `other`

Each type maps to a set of relevant actions (e.g., audio files get "transcribe" and "compress" options).

### Action Handler Pattern

All actions follow this pattern:

```typescript
{
  id: 'action-id',
  label: 'Display Label',
  icon: '🎯',
  run: async () => {
    await doSomething();
    await window.YUA.window['window:close']('fileActionsMenu');
  }
}
```

## Development Workflow

### Quick Start: Adding a Simple Action

1. Open `src/pages/FileActionsMenu/FileActionsMenu.tsx`
2. Find the `actions` useMemo (line ~66)
3. Add your action in the appropriate file type section:

```typescript
if (kind === 'video') {
  list.push({
    id: 'your-action',
    label: 'Your Action',
    icon: '🎬',
    run: async () => {
      // Your code here
      await window.YUA.window['window:close']('fileActionsMenu');
    }
  });
}
```

4. Save and test

### Intermediate: Creating a Workflow Action

```typescript
const runWorkflow = async (defId: string, purpose: string) => {
  if (!primary) return;

  await runWorkflowUtil({
    defId,
    input: { resource: primary, resourceId: primary.id },
    metadata: {
      resourceId: primary.id,
      resourceName: primary.title,
      thumbnailPath: primary.thumbnailPath,
      workspaceId: primary.workspaceId
    }
  });
};

// Then use it
list.push({
  id: 'transcribe',
  label: 'Transcribe Audio',
  icon: '🗣️',
  run: () => closeAfter(() => runWorkflow('sample:transcribe', 'audio transcription'))
});
```

### Advanced: Adding a New File Type

1. **Detect the type** in `guessKind()`:

```typescript
if (/\.your-ext$/.test(ext) || /^your-mime\//.test(mime)) {
  return 'your-type';
}
```

2. **Add actions** in the `actions` useMemo:

```typescript
if (kind === 'your-type') {
  list.push({
    /* action 1 */
  });
  list.push({
    /* action 2 */
  });
}
```

3. **Test** by dropping a file with that extension

## Troubleshooting

### Menu Not Appearing

1. Check browser console for errors
2. Verify `window:open('fileActionsMenu')` is called in `useFileDrop.ts:57,73`
3. Ensure files array is not empty
4. Check window configuration in `electron/main/config/window.ts`

### Action Not Executing

1. Verify action `run` function is async
2. Check for uncaught errors
3. Ensure `window:close()` is called (use `closeAfter` helper)
4. Check workflow ID if using workflow action

### Wrong File Type Detected

1. Check `guessKind()` function logic
2. Verify file extension and MIME type
3. Test with console logging: `console.log(guessKind({name: file.name, mime: file.mime}))`

## Related Skills

Consider pairing this skill with:

- **Workflow Skill**: For creating automated file processing pipelines
- **Resource Management Skill**: For understanding how files are stored and organized
- **AI Chat Skill**: For actions that integrate with conversational AI

## Version History

- **v1.0** (2025-01-16): Initial version with complete workflow documentation
