# Memory System Review and Priority Fixes

Date: 2026-04-11
Scope: `mempalace` reference analysis + current local implementation review
Workspace: `F:\Develop\chobits`

## 1. Executive Summary

Current conclusion:

- The local memory system is already a complete first-generation implementation, not a thin demo.
- It is not a direct clone of `mempalace`; it is a different architecture centered on `Markdown + SQLite/FTS + topic graph + auto recall injection`.
- The main risk is no longer "missing major modules", but "some advanced capabilities appear implemented in docs and types, while the runtime path is only partially wired".

Current overall assessment:

- Architecture completeness: high
- Product integration completeness: high
- Retrieval correctness consistency: medium
- Source-of-truth consistency: medium
- Long-term scalability: medium
- Test coverage for memory core paths: medium

Execution principle:

1. Fix correctness first.
2. Then fix source-of-truth consistency.
3. Then unify behavior across entry points.
4. Only after that, do performance and recall-quality optimization.

## 2. Reference Repo vs Local System

### 2.1 `mempalace` core characteristics

- Preserves original exchanges more aggressively.
- Uses layered memory loading instead of relying mainly on generated summaries.
- Retrieval emphasis is "find the original evidence back".
- Diary and knowledge graph are treated as first-class memory surfaces.
- MCP/tool protocol is a major part of the runtime model.

Reference links:

- <https://github.com/milla-jovovich/mempalace/blob/main/README.md>
- <https://github.com/milla-jovovich/mempalace/tree/main/mempalace>
- <https://github.com/milla-jovovich/mempalace/blob/main/mempalace/layers.py>
- <https://github.com/milla-jovovich/mempalace/blob/main/mempalace/mcp_server.py>
- <https://github.com/milla-jovovich/mempalace/blob/main/mempalace/knowledge_graph.py>

### 2.2 Local system characteristics

- Uses extracted memory notes as the primary retrieval unit.
- Stores structured indices in SQLite and note bodies in Markdown.
- Uses a six-stage retrieval pipeline:
  `Query Analysis -> Topic Recall -> Note Recall -> Section Recall -> Targeted Read -> Context Assembly`
- Uses automatic system-prompt enrichment for memory recall.
- Uses generated `memory/MEMORY.md` as a compact long-term summary layer.

### 2.3 Practical conclusion

The local system is better suited for an Electron desktop workspace product, but it has a stronger dependency on extraction quality. Compared with `mempalace`, it has better integration and maintainability, but weaker original-evidence fidelity.

## 3. Priority Repair Checklist

## P0 - Must Fix First

These items affect correctness, data consistency, or the truthfulness of the retrieval layer. Do not start optimization before these are fixed.

### P0-1. Fix entity fact recall path being wired as topic expansion

Status:

- Implemented in local worktree on 2026-04-11
- Verified by `test/memory-retrieval-service.spec.ts`

Problem:

- In `packages/ai/services/memory-retrieval-service.ts`, Stage 2e pushes `evidenceNoteId` into `expanded`.
- Stage 3 then treats every `allTopicIds` entry as a topic id and calls `listNotesByTopicId(...)`.
- This means entity fact expansion is currently mixed into the topic channel and will not reliably recall the intended notes.

Files:

- `packages/ai/services/memory-retrieval-service.ts`

Key locations:

- `recallTopics()`
- `recallNotes()`

Impact:

- Entity fact graph recall is logically incorrect.
- The feature appears present in docs, types, and DB schema, but the runtime path is not actually correct.
- Queries involving person/project facts may silently underperform.

Recommended fix:

- Separate "topic expansion results" from "fact-derived note ids".
- Add a dedicated field on `TopicRecallResult`, for example `factNoteIds: string[]`.
- In Stage 3, merge `factNoteIds` directly into note candidates through `getNoteById()` or a dedicated batch fetch path.
- Do not route note ids through `listNotesByTopicId()`.

Acceptance criteria:

