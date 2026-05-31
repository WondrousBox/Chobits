/**
 * SkillTreeCanvasRenderer — 全 Canvas 径向星座技能树渲染引擎
 *
 * 精灵核心在中央, 4 个技能分支沿不同角度向外辐射,
 * 等级从内到外依次增高 (beginner → master).
 * 所有绘制 (背景/连线/节点/光效/文字) 均在 Canvas 上完成.
 */

import { getNodeColors, type SkillNode as SkillNodeData, type SkillStatus, type SkillTier, skillTierConfig, skillTreeNodes } from './skillTreeData';

// ━━━━━━━━━━━━━━ Public Types ━━━━━━━━━━━━━━

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderData {
  skillStatuses: Record<string, SkillStatus>;
  selectedSkill: string | null;
  hoveredSkill: string | null;
}

// ━━━━━━━━━━━━━━ Internal Types ━━━━━━━━━━━━━━

interface NodeLayout {
  id: string;
  x: number;
  y: number;
  angle: number;
  radius: number;
  node: SkillNodeData;
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  speed: number;
  offset: number;
  color: string;
}

// ━━━━━━━━━━━━━━ Constants ━━━━━━━━━━━━━━

const DEG = Math.PI / 180;
const NODE_R = 28;
const CORE_R = 40;

const TIER_RADII: Record<SkillTier, number> = {
  beginner: 180,
  intermediate: 320,
  advanced: 450,
  professional: 570,
  master: 700
};

const BRANCH_SECTORS: Record<string, { start: number; end: number }> = {
  perception: { start: 15, end: 105 },
  care: { start: 120, end: 160 },
  avatar: { start: 185, end: 260 },
  intelligence: { start: 275, end: 350 }
};

const COL_SPREAD = 22;
const COL_RADIUS_OFFSET = 40;

const NODE_EMOJI: Record<string, string> = {
  microphone: '🎤',
  systemAudio: '🔊',
  screenshot: '📸',
  speechRecognition: '👂',
  screenRecord: '🖥',
  imageRecognition: '👁',
  realtimeTranscribe: '📝',
  videoAnalysis: '🎬',
  meetingNotes: '📋',
  dailyCare: '💖',
  scheduleReminder: '📅',
  smartReminder: '🔔',
  spriteManage: '🧚',
  movement: '🏃',
  customAppearance: '🎨',
  actionChoreography: '✨',
  emotionExpression: '🎭',
  aiChat: '💬',
  docUnderstanding: '📄',
  translation: '🌐',
  smartAssistant: '🧠',
  autoAgent: '🤖',
  masterAssistant: '⭐'
};

const STAR_COLORS = ['#ffffff', '#c8d6e5', '#a0b4c8', '#ffeaa7', '#dfe6e9'];

const BRANCH_LABELS: Record<string, string> = {
  perception: '感知系',
  care: '关怀系',
  avatar: '化身系',
  intelligence: '智能系'
};

// ━━━━━━━━━━━━━━ Helpers ━━━━━━━━━━━━━━

function angleToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = angleDeg * DEG;
  return { x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius };
}

function quadBezierPt(t: number, ax: number, ay: number, cx: number, cy: number, bx: number, by: number): { x: number; y: number } {
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawPadlock(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const bodyW = size * 0.9;
  const bodyH = size * 0.7;
  const bodyY = cy + size * 0.1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, size * 0.18);
  // Shackle
  ctx.beginPath();
  ctx.arc(cx, bodyY, size * 0.35, Math.PI, 0);
  ctx.stroke();
  // Body
  roundRectPath(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, size * 0.15);
  ctx.fill();
  ctx.restore();
}

// Map angle in our convention (0=up, clockwise) to canvas arc angle (0=right, clockwise)
function toCanvasAngle(deg: number): number {
  return (deg - 90) * DEG;
}

// ━━━━━━━━━━━━━━ Layout ━━━━━━━━━━━━━━

