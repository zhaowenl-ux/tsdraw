import { Point2D } from '../draw/Point2D';

/**
 * Circumradius of a regular n-gon whose side length equals bondLength.
 * R = bondLength / (2 * sin(pi / n))
 */
export function ringRadius(size: number, bondLength: number): number {
  if (!Number.isInteger(size) || size < 3) {
    throw new Error(`Ring size must be an integer >= 3 (got ${size})`);
  }
  return bondLength / (2 * Math.sin(Math.PI / size));
}

/**
 * Vertices of a regular polygon centred on `centre`.
 * `startAngle` is the angle (radians, canvas convention: y points down) of vertex 0.
 * The default places vertex 0 at the top of the ring.
 */
export function regularPolygon(
  size: number,
  centre: Point2D,
  bondLength: number,
  startAngle: number = -Math.PI / 2
): Point2D[] {
  const r = ringRadius(size, bondLength);
  const vertices: Point2D[] = [];
  for (let i = 0; i < size; i++) {
    const angle = startAngle + (2 * Math.PI * i) / size;
    vertices.push(new Point2D(centre.x + r * Math.cos(angle), centre.y + r * Math.sin(angle)));
  }
  return vertices;
}

/**
 * Centre of a ring that has `anchor` as one of its vertices and extends
 * in the direction of `towards`.
 */
export function ringCentreFromAnchor(
  size: number,
  anchor: Point2D,
  towards: Point2D,
  bondLength: number
): Point2D {
  const r = ringRadius(size, bondLength);
  const dx = towards.x - anchor.x;
  const dy = towards.y - anchor.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  return new Point2D(anchor.x + ux * r, anchor.y + uy * r);
}

/** Point `distance` away from `from`, along the direction of `to`. */
export function moveToward(from: Point2D, to: Point2D, distance: number): Point2D {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return from.clone();
  return new Point2D(from.x + (dx / len) * distance, from.y + (dy / len) * distance);
}

/** Shortest distance from point p to the segment a-b. */
export function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return p.distanceTo(a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether p lies inside the polygon (even-odd rule). The polygon is closed implicitly. */
export function pointInPolygon(p: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