- A query that matches an entity fact can retrieve the `evidenceNoteId` note even when no matching topic is hit.
- Stage 2 and Stage 3 logs clearly distinguish `topic ids` vs `fact note ids`.
- Add tests for:
  - direct topic recall
  - entity fact only recall
  - both together

Priority reason:

- This is a correctness bug in a flagship enhancement path.

### P0-2. Restore source-of-truth consistency for `domain` and entity `relations`

Status:

- Implemented in local worktree on 2026-04-11
- Verified by `test/memory-note-fact-roundtrip.spec.ts`

Problem:

- `MemoryNoteFrontmatter` includes `domain`.
- `MemoryNoteEntity` includes `relations`.
- But `packages/ai/services/memory-note-writer.ts` does not serialize `domain`.
- The writer also serializes `entities` only as `name/type`, not `relations`.
- `electron/main/db/schema.ts` does not persist `domain` on `memory_notes`.

Files:

- `packages/ai/services/memory-types.ts`
- `packages/ai/services/memory-note-writer.ts`
- `packages/ai/services/memory-note-parser.ts`
- `electron/main/db/schema.ts`
- `packages/ai/services/memory-extraction-service.ts`

Impact:

- The statement "Markdown is the fact source" is not true for all memory fields.
- Important memory metadata exists only in transient runtime objects or topic rows.
- Rebuild and audit fidelity are reduced.

Recommended fix:

- Add `domain` to note frontmatter rendering and parsing.
- Add entity `relations` serialization to frontmatter.
- Decide whether `memory_notes` should persist `domain` too. Recommended: yes.
- If `relations` are important enough to drive graph writes, they must survive a full rebuild from Markdown.

Implemented:

- `memory-note-writer.ts` now serializes `domain` and nested `entities[].relations[]`.
- `memory-note-parser.ts` now supports nested YAML arrays/objects needed for `entities[].relations[]`.
- `memory_notes` now persists `domain` in schema and migration `0013_tidy_memory_domain.sql`.
- `writeMemory()` now writes note-level `domain` into `memory_notes`.
- Merge now preserves existing entity relations when later updates mention the same entity without restating the relation facts.

Acceptance criteria:

- A note created with `domain` and entity `relations` can round-trip:
  runtime -> Markdown -> parser -> DB write -> retrieval.
- A full index rebuild from Markdown preserves the same domain and relation facts.

Priority reason:

- This is a source-of-truth integrity issue, not just a missing field.

### P0-3. Make runtime extraction config actually govern runtime behavior

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-extraction-runtime-config.spec.ts`

Problem:

- `memory-config.ts` exposes:
  - `minNewMessagesForExtraction`
  - `extractionCooldownMinutes`
  - `maxTokensPerExtraction`
  - `periodicSaveInterval`
- But `extraction-worker.ts` still hardcodes:
  - `MIN_NEW_MESSAGES = 4`
  - `MIN_TRIGGER_COOLDOWN = 15s`
  - `maxTokens = 4000`
- Only `periodicSaveInterval` is currently read dynamically.

Files:

- `electron/main/handlers/memory/memory-config.ts`
- `electron/main/handlers/memory/extraction-worker.ts`
- `packages/ai/services/memory-types.ts`

Impact:

- UI/config behavior is misleading.
- Tuning extraction in production is not reliable.
- Docs and runtime behavior are drifting apart.

Recommended fix:

- Replace hardcoded thresholds in worker trigger logic with config values.
- Convert `extractionCooldownMinutes` to milliseconds at read time.
- Replace extraction `maxTokens` hardcode with config-driven values.
- Align `memory-types.ts` defaults and `memory-config.ts` defaults.

Implemented:

- Added `electron/main/handlers/memory/extraction-runtime-config.ts` as the runtime normalization and trigger-decision layer.
- `memory-config.ts` now normalizes persisted values through the shared runtime config helper, including cooldown minute-to-ms conversion.
- `extraction-worker.ts` now uses config-driven cooldowns, message thresholds, periodic-save trigger evaluation, `maxTokens`, and startup effective-config logging.
- `packages/ai/services/memory-types.ts` defaults are now aligned with runtime config defaults.

Acceptance criteria:

- Changing config changes actual trigger thresholds and token budgets.
- Logs print effective config values at worker startup.
- Add tests for threshold behavior and periodic-save behavior.

Priority reason:

- This affects user trust and operational control.

### P0-4. Unify retrieval capability across auto-recall and explicit memory tools

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-retrieval-db-deps-parity.spec.ts`
- Regression-checked with `test/memory-retrieval-service.spec.ts` and `test/memory-auto-recall-trace.spec.ts`