function computeLayout(): NodeLayout[] {
  const layouts: NodeLayout[] = [];
  const branchRows = new Map<string, number[]>();
  for (const n of skillTreeNodes) {
    if (!branchRows.has(n.branch)) branchRows.set(n.branch, []);
    const arr = branchRows.get(n.branch)!;
    if (!arr.includes(n.row)) arr.push(n.row);
  }
  for (const arr of branchRows.values()) arr.sort((a, b) => a - b);

  for (const node of skillTreeNodes) {
    const sector = BRANCH_SECTORS[node.branch];
    if (!sector) continue;
    const rows = branchRows.get(node.branch) || [];
    const ri = rows.indexOf(node.row);
    const rc = rows.length;
    let angle = rc <= 1 ? (sector.start + sector.end) / 2 : sector.start + ((sector.end - sector.start) * (ri + 0.5)) / rc;
    const sameTR = skillTreeNodes.filter((n) => n.branch === node.branch && n.tier === node.tier && n.row === node.row);
    if (sameTR.length > 1) {
      const ci = sameTR.indexOf(node);
      angle += (ci - (sameTR.length - 1) / 2) * COL_SPREAD;
    }
    const radius = TIER_RADII[node.tier] + node.column * COL_RADIUS_OFFSET;
    const { x, y } = angleToXY(angle, radius);
    layouts.push({ id: node.id, x, y, angle, radius, node });
  }

  // Collision resolution: push overlapping nodes apart
  const MIN_DIST = NODE_R * 2 + 12; // minimum center-to-center distance
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const a = layouts[i];
        const b = layouts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MIN_DIST && dist > 0) {
          const overlap = (MIN_DIST - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }

  return layouts;
}

// ━━━━━━━━━━━━━━ Renderer Class ━━━━━━━━━━━━━━

export class SkillTreeRenderer {
  private layout: NodeLayout[];
  private layoutMap: Map<string, NodeLayout>;
  private stars: Star[] = [];
  private time = 0;

  constructor() {
    this.layout = computeLayout();
    this.layoutMap = new Map();
    for (const n of this.layout) this.layoutMap.set(n.id, n);
  }

  getLayout(): NodeLayout[] {
    return this.layout;
  }

