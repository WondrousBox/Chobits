export type OcrOverlayAnnotation = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
};

type Rect = Pick<OcrOverlayAnnotation, 'x' | 'y' | 'width' | 'height'>;

const MIN_OCR_ANNOTATION_CONFIDENCE = 0.8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
}

function normalizePoint(point: unknown): { x: number; y: number } | undefined {
  if (Array.isArray(point)) {
    const x = readNumber(point[0]);
    const y = readNumber(point[1]);
    return x === undefined || y === undefined ? undefined : { x, y };
  }
  if (isRecord(point)) {
    const x = readNumber(point.x);
    const y = readNumber(point.y);
    return x === undefined || y === undefined ? undefined : { x, y };
  }
  return undefined;
}

function rectFromPoints(points: unknown[]): Rect | undefined {
  const normalized = points.map(normalizePoint).filter((point): point is { x: number; y: number } => Boolean(point));
  if (!normalized.length) return undefined;

  const xs = normalized.map((point) => point.x);
  const ys = normalized.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (maxX <= minX || maxY <= minY) return undefined;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalizeRect(value: unknown): Rect | undefined {
  if (Array.isArray(value)) {
    return rectFromPoints(value);
  }
  if (!isRecord(value)) return undefined;

  const x = readNumber(value.x ?? value.left);
  const y = readNumber(value.y ?? value.top);
  const width = readNumber(value.width);
  const height = readNumber(value.height);
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { x, y, width, height };
  }

  const right = readNumber(value.right);
  const bottom = readNumber(value.bottom);
  if (x !== undefined && y !== undefined && right !== undefined && bottom !== undefined && right > x && bottom > y) {
    return { x, y, width: right - x, height: bottom - y };
  }

  const points = value.points ?? value.vertices ?? value.polygon;
  return Array.isArray(points) ? rectFromPoints(points) : undefined;
}

function normalizeOcrText(value: unknown): string {
  return String(value ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizeAnnotation(value: unknown, index: number): OcrOverlayAnnotation | undefined {
  if (!isRecord(value)) return undefined;
  const rect = normalizeRect(value.box ?? value.boundingBox ?? value.bbox ?? value.rect ?? value);
  if (!rect) return undefined;

  const text = normalizeOcrText(value.text ?? value.label);
  if (!text) return undefined;

  const confidence = readNumber(value.confidence ?? value.score);
  return {
    id: `${index}:${rect.x}:${rect.y}:${text}`,
    text,
    ...rect,
    ...(confidence !== undefined ? { confidence } : {})
  };
}

export function getOcrAnnotationsFromMetadata(metadata?: string | null): OcrOverlayAnnotation[] {
  if (!metadata?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return [];
  }

  if (!isRecord(parsed)) return [];
  const ocr = isRecord(parsed.ocr) ? parsed.ocr : parsed;
  const results = ocr.results ?? ocr.annotations ?? ocr.boxes;
  if (!Array.isArray(results)) return [];

  return results
    .map(normalizeAnnotation)
    .filter((annotation): annotation is OcrOverlayAnnotation => Boolean(annotation))
    .filter((annotation) => annotation.confidence === undefined || annotation.confidence >= MIN_OCR_ANNOTATION_CONFIDENCE);
}