Problem:

- The Electron-side retrieval deps include:
  - `searchNotesByTerms`
  - `listRecentImportant`
- The Pi tool-side retrieval deps currently do not expose the same full set.
- This causes different retrieval quality between:
  - auto recall path
  - `memorySearchTool`
  - other explicit memory tools

Files:

- `electron/main/handlers/memory/retrieval-db-deps.ts`
- `packages/ai/runtime/pi/tools/memory-db-deps.ts`
- `packages/ai/runtime/pi/tools/memory-search.ts`

Impact:

- User-visible inconsistency: automatic memory may find results that explicit search does not, or vice versa.
- Harder to debug retrieval behavior.

Recommended fix:

- Make `buildRetrievalDbDeps()` in both places expose the same retrieval features unless there is a deliberate security restriction.
- Document any intentional differences.
- Consider routing both through one shared builder if possible.

Implemented:

- `packages/ai/runtime/pi/tools/memory-db-deps.ts` now exposes `searchNotesByTerms` and `listRecentImportant`, matching the Electron-side retrieval deps capability set.
- Explicit Pi memory tools now receive the same optional retrieval surfaces that auto-recall already had available.
- Added a parity regression test to lock the two retrieval-deps builders to the same optional capability set.

Acceptance criteria:

- The same query against the same workspace produces consistent recall candidates regardless of entry point.
- Differences, if any, are documented and intentional.

Priority reason:

- This is a correctness and debuggability issue across user-facing surfaces.

## P1 - High Priority After P0

These items do not invalidate the system immediately, but they will become painful quickly.

