# File Drag-Drop Menu Skill

This skill provides deep knowledge of the Chobits AI assistant's file drag-drop menu system, enabling AI assistants to understand, modify, and extend the file handling workflow.

## Overview

The Chobits AI assistant features a sophisticated file drag-drop system that allows users to drag files onto the floating sprite, triggering a radial menu with context-aware actions. The system seamlessly integrates with the resource database and workflow automation engine.

## Key Concepts

### Component Architecture

- **useFileDrop Hook**: Manages file drag events (`hooks/useFileDrop.ts`)
- **AIAssistant Component**: Orchestrates sprite animations and state (`AIAssistant.tsx`)
- **FileActionsMenu**: Renders the radial menu with file-type-specific actions (`src/pages/FileActionsMenu/FileActionsMenu.tsx`)
- **RadialMenu Component**: Provides the circular menu UI (`src/components/common/RadialMenu/RadialMenu.tsx`)
- **Window Manager**: Handles menu window lifecycle (`electron/main/config/window.ts`)

### Core Flow

1. User drags files onto sprite → `handleDragEnter` triggers
2. Sprite plays animation (intro → loop → outro if configured)
3. User drops files → `handleDrop` processes files
4. Files are imported to database via `addResourcesFromDataTransfer()`
5. Menu window opens with IPC call: `window:open('fileActionsMenu', { files, resources })`
6. Menu renders context-aware actions based on file type
7. User selects action → executes workflow or opens assistant
8. Window closes automatically

## File Type Detection

The system detects file types using `guessKind()` function:

```typescript
function guessKind(file: FileInfo): 'doc' | 'audio' | 'video' | 'image' | 'pdf' | 'subtitle' | 'other';
```

Detection criteria:

