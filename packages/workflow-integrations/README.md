# Workflow Integrations

Private host-application capabilities, nodes, adapters, persistence, and IPC contracts for `@chobits/workflow`.

This package may depend on application repositories and host services. The public workflow package must never import this package. Existing node IDs and preset behavior remain stable through explicit definition migration.

## Current domains

- `resource`: read/write repositories, downloads, workspace copies, and run context updates.
- `ai`: provider/preset/secret execution and usage tracking.
- `local-processing`: FFmpeg, ASR, plugin resources, and resource project directories.
- `ocr`: PaddleOCR runtime plus local OCR execution.
- `rendering`: Electron HTML screenshot rendering.
- `nodes`: 26 application node implementations grouped by domain.
- `plugins`: 7 local engine/model plugin implementations.
- `persistence`: SQLite/Drizzle workflow store and preset loader.
- `composition`: the complete capability resolver and named execution-group limits.
- `client`: shared application IPC channels, request/result/event contracts, and a transport-neutral renderer client.

The Electron host composition lives in `electron/main/workflow` and injects a public `WorkflowRuntimeFacade` into scheduler and Pi sessions. Legacy files under `packages/workflow/nodes`, `plugins`, `store.ts`, and host adapter paths currently only forward to the private implementations or Electron host. The private boundary check enforces that split, prevents imports from the public workflow source closure, and rejects direct renderer `wf:*` IPC calls.

These forwarders are temporary Phase 6-10 migration artifacts. Phase 11 will migrate remaining tests and imports, move each implementation to its final owner, and delete the forwarders before the first external release. They are not a supported integrations API and are not shipped in the public tarball. See the [workflow legacy removal plan](../../docs/workflow/legacy-removal-plan.md) for the removal batches and data migration gates.

Run the package type check from the repository root:

```text
pnpm workflow:integrations:check
```