### P1-1. Replace per-note FTS full rebuild with incremental update strategy

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-fts-repo.spec.ts`

Problem:

- `MemoryFTSRepo.rebuildForNote()` drops and recreates the entire FTS table, then reinserts all rows except the target note, then reinserts the target note.
- `deleteByNote()` also rebuilds globally.

Files:

- `electron/main/db/memory-repositories.ts`

Impact:

- Write cost grows with memory volume.
- Reindex work is repeated for every note update.
- Concurrency and large-memory performance will degrade.

Recommended fix:

- Revisit the contentless FTS strategy.
- Prefer one of:
  - normal content table + triggers
  - external content table
  - manual shadow table with row-level replace/delete support
- If keeping contentless FTS, add a batch queue and coalesced rebuild strategy rather than rebuild-per-note.

Acceptance criteria:

- Updating one note does not require full FTS drop/rebuild.
- Memory write cost scales close to O(changed note), not O(all notes).

Implemented:

- Added `electron/main/db/memory-fts-repo.ts` as the optimized FTS repository used by runtime write, retrieval, cleanup, and IPC rebuild paths.
- `rebuildForNote()` now performs note-scoped `DELETE` + `INSERT` inside one transaction instead of dropping and rebuilding the whole FTS table.
- `deleteByNote()` now removes only rows for the target `note_id`.
- `truncate()` now clears the FTS table with row deletion instead of drop/recreate.
- Added `electron/main/db/memory-fts.ts` to hold the shared FTS DDL and legacy contentless-schema detection helper.
- Startup DB init now detects the old contentless `memory_notes_fts`, recreates it as a row-mutable FTS table, and rebuilds it from `memory_notes` + `memory_sections` if migration is needed.
- Added regression tests covering:
  - row-scoped delete behavior
  - row-scoped rebuild behavior
  - legacy contentless-schema detection

Priority reason:

- This is the main scalability bottleneck.

### P1-2. Add core regression tests for extraction, merge, retrieval, cleanup

Status:

- Implemented in local worktree on 2026-04-12
- Verified by:
  - `test/memory-extraction-pipeline.spec.ts`
  - `test/memory-cleanup.spec.ts`
  - `test/memory-content-gen.spec.ts`
  - expanded `test/memory-retrieval-service.spec.ts`

Problem:

- Current memory-specific test coverage is thin.
- The found test coverage is mainly for auto-recall trace behavior.

Files:

- `test/`
- memory service modules

Recommended minimum test matrix:

- extraction:
  - split -> extract -> merge create
  - merge update
  - open items resolution fallback path
  - source excerpts gating
- retrieval:
  - topic hit
  - FTS hit
  - LIKE fallback hit
  - entity fact hit
  - broad recall fallback
- cleanup:
  - remove one source conversation
  - orphan note delete
  - topic/keyword orphan cleanup
- content generation:
  - `MEMORY.md` critical facts output
  - `INDEX.md` generation
  - recall cue preference behavior

Acceptance criteria:

- Core memory flows have deterministic regression tests.
- P0 fixes are covered before additional feature work.

Implemented:

- Added extraction regression coverage for:
  - split -> extract -> merge -> write create flow
  - single-conversation seq-range fallback during extraction
  - source excerpts high-importance gating
  - merge open-items fallback when the LLM merge step fails
- Added retrieval regression coverage for:
  - entity fact direct note recall
  - topic + fact merged recall
  - LIKE fallback recall when FTS misses
  - broad recall fallback to recent workspace notes
- Added cleanup regression coverage for:
  - removing one source conversation while keeping shared notes
  - fully deleting orphaned notes and their Markdown files
- Added content-generation regression coverage for:
  - `MEMORY.md` critical facts output
  - recall cue preference behavior
  - `INDEX.md` browse index generation

Priority reason:

- Without this, every enhancement increases hidden breakage risk.

### P1-3. Make diary a real memory surface or explicitly keep it as a log

Status:

- Implemented in local worktree on 2026-04-12
- Chosen direction: Option A, keep diary as a plain log surface
- Verified by `test/memory-diary-tool.spec.ts`

Problem:

- `memoryDiaryTool` writes Markdown diary entries only.
- It is not indexed into DB/FTS/graph.
- It is registered as a tool descriptor, but not part of default session tool activation.

Files:

- `packages/ai/runtime/pi/tools/memory-diary.ts`
- `packages/ai/runtime/pi/tools/index.ts`
- `packages/ai/runtime/pi/tool-registry.ts`

Impact:

- The feature exists but is weak compared with its conceptual role.
- It is closer to journaling than retrievable agent memory.

Recommended fix:

- Decide explicitly:
  - Option A: keep as plain log, document that it is not part of retrieval.
  - Option B: integrate diary into indexing and retrieval.
- If Option B:
  - define diary schema
  - FTS indexing
  - diary-specific retrieval rules
  - optional diary-to-topic linking

Implemented:

- Kept diary as a log-only surface rather than indexing it into memory DB / FTS / topic graph.
- `memoryDiaryTool` runtime description now explicitly states that diary entries do not enter long-term memory retrieval or auto-recall.
- Tool result payload now returns explicit non-retrievable signals:
  - `surface: "log-only"`
  - `indexed: false`
  - `searchable: false`
  - `recallable: false`
- Newly created diary files now include a header note that they are log-only and not part of memory retrieval.
- Tool metadata and label wording now present diary as logging rather than memory saving.
- `memory-diary` remains registered but stays outside `DEFAULT_SESSION_TOOL_IDS`.

Acceptance criteria:

- The product behavior matches the docs and feature naming.

Priority reason:

- This is currently ambiguous product behavior.

### P1-4. Align docs with actual runtime state

Status:

- Implemented in local worktree on 2026-04-12
- Reconciled across:
  - `docs/memory-system/memory-retrieval-pipeline.md`
  - `docs/memory-system/memory-note-spec.md`
  - `docs/memory-system/memory-sync-extraction.md`
  - `docs/memory-system/Memory System 编码实现计划.md`

Problem:

- Some legacy doc lines no longer reflect current runtime.
- Some new capabilities are documented at a higher maturity level than runtime reality.

Files:

- `docs/memory-system/Memory System 编码实现计划.md`
- `docs/memory-system/memory-retrieval-pipeline.md`
- `docs/memory-system/memory-note-spec.md`
- `docs/memory-system/memory-sync-extraction.md`

Recommended fix:

- After P0 fixes, do one doc reconciliation pass.
- Mark each feature as:
  - implemented
  - partially wired
  - planned
- Remove statements that imply a fully working path where runtime is still partial.

Implemented:

- Retrieval docs now reflect the real runtime split between `search()` and `searchWithContent()`.
- Topic recall docs now describe `factNoteIds` and the direct note merge path for `entity_fact.evidenceNoteId`.
- Note spec docs now include the real frontmatter/runtime fields:
  - `timeRange`
  - `parentTopicId`
  - `relatedTopicIds`
  - `domain`
  - `aliases`
  - `entities[].relations[]`
- Extraction docs now reflect runtime-config wiring, regression coverage, and note-scoped incremental FTS maintenance with startup migration from legacy contentless FTS.
- Plan docs now document the current tool/runtime state, including diary being registered but not part of the default retrieval surface.

Acceptance criteria:

- Docs become a reliable engineering reference again.

Priority reason:

- Prevents future design drift and onboarding confusion.

## P2 - Important but Can Wait Until Core Repair Is Stable

### P2-1. Improve contradiction handling from appended warnings to structured state

Status:

- Implemented in local worktree on 2026-04-12
- Verified by:
  - `test/memory-note-fact-roundtrip.spec.ts`
  - `test/memory-extraction-pipeline.spec.ts`
  - `test/memory-retrieval-service.spec.ts`

Current state:

- Contradictions are now stored as structured `frontmatter.contradictions[]` state and rendered into a dedicated `Contradictions` section.

Problem:

- This is useful as a first pass, but it mixes canonical memory and conflict annotations in one section.

Recommended direction:

- Store contradictions as structured metadata or dedicated sections.
- Let retrieval decide whether to surface canonical fact, latest fact, or conflict summary.

Implemented:

- Added structured contradiction state to note frontmatter:
  - `contradictions[].old`
  - `contradictions[].new`
  - `contradictions[].type`
  - `contradictions[].detectedAt`
- `renderNoteMarkdown()` now reserves an explicit `Contradictions` section between `Key Points` and `Open Items`.
- `mergeMemory()` now:
  - strips the old inline contradiction appendix format from `Key Points`
  - migrates legacy inline contradiction warnings into structured state on the next merge
  - removes contradicted old bullets from canonical `Key Points`
  - renders a dedicated `Contradictions` section for conflict history
- Retrieval now recognizes contradiction-oriented queries (`矛盾` / `冲突` / `conflict` / `contradiction`) and prioritizes the `Contradictions` section during section recall.

Acceptance criteria:

- Contradiction state survives Markdown round-trip as structured frontmatter data.
- Canonical `Key Points` no longer need to carry inline warning blocks for detected contradictions.
- A contradiction-oriented query can preferentially read the `Contradictions` section.

### P2-2. Revisit note merge strategy for summary and section accumulation

Status:

- Implemented in local worktree on 2026-04-12
- Verified by:
  - `test/memory-extraction-pipeline.spec.ts`
  - `test/memory-note-fact-roundtrip.spec.ts`

Current state:

- Several sections are merged by concatenation.

Problem:

- Over time this may create bloated notes and uneven quality.

Recommended direction:

- Add periodic compaction or regeneration rules for old notes.
- Consider note refresh thresholds based on version count or character count.

Implemented:

- `mergeMemory()` now refreshes `frontmatter.summary` from the latest extraction result instead of leaving old summaries stale forever.
- `Key Points` now merge through deterministic bullet dedupe and are capped to 15 items, so updates do not grow by raw concatenation.
- `Open Items` still use the LLM-assisted resolution path first, but the final section is now compacted back into a bounded unique bullet list.
- `Recall Cues` now merge through normalized unique bullets with a bounded cap, keeping the section aligned with long-term-memory intent instead of accumulating duplicates.
- `Source Excerpts` now replace older excerpt blocks with the latest extracted excerpt set when new excerpts are provided, instead of appending forever.

Acceptance criteria:

- Updating an existing note refreshes its note-level summary.
- Repeated merges do not indefinitely grow `Key Points`, `Open Items`, `Recall Cues`, or `Source Excerpts` through raw append-only behavior.
- Section-level compaction remains deterministic and covered by regression tests.

### P2-3. Add rebuild-from-Markdown audit mode

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-index-audit.spec.ts`