  init(w: number, h: number): void {
    const count = Math.min(900, Math.floor((w * h) / 2000));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * w * 3,
        y: (Math.random() - 0.5) * h * 3,
        size: Math.random() * 2 + 0.3,
        brightness: Math.random() * 0.5 + 0.2,
        speed: Math.random() * 1.5 + 0.5,
        offset: Math.random() * Math.PI * 2,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
      });
    }
  }

  hitTest(worldX: number, worldY: number): string | null {
    let best: string | null = null;
    let minD = NODE_R + 8;
    for (const n of this.layout) {
      const d = Math.hypot(n.x - worldX, n.y - worldY);
      if (d < minD) {
        minD = d;
        best = n.id;
      }
    }
    // Also check core
    if (Math.hypot(worldX, worldY) < CORE_R + 8) return 'core';
    return best;
  }

  // ━━ Main draw ━━
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera, data: RenderData, dt: number): void {
    this.time += dt;
    const t = this.time;
    const toS = (wx: number, wy: number): { x: number; y: number } => ({
      x: (wx - cam.x) * cam.zoom + W / 2,
      y: (wy - cam.y) * cam.zoom + H / 2
    });

    ctx.clearRect(0, 0, W, H);
    this.drawBg(ctx, W, H, cam, t);
    this.drawSectorBackgrounds(ctx, cam, toS);
    this.drawTierRings(ctx, W, H, cam, toS, t);
    this.drawConnections(ctx, W, H, cam, toS, data, t, dt);
    this.drawCore(ctx, W, H, toS, t);
    this.drawNodes(ctx, W, H, cam, toS, data, t);
    this.drawBranchLabels(ctx, cam, toS);
    if (data.hoveredSkill && data.hoveredSkill !== 'core') this.drawTooltip(ctx, W, H, toS, data);
    this.drawVignette(ctx, W, H);
  }

  // ━━ Background ━━
  private drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera, t: number): void {
    // Deep space gradient
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#0c1222');
    bg.addColorStop(0.5, '#070d1a');
    bg.addColorStop(1, '#030710');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Nebula blobs
    const nebulae = [
      { ox: 250, oy: -200, r: 400, color: 'rgba(59,130,246,0.025)' },
      { ox: -300, oy: 250, r: 350, color: 'rgba(168,85,247,0.02)' },
      { ox: 100, oy: 300, r: 300, color: 'rgba(34,197,94,0.018)' },
      { ox: -200, oy: -300, r: 450, color: 'rgba(249,115,22,0.015)' }
    ];
    for (const nb of nebulae) {
      const sx = (nb.ox - cam.x * 0.15) * cam.zoom + W / 2;
      const sy = (nb.oy - cam.y * 0.15) * cam.zoom + H / 2;
      const sr = nb.r * cam.zoom;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, nb.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }

    // Stars
    for (const star of this.stars) {
      const px = star.x - cam.x * 0.08;
      const py = star.y - cam.y * 0.08;
      const wx = ((px % W) + W) % W;
      const wy = ((py % H) + H) % H;
      const tw = Math.sin(t * star.speed + star.offset);
      const a = star.brightness * (0.5 + tw * 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(wx, wy, star.size, 0, Math.PI * 2);
      ctx.fill();
      if (star.size > 1.4) {
        const gl = ctx.createRadialGradient(wx, wy, 0, wx, wy, star.size * 3);
        gl.addColorStop(0, star.color);
        gl.addColorStop(1, 'transparent');
        ctx.fillStyle = gl;
        ctx.globalAlpha = a * 0.2;
        ctx.beginPath();
        ctx.arc(wx, wy, star.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ━━ Sector backgrounds (subtle branch wedges) ━━
  private drawSectorBackgrounds(ctx: CanvasRenderingContext2D, cam: Camera, toS: (wx: number, wy: number) => { x: number; y: number }): void {
    const center = toS(0, 0);
    const outerR = (TIER_RADII.master + 90) * cam.zoom;
    const innerR = 60 * cam.zoom;

    for (const [branchId, sector] of Object.entries(BRANCH_SECTORS)) {
      const colors = getNodeColors(branchId);
      const pad = 4;
      const startA = toCanvasAngle(sector.start - pad);
      const endA = toCanvasAngle(sector.end + pad);

      const g = ctx.createRadialGradient(center.x, center.y, innerR, center.x, center.y, outerR);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.55, hexAlpha(colors.color, 0.05));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(startA) * innerR, center.y + Math.sin(startA) * innerR);
      ctx.arc(center.x, center.y, outerR, startA, endA);
      ctx.lineTo(center.x + Math.cos(endA) * innerR, center.y + Math.sin(endA) * innerR);
      ctx.arc(center.x, center.y, innerR, endA, startA, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ━━ Tier rings (clean concentric orbits with slow sweeping highlight) ━━
  private drawTierRings(ctx: CanvasRenderingContext2D, _W: number, _H: number, cam: Camera, toS: (wx: number, wy: number) => { x: number; y: number }, t: number): void {
    const center = toS(0, 0);
    const tiers: SkillTier[] = ['beginner', 'intermediate', 'advanced', 'professional', 'master'];

    for (let idx = 0; idx < tiers.length; idx++) {
      const tier = tiers[idx];
      const cfg = skillTierConfig[tier];
      const baseR = TIER_RADII[tier] * cam.zoom;

      // Thin base ring
      ctx.save();
      ctx.strokeStyle = hexAlpha(cfg.color, 0.14);
      ctx.lineWidth = 1 * cam.zoom;
      ctx.beginPath();
      ctx.arc(center.x, center.y, baseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Slow sweeping highlight arc (one per ring, alternating direction)
      const dir = idx % 2 === 0 ? 1 : -1;
      const head = t * 0.18 * dir + idx * 1.3;
      const sweepLen = 0.9; // radians
      ctx.save();
      const grad = ctx.createConicGradient(head - (dir > 0 ? sweepLen : 0), center.x, center.y);
      const seg = sweepLen / (Math.PI * 2);
      if (dir > 0) {
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(seg * 0.5, hexAlpha(cfg.color, 0.35));
        grad.addColorStop(seg, 'transparent');
      } else {
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(seg * 0.5, hexAlpha(cfg.color, 0.35));
        grad.addColorStop(seg, 'transparent');
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2 * cam.zoom;
      ctx.beginPath();
      const a0 = dir > 0 ? head - sweepLen : head;
      const a1 = dir > 0 ? head : head + sweepLen;
      ctx.arc(center.x, center.y, baseR, a0, a1);
      ctx.stroke();
      ctx.restore();

      // Tier label
      const labelPos = angleToXY(8, TIER_RADII[tier]);
      const ls = toS(labelPos.x, labelPos.y);
      ctx.font = `${10 * cam.zoom}px "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = hexAlpha(cfg.color, 0.45);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.label, ls.x + 6, ls.y);
    }
  }

  // ━━ Branch labels (outer arc) ━━
  private drawBranchLabels(ctx: CanvasRenderingContext2D, cam: Camera, toS: (wx: number, wy: number) => { x: number; y: number }): void {
    const labelR = TIER_RADII.master + 70;
    for (const [branchId, sector] of Object.entries(BRANCH_SECTORS)) {
      const colors = getNodeColors(branchId);
      const midAngle = (sector.start + sector.end) / 2;
      const pos = angleToXY(midAngle, labelR);
      const s = toS(pos.x, pos.y);
      const label = BRANCH_LABELS[branchId] || branchId;

      ctx.save();
      ctx.font = `bold ${13 * cam.zoom}px "Microsoft YaHei", sans-serif`;
      const metrics = ctx.measureText(label);
      const padX = 10 * cam.zoom;
      const padY = 5 * cam.zoom;
      const w = metrics.width + padX * 2;
      const h = 13 * cam.zoom + padY * 2;
      // Backdrop pill
      roundRectPath(ctx, s.x - w / 2, s.y - h / 2, w, h, h / 2);
      ctx.fillStyle = 'rgba(10,14,26,0.72)';
      ctx.fill();
      ctx.strokeStyle = hexAlpha(colors.color, 0.45);
      ctx.lineWidth = 1 * cam.zoom;
      ctx.stroke();
      // Color dot
      const dotR = 3 * cam.zoom;
      const dotX = s.x - w / 2 + padX + dotR;
      ctx.beginPath();
      ctx.arc(dotX, s.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = colors.color;
      ctx.shadowColor = colors.color;
      ctx.shadowBlur = 8 * cam.zoom;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Text
      ctx.fillStyle = hexAlpha(colors.color, 0.95);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, dotX + dotR + 6 * cam.zoom, s.y);
      ctx.restore();
    }
  }

  // ━━ Connections ━━
  private drawConnections(ctx: CanvasRenderingContext2D, W: number, H: number, _cam: Camera, toS: (wx: number, wy: number) => { x: number; y: number }, data: RenderData, t: number, dt: number): void {
    for (const node of this.layout) {
      const nd = node.node;
      if (nd.prerequisites.length === 0) {
        // Core → beginner connection
        this.drawOneConnection(ctx, W, H, toS, data, t, dt, { x: 0, y: 0 }, { x: node.x, y: node.y }, 'core', nd.branch, node.id, true);
        continue;
      }
      for (const prereqId of nd.prerequisites) {
        const prereqLayout = this.layoutMap.get(prereqId);
        if (!prereqLayout) continue;
        this.drawOneConnection(ctx, W, H, toS, data, t, dt, { x: prereqLayout.x, y: prereqLayout.y }, { x: node.x, y: node.y }, prereqId, nd.branch, node.id, false);
      }
    }
  }

  private drawOneConnection(
    ctx: CanvasRenderingContext2D,
    _W: number,
    _H: number,
    toS: (wx: number, wy: number) => { x: number; y: number },
    data: RenderData,
    t: number,
    _dt: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromId: string,
    branch: string,
    toId: string,
    isCoreLine: boolean
  ): void {
    const colors = getNodeColors(branch);
    const fromS = toS(from.x, from.y);
    const toS2 = toS(to.x, to.y);

    // Control point: pull inward toward center for curved arcs
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const midDist = Math.hypot(mx, my);
    const factor = midDist > 50 ? 0.7 : 0.9;
    const cx = mx * factor;
    const cy = my * factor;
    const cs = toS(cx, cy);

    // Determine active state
    const fromStatus = fromId === 'core' ? 'active' : data.skillStatuses[fromId] || 'locked';
    const toStatus = data.skillStatuses[toId] || 'locked';
    const isActive = fromStatus === 'active' && (toStatus === 'active' || toStatus === 'unlocked');
    const isUnlockableNext = fromStatus === 'active' && toStatus === 'unlocked';

    ctx.beginPath();
    ctx.moveTo(fromS.x, fromS.y);
    ctx.quadraticCurveTo(cs.x, cs.y, toS2.x, toS2.y);

    if (isActive) {
      // Glow underlay
      ctx.save();
      ctx.strokeStyle = hexAlpha(colors.color, 0.18);
      ctx.lineWidth = isCoreLine ? 6 : 5;
      ctx.stroke();
      ctx.restore();
      // Gradient stroke from prereq color → branch color
      const fromColors = fromId === 'core' ? getNodeColors('core') : getNodeColors(this.layoutMap.get(fromId)?.node.branch ?? branch);
      const lg = ctx.createLinearGradient(fromS.x, fromS.y, toS2.x, toS2.y);
      lg.addColorStop(0, hexAlpha(fromColors.color, 0.85));
      lg.addColorStop(1, hexAlpha(colors.color, 0.85));
      ctx.strokeStyle = lg;
      ctx.lineWidth = isCoreLine ? 2 : 1.6;
      ctx.stroke();

      // Flow dots along the curve
      const phaseSeed = (fromId.charCodeAt(0) * 13 + toId.charCodeAt(0) * 7) % 100 / 100;
      const dotCount = 2;
      for (let k = 0; k < dotCount; k++) {
        const tt = (t * 0.22 + phaseSeed + k / dotCount) % 1;
        const p = quadBezierPt(tt, fromS.x, fromS.y, cs.x, cs.y, toS2.x, toS2.y);
        const fade = Math.sin(tt * Math.PI); // fade in/out at endpoints
        const dr = 2.6;
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dr * 3);
        gg.addColorStop(0, hexAlpha(colors.color, 0.9 * fade));
        gg.addColorStop(1, 'transparent');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dr * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexAlpha('#ffffff', 0.9 * fade);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dr * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (isUnlockableNext) {
      // Subtle pulse for connections leading to currently-unlockable nodes
      const pulse = 0.25 + Math.sin(t * 2) * 0.15;
      ctx.strokeStyle = hexAlpha(colors.color, pulse);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 12;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    } else {
      ctx.strokeStyle = hexAlpha(colors.color, 0.16);
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ━━ Core orb (calm luminous gem) ━━
  private drawCore(ctx: CanvasRenderingContext2D, _W: number, _H: number, toS: (wx: number, wy: number) => { x: number; y: number }, t: number): void {
    const c = toS(0, 0);
    const breathe = Math.sin(t * 0.8) * 0.06 + 1;
    const r = CORE_R * breathe;

    // Outer halo
    const halo = ctx.createRadialGradient(c.x, c.y, r * 0.8, c.x, c.y, r * 4);
    halo.addColorStop(0, 'rgba(251,191,36,0.22)');
    halo.addColorStop(0.45, 'rgba(251,191,36,0.06)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 4, 0, Math.PI * 2);
    ctx.fill();

    // Single elegant rotating ring
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(t * 0.25);
    ctx.strokeStyle = 'rgba(251,191,36,0.25)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Core gradient sphere
    ctx.save();
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 28;
    const coreGrad = ctx.createRadialGradient(c.x - r * 0.25, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
    coreGrad.addColorStop(0, '#fff7d6');
    coreGrad.addColorStop(0.45, '#fbbf24');
    coreGrad.addColorStop(1, '#b45309');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Inner rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Specular highlight
    const spec = ctx.createRadialGradient(c.x - r * 0.25, c.y - r * 0.3, 0, c.x - r * 0.25, c.y - r * 0.3, r * 0.5);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1, 'transparent');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(c.x - r * 0.25, c.y - r * 0.3, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Center label
    ctx.font = `bold ${11 * 1}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(120,53,15,0.85)';
    ctx.fillText('核心', c.x, c.y + 1);
  }

  // ━━ Skill nodes ━━
  private drawNodes(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera, toS: (wx: number, wy: number) => { x: number; y: number }, data: RenderData, t: number): void {
    for (const nl of this.layout) {
      const s = toS(nl.x, nl.y);
      // Culling
      if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) continue;

      const rawStatus = data.skillStatuses[nl.id] || 'locked';
      const status = rawStatus;
      const isActive = status === 'active';
      const isUnlocked = status === 'unlocked' || isActive;
      const isHovered = data.hoveredSkill === nl.id;
      const isSelected = data.selectedSkill === nl.id;
      const colors = getNodeColors(nl.node.branch);
      const r = NODE_R * cam.zoom;
      const emoji = NODE_EMOJI[nl.id] || '?';

      // (No aura / glow — keep nodes clean)

      // ── Selection ring ──
      if (isSelected) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(t * 0.5);
        ctx.strokeStyle = hexAlpha(colors.color, 0.7);
        ctx.lineWidth = 2 * cam.zoom;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 8 * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── Outer halo for active nodes ──
      if (isActive) {
        const halo = ctx.createRadialGradient(s.x, s.y, r * 0.8, s.x, s.y, r * 2.4);
        halo.addColorStop(0, hexAlpha(colors.color, 0.28));
        halo.addColorStop(0.6, hexAlpha(colors.color, 0.06));
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Selection ring ──
      if (isSelected) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(t * 0.5);
        ctx.strokeStyle = hexAlpha(colors.color, 0.75);
        ctx.lineWidth = 2 * cam.zoom;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 9 * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ── Main disc ──
      ctx.save();
      if (isActive) {
        const cg = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.35, r * 0.1, s.x, s.y, r);
        cg.addColorStop(0, colors.gradientFrom);
        cg.addColorStop(1, colors.gradientTo);
        ctx.fillStyle = cg;
      } else if (isUnlocked) {
        // Frosted glass with branch color tint
        const cg = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.25, r * 0.1, s.x, s.y, r);
        cg.addColorStop(0, hexAlpha(colors.color, 0.22));
        cg.addColorStop(1, hexAlpha(colors.color, 0.06));
        ctx.fillStyle = cg;
      } else {
        // Dim, slightly tinted dark fill
        const cg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        cg.addColorStop(0, 'rgba(30,41,59,0.85)');
        cg.addColorStop(1, 'rgba(15,23,42,0.92)');
        ctx.fillStyle = cg;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Border ring ──
      ctx.save();
      ctx.strokeStyle = isActive ? hexAlpha('#ffffff', 0.55) : isUnlocked ? hexAlpha(colors.color, 0.55) : 'rgba(71,85,105,0.45)';
      ctx.lineWidth = isActive ? 1.8 * cam.zoom : 1.4 * cam.zoom;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r - (isActive ? 0.9 : 0.7), 0, Math.PI * 2);
      ctx.stroke();
      // Outer thin accent ring for active
      if (isActive) {
        ctx.strokeStyle = hexAlpha(colors.color, 0.7);
        ctx.lineWidth = 1 * cam.zoom;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 2 * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // ── Hover highlight ──
      if (isHovered) {
        ctx.save();
        ctx.strokeStyle = hexAlpha(isUnlocked ? colors.color : '#94a3b8', 0.7);
        ctx.lineWidth = 2 * cam.zoom;
        ctx.shadowColor = isUnlocked ? colors.color : '#475569';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 5 * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ── Top-left specular highlight (active only) ──
      if (isActive) {
        const spec = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.35, 0, s.x - r * 0.3, s.y - r * 0.35, r * 0.55);
        spec.addColorStop(0, 'rgba(255,255,255,0.35)');
        spec.addColorStop(1, 'transparent');
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.arc(s.x - r * 0.3, s.y - r * 0.35, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Emoji icon ──
      const fontSize = isActive ? r * 0.9 : r * 0.78;
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = isActive ? 1 : isUnlocked ? 0.92 : 0.32;
      ctx.fillText(emoji, s.x, s.y + 1);
      ctx.globalAlpha = 1;

      // ── Lock badge (drawn padlock) ──
      if (!isUnlocked) {
        const badgeR = 8 * cam.zoom;
        const bx = s.x + r * 0.72;
        const by = s.y - r * 0.72;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.95)';
        ctx.beginPath();
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,116,139,0.65)';
        ctx.lineWidth = 1 * cam.zoom;
        ctx.stroke();
        drawPadlock(ctx, bx, by - 0.3, badgeR * 0.85, 'rgba(203,213,225,0.85)');
        ctx.restore();
      }

      // ── Name label with backdrop pill ──
      ctx.save();
      const labelFont = `${10 * cam.zoom}px "Microsoft YaHei", sans-serif`;
      ctx.font = labelFont;
      const labelText = nl.node.name;
      const labelMetrics = ctx.measureText(labelText);
      const labelPadX = 6 * cam.zoom;
      const labelPadY = 3 * cam.zoom;
      const labelW = labelMetrics.width + labelPadX * 2;
      const labelH = 10 * cam.zoom + labelPadY * 2;
      const labelX = s.x - labelW / 2;
      const labelY = s.y + r + 6 * cam.zoom;
      // Backdrop
      roundRectPath(ctx, labelX, labelY, labelW, labelH, labelH / 2);
      ctx.fillStyle = isActive ? hexAlpha(colors.color, 0.18) : 'rgba(10,14,26,0.6)';
      ctx.fill();
      if (isActive || isHovered) {
        ctx.strokeStyle = hexAlpha(colors.color, isActive ? 0.55 : 0.35);
        ctx.lineWidth = 1 * cam.zoom;
        ctx.stroke();
      }
      // Text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? '#ffffff' : isUnlocked ? 'rgba(226,232,240,0.9)' : 'rgba(148,163,184,0.55)';
      ctx.fillText(labelText, s.x, labelY + labelH / 2);
      ctx.restore();
    }
  }

  // ━━ Tooltip ━━
  private drawTooltip(ctx: CanvasRenderingContext2D, W: number, H: number, toS: (wx: number, wy: number) => { x: number; y: number }, data: RenderData): void {
    const nl = this.layoutMap.get(data.hoveredSkill!);
    if (!nl) return;
    const s = toS(nl.x, nl.y);
    const colors = getNodeColors(nl.node.branch);
    const tierCfg = skillTierConfig[nl.node.tier];
    const status = data.skillStatuses[nl.id] || 'locked';

    const pw = 200;
    const ph = 90;
    let px = s.x + 45;
    let py = s.y - ph / 2;
    if (px + pw > W - 10) px = s.x - pw - 45;
    if (py < 10) py = 10;
    if (py + ph > H - 10) py = H - ph - 10;

    // Panel bg
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,26,0.92)';
    ctx.strokeStyle = hexAlpha(colors.color, 0.3);
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    // Rounded rect
    const rr = 8;
    ctx.beginPath();
    ctx.moveTo(px + rr, py);
    ctx.lineTo(px + pw - rr, py);
    ctx.quadraticCurveTo(px + pw, py, px + pw, py + rr);
    ctx.lineTo(px + pw, py + ph - rr);
    ctx.quadraticCurveTo(px + pw, py + ph, px + pw - rr, py + ph);
    ctx.lineTo(px + rr, py + ph);
    ctx.quadraticCurveTo(px, py + ph, px, py + ph - rr);
    ctx.lineTo(px, py + rr);
    ctx.quadraticCurveTo(px, py, px + rr, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Top color bar
    ctx.fillStyle = hexAlpha(colors.color, 0.6);
    ctx.fillRect(px, py, pw, 2);

    // Name
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = colors.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(nl.node.name, px + 12, py + 10);

    // Tier + status
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = tierCfg.color;
    const statusText = status === 'active' ? ' · ✅ 已激活' : status === 'unlocked' ? ' · 可激活' : ' · 🔒 未解锁';
    ctx.fillText(tierCfg.label + '技能' + statusText, px + 12, py + 30);

    // Description
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    const desc = nl.node.description;
    // Simple word wrap (max 1 line for now)
    const maxW = pw - 24;
    let displayDesc = desc;
    if (ctx.measureText(desc).width > maxW) {
      let truncated = desc;
      while (ctx.measureText(truncated + '…').width > maxW && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      displayDesc = truncated + '…';
    }
    ctx.fillText(displayDesc, px + 12, py + 50);

    // Prerequisites
    if (nl.node.prerequisites.length > 0) {
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(100,116,139,0.6)';
      const prereqNames = nl.node.prerequisites
        .map((id) => {
          const n = skillTreeNodes.find((x) => x.id === id);
          return n ? n.name : id;
        })
        .join(', ');
      ctx.fillText('需要: ' + prereqNames, px + 12, py + 68);
    }
  }

  // ━━ Vignette ━━
  private drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
