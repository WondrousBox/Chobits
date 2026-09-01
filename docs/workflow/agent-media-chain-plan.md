# Agent Media Chain Workflow Plan

## Original Need

User expectation:

- When the user gives a video link and says they cannot understand it, the agent should plan the whole chain:
  1. download the video,
  2. transcribe the newly downloaded video,
  3. get the subtitle resource created by transcription,
  4. translate that subtitle.
- Each step should pass the concrete output from the previous step into the next step.
- After download completes, the agent should use the returned video `resourceId`.
- After transcription completes, the agent should use the returned subtitle `resourceId`.
- The agent must not search by the video title after it already has a fresh output ID, because fuzzy title search can return an older same-name resource and then translate the wrong subtitle.

Observed failure:

- The agent first looked up subtitle translation tools, then found the download tool.
- After downloading, it searched resources by the video title.
- The search returned an older same-name file.
- The agent translated that old subtitle instead of transcribing and translating the newly downloaded video.

## Diagnosis

The current system exposes useful tools, but the workflow contract is too loose:

- `youtubeDownloadTool` can return a downloaded video `resourceId`, but the tool instructions do not strongly require using it as the next step input.
- `workflowRunTool` returns `runRecord.output`, and transcription workflows can output the newly created subtitle `resourceId`, but the output is not normalized into an explicit "created resource" summary for the agent.
- Toolbox instructions still describe many workflows as "query resource first", which is valid for user-selected existing resources but harmful after a tool just created a resource.
- There is no explicit media-chain playbook saying "download -> transcribe -> translate" for vague comprehension requests.
- `resourceQueryTool` is too easy to misuse as a bridge between freshly produced resources.

## Design Goals

1. Preserve direct tool composability.
2. Make fresh `resourceId` outputs obvious and machine-readable.
3. Prefer deterministic chain state over fuzzy resource search.
4. Keep existing tools and workflows; avoid a large orchestration rewrite.
5. Add tests that lock down the intended chain behavior.

## Architecture Boundary

This plan describes an AI-tool consumer of the workflow runtime, not functionality that belongs inside the publishable workflow package. Under the [workflow target architecture](./architecture.md):

- `workflowRunTool` receives a host-provided runtime facade and uses only its public run contract.
- Permission checks, synchronous waiting versus background execution, tool-result normalization, and fresh-resource chain hints remain responsibilities of the host application's AI-tool layer.
- The public workflow runtime owns execution, cancellation, events, and terminal run records, but does not import agent tools, resource search, translation, or host providers.
- Resource, AI, transcription, and translation behavior enters the runtime through integration nodes and capabilities.

## Implementation Plan

### 1. Strengthen Tool Result Contracts

Update long-running tools so their JSON details and text content make the next resource ID explicit.

- `youtubeDownloadTool`
  - On completed download, include `resourceId`, `resource`, and `createdResource`.
  - Add a `next` hint: use this exact `resourceId` for transcription or other workflows.
  - Do not suggest resource search after a successful download.

- `workflowRunTool`
  - On completed workflow, inspect `runRecord.output` and node outputs.
  - Normalize resource outputs into:
    - `outputResourceId`
    - `outputResource`
    - `createdResources`
    - `producedResourceIds`
    - `next.resourceId`
  - For transcription workflows, mark the output as a subtitle candidate when the created resource type/ext indicates subtitle.

- `translationTool`
  - Keep requiring a subtitle `resourceId`.
  - Its description should say it must receive the subtitle resource ID from workflow output when the subtitle was just generated.

### 2. Add Agent Workflow Rules

Update `toolbox.md` to include a "fresh resource chain" rule:

- If a previous tool result contains `resourceId`, `outputResourceId`, `createdResources`, or `next.resourceId`, use that ID directly.
- Do not call `resourceQueryTool` to locate a resource that was just produced.
- Only use `resourceQueryTool` when the user asks about an existing resource and no exact ID is available.

Add a dedicated playbook:

- For "I do not understand this video/link" or equivalent:
  1. activate `youtubeDownloadTool`, `workflowRunTool`, `translationTool`,
  2. download with `waitForCompletion: true`,
  3. run transcription workflow with `input.resourceId = downloaded.resourceId`,
  4. translate with `resourceId = transcription.outputResourceId`,
  5. never search by title between these steps.

### 3. Improve Workflow Output Extraction

Implement a small helper in `workflow-run.ts`:

- Inspect final output and node outputs for resource-like values.
- Prefer terminal output resource IDs.
- Include node metadata when available.
- Return compact summaries so the model sees enough to continue without searching.

### 4. Tests

Add unit tests for:

- `workflowRunTool` normalizes transcription output `resourceId` into `outputResourceId` and `next.resourceId`.
- Toolbox search for a "download, transcribe, translate" style query returns a playbook containing the no-search chain rule.
- Existing toolbox tests are updated for new involved tools.

### 5. Acceptance Criteria

The ideal chain after a user provides a YouTube link and says they cannot understand it:

1. `youtubeDownloadTool({ url, waitForCompletion: true })`
2. Use returned `resourceId` directly.
3. `workflowRunTool({ action: "search", query: "transcribe subtitle" })` if workflow ID is not known.
4. `workflowRunTool({ action: "run", workflowId, input: { resourceId: downloadedResourceId }, waitForCompletion: true })`
5. Use returned `outputResourceId` or `next.resourceId` directly.
6. `translationTool({ resourceId: subtitleResourceId, targetLanguage, waitForCompletion: true })`

Disallowed in this chain:

- Searching resources by downloaded title after download completion.
- Searching subtitles by title after transcription completion.
- Translating a resource ID that did not come from the current chain unless the user explicitly chose it.

## Future Option

If the agent still struggles after these guardrails, add a higher-level `mediaUnderstandTool` that owns the complete download/transcribe/translate pipeline. That is more deterministic but less flexible, so this plan first improves the existing composable tool design.