Problem:

- There is no explicit audit mode proving DB/index can be reconstructed faithfully from Markdown.

Recommended direction:

- Add a validation command or IPC path:
  - parse all notes
  - compare against DB/index state
  - emit mismatch report

Implemented:

- Added `electron/main/handlers/memory/memory-index-audit.ts` with `validateMemoryIndex(workspaceId, { issueLimit? })`.
- Added IPC entry `memory:validateIndex` and preload bridge `window.YUA.memory.validateIndex(...)`.
- The audit now scans Markdown truth sources under `memory/daily/**/*.md` and compares derived expectation against:
  - `memory_notes`
  - `memory_sections`
  - `memory_notes_fts`
- The report distinguishes:
  - `markdownIssues`
  - `noteIssues`
  - `sectionIssues`
  - `ftsIssues`
- The current mode is deliberately read-only: it reports drift but does not mutate DB or rebuild note state.

Acceptance criteria:

- A workspace can produce a deterministic mismatch report from Markdown truth sources alone.
- Missing / stale DB note rows, section rows, and FTS rows are all surfaced in one report.
- The baseline aligned case and a drift case are both covered by regression tests.

### P2-4. Improve retrieval scoring transparency

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-retrieval-service.spec.ts`

Problem:

- Ranking uses mixed heuristic weights, but score explainability is limited.

Recommended direction:

- Return structured scoring breakdown in debug mode.
- Make it easier to inspect why a note won.

Implemented:

- `packages/ai/services/memory-retrieval-service.ts` now records structured `matchReasons` and `scoreBreakdown` for ranked note candidates.
- `search()` now supports `debug?: boolean` and can return:
  - per-note `scoreBreakdown`
  - top-level `debug.analysis`
  - top-level `debug.weights`
  - top-level `debug.topicRecall`
  - top-level `debug.noteRanking`
- Explicit retrieval entry points now expose the same debug switch:
  - `memorySearchTool`
  - `memory:search`
  - preload `window.YUA.memory.search(...)`
- Stage 3 debug logs now print weighted component breakdowns and route tags instead of only a final score.

Acceptance criteria:

- Debug mode is optional and does not change the normal retrieval payload shape unless requested.
- Ranked notes expose raw and weighted component scores together with recall-route tags such as `topic:*`, `fts:note`, `entity_fact`, `like_fallback`, `date_range`, `broad_recall`.
- Tool-side and renderer-side explicit retrieval surfaces can inspect the same explanation payload.

## 4. Suggested Execution Order

Recommended implementation order:

1. P0-1 entity fact recall path
2. P0-2 source-of-truth consistency for `domain` and `relations`
3. P0-3 config actually controls runtime
4. P0-4 unify retrieval deps and entry-point behavior
5. P1-2 add regression tests for the above
6. P1-1 replace FTS full rebuild strategy
7. P1-4 doc reconciliation
8. P1-3 decide diary product direction
9. P2 items

Reason for this order:

- The first four items repair correctness and system truthfulness.
- Tests should land right after the first repair wave, not at the end.
- Docs should be reconciled immediately after the repair wave, so the next product decision is made against the real runtime.
- Performance work should happen only after the model is correct.

## 5. Repair Acceptance Gate

Do not start optimization until all conditions below are met:

- Entity fact recall has a correct note-path and regression tests.
- `domain` and entity `relations` survive full round-trip through Markdown and DB.
- Memory runtime config actually changes worker behavior.
- Auto-recall and explicit memory search behave consistently on the same dataset.
- Core regression tests exist for extraction, retrieval, cleanup, and content generation.

## 6. Optimization Backlog After Repairs

Only start these after the repair acceptance gate passes.

### O1. Retrieval quality optimization

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-retrieval-service.spec.ts`

