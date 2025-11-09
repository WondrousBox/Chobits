# Workflow System (Electron Main)

This module provides a pluggable workflow engine to process managed resources in the main process.

- Nodes have explicit inputs/outputs with simple runtime validation.
- Plugins declare capabilities and installation checks (e.g., FFmpeg, Tesseract) and may prepare environment.
- DAG execution with topological order, fail-fast or continue-on-error strategy.
- IPC endpoints to create/list/validate/run workflows from the renderer.
- Persistence stored under userData (`workflows.json`) for definitions and run history.

## Folder structure

- `types.ts` — core types for nodes, workflows, plugins, runtime records.
- `registry.ts` — registries for node handlers and plugins.
- `engine.ts` — execution engine and validation.
- `store.ts` — simple JSON store (easily replaceable with Drizzle).
- `plugins/` — built-in plugins: FFmpeg, Tesseract.
- `nodes/` — built-in nodes: start/end, load-resource, transcode, ocr, doc-to-md.
- `index.ts` — entry point to initialize the system and register IPC.

## IPC

- `wf:listNodes` → NodeSpec[]
- `wf:listPlugins` → Plugin brief list
- `wf:listDefinitions` / `wf:getDefinition` / `wf:saveDefinition` / `wf:deleteDefinition`
- `wf:validate` → ValidateResult
- `wf:run` → { ok, runId? }
- `wf:getRun` / `wf:listRuns` / `wf:cancelRun`

## Samples

Two sample workflow definitions are seeded on init:

- `sample:ocr`: Start → LoadResource → OCR → End
- `sample:transcode`: Start → LoadResource → Transcode → End

To run a sample, call `wf:run` with `defId` and pass `{ path: '/abs/path/to/file' }` as initial payload.

## Extending

- Add a new node: implement a `NodeHandler` and `registerNode` it in `initWorkflowSystem`.
- Add a new plugin: implement a `Plugin` with `isInstalled` and `prepare`, then `registerPlugin` it.

## Notes

- The engine currently executes nodes sequentially (by topo order). Concurrency primitives are ready but not yet enabled per-edge; set `options.concurrency` for future scheduling policies.
- STT/docx/pdf extraction can be added by plugging dedicated plugins (e.g., Whisper, Mammoth, PDF.js pipeline) and nodes.
