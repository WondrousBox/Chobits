# Download Feature — Spec & Coding Guide

> **Living document** — Every download-related change should reference this spec and append to the [Changelog](#changelog) section.

## 1. Overview

The Download feature provides video/audio downloading capabilities powered by **yt-dlp**, with a floating "traffic ball" progress UI, YouTube cookie authentication, subscription auto-download, and settings management.

### Key traits

| Aspect             | Detail                                                          |
| ------------------ | --------------------------------------------------------------- |
| **Backend**        | yt-dlp binary managed per-platform, invoked by main process     |
| **IPC domains**    | `video-downloader:*` (25 channels), `ytdlp:*` (6 channels)      |
| **Renderer entry** | `src/features/download/` — single feature folder                |
| **UI surface**     | Floating ball window (`#/download`), settings panel, RSS page   |
| **Window**         | Frameless, transparent, always-on-top, 340×140 px, bottom-right |

---

## 2. Folder Structure

```
src/features/download/
├── index.ts                              # Barrel re-exports (public API)
├── README.md                             # This spec document
│
├── components/
│   ├── DownloadBubble/
│   │   ├── index.tsx                     # Circular progress "traffic ball" component
│   │   └── styles.scss                   # SCSS animations & styling
│   ├── DownloadFloating.tsx              # Frameless floating window shell
│   ├── DownloaderSettings.tsx            # yt-dlp version, quality, browser cookies settings
│   └── YoutubeCookieSettings.tsx         # YouTube login/cookie management card
│
├── hooks/
│   └── useDownloadTasks.ts               # Hook: IPC task state management
│
└── lib/
    └── youtube-cookie-api.ts             # YouTube cookie IPC wrappers
```

### Import convention

External consumers import via the barrel:

```ts
import { DownloadFloating, DownloaderSettings } from '@/features/download';
```

Internal modules use **relative paths** between each other.

---

## 3. Component API

### 3.1 `DownloadBubble`

Reusable circular progress indicator with stop-on-hover overlay.

```tsx
interface DownloadBubbleProps {
  hookOptions?: UseDownloadTasksOptions; // Forwarded to useDownloadTasks
  className?: string;
  hideWhenEmpty?: boolean; // Default: true
  size?: number; // Ball diameter in px (default: 88)
}
```

**Visual states**: `idle` → `downloading` (blue/purple gradient ring + pulse glow) → `completed` (green) / `failed` (red).

**Sub-components**:

- `CircularProgress` — SVG ring with gradient stroke, Gaussian glow filter, smooth `stroke-dashoffset` transition.
- Stop-button overlay — hidden by default, fades in on hover via CSS `.dl-bubble__ball:hover .dl-bubble__ball-stop { opacity: 1 }`.

**Can be used**:

- As the root content of the floating download window
- Embedded in any other page (e.g., resource page sidebar)

### 3.2 `DownloadFloating`

Thin shell for the `#/download` route — a frameless, draggable window wrapping `<DownloadBubble>`.

- Title bar: `-webkit-app-region: drag` with grip icon + close button (`no-drag`).
- Passes `autoCloseOnComplete: true` and `autoCloseDelay: 4000` to the hook.
- Closes via `window.YUA.window['window:close']('downloadFloating')`.

### 3.3 `DownloaderSettings`

Full settings panel for the download subsystem, rendered inside the Preferences settings page.

| Section                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| yt-dlp version         | Check/download updates, version dropdown                        |
| Download quality mode  | `best`, `1080p`, `720p`, `480p`, `audio`                        |
| Advanced (collapsible) | Browser cookies, config path, reset, EJS runtime, YouTube login |

**External dependency**: Imports `SettingGroup` / `SettingItem` from `@/pages/SettingsPage/components/SettingComponents` (shared settings primitives).

### 3.4 `YoutubeCookieSettings`

Card UI for YouTube session cookie management. Uses `lib/youtube-cookie-api.ts` for IPC calls.

---

## 4. Hook: `useDownloadTasks`

```ts
function useDownloadTasks(options?: UseDownloadTasksOptions): {
  tasks: DownloadTask[];
  activeTasks: DownloadTask[]; // status = 'downloading' | 'queued'
  completedTasks: DownloadTask[];
  failedTasks: DownloadTask[];
  overallProgress: number; // 0–100
  cancelTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
};
```

### Options

| Option                | Type         | Default | Description                               |
| --------------------- | ------------ | ------- | ----------------------------------------- |
| `autoCloseOnComplete` | `boolean`    | `false` | Close floating window when all tasks done |
| `autoCloseDelay`      | `number`     | `3000`  | ms delay before auto-close                |
| `onAllComplete`       | `() => void` | —       | Callback when all tasks finished          |

### IPC listeners (registered on mount, cleaned up on unmount)

| Channel                           | Action                                |
| --------------------------------- | ------------------------------------- |
| `video-downloader:task-progress`  | Update task in state                  |
| `video-downloader:task-started`   | Add or update task                    |
| `video-downloader:task-completed` | Update task; trigger auto-close logic |
| `video-downloader:task-failed`    | Update task status                    |
| `on:window:open:ready`            | Hydrate initial task from window data |

### Data types

```ts
interface DownloadTask {
  id: string;
  url: string;
  filename?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: DownloadProgress;
  error?: string;
  videoInfo?: { title?: string; thumbnail?: string; duration?: number; [key: string]: any };
}

interface DownloadProgress {
  percent?: number;
  totalSize?: string;
  downloadSpeed?: string;
  eta?: string;
  statusText?: string;
}
```

---

## 5. Lib: YouTube Cookie API

Thin wrappers around `window.ipcRenderer.invoke()`:

| Function                | IPC Channel                           | Returns                       |
| ----------------------- | ------------------------------------- | ----------------------------- |
| `openYoutubeLogin()`    | `video-downloader:open-youtube-login` | `{ cookieCount, isLoggedIn }` |
| `getCookieStatus()`     | `video-downloader:get-cookie-status`  | `CookieStatus`                |
| `clearYoutubeCookies()` | `video-downloader:clear-cookies`      | `void`                        |
| `exportCookies(path?)`  | `video-downloader:export-cookies`     | `string` (filePath)           |

---

## 6. IPC Channel Reference

### 6.1 `video-downloader:*` (Main → Renderer invoke/send)

| Channel                                           | Direction | Purpose                               |
| ------------------------------------------------- | --------- | ------------------------------------- |
| `video-downloader:get-info`                       | invoke    | Get video metadata for URL            |
| `video-downloader:get-thumbnail`                  | invoke    | Get thumbnail URL                     |
| `video-downloader:download`                       | invoke    | Start download task                   |
| `video-downloader:cancel`                         | invoke    | Cancel task by ID                     |
| `video-downloader:get-tasks`                      | invoke    | Get all tasks                         |
| `video-downloader:get-task`                       | invoke    | Get single task by ID                 |
| `video-downloader:cleanup`                        | invoke    | Remove completed tasks                |
| `video-downloader:get-external-resource-settings` | invoke    | Read download settings                |
| `video-downloader:set-external-resource-settings` | invoke    | Write download settings               |
| `video-downloader:get-config-path`                | invoke    | Get yt-dlp config file path           |
| `video-downloader:get-subscriptions`              | invoke    | List YouTube subscriptions            |
| `video-downloader:add-subscription`               | invoke    | Add subscription                      |
| `video-downloader:update-subscription`            | invoke    | Update subscription                   |
| `video-downloader:delete-subscription`            | invoke    | Delete subscription                   |
| `video-downloader:check-subscription`             | invoke    | Check one subscription for new videos |
| `video-downloader:check-all-subscriptions`        | invoke    | Check all subscriptions               |
| `video-downloader:start-periodic-check`           | invoke    | Start periodic check (default 60 min) |
| `video-downloader:stop-periodic-check`            | invoke    | Stop periodic check                   |
| `video-downloader:open-youtube-login`             | invoke    | Open YouTube login window             |
| `video-downloader:get-cookie-status`              | invoke    | Query cookie status                   |
| `video-downloader:clear-cookies`                  | invoke    | Clear YouTube cookies                 |
| `video-downloader:export-cookies`                 | invoke    | Export cookies (Netscape format)      |
| `video-downloader:task-started`                   | send      | Notify floating window: task started  |
| `video-downloader:task-progress`                  | send      | Notify both windows: progress update  |
| `video-downloader:task-completed`                 | send      | Notify floating window: task finished |
| `video-downloader:task-failed`                    | send      | Notify floating window: task failed   |

### 6.2 `ytdlp:*` (yt-dlp binary management)

| Channel                   | Direction | Purpose                          |
| ------------------------- | --------- | -------------------------------- |
| `ytdlp:check-update`      | invoke    | Check for new yt-dlp versions    |
| `ytdlp:download-version`  | invoke    | Download & install a release     |
| `ytdlp:get-path`          | invoke    | Get current binary path          |
| `ytdlp:reset-to-builtin`  | invoke    | Reset to bundled binary          |
| `ytdlp:get-folder-path`   | invoke    | Get binary folder                |
| `ytdlp:download-progress` | send      | Progress while installing yt-dlp |

### 6.3 Preload bridge

| Object                       | Exposed as                                                    |
| ---------------------------- | ------------------------------------------------------------- |
| `window.YUA.videoDownloader` | All `video-downloader:*` invoke methods + `onTask*` listeners |
| `window.YUA.ytdlp`           | All `ytdlp:*` invoke methods + `onDownloadProgress` listener  |

---

## 7. Data Flow

### 7.1 Download lifecycle

```
User triggers download (e.g., from RSS page, resource import)
  │
  ▼
Renderer: window.YUA.videoDownloader.downloadVideo({ url, quality?, ... })
  │
  ▼  IPC invoke: video-downloader:download
Main process: downloadManager.addTask(...)
  │
  ├─► taskStarted event
  │     ├─ Set main window taskbar progress = 0
  │     ├─ windowManager.createOrShow('downloadFloating')
  │     ├─ Position floating window → bottom-right (24px margin)
  │     └─ Send 'task-started' to floating window
  │
  ├─► taskProgress event (repeated)
  │     ├─ Send 'task-progress' to BOTH main window & floating window
  │     └─ Update main window taskbar progress bar
  │
  └─► taskCompleted / taskFailed
        ├─ Reset main window taskbar progress = -1
        └─ Send 'task-completed' or 'task-failed' to floating window
              │
              ▼
        useDownloadTasks: auto-close timer (if autoCloseOnComplete)
```

### 7.2 Floating window rendering

```
Electron creates BrowserWindow (frameless, transparent, 340×140)
  → loads index.html#/download
    → React Router matches /download
      → <DownloadFloating />
        → <DownloadBubble hookOptions={{ autoCloseOnComplete: true }}>
          → useDownloadTasks() subscribes to IPC events
            → CircularProgress ring + status display
```

### 7.3 Settings rendering

```
/settings route → <SettingsPage />
  → <PreferencesSettings />
    → <DownloaderSettings />  (imported from @/features/download)
      → <YoutubeCookieSettings />  (YouTube login card, in advanced section)
```

---

## 8. Styling Architecture

All download-specific styles are in `components/DownloadBubble/styles.scss`.

### CSS class namespace

All classes use the `dl-` prefix to avoid collisions:

| Class pattern                | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `.dl-bubble`                 | Root container                                         |
| `.dl-bubble__head`           | Head row (ball + info)                                 |
| `.dl-bubble__ball`           | Circular ball container                                |
| `.dl-bubble__ball--{status}` | Status modifier (downloading, completed, failed, idle) |
| `.dl-bubble__ring`           | SVG ring overlay                                       |
| `.dl-bubble__ball-inner`     | Inner circle (card bg + border)                        |
| `.dl-bubble__ball-content`   | Center text/icon                                       |
| `.dl-bubble__ball-stop`      | Stop button overlay (hover)                            |
| `.dl-bubble__head-info`      | Info strip (title, speed, ETA)                         |
| `.dl-bubble__badge`          | Active count badge                                     |
| `.dl-bubble__speed/eta/size` | Detail row items                                       |
| `.dl-bubble__error`          | Error message strip                                    |

### Keyframe animations

- `dl-pulse-glow` — Blue/purple pulsing box-shadow (downloading)
- `dl-pulse-glow-success` — Green pulsing (completed)
- `dl-pulse-glow-error` — Red pulsing (failed)

### Theming

Uses CSS variables from the app's design system:

- `hsl(var(--foreground))`, `hsl(var(--card))`, `hsl(var(--border))`, `hsl(var(--muted-foreground))`, `hsl(var(--primary))`
- Gradient colors are hardcoded (blue→purple for progress, green for success, red for error).

---

## 9. Window Configuration

Defined in `electron/main/config/window.ts` under key `downloadFloating`:

```typescript
{
  routeHash: 'download',
  autoCenterOn: 'none',
  showOnReady: false,
  options: {
    width: 340,
    height: 140,
    minWidth: 300,
    minHeight: 120,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
  }
}
```

**Position**: Programmatically set to bottom-right of primary display with 24px margin in `electron/main/handlers/downloader/ipc-main.ts`.

---

## 10. External dependencies

### Main process (not in this folder, referenced for context)

| File                                                | Role                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| `electron/main/handlers/downloader/ipc-main.ts`     | IPC handler registration, task orchestration           |
| `electron/main/handlers/ytdlp/ipc-main.ts`          | yt-dlp binary management handlers                      |
| `electron/main/handlers/downloader/ipc-renderer.ts` | Preload API definitions (`window.YUA.videoDownloader`) |
| `electron/main/handlers/ytdlp/ipc-renderer.ts`      | Preload API definitions (`window.YUA.ytdlp`)           |
| `electron/main/config/window.ts`                    | `downloadFloating` window config                       |

### Renderer consumers (import from `@/features/download`)

| File                                                        | Imports              |
| ----------------------------------------------------------- | -------------------- |
| `src/App.tsx`                                               | `DownloadFloating`   |
| `src/pages/SettingsPage/components/PreferencesSettings.tsx` | `DownloaderSettings` |

### Shared UI primitives used

- `@/components/ui/*` — shadcn/ui (Button, Card, Badge, Select, Switch, Progress, Alert, DropdownMenu)
- `@/pages/SettingsPage/components/SettingComponents` — `SettingGroup`, `SettingItem`
- `@/lib/utils` — `cn()` classname merge utility

---

## 11. Known issues & future considerations

1. **Listener cleanup** — `onTaskProgress`, `onTaskStarted`, `onTaskCompleted`, `onTaskFailed` in the preload ipc-renderer bridge do not return cleanup functions (unlike `ytdlp.onDownloadProgress`). This may cause listener leaks if called multiple times. The current `useDownloadTasks` hook works around this by using `window.ipcRenderer.on/off` directly.

2. **Multi-task display** — The bubble currently shows overall progress and the first active task's details. When multiple downloads run concurrently, only one filename/speed/ETA is visible.

3. **Embedded usage** — `DownloadBubble` is designed for embedding in other pages but is currently only used in the floating window. Future: sidebar widget, resource page inline indicator.

---

## Changelog

Record all download-related changes here in reverse chronological order.

### 2025-XX-XX — Feature folder consolidation

- **Moved** all download renderer files into `src/features/download/` with barrel exports
- **Files consolidated**: `DownloadBubble`, `DownloadFloating`, `DownloaderSettings`, `YoutubeCookieSettings`, `useDownloadTasks`, `youtube-cookie-api`
- **Updated imports** in `App.tsx` and `PreferencesSettings.tsx` to use barrel
- **Created** this spec document (`README.md`)

### 2025-XX-XX — Simplified traffic ball UI

- Removed expandable task list panel
- Removed wave/water animation effects
- Added stop button inside ball (visible on hover)
- Reduced window size to 340×140 px (was 380×160)

### 2025-XX-XX — Initial traffic ball implementation

- Created `DownloadBubble` component with 360-style circular progress ring
- Created `useDownloadTasks` hook separating IPC logic from UI
- Redesigned floating window as frameless draggable shell
- Added SVG gradient progress ring with glow animations