- Improve Chinese tokenization behavior beyond current FTS + LIKE fallback.
- Add better query rewriting and synonym expansion.
- Improve section targeting for evidence-style questions.

Implemented:

- Retrieval now expands query terms before FTS and LIKE fallback, including:
  - CJK bigram expansion for dense Chinese phrases
  - delimiter-based term splitting
  - small synonym rewrites for evidence / vector / memory / retrieval vocabulary
- Evidence-oriented section recall now prioritizes `Source Excerpts` ahead of `Key Points`, so "why / evidence / 证据 / 依据" style questions are more likely to land on quoted support first.

Acceptance criteria:

- Chinese queries without ideal token boundaries still produce useful fallback search terms.
- Explicit evidence-seeking queries can prefer `Source Excerpts` when that section exists.
- Query-term expansion behavior is regression-tested.

### O2. Memory compaction and note lifecycle optimization

Status:

- Implemented in local worktree on 2026-04-12
- Verified by `test/memory-content-gen.spec.ts`

Implemented:

- `packages/ai/services/memory-content-gen.ts` now classifies meaningful notes into advisory lifecycle actions during `MEMORY.md` generation.
- Added `## Lifecycle Suggestions` output to `memory/MEMORY.md`, with read-only `archive`, `freeze`, `refresh`, and `compact` recommendations.
- Classification uses existing note signals only:
  - `importance`
  - `stability`
  - note age / recency
  - presence of `Open Items`
  - Markdown body size
