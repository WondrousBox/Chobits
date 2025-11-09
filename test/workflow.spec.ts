import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createEngine } from '../electron/workflow/engine';
import { DocToMarkdownNode } from '../electron/workflow/nodes/doc-to-md';
import { EndNode } from '../electron/workflow/nodes/end';
import { LoadResourceNode } from '../electron/workflow/nodes/load-resource';
import { StartNode } from '../electron/workflow/nodes/start';
import { FfmpegPlugin } from '../electron/workflow/plugins/ffmpeg';
import { TesseractPlugin } from '../electron/workflow/plugins/tesseract';
import { registerNode, registerPlugin } from '../electron/workflow/registry';

// Register minimal set (idempotent across tests)
registerPlugin(FfmpegPlugin);
registerPlugin(TesseractPlugin);
registerNode(StartNode);
registerNode(EndNode);
registerNode(LoadResourceNode);
registerNode(DocToMarkdownNode);

describe('WorkflowEngine basic', () => {
  it('runs a simple doc->markdown workflow', async () => {
    const engine = createEngine({
      resourcesDir: path.join(process.cwd(), 'resources'),
      userDataDir: os.tmpdir(),
      workspaceDir: undefined
    });
    const def = {
      id: 'test:doc-md',
      name: 'Doc MD',
      nodes: [
        { id: 'start', type: 'core/start' },
        { id: 'load', type: 'resource/load' },
        { id: 'conv', type: 'doc/to-markdown' },
        { id: 'end', type: 'core/end' }
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'start', port: 'payload' }, to: { nodeId: 'load', port: 'path' } },
        { id: 'e2', from: { nodeId: 'load', port: 'path' }, to: { nodeId: 'conv', port: 'file' } },
        { id: 'e3', from: { nodeId: 'conv', port: 'markdown' }, to: { nodeId: 'end', port: 'result' } }
      ],
      options: { concurrency: 1, errorStrategy: 'fail-fast' }
    };

    // Create temp text file
    const tmpFile = path.join(os.tmpdir(), 'wf-test.txt');
    await import('node:fs/promises').then((m) => m.writeFile(tmpFile, 'hello world'));

    const validation = await engine.validate(def as any);
    expect(validation.ok).toBe(true);

    const rec = await engine.run(def as any, { path: tmpFile });
    expect(rec.status).toBe('completed');
    expect(rec.output?.markdown).toContain('hello world');
  });
});
