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
└── index.ts                # Exposes window.YUA API

src/                        # Renderer process (React app)
├── pages/                  # Route components (15+ pages)
├── components/             # React components
├── hooks/                  # Custom React hooks
└── lib/                    # Utilities & helpers

packages/                   # Shared packages (monorepo-style)
├── ai/                     # AI service layer (multi-provider)
├── ai-agent/               # AI agent framework
├── workflow/               # Workflow engine (DAG-based)
├── plugins/                # Plugin system
├── common/                 # Shared utilities & DB
├── event/                  # Event bus system
├── sherpa/                 # Speech recognition
├── tts/                    # Text-to-speech
└── recorder/               # Recording functionality
```

**Path aliases**: `@/*` → `src/*`, `@packages/*` → `packages/*` (configured in `tsconfig.json` and `vite.config.ts`)

### IPC Communication Pattern

**Channel naming**: `domain:action` (e.g., `resource:importLocalFiles`, `ai:chat`)

**Handler locations**:

- Main process: `electron/main/handlers/*/ipc-main.ts`
- Preload bridge: `electron/preload/apis/*.ts`
- Renderer access: `window.YUA.domain.action(payload)`

**Handler domains** (25+): `resource`, `ai`, `ffmpeg`, `folder`, `workspace`, `file`, `system`, `preferences`, `proxy`, `theme`, `shortcuts`, `sprite`, `status`, `trash`, `ytdlp`, `rss`, `automation`, `downloader`, `embedding`, `clip`, `annotation`, `spleeter`, `window`, `memory`

### Database Architecture

**ORM**: Drizzle ORM with SQLite
**Schema**: `electron/main/db/schema.ts`
**Repositories**: `electron/main/db/repositories.ts`

**Key tables**:

- `resources` - File metadata (videos, docs, images, etc.)
- `documents` - Text content with embeddings (semantic search)
- `folders` - Hierarchical organization
- `workspaces` - Multi-workspace support
- `tags` / `resource_tags` - Tagging system
- `conversations` / `chat_messages` - AI chat history
- `rss_feed_items` - RSS subscriptions
- `recycle_bin` - Soft-delete index for trash/restore
- `automation_rules` - Workflow automation triggers

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

- Absolute path: `res://local/<encodeURIComponent(absolutePath)>`
- Workspace relative: `res://ws/<workspaceId>/<relative/path>`

Only files in allowed roots (workspace resources, app resources) are accessible. Setup in `electron/main/resource-protocol.ts`.

### AI Service Architecture

**Location**: `packages/ai/`

- **Provider adapters**: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Zhipu, Ollama — each implements `chat()`, `embed()`, `stream()`
- **Chat service**: `packages/ai/chat-service.ts` — conversation management, streaming, abort support
- **Instance-based selection**: Per-conversation provider configuration with fallback
- **API key storage**: System keychain via `keytar` with JSON fallback; secrets never exposed to renderer
- **System prompt enrichment**: `packages/ai/system-prompt-enricher.ts` — plugin-style registry for external modules to inject system prompt segments (e.g., persona, memory auto-recall)

### Memory System

**Location**: `packages/ai/services/memory-*.ts` (core services), `electron/main/handlers/memory/` (IPC + workers)

- **Extraction pipeline**: Conversations → LLM topic splitting → structured extraction → Markdown notes (`memory/daily/YYYY/MM/`)
- **Retrieval pipeline**: 6-stage pipeline (Query Analysis → Topic Recall → Note Recall → Section Recall → Targeted Read → Context Assembly)
- **Auto-recall**: Automatically retrieves relevant memories before each conversation turn via `SystemPromptEnricher`. Uses AI to extract search keywords from user message, then runs the structural retrieval pipeline. Results injected into system prompt as `<recalled_memories>` block.
- **Agent tools**: `memorySearchTool`, `memoryGetTool`, `memoryTopicsTool`, `memorySaveTool` — for explicit memory operations by the AI agent
- **Storage**: SQLite tables (`memory_notes`, `memory_topics`, `memory_sections`, `memory_edges`, `memory_keywords`) + Markdown files on disk + FTS5 full-text index

**IPC prefix**: `memory:*`

**Key files**:

- `packages/ai/services/memory-auto-recall.ts` — Auto-recall service (triage, keyword extraction, search, caching)
- `electron/main/handlers/memory/memory-auto-recall-enricher.ts` — Enricher bridge (registers with SystemPromptEnricher, provides DB deps)
- `packages/ai/services/memory-retrieval-service.ts` — 6-stage retrieval pipeline
- `packages/ai/services/memory-extraction-service.ts` — LLM-based memory extraction from conversations
- `electron/main/handlers/memory/extraction-worker.ts` — Background extraction worker

**Design docs**: `docs/memory-system/`

### Workflow System

**Location**: `packages/workflow/`

DAG-based execution engine with topological sort. 30+ node types across categories: Core, Resource, Media, AI, Text, Speech.

**IPC prefix**: `wf:` (e.g., `wf:run`, `wf:validate`, `wf:listNodes`)

### Plugin System

**Location**: `packages/plugins/`

Manages native plugin resources (FFmpeg, Tesseract, Whisper models, etc.) with download queue, SHA256 verification, archive extraction, and platform-specific binary resolution.

**IPC prefix**: `plugin-resource:*`

## UI Architecture

**Routing**: HashRouter with 15+ routes

**Key pages**: Assistant (`/`), Chat (`/chat`), Resources (`/resources/*`), Workflow (`/workflow`), Settings (`/settings`), Plugin Manager (`/plugin-manager`), ASR (`/asr`), TTS (`/tts`), Screenshot (`/screenshot`), Workspace, Tagging, Status

**Styling**: TailwindCSS + shadcn/ui primitives, CSS variables for light/dark theming

## Adding New Features

### New IPC Handler

1. Create `electron/main/handlers/yourfeature/ipc-main.ts` with `initYourFeatureHandlers()` function
2. Register in `electron/main/handlers/index.ts`
3. Create preload bridge in `electron/preload/apis/` (optional, for type safety)
4. Access from renderer: `window.YUA.yourfeature.action(payload)`

### New Workflow Node

1. Create node in `packages/workflow/nodes/yournode.ts` implementing `NodeHandler` (with `spec` + `run`)
2. Register in `packages/workflow/index.ts` via `registry.registerNode()`

### New AI Provider

1. Add builtin provider definition/models under `packages/ai/providers/builtins/<provider>/`
2. If the provider needs runtime behavior, implement `ProviderAdapter` in `packages/ai/providers/` and wire its factory in `packages/ai/providers/catalog.ts`
3. Let `ProviderService` expose schema/models/defaults; do not add provider schema JSON back under `resources/providers/`

## Code Quality

- **Strict TypeScript** with typed IPC payloads, Drizzle schema types, and typed React components
- **ESLint** + **Prettier** (`.prettierrc.yaml`), import ordering via `eslint-plugin-simple-import-sort`
- **Testing**: Vitest + Playwright — `test/e2e.spec.ts`, `test/workflow.spec.ts`

**IMPORTANT**: Never run `pnpm lint` or `pnpm lint --fix` automatically. These commands will modify code formatting across the entire project, making it difficult to track actual changes. Only run these commands when explicitly requested by the user.

## Important Notes

- **Main process only**: File I/O, database operations, native modules
- **Renderer process only**: UI, user interactions
- **Preload**: Secure IPC bridge via `contextBridge` — never expose secrets
- **Repository pattern**: Always use repository methods for database access
- **Event-driven**: Use event system for cross-window communication
- **Local-first**: Data stored in SQLite, AI providers are optional

## Resource Lifecycle Design Principles

### Cascading Lifecycle: Parent ↔ Child Resources

Resources in Chobits have a **parent-child relationship** via the `parentResourceId` field. A parent resource (e.g., a video, audio, or document) can spawn derived child resources such as:

- `translation` — Translated text
- `summary` — AI-generated summary
- `mindmap` — Mind map data
- `note` — User notes attached to a resource
- `segments` — Subtitle/audio segments JSON
- `screenshot` — Keyframe screenshots from video
- `subtitle` — Extracted/generated subtitles
- Any future derived resource type linked by `parentResourceId`

**Core Principle**: Child resources share the lifecycle of their parent. They are not independently manageable by users and should follow their parent automatically:

| Parent Action                            | Child Behavior                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| **Soft delete** (move to recycle bin)    | All children are **automatically soft-deleted** and moved to recycle bin together  |
| **Restore** (recover from recycle bin)   | All children are **automatically restored** together                               |
| **Hard delete** (purge from recycle bin) | All children are **automatically hard-deleted** (DB rows + physical files removed) |

**Implementation** (in `ResourcesRepo`):

- `softDelete(ids)`: Recursively collects all descendant resources via `parentResourceId`, then soft-deletes them all in one transaction. Physical files are moved to `<workspace>/resources/.trash/<resourceId>/` to free the original filename for reuse.
- `restore(ids)`: Recursively collects all soft-deleted descendants, restores them all, and moves files back from `.trash/` to their original locations.
- `deleteByIds(ids)`: Already collects child resources for physical deletion.

**Why this matters**:

1. Users cannot see or manage child resources directly — they appear as features of the parent (e.g., "this video has a translation"). Orphaned children are invisible clutter.
2. When a parent is deleted, its filename should be immediately reusable. Files are moved to `.trash/` on soft delete rather than left in place.
3. Restoration should be seamless — "undo delete" brings back the parent with all its derived data intact.

**For AI contributors**: When adding new derived resource types, always set `parentResourceId` to link them to their source resource. The cascading delete/restore logic uses recursive BFS on `parentResourceId` with **no type filter**, so new child types are automatically covered without code changes.

## Resource Project Directory

### Overview

Each resource can have an associated **project directory** for storing task outputs, cache files, temporary data, and persistent data. This provides isolated workspace for resource-specific processing without polluting the main resources folder.

Project folders use the `.resproject` suffix, which allows macOS to register them as custom package types in the future (double-clickable bundles).

**Directory structure:**

```
<workspace>/
├── resources/              # Main resource storage
│   ├── folders/            # Organized by folder
│   ├── .trash/             # Recycle bin
│   └── .thumbs/            # Thumbnails
└── projects/               # Resource project directories
    └── <resourceId>.resproject/  # One package per resource
        ├── project.json    # Project metadata file
        ├── outputs/        # Task outputs (exports, generated files for export)
        ├── cache/          # Cache files (intermediate results, reusable)
        ├── temp/           # Temporary files (processing artifacts, caches)
        │   └── waveforms/  # Audio waveform cache files
        │       └── video.waveform-abc123.json  # Waveform data for timeline display
        └── data/           # Persistent data
            ├── translations/  # Translation files (for subtitle resources)
            │   └── video.zh-CN.1234567890.json  # Translation JSON with timestamp
            ├── segments/      # Segments data for subtitles (word-level timestamps)
            │   └── video.zh.segments.json
            ├── clips/         # Media clip/segment data (timeline markers, cuts)
            │   └── resourceId.json  # Clip data for media resources
            ├── tracks/        # Track configuration files (subtitle-edit, tts, media)
            │   ├── subtitle-xxx.json  # Subtitle edit track config
            │   ├── tts-xxx.json       # TTS track config
            │   └── media-xxx.json     # Media track config
            ├── tts/           # TTS synthesized audio files (organized by track)
            │   ├── main/      # Main track TTS audio
            │   │   ├── history-abc12345.json  # TTS synthesis history
            │   │   └── *.mp3  # Synthesized audio files
            │   └── en/        # Translation track TTS (language code as folder)
            │       └── ...
            └── ...              # Other data files
```

**Directory purposes:**

- `project.json` - Project metadata (resource info, segments mappings, translation history)
- `outputs/` - Final export files (e.g., processed videos ready for export)
- `cache/` - Reusable intermediate files (e.g., transcoded audio for transcription)
- `temp/` - Temporary processing outputs and caches
  - `waveforms/` - Audio waveform cache files for timeline display (auto-generated, can be deleted)
- `data/` - Persistent data files
  - `translations/` - Translation JSON files (for subtitle resources)
  - `segments/` - Segments data with word-level timestamps (for subtitle resources)
  - `clips/` - Media clip/segment data (timeline markers, cuts) for media resources
  - `tracks/` - Track configuration files (subtitle-edit, tts, media tracks) - **not stored in database**
  - `tts/` - TTS synthesized audio files, organized by track (`main/` for main track, `<langCode>/` for translation tracks)
  - `annotations/` - Annotation data files (highlights, notes, vocabulary) - **not stored in database**

### Project Metadata (project.json)

The `project.json` file stores metadata about the project:

```json
{
  "version": 1,
  "resourceId": "xxx-xxx-xxx",
  "resourceType": "subtitle",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "parentResourceId": "yyy-yyy-yyy",
  "segments": [
    {
      "subtitleFile": "video.zh.srt",
      "segmentsFile": "video.zh.segments.json"
    }
  ],
  "translations": [
    {
      "id": "uuid-for-translation-entry",
      "fileName": "video.zh.srt.en.1234567890.json",
      "targetLanguage": "en",
      "providerId": "openai",
      "model": "gpt-4",
      "translatedAt": 1234567890,
      "startTimestamp": 1234567800
    }
  ],
  "tracks": [
    {
      "id": "subtitle-abc123",
      "type": "media",
      "fileName": "subtitle-abc123.json",
      "title": "编排字幕 1",
      "createdAt": 1234567890
    },
    {
      "id": "tts-def456",
      "type": "tts",
      "fileName": "tts-def456.json",
      "title": "TTS 轨道 1",
      "createdAt": 1234567890
    }
  ]
}
```

**Key fields:**

- `version` - Metadata schema version
- `resourceId` - The resource this project belongs to
- `resourceType` - Type of the resource (e.g., "subtitle")
- `parentResourceId` - Parent resource ID (for derived resources)
- `segments` - Array of subtitle-to-segments file mappings
- `translations` - Array of translation entries (for subtitle resources)
- `tracks` - Array of track entries (subtitle-edit, tts, media tracks) stored in `data/tracks/`

### Subtitle Segments Management

Subtitle resources store their segments data (word-level timestamps) in the project folder's `data/segments/` subdirectory instead of as database resources. This makes segments invisible to users but still queryable.

**Storage location:** `<resourceId>.resproject/data/segments/<filename>.segments.json`

### Audio Waveform Cache

Audio waveform data (for timeline display) is cached in the project folder's `temp/waveforms/` subdirectory. These files are auto-generated and can be safely deleted (they will be regenerated when needed).

**Storage location:** `<resourceId>.resproject/temp/waveforms/<filename>.waveform-<hash>.json`

**How it works:**

1. When a subtitle is created, the system looks for a companion `.segments.json` file
2. If found, it's **moved** to `<resourceId>.resproject/data/segments/<basename>.segments.json` (not copied - source file is deleted)
3. The `project.json` is updated with the segments file mapping
4. Querying segments reads from the project folder, not the database
5. When subtitle is deleted, the project folder (including segments) is automatically removed

**Segments file naming:** `video.zh.srt` → `video.zh.segments.json`

### Translation Management

Translation files follow the same pattern as segments - stored in project folder instead of database resources:

**How it works:**

1. When translation is performed, files are saved to `<subtitleId>.resproject/data/translations/`
2. The `project.json` is updated with translation entry metadata
3. Querying translations reads from the project folder, not the database
4. Translation history is preserved with timestamp-based file naming
5. When subtitle is deleted, all translations are automatically removed

**Translation file naming:** `video.zh.srt.en.1234567890.json` (original name + target language + timestamp)

**IPC API for translations** (prefix `ai:`):

- `ai:getResourceTranslations` - Get translations for a subtitle (latest per language)
- `ai:getAllTranslationHistory` - Get all translation history for a subtitle
- `ai:updateTranslationSegment` - Update a segment in a translation file
- `ai:insertTranslationSegment` - Insert a new segment in a translation file
- `ai:deleteTranslationSegment` - Delete a segment from a translation file
- `ai:cleanupTranslationResources` - Remove old translation records from database (migration)

### Track Management

Tracks (subtitle-edit, TTS, media tracks) are stored in the project folder's `data/tracks/` subdirectory instead of as database resources. This makes tracks invisible to users in the resource list while still being fully manageable through the timeline UI.

**Storage location:** `<resourceId>.resproject/data/tracks/<trackId>.json`

**Track types:**

| Track Type    | ID Prefix   | Description                                |
| ------------- | ----------- | ------------------------------------------ |
| Subtitle Edit | `subtitle-` | Manual subtitle editing/arrangement tracks |
| TTS Track     | `tts-`      | Independent TTS tracks with voice config   |
| Media Track   | `media-`    | Media overlay tracks (video/audio layers)  |

**How it works:**

1. When a track is created, config file is saved to `data/tracks/<trackId>.json`
2. The `project.json` is updated with track entry metadata
3. Track config contains all track-specific settings (segments, voice config, etc.)
4. When track is deleted, config file is removed and `project.json` is updated
5. When parent resource is deleted, entire project folder (including tracks) is removed

**IPC API for tracks** (prefix `resource:`):

| Method                             | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `resource:createSubtitleEditTrack` | Create a subtitle edit track                  |
| `resource:getSubtitleEditTracks`   | List all subtitle edit tracks for a resource  |
| `resource:updateSubtitleEditTrack` | Update subtitle-edit track segments           |
| `resource:deleteSubtitleEditTrack` | Delete a subtitle edit track                  |
| `resource:deleteTranslation`       | Delete a translation file from project folder |
| `resource:createTTSTrack`          | Create an independent TTS track               |
| `resource:getTTSTracks`            | List all TTS tracks for a resource            |
| `resource:updateTTSTrack`          | Update TTS track configuration                |
| `resource:deleteTTSTrack`          | Delete a TTS track (config + audio files)     |
| `resource:createMediaTrack`        | Create a media overlay track                  |
| `resource:getMediaTracks`          | List all media tracks for a resource          |
| `resource:updateMediaTrack`        | Update media track configuration              |
| `resource:deleteMediaTrack`        | Delete a media track                          |

**Important:** Tracks do NOT create database resource records. They exist only as files in the project folder. This means:

- Tracks don't appear in resource lists or search
- Tracks don't have cascade delete issues with parent resources
- Tracks are automatically cleaned up when parent resource's project folder is deleted

### Annotation Management

Annotations (highlights, notes, vocabulary) are stored in the project folder's `data/annotations/` subdirectory. This allows users to mark up subtitle content with custom annotations that persist across sessions.

**Storage location:** `<resourceId>.resproject/data/annotations/<resourceId>.json`

**Annotation types:**

| Type         | Color                       | Description           |
| ------------ | --------------------------- | --------------------- |
| `highlight`  | Yellow `hsl(48, 95%, 55%)`  | Text highlighting     |
| `note`       | Blue `hsl(210, 80%, 60%)`   | General notes         |
| `vocabulary` | Green `hsl(150, 70%, 50%)`  | Vocabulary/word lists |
| `comment`    | Purple `hsl(280, 70%, 60%)` | Comments              |
| `custom`     | Orange `hsl(30, 80%, 55%)`  | Custom annotations    |

**How it works:**

1. Annotations are created through the subtitle timeline UI (select text → add annotation)
2. Data is saved to `data/annotations/<resourceId>.json` in the project folder
3. Annotations are loaded when the resource is opened in the subtitle player
4. Annotations are automatically cleaned up when parent resource's project folder is deleted

**IPC API for annotations** (prefix `annotation:`):

| Method              | Description                         |
| ------------------- | ----------------------------------- |
| `annotation:load`   | Load annotation data for a resource |
| `annotation:save`   | Save annotation data for a resource |
| `annotation:delete` | Delete annotation data file         |

### Implementation

**Location**: `electron/main/handlers/resource/resource-project.ts`

**IPC API** (prefix: `resource:`):

| Method                              | Description                                                           |
| ----------------------------------- | --------------------------------------------------------------------- |
| `resource:getProjectPath`           | Get project directory path (no creation)                              |
| `resource:ensureProjectDir`         | Ensure project directory exists, return paths                         |
| `resource:clearProjectDir`          | Clear contents (keep structure), optionally for specific subdirectory |
| `resource:deleteProjectDir`         | Delete project directory entirely                                     |
| `resource:getProjectStats`          | Get size/file count statistics                                        |
| `resource:createProjectSubDir`      | Create custom subdirectory                                            |
| `resource:getSegmentsData`          | Get segments data for subtitle (reads from project folder)            |
| `resource:updateSegmentsData`       | Update segments data for subtitle (writes to project folder)          |
| `resource:cleanupSegmentsResources` | Delete old segments-type resources from database                      |
| `resource:createSubtitleEditTrack`  | Create a subtitle edit track in `data/tracks/`                        |
| `resource:getSubtitleEditTracks`    | List subtitle edit tracks                                             |
| `resource:updateSubtitleEditTrack`  | Update subtitle-edit track segments in config file                    |
| `resource:deleteSubtitleEditTrack`  | Delete a subtitle edit track                                          |
| `resource:deleteTranslation`        | Delete a translation file from `data/translations/`                   |
| `resource:createTTSTrack`           | Create a TTS track in `data/tracks/`                                  |
| `resource:getTTSTracks`             | List TTS tracks                                                       |
| `resource:updateTTSTrack`           | Update TTS track configuration                                        |
| `resource:deleteTTSTrack`           | Delete a TTS track (config + audio files)                             |
| `resource:createMediaTrack`         | Create a media track in `data/tracks/`                                |
| `resource:getMediaTracks`           | List media tracks                                                     |
| `resource:updateMediaTrack`         | Update media track configuration                                      |
| `resource:deleteMediaTrack`         | Delete a media track                                                  |

**Usage example:**

```typescript
// Renderer process
const result = await window.YUA.resource['resource:ensureProjectDir']({
  resourceId: 'xxx-xxx-xxx',
  workspaceId: 'ws-xxx',
  subDirs: ['outputs', 'cache', 'temp', 'data'] // Optional, defaults to all
});

// result.path: "/workspace/projects/xxx-xxx-xxx.resproject"
// result.subDirs.outputs: "/workspace/projects/xxx-xxx-xxx.resproject/outputs"
// result.subDirs.cache: "/workspace/projects/xxx-xxx-xxx.resproject/cache"
// result.subDirs.temp: "/workspace/projects/xxx-xxx-xxx.resproject/temp"
// result.subDirs.data: "/workspace/projects/xxx-xxx-xxx.resproject/data"
```

### Workflow Integration

The workflow engine provides `getResourceProjectDirs` callback through `ExecutionContext`:

```typescript
// In workflow nodes
if (ctx.getResourceProjectDirs) {
  const dirs = await ctx.getResourceProjectDirs('transcribe');
  // dirs.outputsDir - for final export files
  // dirs.cacheDir - for reusable intermediate files (e.g., transcoded audio)
  // dirs.tempDir - for temporary outputs (e.g., SRT, segments.json)
  // dirs.dataDir - for persistent data files
}
```

### Lifecycle Integration

- **Permanent delete**: Project directory is automatically cleaned up when a resource is hard-deleted
- **Soft delete**: Project directory is preserved (resource can be restored)
- **Subdirectory types**: `outputs`, `cache`, `temp`, `data` are predefined; custom subdirectories can be created
- **macOS package**: The `.resproject` suffix allows future registration as a custom package type that can be opened by double-clicking

**For AI contributors**: When implementing features that generate files from resources (e.g., video frame extraction, audio processing, AI analysis results), use the project directory instead of creating files alongside the original resource. This keeps the resources folder clean and makes cleanup predictable.

- Use `cache/` for reusable intermediate files (e.g., transcoded audio that can be reused)
- Use `temp/` for task outputs that are consumed by other processes (e.g., transcription SRT files)
- Use `data/` for persistent data files that need to be kept
  - `data/segments/` - Segments data with word-level timestamps
  - `data/translations/` - Translation JSON files
  - `data/clips/` - Media clip/segment data (timeline markers, cuts)
  - `data/tracks/` - Track configuration files (subtitle-edit, tts, media tracks) - **do NOT create database resources for tracks**
- Use `outputs/` for final export-ready files

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
- `resources/providers/README.md` - Provider icon assets
- `docs/memory-system/` - Memory system design documents (retrieval pipeline, extraction, note spec)
- `docs/sprite-core/` - Sprite core engine documentation (architecture, events, refactor plan)
- `docs/persona-system/` - Persona character system design

## Documentation Maintenance Rules

> **This section is a mandatory process for all AI contributors (and human developers). Every code change must consider its documentation impact.**

### Rule 1: Major System Changes — Mandatory CLAUDE.md Review

When making **architectural, cross-cutting, or design-level changes** (examples: new lifecycle rules, new IPC domains, schema migrations, new subsystems, changes to core patterns), you **MUST**:

1. **Review** all relevant sections of `CLAUDE.md` to check if they need updating.
2. **Update** affected sections (Architecture, Design Principles, Important Notes, etc.) to reflect the new behavior.
3. **Add new sections** if the change introduces a new design principle, subsystem, or cross-cutting concern that future contributors need to know.

**What counts as "major":**

- New or changed database tables/columns
- New IPC handler domains or changes to IPC patterns
- Changes to resource lifecycle, workflow engine, AI service layer, or plugin system
- New Electron windows or changes to window management
- Changes to build, packaging, or native module handling
- New cross-cutting design principles or patterns

### Rule 2: Feature Updates — Maintain Corresponding Module Docs

When making **feature-level changes** (examples: new workflow node, new AI provider, new resource type, UI page additions), you **MUST**:

1. **Update the module-level doc** closest to the change:
   - AI features → `packages/ai/ai-module-design.md`
   - Workflow features → `packages/workflow/README.md`
   - Provider icon assets → `resources/providers/README.md`
   - User-facing features → `README.md`
2. **If no module doc exists** for the area you changed, consider whether one should be created (e.g., a new `packages/<module>/README.md`).
3. **Update `CLAUDE.md`** only if the feature change affects architecture awareness (e.g., adds a new handler domain, a new resource type to the enum, or a new event).

**What counts as "feature-level":**

- New workflow nodes
- New AI provider adapters
- New resource types (add to the type enum docs)
- New UI pages or routes
- New plugin resource types
- Bug fixes that change externally visible behavior

### Rule 3: Documentation Change Checklist

Before completing any task, run through this checklist:

- [ ] Does this change affect how the system **architecture** works? → Update `CLAUDE.md` Architecture section
- [ ] Does this change introduce a new **design principle** or **lifecycle rule**? → Add to `CLAUDE.md` Design Principles
- [ ] Does this change add a new **IPC handler domain**? → Update `CLAUDE.md` IPC section and Handler domains list
- [ ] Does this change add or modify a **database table/column**? → Update `CLAUDE.md` Database Architecture section
- [ ] Does this change affect a specific **module** (AI, workflow, plugins, etc.)? → Update the module's own README/doc
- [ ] Does this change add a new **troubleshooting** scenario? → Update `CLAUDE.md` Troubleshooting section
- [ ] Does this change add a new **development command** or script? → Update `CLAUDE.md` Development Commands section