- Very stable old notes can now be surfaced as:
  - archive candidates
  - freeze candidates
- Stale but still relevant notes can now be surfaced as refresh candidates.
- Aging dense notes can now be surfaced as compaction candidates without introducing new DB schema or mutating the source Markdown note automatically.

Acceptance criteria:

- `MEMORY.md` can surface lifecycle governance hints without degrading into a browse index.
- Archive / freeze / refresh / compact heuristics are deterministic and regression-tested.
- The feature remains advisory-only and does not rewrite notes or alter retrieval truth sources.

### O3. Recall latency optimization

Status:

- Implemented in local worktree on 2026-04-12
- Verified by:
  - `test/memory-retrieval-service.spec.ts`
  - `test/memory-auto-recall-trace.spec.ts`
  - `test/memory-retrieval-db-deps-parity.spec.ts`

Implemented:

- `RetrievalDbDeps` now supports optional batch helpers:
  - `listNotesByIds`
  - `listSectionsByNoteIds`
- Electron auto-recall and Pi memory tools now both expose the same batch retrieval surfaces through their shared deps builders.
- Stage 3 note recall now batch-loads:
  - fact-derived evidence notes
  - FTS-only note misses
- Stage 4 section recall now batch-loads section metadata across candidate notes instead of per-note N+1 reads.
- Stage 5 targeted read now caches file contents per note path, avoiding repeated file reads when multiple matched sections come from the same Markdown note.
- `search()` now batch-loads section summaries for `includeContent=true`.
- Auto-recall now reuses the analysis it already prepared from the user message + extracted keywords when calling `searchWithContent()`, instead of paying for a second query-analysis pass.