- **doc**: `.docx`, `.doc`, MIME type `word/*`
- **audio**: `.mp3`, `.wav`, `.m4a`, `.flac`, `.aac`, `.ogg`, MIME `audio/*`
- **video**: `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, MIME `video/*`
- **image**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.tiff`, MIME `image/*`
- **pdf**: `.pdf`, MIME `pdf`
- **subtitle**: `.srt`, `.vtt`, `.ass`
- **other**: Everything else

## Adding New Actions

### Step 1: Define the Action

In `FileActionsMenu.tsx`, add action to the `actions` useMemo:

```typescript
if (kind === 'your-file-type') {
  list.push({
    id: 'your-action-id',
    label: 'Action Label',
    icon: '🎯',
    run: async () => {
      // Your action logic
      await performYourAction();

      // Close menu after execution
      await window.YUA.window['window:close']('fileActionsMenu');
    }
  });
}
```

### Step 2: Handle Menu Closing

Use the `closeAfter` helper pattern:

```typescript
const closeAfter = async (fn: () => Promise<void> | void): Promise<void> => {
  try {
    await fn();
  } finally {
    await window.YUA.window['window:close']('fileActionsMenu');
  }
};
```

### Step 3: Workflow Execution

For workflow-based actions:

```typescript
await runWorkflowUtil({
  defId: 'your-workflow-id',
  input: { resource: primary, resourceId: primary.id },
  metadata: {
    resourceId: primary.id,
    resourceName: primary.title || 'Unknown',
    thumbnailPath: primary.thumbnailPath,
    workspaceId: primary.workspaceId
  },
  onSuccess: (runId) => console.log('Workflow started:', runId),
  onError: () => console.warn('Workflow failed')
});
```

## Window Configuration

The file actions menu window is configured in `electron/main/config/window.ts`:

```typescript
fileActionsMenu: {
  routeHash: 'file-actions',           // URL: #/file-actions
  width: 640, height: 640,           // Square 640x640 window
  transparent: true,                    // Transparent background
  followMain: true,                    // Follows main window
  forceCenterAlignment: true,           // Centered on screen
  closeOnBlur: true,                   // Close when focus lost
  alwaysOnTop: true,                   // Stays above other windows
  parent: 'main'                       // Child of main window
}
```

## IPC Communication

### Open Menu Window

```typescript
window.YUA.window['window:open']('fileActionsMenu', {
  files: [{ name: 'example.pdf', path: '/path/to/file' }],
  resources: [{ id: 'res-123', title: 'Example', filePath: '/path/to/file' }],
  source: 'drop'
});
```

### Receive Data (in FileActionsMenu)

```typescript
useEffect(() => {
  const handler = (_, payload) => {
    setResources(payload.resources);
  };
  window.ipcRenderer?.on('on:window:open:ready', handler);
  return () => window.ipcRenderer?.off('on:window:open:ready', handler);
}, []);
```

### Close Menu Window

```typescript
window.YUA.window['window:close']('fileActionsMenu');
```

## Radial Menu Customization

### Basic Props

```typescript
<RadialMenu
  items={radialItems}                  // Array of action items
  open={true}                          // Show/hide menu
  anchor={{ x: 320, y: 320 }}        // Center position (optional)
  size={600}                          // Container size (default: 600)
  radii={{ level1: 140, level2: 130 }} // Ring radii (optional)
  onClose={() => handleClose()}         // Close callback
/>
```

### Radial Item Structure

```typescript
{
  id: 'unique-id',
  label: 'Action Name',                // Display label
  icon: '🎯',                        // Emoji or ReactNode
  shortcut?: '1',                     // Optional keyboard shortcut (1-9)
  action: () => void,                 // Action handler
  children?: RadialMenuItem[]           // Optional sub-menu
}
```

### Keyboard Navigation

- **1-9**: Select action by number
- **Arrow keys**: Navigate through items
- **Enter/Space**: Execute selected action
- **Esc**: Close menu (or return to parent if in submenu)

## Sprite Animation System

### Animation States

The sprite responds to file drag events:

```typescript
// File enters drag zone
setAssistantState('fileDragOver');
playAnimation(); // Plays configured 3-phase animation

// File is dropped
setAssistantState('fileDrop');
handleDrop(); // Process files and open menu
```

### Three-Phase Animation

Configured in sprite JSON (`sprite.json` or in database):

```json
{
  "loopStartMs": 1500,
  "loopEndMs": 2500,
  "durationMs": 3000
}
```

- **0-1500ms**: Intro (played once)
- **1500-2500ms**: Loop (repeats until interrupted)
- **2500-3000ms**: Outro (played on stop)

## Resource Integration

Files are automatically imported via:

```typescript
import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '@/pages/ResourcePage/services/resourceService';

// From drag-drop event
const resources = await addResourcesFromDataTransfer(e.dataTransfer);

// From selected file dialog
const resources = await addResourcesFromSelectedFiles(files);
```

Resources are stored in SQLite database with metadata:

- File path and title
- MIME type detection
- Thumbnail generation (for images/videos)
- Workspace association
- Folder organization

## Common Patterns

### Adding a New File Type

1. Extend `guessKind()` function:

```typescript
if (/\.your-ext$/.test(ext) || /^your-mime\//.test(mime)) {
  return 'your-type';
}
```

2. Add actions in `FileActionsMenu.tsx`:

```typescript
if (kind === 'your-type') {
  list.push({ id: 'action1', label: 'Action 1', icon: '🎯', run: action1 });
  list.push({ id: 'action2', label: 'Action 2', icon: '🔧', run: action2 });
}
```

**Example: Subtitle File Type**

The subtitle file type was added as follows:

```typescript
// 1. File type detection
if (/^(srt|vtt|ass)$/i.test(ext)) return 'subtitle';

// 2. Action handlers
const openSubtitlePreview = (): Promise<void> =>
  closeAfter(async () => {
    if (!primary?.id) return;
    await window.YUA.window['window:open']('resourcePreview', {
      current: primary
    });
  });

const translateSubtitle = (): Promise<void> =>
  closeAfter(async () => {
    if (!primary?.id) return;
    await window.YUA.window['window:open']('resourcePreview', {
      current: primary
    });
  });

// 3. Add to menu
if (kind === 'subtitle') {
  list.push({ id: 'subtitle-view', label: '查看字幕', icon: '📺', run: openSubtitlePreview });
  list.push({ id: 'subtitle-translate', label: '翻译字幕', icon: '🌐', run: translateSubtitle });
}
```

### Opening Assistant Window with Context

```typescript
const openAssistant = () =>
  closeAfter(async () => {
    await window.YUA.window['window:open']('assistant');
  });
```

### Conditional Actions Based on File Count

```typescript
const multipleFiles = resources.length > 1;
if (multipleFiles) {
  list.push({
    id: 'batch-process',
    label: 'Batch Process All Files',
    icon: '📦',
    run: async () => {
      for (const res of resources) {
        await processResource(res);
      }
    }
  });
}
```

## Troubleshooting

### Menu Not Opening

- Check if `window:open` is being called
- Verify `files` array is not empty
- Check window configuration in `window.ts`

### Actions Not Executing

- Ensure `run` function is async/await
- Check for uncaught errors in action
- Verify `window:close` is called after execution

### File Type Detection Failing

- Check file extension regex in `guessKind()`
- Verify MIME type is passed correctly
- Test with actual files of the target type

### Animation Not Playing

- Verify sprite has `loopStartMs` and `loopEndMs` configured
- Check `fileDragOver` state is set
- Ensure `playAnimation()` is called

## Best Practices

1. **Always close the menu** after action execution using `closeAfter` helper
2. **Use resource metadata** (`resourceId`, `workspaceId`) in workflows
3. **Provide meaningful icons** (emoji or custom icons) for better UX
4. **Handle errors gracefully** with try/catch in action handlers
5. **Test with multiple file types** to ensure proper detection
6. **Consider batch operations** when user drops multiple files
7. **Keep actions focused** - each action should do one thing well

## Related Files

- `src/components/AIAssistant/hooks/useFileDrop.ts` - Drag-drop event handling
- `src/components/AIAssistant/AIAssistant.tsx` - Main assistant component
- `src/pages/FileActionsMenu/FileActionsMenu.tsx` - Menu implementation
- `src/components/common/RadialMenu/RadialMenu.tsx` - Radial menu UI
- `electron/main/config/window.ts` - Window configuration
- `src/pages/ResourcePage/services/resourceService.ts` - Resource import service
- `packages/workflow/` - Workflow engine for actions
