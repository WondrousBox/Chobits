import { describe, expect, it } from 'vitest';

import { ProgressSpeechAnnouncer } from '../packages/sprite-core/manager/progress-speech-announcer';

describe('ProgressSpeechAnnouncer', () => {
  it('skips fast checkpoint bursts and announces the latest eligible checkpoint', () => {
    const spoken: string[] = [];
    const announcer = new ProgressSpeechAnnouncer({
      minIntervalMs: 5000,
      random: () => 0,
      speak: (text) => spoken.push(text)
    });

    announcer.start({ id: 'download:1', kind: 'download', progress: 0, now: 0 });
    announcer.update({ id: 'download:1', kind: 'download', progress: 30, now: 4000 });
    expect(spoken).toEqual([]);

    announcer.update({ id: 'download:1', kind: 'download', progress: 55, now: 6000 });
    expect(spoken).toEqual(['下载进度 55%。']);

    announcer.update({ id: 'download:1', kind: 'download', progress: 91, now: 11000 });
    expect(spoken).toEqual(['下载进度 55%。', '下载快完成了。']);

    announcer.complete({ id: 'download:1', kind: 'download', now: 11100 });
    expect(spoken).toEqual(['下载进度 55%。', '下载快完成了。', '下载完成了。']);
  });

  it('keeps a specialized workflow kind for completion speech', () => {
    const spoken: string[] = [];
    const announcer = new ProgressSpeechAnnouncer({
      minIntervalMs: 5000,
      random: () => 0,
      speak: (text) => spoken.push(text)
    });

    announcer.start({ id: 'workflow:1', kind: 'workflow', progress: 0, message: '执行工作流', now: 0 });
    announcer.update({ id: 'workflow:1', progress: 30, message: '转录中', now: 6000 });
    announcer.complete({ id: 'workflow:1', message: '工作流完成', now: 7000 });

    expect(spoken).toEqual(['转写进度 30%。', '转写完成了。']);
  });

  it('does not treat a 100% progress update as completion', () => {
    const spoken: string[] = [];
    const announcer = new ProgressSpeechAnnouncer({
      minIntervalMs: 5000,
      random: () => 0,
      speak: (text) => spoken.push(text)
    });

    announcer.start({ id: 'download:1', kind: 'download', progress: 0, now: 0 });
    announcer.update({ id: 'download:1', kind: 'download', progress: 100, now: 6000 });
    expect(spoken).toHaveLength(1);

    announcer.complete({ id: 'download:1', kind: 'download', now: 7000 });
    expect(spoken).toHaveLength(2);
  });
});
