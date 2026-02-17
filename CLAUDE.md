# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chobits** is an AI-powered desktop assistant application built with Electron, featuring a floating "sprite" interface that provides conversational AI, resource management, workflow automation, and multimedia processing capabilities.

- **Cross-platform desktop app** (macOS, Windows, Linux) with Electron 39
- **Frameless, transparent floating assistant UI** with animated sprite
- **Multi-model AI support**: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Zhipu, Ollama
- **Local-first architecture** with SQLite database (Drizzle ORM)
- **Visual workflow automation** with 30+ nodes
- **Resource management** system with folders, tags, and workspaces
- **RSS subscriptions** for YouTube, Bilibili, and generic feeds
- **Built-in screenshot capture** and media processing

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development (Vite + Electron)
pnpm dev

# Build for production
pnpm build

# Lint code
pnpm lint

# Run tests
pnpm test                    # Runs vitest (builds first via pretest)

# Database operations
pnpm db:generate             # Generate Drizzle migration
pnpm db:push                 # Push schema to database
pnpm db:studio               # Open Drizzle Studio

# Rebuild native modules (required after npm install)
pnpm rebuild                 # Rebuild all native modules
pnpm rebuild:sqlite          # Rebuild better-sqlite3 only
pnpm rebuild:sqlite-vec      # Rebuild sqlite-vec only
```

**Important**: Native modules (`better-sqlite3`, `sqlite-vec`, `sharp`, `sherpa-onnx-node`) must be rebuilt for Electron after installation.

## Architecture Overview

### Electron Multi-Process Architecture

```
electron/main/              # Main process (Node.js)
├── index.ts                # App entry, window lifecycle
├── handlers/               # IPC handlers (25+ domains)
├── db/                     # Database schema & repositories
├── config/                 # App configuration
└── utils/                  # Main process utilities

electron/preload/           # Preload scripts (IPC bridge)
└── index.mjs               # Exposes window.YUA API

src/                        # Renderer process (React app)
├── pages/                  # Route components (15+ pages)
├── components/             # React components
├── hooks/                  # Custom React hooks
└── lib/                    # Utilities & helpers

