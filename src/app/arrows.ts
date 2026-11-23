/**
 * Reaction arrows (the Arrows tool): kinds, and the lines and heads that draw each kind.
 * Pure geometry, no canvas, so it can be tested; view.ts strokes and fills the shapes.
 */
import { Point2D } from '../draw/Point2D';

/**
 * forward     → reaction
 * equilibrium ⇌ two half-headed arrows, forward and back
 * both        ↔ one line with a head at each end (resonance)
 * retro       ⇒ open double-line arrow (retrosynthesis)
 */
export type ArrowKind = 'forward' | 'equilibrium' | 'both' | 'retro';

export const ARROW_KINDS: { kind: ArrowKind; name: string }[] = [
  { kind: 'forward', name: 'Reaction arrow' },
  { kind: 'equilibrium', name: 'Equilibrium arrow' },
  { kind: 'both', name: 'Two-way arrow' },
  { kind: 'retro', name: 'Retrosynthesis arrow' },
];

export function arrowName(kind: ArrowKind): string {
  return ARROW_KINDS.find((a) => a.kind === kind)?.name ?? 'Arrow';
}

export function isArrowKind(value: unknown): value is ArrowKind {
  return ARROW_KINDS.some((a) => a.kind === value);
}

export interface Arrow {
  kind: ArrowKind;
  from: Point2D;
  to: Point2D;
}

/** What to draw: stroked lines, filled polygons, and open polylines (the retrosynthesis chevron). */
export interface ArrowShape {
  lines: [Point2D, Point2D][];
  heads: Point2D[][];
  open: Point2D[][];
}

/** Arrows shorter than this are not drawn (a click places a default-length arrow instead). */
export const MIN_ARROW_LENGTH = 8;

/** Lines and heads of an arrow drawn with the given line width. */
export function arrowShape(arrow: Arrow, lineWidth: number): ArrowShape {
  const { from, to } = arrow;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const shape: ArrowShape = { lines: [], heads: [], open: [] };
  if (len < 1e-6) return shape;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  const at = (p: Point2D, along: number, side: number) => new Point2D(p.x + u.x * along + n.x * side, p.y + u.y * along + n.y * side);

  // Head size grows a little with the line width, and never takes more than 40% of the arrow.
  const h = Math.min(len * 0.4, 9 + 2.5 * lineWidth);
  const w = h * 0.42;
  const notch = h * 0.72;

  // Full head pointing along +u at `tip` (dir 1) or along -u (dir -1).
  const head = (tip: Point2D, dir: 1 | -1): Point2D[] => [
    tip,
    at(tip, -dir * h, w),
    at(tip, -dir * notch, 0),
    at(tip, -dir * h, -w),
  ];

  switch (arrow.kind) {
    case 'forward':
      shape.lines.push([from, at(to, -notch, 0)]);
      shape.heads.push(head(to, 1));
      break;
    case 'both':
      shape.lines.push([at(from, notch, 0), at(to, -notch, 0)]);
      shape.heads.push(head(to, 1), head(from, -1));
      break;
    case 'equilibrium': {
      // Two half-headed arrows: the top one forward (barb on its outer side), the bottom one back.
      const g = 3 + lineWidth;
      const a1 = at(from, 0, -g);
      const b1 = at(to, 0, -g);
      const a2 = at(to, 0, g);
      const b2 = at(from, 0, g);
      shape.lines.push([a1, at(b1, -notch * 0.6, 0)], [a2, at(b2, notch * 0.6, 0)]);
      shape.heads.push([b1, at(b1, -h, -w), at(b1, -notch, 0)]);
      shape.heads.push([b2, at(b2, h, w), at(b2, notch, 0)]);
      break;
    }
    case 'retro': {
      // Two parallel lines ending in an open chevron.
      const g = 2.5 + lineWidth;
      const H = h * 1.1;
      const W = g + w * 1.3;
      const back = (H * g) / W;
      shape.lines.push([at(from, 0, -g), at(to, -back, -g)], [at(from, 0, g), at(to, -back, g)]);
      shape.open.push([at(to, -H, -W), to, at(to, -H, W)]);
      break;
    }
  }
  return shape;
}

/** Shortest distance from p to the arrow's shaft. */
export function distanceToArrow(arrow: Arrow, p: Point2D): number {
  const { from: a, to: b } = arrow;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** End point of an arrow dragged from `from` toward `p`, optionally snapped to `snapDegrees` steps. */
export function arrowEnd(from: Point2D, p: Point2D, snapDegrees = 0): Point2D {
  const len = Math.hypot(p.x - from.x, p.y - from.y);
  const raw = Math.atan2(p.y - from.y, p.x - from.x);
  let angle = raw;
  if (snapDegrees) {
    const step = (snapDegrees * Math.PI) / 180;
    angle = Math.round(raw / step) * step;
  } else {
    // Without Shift, an arrow within a few degrees of horizontal or vertical is straightened.
    const quarter = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(raw - quarter) <= (STRAIGHTEN_DEGREES * Math.PI) / 180) angle = quarter;
    else return p.clone();
  }
  return new Point2D(from.x + len * Math.cos(angle), from.y + len * Math.sin(angle));
}

/** Arrows drawn within this many degrees of horizontal or vertical come out straight. */
const STRAIGHTEN_DEGREES = 4;
