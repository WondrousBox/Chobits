import { getCharacterProgressSpeechText } from '../messages/character';

export type ProgressSpeechKind = 'download' | 'transcribe' | 'import' | 'workflow' | 'generic';

export interface ProgressSpeechUpdate {
  id: string;
  progress: number;
  message?: string;
  kind?: ProgressSpeechKind;
  now?: number;
}

interface ProgressCheckpoint {
  threshold: number;
  type: 'progress' | 'almost';
}

interface ProgressSpeechSession {
  id: string;
  kind: ProgressSpeechKind;
  checkpoints: ProgressCheckpoint[];
  nextCheckpointIndex: number;
  startedAt: number;
  lastSpokenAt: number;
  lastProgress: number;
  completed: boolean;
}

export interface ProgressSpeechAnnouncerOptions {
  speak: (text: string) => void;
  minIntervalMs?: number;
  random?: () => number;
}

const DEFAULT_MIN_INTERVAL_MS = 5000;
const CHECKPOINT_BUCKETS: Array<[number, number]> = [
  [0, 25],
  [25, 50],
  [50, 75],
  [75, 90]
];

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function randomInRange(min: number, max: number, random: () => number): number {
  return min + (max - min) * Math.max(0, Math.min(1, random()));
}

function createCheckpoints(random: () => number): ProgressCheckpoint[] {
  return [
    ...CHECKPOINT_BUCKETS.map(([min, max]) => ({
      threshold: randomInRange(min, max, random),
      type: 'progress' as const
    })),
    {
      threshold: 90,
      type: 'almost' as const
    }
  ].sort((a, b) => a.threshold - b.threshold);
}

function inferKind(message?: string, fallback: ProgressSpeechKind = 'generic'): ProgressSpeechKind {
  const text = message?.toLowerCase() ?? '';
  if (/转写|转录|transcrib|asr|字幕识别|语音识别/.test(text)) {
    return 'transcribe';
  }
  if (/下载|download|yt-dlp|youtube/.test(text)) {
    return 'download';
  }
  if (/导入|上传|import|upload/.test(text)) {
    return 'import';
  }
  if (/工作流|workflow/.test(text)) {
    return fallback === 'generic' || fallback === 'workflow' ? 'workflow' : fallback;
  }
  return fallback;
}

function getKindLabel(kind: ProgressSpeechKind): string {
  switch (kind) {
    case 'download':
      return '下载';
    case 'transcribe':
      return '转写';
    case 'import':
      return '导入';
    case 'workflow':
      return '处理';
    case 'generic':
    default:
      return '任务';
  }
}

function formatProgressSpeech(kind: ProgressSpeechKind, progress: number, checkpoint: ProgressCheckpoint): string {
  const label = getKindLabel(kind);
  if (checkpoint.type === 'almost') {
    return getCharacterProgressSpeechText('almost', {
      kind,
      fallbackKindLabel: label,
      progress
    });
  }
  return getCharacterProgressSpeechText('progress', {
    kind,
    fallbackKindLabel: label,
    progress
  });
}

function formatCompleteSpeech(kind: ProgressSpeechKind): string {
  return getCharacterProgressSpeechText('complete', {
    kind,
    fallbackKindLabel: getKindLabel(kind)
  });
}

export class ProgressSpeechAnnouncer {
  private readonly speak: (text: string) => void;
  private readonly minIntervalMs: number;
  private readonly random: () => number;
  private readonly sessions = new Map<string, ProgressSpeechSession>();

  constructor(options: ProgressSpeechAnnouncerOptions) {
    this.speak = options.speak;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.random = options.random ?? Math.random;
  }

  start(update: ProgressSpeechUpdate): void {
    const now = update.now ?? Date.now();
    const progress = clampProgress(update.progress);
    this.sessions.set(update.id, {
      id: update.id,
      kind: inferKind(update.message, update.kind ?? 'generic'),
      checkpoints: createCheckpoints(this.random),
      nextCheckpointIndex: 0,
      startedAt: now,
      lastSpokenAt: now,
      lastProgress: progress,
      completed: false
    });
  }

  update(update: ProgressSpeechUpdate): void {
    const now = update.now ?? Date.now();
    const progress = clampProgress(update.progress);
    let session = this.sessions.get(update.id);

    if (session?.completed) {
      return;
    }

    if (!session || progress + 8 < session.lastProgress) {
      this.start({ ...update, progress, now });
      session = this.sessions.get(update.id)!;
    }

    session.kind = inferKind(update.message, update.kind ?? session.kind);
    session.lastProgress = Math.max(session.lastProgress, progress);

    let crossedCount = 0;
    for (let index = session.nextCheckpointIndex; index < session.checkpoints.length; index += 1) {
      if (progress < session.checkpoints[index].threshold) {
        break;
      }
      crossedCount += 1;
    }

    if (crossedCount === 0) {
      return;
    }

    const checkpointIndex = session.nextCheckpointIndex + crossedCount - 1;
    const checkpoint = session.checkpoints[checkpointIndex];
    session.nextCheckpointIndex += crossedCount;

    if (now - session.lastSpokenAt < this.minIntervalMs) {
      return;
    }

    this.speak(formatProgressSpeech(session.kind, progress, checkpoint));
    session.lastSpokenAt = now;
  }

  complete(update: Omit<ProgressSpeechUpdate, 'progress'> & { progress?: number }): void {
    const now = update.now ?? Date.now();
    let session = this.sessions.get(update.id);

    if (!session) {
      this.start({ ...update, progress: update.progress ?? 100, now });
      session = this.sessions.get(update.id)!;
    }

    if (session.completed) {
      return;
    }

    session.kind = inferKind(update.message, update.kind ?? session.kind);
    session.completed = true;
    session.lastProgress = 100;
    this.speak(formatCompleteSpeech(session.kind));
    session.lastSpokenAt = now;
  }

  reset(id?: string): void {
    if (id) {
      this.sessions.delete(id);
      return;
    }
    this.sessions.clear();
  }
}