Acceptance criteria:

- Auto-recall and explicit retrieval can reuse prepared analysis state instead of always re-analyzing from scratch.
- Stage 4 / Stage 5 no longer rely on avoidable per-note metadata reads in the common path.
- Batch note/section loading behavior is regression-tested and available consistently across Electron and Pi retrieval entry points.

### O4. Better "always-loaded" layer

Status:

- Implemented in local worktree on 2026-04-12
- Verified by:
  - `test/memory-content-gen.spec.ts`
  - `test/memory-auto-recall-trace.spec.ts`

Implemented:

- `packages/ai/services/memory-content-gen.ts` now emits a structured always-loaded layer in `memory/MEMORY.md`, including:
  - `## Critical Facts`
  - `## User Preferences`
  - `## Active Projects`
- `packages/ai/services/memory-auto-recall.ts` new-session preload now parses and injects all always-loaded sections from `MEMORY.md`, instead of only loading `Critical Facts`.
- The always-loaded loader now caches parsed sections per workspace root for 5 minutes, keeping new-session preload cheap across repeated conversations.
- Always-loaded generation stays advisory-only and derives from existing note signals:
  - `Recall Cues`
  - `Open Items`
  - note `summary`
  - `importance`
  - `stability`
- Fixed `extractSectionBody()` in content generation so multi-bullet `Recall Cues` / `Open Items` sections are consumed completely instead of truncating after the first line.

Acceptance criteria:

- New sessions can preload critical facts, stable user preferences, and active-project summaries without requiring a keyword search first.
- `MEMORY.md` keeps the always-loaded layer compact and structured rather than collapsing back into a browse index.
- The generation path and preload consumption path are both regression-tested.

### O5. Diary optimization

- If diary becomes indexed memory:
  - separate diary retrieval from factual memory retrieval
  - add diary-to-topic linking
  - add temporal weighting

## 7. Immediate Next Action Recommendation

Recommended next implementation task:

- Continue with `O5 diary optimization` only if product direction changes and diary should become a retrievable memory surface; otherwise revisit deeper retrieval/runtime caching.

Why:

- `P0-1` through `P0-4` are implemented in the local worktree.
- `P1-2` regression coverage is now in place across extraction, retrieval, cleanup, and content generation.
- `P1-1` has reduced the main FTS write-scaling bottleneck.
- `P1-3` diary positioning is now explicit and no longer blocks product understanding.
- `P2-3` now provides the missing read-only audit path proving DB / FTS drift can be checked against Markdown truth sources.
- `P2-1` now separates contradiction state from canonical memory and makes contradiction-focused recall addressable.
- `P2-4` now exposes inspectable score weights, route tags, and ranked-note breakdowns for explicit retrieval debugging.
- `P2-2` now makes note merge behavior deterministic by refreshing summaries and compacting append-prone sections.
- `O1` now improves Chinese query expansion, synonym-friendly fallback, and evidence-style section targeting.
- `O2` now adds lifecycle governance hints to `MEMORY.md`, covering archive / freeze / refresh / compact suggestions without schema churn.
- `O3` now removes the main remaining N+1 retrieval reads and lets auto-recall reuse prepared analysis state.
- `O4` now upgrades the always-loaded layer beyond generated `Critical Facts`, adding structured `User Preferences` and `Active Projects` blocks plus new-session preload consumption.

After that:

- Continue with `O5 diary optimization` if product direction changes, or revisit deeper retrieval/runtime caching.