packages/                   # Shared packages (monorepo-style)
├── ai/                     # AI service layer (multi-provider)
├── workflow/               # Workflow engine (DAG-based)
├── plugins/                # Plugin system
├── common/                 # Shared utilities & DB
├── event/                  # Event bus system
├── sherpa/                 # Speech recognition
└── recorder/               # Recording functionality
```

### IPC Communication Pattern

**Channel naming**: `domain:action` (e.g., `resource:importLocalFiles`, `ai:chat`)

**Handler locations**:

- Main process: `electron/main/handlers/*/ipc-main.ts`
- Preload bridge: `electron/preload/apis/*.ts`
- Renderer access: `window.YUA.domain.action(payload)`

**Handler domains** (25+): `resource`, `ai`, `ffmpeg`, `folder`, `workspace`, `file`, `system`, `preferences`, `proxy`, `theme`, `shortcuts`, `sprite`, `status`, `trash`, `ytdlp`, `rss`, `automation`, `downloader`, `embedding`

### Database Architecture

**ORM**: Drizzle ORM with SQLite
**Schema location**: `electron/main/db/schema.ts`
**Repositories**: `electron/main/db/repositories/`

**Key tables**:

- `resources` - File metadata (videos, docs, images, etc.)
- `documents` - Text content with embeddings (semantic search)
- `folders` - Hierarchical organization
- `workspaces` - Multi-workspace support
- `tags` - Tagging system
- `conversations` - AI chat history
- `messages` - Chat messages
- `rss_feeds` & `rss_items` - RSS subscriptions

**Repository pattern**: Always use repository methods (e.g., `ResourcesRepo.getById()`) instead of raw queries. Access via IPC from renderer.

**Vector search**: `sqlite-vec` for similarity search with embeddings from multiple providers.

### Event System

**Event bus**: `packages/event/` - Centralized event manager

```typescript
import { eventManager } from '@packages/event';
import { AppEvent } from '@packages/event/events';

eventManager.emit(AppEvent.RESOURCE_CREATED, data);
eventManager.on(AppEvent.RESOURCE_CREATED, handler);
```

Events broadcast to all windows via IPC for cross-window state synchronization.

### Custom Resource Protocol

**Scheme**: `res://` - Secure file access protocol for resources

**URL patterns**:

- Absolute path: `res://local/<encodeURIComponent(C:/path/to/file)>`
- Workspace relative: `res://ws/<workspaceId>/<relative/path>`

**Security**: Only files in allowed roots (workspace resources, app resources) are accessible. Protocol setup in `electron/main/resource-protocol.ts`.

### Global Shortcuts

**System-wide hotkeys** registered via Electron's `globalShortcut`:

- `toggleAssistant` - Show/hide assistant window
- `toggleDevtools` - Toggle developer tools
- `toggleMainWindow` - Show/hide main window
- `screenshot` - Trigger screenshot capture

**Configuration**: Stored in `electron/main/shortcut-store.ts`, user-customizable via settings IPC (`shortcuts:*`).

### AI Service Architecture

**Location**: `packages/ai/`

**Provider adapters**: Abstract interface for AI providers

- Supported: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Zhipu, Ollama
- Each implements: `chat()`, `embed()`, `stream()`
- Dynamic configuration via JSON schemas

**Chat service**: `packages/ai/chat-service.ts`

- Conversation management with persistence
- Streaming responses with abort support
- Agent-based routing (system prompts, tools)

**Instance-based selection**: Per-conversation provider configuration with fallback mechanisms.

### Workflow System

**Location**: `packages/workflow/`

**Architecture**: DAG-based execution engine with topological sort

**Node categories** (30+ nodes):

- Core: Start, End
- Resource: Load, Create, Update
- Media: Transcode, ExtractKeyframes, OCR
- AI: Chat, ImageUnderstand, ImageGenerate
- Text: DocToMarkdown, TextOutput
- Speech: TranscribeWhisper, TranscribeParakeet

**IPC prefix**: `wf:` (e.g., `wf:run`, `wf:validate`, `wf:listNodes`)

**Execution**: Sequential (with error strategy), progress events to renderer, results in `WorkflowStore`

### Plugin System

**Location**: `packages/plugins/`

**Purpose**: Manages native plugin resources (FFmpeg, Tesseract, Whisper models, etc.)

**Features**:

- Download queue with configurable concurrency
- SHA256 verification after download
- Archive extraction (zip, tar.gz, tar.bz2)
- Progress tracking via IPC (`plugin-resource:progress`)
- Platform-specific binary resolution

**Resource types**:

- `engine` - Native binaries (FFmpeg, Tesseract, etc.)
- `model` - Model files for AI/ML plugins

**IPC prefix**: `plugin-resource:*`

**Categories**: ASR, TTS, OCR, LLM, image generation, translation, etc.

### API Key Storage

**Storage**: System keychain via `keytar` with JSON fallback

**Location**: `userData/data/ai-settings.json` (fallback only)

**Provider secrets**: Stored per-provider (e.g., OpenAI API key)
**Instance secrets**: Stored per-instance for override configurations

**Security**: Secrets never exposed to renderer; accessed only in main process via IPC (`ai:getProviderSecrets`, `ai:setProviderSecrets`).

### Sprite Window (Assistant UI)

**Configuration**:

- Frameless window (`frame: false`)
- Transparent background (`transparent: true`)
- Always on top (`alwaysOnTop: true`)
- Skip taskbar (`skipTaskbar: true`)
- Resizable: false (fixed size)

**Features**:

- Drag-to-move functionality
- Click-through behavior when idle
- Animated sprite with walk cycles
- File drop support
- Contextual messages and status indicators

### Screenshot System

**Location**: `electron/main/screenshot/`

**Features**:

- Screen capture with selection UI
- Triggered via global shortcut or IPC
- Integration with workflow system for OCR pipelines
- Stored as resources in the database

**IPC**: `screenshot:*` channels for capture and configuration

## Path Aliases

```typescript
@/*          → src/*
@packages/*  → packages/*
```

Configured in `tsconfig.json` and `vite.config.ts`.

## UI Architecture

**Routing**: HashRouter with 15+ routes

- `/` - AI assistant (floating sprite)
- `/status` - Status page
- `/chat` - Chat interface
- `/resources/*` - Resource manager
- `/workflow` - Workflow builder
- `/settings` - Settings
- `/plugin-manager` - Plugin management
- `/screenshot` - Screenshot tool

**Component organization**:

- Page components: `src/pages/`
- Feature components: Self-contained features
- UI components: `src/components/ui/` (shadcn/ui primitives)
- Common components: `src/components/common/`

**Styling**: TailwindCSS with CSS variables for theming (light/dark mode)

## Adding New Features

### New IPC Handler

1. Create `electron/main/handlers/yourfeature/ipc-main.ts`:

```typescript
import { ipcMain } from 'electron';

export function initYourFeatureHandlers() {
  ipcMain.handle('yourfeature:action', async (event, payload) => {
    // Handler logic
    return response;
  });
}
```

2. Register in `electron/main/handlers/index.ts`:

```typescript
import { initYourFeatureHandlers } from './yourfeature/ipc-main';

export function initHandlers(win: BrowserWindow): void {
  // ...
  initYourFeatureHandlers();
}
```

3. Create preload bridge (optional, for type safety)

4. Access from renderer: `window.YUA.yourfeature.action(payload)`

### New Workflow Node

1. Create node handler in `packages/workflow/nodes/yournode.ts`:

```typescript
import { NodeHandler } from '../types';

export const YourNode: NodeHandler = {
  spec: {
    id: 'your-node',
    label: 'Your Node',
    inputs: [{ id: 'in', type: 'any' }],
    outputs: [{ id: 'out', type: 'any' }]
  },
  run: async ({ input, config, ctx, emit, getPlugin }) => {
    // Node logic
    return { out: result };
  }
};
```

2. Register in `packages/workflow/index.ts`:

```typescript
import { YourNode } from './nodes/yournode';
import { registry } from './registry';

export function initWorkflowSystem() {
  registry.registerNode(YourNode);
  // ...
}
```

### New AI Provider

1. Create provider in `packages/ai/providers/yourprovider.ts` implementing `ProviderAdapter`
2. Register in `packages/ai/ipc-main.ts` via `registerProvider(new YourProvider())`
3. Add provider schema to `resources/providers/` (optional)

## Native Dependencies

These require rebuild for Electron:

- `better-sqlite3` - Embedded SQLite database
- `sqlite-vec` - Vector similarity search
- `sharp` - Image processing
- `sherpa-onnx-node` - Speech recognition

Run `pnpm rebuild` after any `npm install` or `pnpm install`.

## Type Safety

- **Strict TypeScript** enabled
- **IPC payloads typed** - Define types for channel payloads
- **Database schema typed** - Drizzle ORM provides types
- **React components fully typed** - Use TypeScript for all components

## Testing

**Framework**: Vitest + Playwright

**Test structure**:

```
test/
├── e2e.spec.ts          # E2E tests (Playwright + Electron)
└── workflow.spec.ts     # Workflow engine tests
```

**Running**: `pnpm test` (builds first via `pretest`)

## Code Quality

- **ESLint**: Configured with React & TypeScript rules
- **Prettier**: Code formatting (`.prettierrc.yaml`)
- **Import order**: `eslint-plugin-simple-import-sort` enforced

**IMPORTANT**: Never run `pnpm lint` or `pnpm lint --fix` automatically. These commands will modify code formatting across the entire project, making it difficult to track actual changes. Only run these commands when explicitly requested by the user.

## Important Notes

- **Main process only**: File I/O, database operations, native modules
- **Renderer process only**: UI, user interactions
- **Preload**: Secure IPC bridge via `contextBridge` - never expose secrets
- **Repository pattern**: Always use repository methods for database access
- **Event-driven**: Use event system for cross-window communication
- **Local-first**: Data stored in SQLite, AI providers are optional

## Troubleshooting

### Native Module Issues

If you encounter errors with native modules after `pnpm install`:

```bash
# Rebuild all native modules
pnpm rebuild

# Or rebuild individually
pnpm rebuild:sqlite
pnpm rebuild:sqlite-vec
```

**Common symptoms**:

- `Cannot find module 'better-sqlite3'`
- `Error: The specified module could not be found`
- `dlopen(...): image not found`

### Platform-Specific Binaries

Some features require platform-specific binaries downloaded separately:

- **FFmpeg**: `pnpm download-ffmpeg-<platform>-<arch>`
- **yt-dlp**: `pnpm download-ytdlp-<platform>`

### Database Migration Issues

If schema changes don't apply:

```bash
# Generate new migration
pnpm db:generate

# Push to database (development only)
pnpm db:push

# Or use Drizzle Studio to inspect
pnpm db:studio
```

### IPC Debugging

Enable IPC logging in main process by setting environment variable:

```bash
DEBUG_IPC=1 pnpm dev
```

## Documentation Files

- `README.md` - User-facing features and quick start
- `packages/ai/ai-module-design.md` - AI system design
- `packages/workflow/README.md` - Workflow system documentation
- `resources/providers/README.md` - Provider schemas
