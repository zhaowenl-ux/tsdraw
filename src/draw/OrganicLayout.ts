import { Molecule } from '../core/Molecule';
import { BondType } from '../core/Bond';
import { Point2D } from './Point2D';

/**
 * Skeletal 2D layout for organic molecules.
 *
 * 1. Rings. Small rings (up to MAX_RING_SIZE atoms) are found and drawn as regular polygons
 *    of bond-length sides. The first ring is placed at the origin of its component, and each
 *    further ring is fused onto a bond it shares with placed atoms, or attached at one atom.
 * 2. Chains. Remaining atoms are placed breadth-first. Each new atom sits one bond length
 *    from its parent, in the free direction that avoids overlaps and keeps the bonds spread.
 * 3. Relaxation. Gradient descent on a small energy: bonds want the bond length, angles want
 *    their ideal value (180 for a triple bond, otherwise 120 or 109.5), and non-bonded atoms
 *    closer than REPULSION_RADIUS are pushed apart. Starting from polygons, this only fixes
 *    the small errors left by chain placement.
 */

const MAX_RING_SIZE = 8;
const MAX_CYCLES = 300;
/** Placement rejects a direction whose new atom would be closer than this to an existing atom (x bond length). */
const COLLISION_RADIUS = 0.8;
/** Non-bonded pairs closer than this are pushed apart (x bond length). */
const REPULSION_RADIUS = 1.2;
const REPULSION_WEIGHT = 0.5;
/** Angular resolution of the placement search. */
const DIRECTION_STEP = Math.PI / 12;
const RELAX_STEPS = 600;
const TWO_PI = 2 * Math.PI;

/** Ideal angle between two bonds on an atom with the given number of neighbours. */
function idealSpread(neighbourCount: number): number {
  return neighbourCount >= 4 ? (109.5 * Math.PI) / 180 : (2 * Math.PI) / 3;
}

/** Smallest angle between two directions, in [0, pi]. */
function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % TWO_PI;
  return Math.min(d, TWO_PI - d);
}

function directionOf(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Circumradius of a regular n-gon whose sides equal the bond length. */
function polygonRadius(n: number, bondLength: number): number {
  return bondLength / (2 * Math.sin(Math.PI / n));
}

function centroid(ids: number[], placed: Map<number, Point2D>): Point2D {
  let cx = 0;
  let cy = 0;
  for (const id of ids) {
    const p = placed.get(id)!;
    cx += p.x;
    cy += p.y;
  }
  return new Point2D(cx / ids.length, cy / ids.length);
}

/**
 * Lay out every atom of the molecule. Disconnected pieces are placed side by side.
 * Positions are in the same units as bondLength; the caller is expected to centre them.
 *
 * `cisTrans` lists double bonds whose cis/trans arrangement is known from elsewhere (e.g. / and \ in a
 * SMILES): substituent `onA` of atom `a` and `onB` of atom `b` end up on the same side when `cis`.
 * `reference` holds the positions as currently drawn (e.g. before a clean up). When given, every
 * double bond outside a ring keeps its drawn cis/trans (Z/E) arrangement.
 */
export function layoutOrganic(
  molecule: Molecule,
  bondLength: number,
  reference?: Map<number, Point2D>,
  cisTrans: Array<{ a: number; b: number; onA: number; onB: number; cis: boolean }> = []
): Map<number, Point2D> {
  const placed = new Map<number, Point2D>();
  const atoms = molecule.getAtoms();
  if (atoms.length === 0) return placed;

  const bonds = molecule.getBonds();
  const adjacency = new Map<number, number[]>();
  for (const atom of atoms) adjacency.set(atom.id, []);
  const tripleAtoms = new Set<number>();
  const doubleCount = new Map<number, number>();
  for (const bond of bonds) {
    adjacency.get(bond.atomId1)?.push(bond.atomId2);
    adjacency.get(bond.atomId2)?.push(bond.atomId1);
    if (bond.type === BondType.TRIPLE) {
      tripleAtoms.add(bond.atomId1);
      tripleAtoms.add(bond.atomId2);
    }
    if (bond.type === BondType.DOUBLE) {
      for (const id of [bond.atomId1, bond.atomId2]) doubleCount.set(id, (doubleCount.get(id) ?? 0) + 1);
    }
  }
  // Atoms drawn straight (180 degrees): on a triple bond, or the middle of a cumulated C=C=C (allene, CO2).
  // Every other atom with two bonds, including one with a C=C or C=O double bond, is bent at 120 degrees.
  const linearAtoms = new Set(tripleAtoms);
  for (const [id, n] of doubleCount) if (n >= 2) linearAtoms.add(id);
  const chainAtoms = acyclicAtoms(adjacency);

  const rings = selectRings(findCycles(adjacency));

  let originX = 0;
  for (const atom of atoms) {
    if (placed.has(atom.id)) continue;
    const component = collectComponent(atom.id, adjacency);
    const inComponent = new Set(component);
    const members: number[] = [];

    const componentRings = rings.filter((ring) => inComponent.has(ring[0]));
    const usedRings = new Set<number[]>();
    placeRings(componentRings, bondLength, originX, placed, members, usedRings);
    if (members.length === 0) {
      placed.set(atom.id, new Point2D(originX, 0));
      members.push(atom.id);
    }
    placeBreadthFirst(members, adjacency, placed, bondLength, linearAtoms, chainAtoms, componentRings, usedRings);
    originX = maxX(placed) + 2 * bondLength;
  }

  const geometry = reference
    ? doubleBondGeometry(
        bonds.filter((b) => b.type === BondType.DOUBLE).map((b) => [b.atomId1, b.atomId2] as [number, number]),
        adjacency,
        reference
      )
    : [];
  for (const c of cisTrans) {
    const bSide = sideAcross(c.a, c.b, adjacency);
    if (bSide) geometry.push({ ...c, bSide });
  }
  keepDoubleBondGeometry(geometry, placed);

  relax(
    bonds.map((b) => [b.atomId1, b.atomId2] as [number, number]),
    adjacency,
    linearAtoms,
    placed,
    bondLength,
    chainAtoms
  );
  // The relaxation only nudges atoms, but check again so a double bond can never come out flipped.
  keepDoubleBondGeometry(geometry, placed);
  return placed;
}

// ---------- cis/trans (Z/E) of double bonds ----------

/** A drawn double bond a=b, one substituent on each end, whether they were drawn on the same side, and b's side of the molecule. */
interface DoubleBondGeometry {
  a: number;
  b: number;
  onA: number;
  onB: number;
  cis: boolean;
  /** Atoms reached from b without crossing the double bond (b included). */
  bSide: number[];
}

/** Which side of the line a->b the point p lies on: +1, -1, or 0 if (nearly) on the line. */
function sideOf(a: Point2D, b: Point2D, p: Point2D): number {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const scale = a.distanceTo(b) * a.distanceTo(p);
  if (scale < 1e-9 || Math.abs(cross) < 0.05 * scale) return 0; // within ~3 degrees of straight
  return Math.sign(cross);
}

/**
 * Record the drawn cis/trans arrangement of each double bond that is not in a ring and has a
 * substituent on both ends. Double bonds drawn straight (no defined arrangement) are skipped.
 */
function doubleBondGeometry(
  doubles: Array<[number, number]>,
  adjacency: Map<number, number[]>,
  reference: Map<number, Point2D>
): DoubleBondGeometry[] {
  const result: DoubleBondGeometry[] = [];
  for (const [a, b] of doubles) {
    const onA = (adjacency.get(a) ?? []).find((id) => id !== b);
    const onB = (adjacency.get(b) ?? []).find((id) => id !== a);
    if (onA === undefined || onB === undefined) continue;

    const bSide = sideAcross(a, b, adjacency);
    if (!bSide) continue;

    const [pa, pb, pA, pB] = [a, b, onA, onB].map((id) => reference.get(id));
    if (!pa || !pb || !pA || !pB) continue;
    const sA = sideOf(pa, pb, pA);
    const sB = sideOf(pa, pb, pB);
    if (sA === 0 || sB === 0) continue;
    result.push({ a, b, onA, onB, cis: sA === sB, bSide });
  }
  return result;
}

/** b's side of bond a-b: everything reachable from b without using that bond; null if the bond is in a ring. */
function sideAcross(a: number, b: number, adjacency: Map<number, number[]>): number[] | null {
  const side = new Set<number>([b]);
  const queue = [b];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (queue[i] === b && next === a) continue;
      if (next === a) return null;
      if (!side.has(next)) {
        side.add(next);
        queue.push(next);
      }
    }
  }
  return [...side];
}

/** Where the layout has flipped a double bond, mirror b's side across the bond axis to restore it. */
function keepDoubleBondGeometry(geometry: DoubleBondGeometry[], placed: Map<number, Point2D>): void {
  for (const g of geometry) {
    const pa = placed.get(g.a);
    const pb = placed.get(g.b);
    const pA = placed.get(g.onA);
    const pB = placed.get(g.onB);
    if (!pa || !pb || !pA || !pB) continue;
    const sA = sideOf(pa, pb, pA);
    const sB = sideOf(pa, pb, pB);
    if (sA === 0 || sB === 0 || (sA === sB) === g.cis) continue;

    const len = Math.max(pa.distanceTo(pb), 1e-9);
    const ux = (pb.x - pa.x) / len;
    const uy = (pb.y - pa.y) / len;
    for (const id of g.bSide) {
      const p = placed.get(id);
      if (!p) continue;
      const dx = p.x - pa.x;
      const dy = p.y - pa.y;
      const along = dx * ux + dy * uy;
      placed.set(id, new Point2D(pa.x + 2 * along * ux - dx, pa.y + 2 * along * uy - dy));
    }
  }
}

/** Atoms not on any ring: every bond they have is a bridge (Tarjan's bridge search). */
function acyclicAtoms(adjacency: Map<number, number[]>): Set<number> {
  const order = new Map<number, number>();
  const low = new Map<number, number>();
  const cyclic = new Set<number>();
  let counter = 0;
  for (const root of adjacency.keys()) {
    if (order.has(root)) continue;
    // Iterative DFS: stack of [node, parent, next neighbour index].
    const stack: Array<[number, number, number]> = [[root, -1, 0]];
    order.set(root, counter);
    low.set(root, counter++);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, parent] = top;
      const nbs = adjacency.get(v) ?? [];
      if (top[2] < nbs.length) {
        const w = nbs[top[2]++];
        if (w === parent) continue;
        if (order.has(w)) {
          low.set(v, Math.min(low.get(v)!, order.get(w)!));
        } else {
          order.set(w, counter);
          low.set(w, counter++);
          stack.push([w, v, 0]);
        }
      } else {
        stack.pop();
        if (parent !== -1) {
          low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
          // Edge parent-v is on a cycle unless it is a bridge.
          if (low.get(v)! <= order.get(parent)!) {
            cyclic.add(v);
            cyclic.add(parent);
          }
        }
      }
    }
  }
  return new Set([...adjacency.keys()].filter((id) => !cyclic.has(id)));
}

function maxX(points: Map<number, Point2D>): number {
  let max = -Infinity;
  for (const p of points.values()) max = Math.max(max, p.x);
  return max;
}

function collectComponent(seed: number, adjacency: Map<number, number[]>): number[] {
  const seen = new Set<number>([seed]);
  const queue = [seed];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return queue;
}

// ---------- rings ----------

/** Simple cycles of at most MAX_RING_SIZE atoms, each reported once, as ordered atom ids. */
function findCycles(adjacency: Map<number, number[]>): number[][] {
  const seen = new Set<string>();
  const cycles: number[][] = [];
  const starts = [...adjacency.keys()].sort((a, b) => a - b);

  for (const start of starts) {
    const path = [start];
    const onPath = new Set<number>([start]);
    const search = (node: number): void => {
      if (cycles.length >= MAX_CYCLES) return;
      for (const next of adjacency.get(node) ?? []) {
        if (next === start && path.length >= 3) {
          const key = [...path].sort((a, b) => a - b).join(',');
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push([...path]);
          }
        } else if (next > start && !onPath.has(next) && path.length < MAX_RING_SIZE) {
          path.push(next);
          onPath.add(next);
          search(next);
          path.pop();
          onPath.delete(next);
        }
      }
    };
    search(start);
  }
  return cycles;
}

/**
 * Keep the smallest cycles that each add a bond not already in a kept ring.
 * Each kept ring closes at least one bond that no other kept ring closes, so fused systems get all their rings.
 */
function selectRings(cycles: number[][]): number[][] {
  const sorted = [...cycles].sort((a, b) => a.length - b.length);
  const covered = new Set<string>();
  const kept: number[][] = [];
  for (const ring of sorted) {
    const edges = ring.map((id, i) => edgeKey(id, ring[(i + 1) % ring.length]));
    if (edges.every((e) => covered.has(e))) continue;
    edges.forEach((e) => covered.add(e));
    kept.push(ring);
  }
  return kept;
}

/** The smallest set of rings (at most MAX_RING_SIZE atoms) covering every ring bond, as ordered atom ids. */
export function smallRings(adjacency: Map<number, number[]>): number[][] {
  return selectRings(findCycles(adjacency));
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Place rings of one component. The first ring is centred at (originX + R, 0); each later
 * ring that shares a bond with placed atoms is fused on that bond, and a ring sharing one
 * atom is attached there. Atoms placed here are appended to `members`.
 */
function placeRings(
  rings: number[][],
  bondLength: number,
  originX: number,
  placed: Map<number, Point2D>,
  members: number[],
  used: Set<number[]> = new Set()
): void {
  if (rings.length === 0) return;

  const first = rings[0];
  const r0 = polygonRadius(first.length, bondLength);
  const centre = new Point2D(originX + r0, 0);
  first.forEach((id, k) => {
    const angle = -Math.PI / 2 + (TWO_PI * k) / first.length;
    placed.set(id, new Point2D(centre.x + r0 * Math.cos(angle), centre.y + r0 * Math.sin(angle)));
    members.push(id);
  });

  used.add(first);
  growRingSystems(rings, used, bondLength, placed, members);
}

/**
 * Place every unused ring that shares a bond (fused) or an atom (spiro) with placed atoms, repeatedly,
 * so a whole ring system follows from the rings already placed.
 */
function growRingSystems(
  rings: number[][],
  used: Set<number[]>,
  bondLength: number,
  placed: Map<number, Point2D>,
  members: number[]
): void {
  let progress = true;
  while (progress) {
    progress = false;
    for (const ring of rings) {
      if (used.has(ring)) continue;
      const placedIdx = ring.map((id, i) => (placed.has(id) ? i : -1)).filter((i) => i >= 0);
      if (placedIdx.length === 2) {
        const [i, j] = placedIdx;
        const adjacent = (j - i + ring.length) % ring.length === 1 || (i - j + ring.length) % ring.length === 1;
        if (!adjacent) continue;
        fuseRingOnBond(ring, ring[i], ring[j], bondLength, placed, members);
      } else if (placedIdx.length === 1) {
        attachRingAtAtom(ring, ring[placedIdx[0]], bondLength, placed, members);
      } else {
        continue;
      }
      used.add(ring);
      progress = true;
    }
  }
}

/** Place the ring on the side of bond a-b that faces away from the rest of the component. */
function fuseRingOnBond(
  ring: number[],
  a: number,
  b: number,
  bondLength: number,
  placed: Map<number, Point2D>,
  members: number[]
): void {
  const n = ring.length;
  const pa = placed.get(a)!;
  const pb = placed.get(b)!;
  const mid = new Point2D((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
  const abLength = Math.max(pa.distanceTo(pb), 1e-9);
  const c = centroid(members, placed);

  let px = -(pb.y - pa.y) / abLength;
  let py = (pb.x - pa.x) / abLength;
  if (px * (mid.x - c.x) + py * (mid.y - c.y) < 0) {
    px = -px;
    py = -py;
  }
  const R = polygonRadius(n, bondLength);
  const apothem = Math.sqrt(Math.max(0, R * R - (abLength / 2) ** 2));
  const centreX = mid.x + px * apothem;
  const centreY = mid.y + py * apothem;
  const startAngle = Math.atan2(pa.y - centreY, pa.x - centreX);

  // Choose the polygon orientation in which the next vertex is b.
  const vertex = (k: number, sign: number): Point2D => {
    const angle = startAngle + (sign * TWO_PI * k) / n;
    return new Point2D(centreX + R * Math.cos(angle), centreY + R * Math.sin(angle));
  };
  const sign = vertex(1, 1).distanceTo(pb) <= vertex(1, -1).distanceTo(pb) ? 1 : -1;

  const ia = ring.indexOf(a);
  const direction = ring[(ia + 1) % n] === b ? 1 : -1;
  for (let k = 1; k < n; k++) {
    const id = ring[((ia + direction * k) % n + n) % n];
    if (placed.has(id)) continue;
    placed.set(id, vertex(k, sign));
    members.push(id);
  }
}

/**
 * Attach the ring at atom a, growing away from the rest of the component, or along `towards`
 * (radians) when given: the ring's centre then lies straight on from the bond that reached a.
 */
function attachRingAtAtom(
  ring: number[],
  a: number,
  bondLength: number,
  placed: Map<number, Point2D>,
  members: number[],
  towards?: number
): void {
  const n = ring.length;
  const pa = placed.get(a)!;
  const c = centroid(members, placed);
  let ux = towards !== undefined ? Math.cos(towards) : pa.x - c.x;
  let uy = towards !== undefined ? Math.sin(towards) : pa.y - c.y;
  const len = Math.hypot(ux, uy);
  if (len < 1e-6) {
    ux = 0;
    uy = -1;
  } else {
    ux /= len;
    uy /= len;
  }
  const R = polygonRadius(n, bondLength);
  const centreX = pa.x + ux * R;
  const centreY = pa.y + uy * R;
  const startAngle = Math.atan2(pa.y - centreY, pa.x - centreX);

  const ia = ring.indexOf(a);
  for (let k = 1; k < n; k++) {
    const id = ring[(ia + k) % n];
    if (placed.has(id)) continue;
    const angle = startAngle + (TWO_PI * k) / n;
    placed.set(id, new Point2D(centreX + R * Math.cos(angle), centreY + R * Math.sin(angle)));
    members.push(id);
  }
}

// ---------- chains ----------

/**
 * Place every unplaced atom reachable from `members` (which already has positions).
 * Each new atom gets the free direction that avoids overlaps and keeps the spread.
 */
function placeBreadthFirst(
  members: number[],
  adjacency: Map<number, number[]>,
  placed: Map<number, Point2D>,
  bondLength: number,
  linearAtoms: Set<number> = new Set(),
  chainAtoms: Set<number> = new Set(),
  rings: number[][] = [],
  usedRings: Set<number[]> = new Set()
): void {
  const queue = [...members];
  const ringsOf = new Map<number, number[][]>();
  for (const ring of rings) for (const id of ring) (ringsOf.get(id) ?? ringsOf.set(id, []).get(id)!).push(ring);
  while (queue.length > 0) {
    const atomId = queue.shift()!;
    const origin = placed.get(atomId)!;
    const neighbours = adjacency.get(atomId) ?? [];
    const fresh = neighbours.filter((id) => !placed.has(id));
    if (fresh.length === 0) continue;

    const taken = neighbours
      .filter((id) => placed.has(id))
      .map((id) => directionOf(origin, placed.get(id)!));
    const linear = linearAtoms.has(atomId) && neighbours.length === 2;
    const ideal = linear ? Math.PI : idealSpread(neighbours.length);
    // A chain atom with two bonds should be bent by exactly the ideal (120, or 180 if linear), not merely
    // at least the ideal: otherwise "straight on" scores as well as the 120-degree bend (C=C-C drawn straight).
    // Ring atoms keep the looser rule, which lets large rings close.
    const exact = neighbours.length === 2 && chainAtoms.has(atomId);

    for (const id of fresh) {
      if (placed.has(id)) continue;
      const angle = bestDirection(atomId, origin, taken, ideal, placed, members, bondLength, exact);
      placed.set(
        id,
        new Point2D(origin.x + bondLength * Math.cos(angle), origin.y + bondLength * Math.sin(angle))
      );
      taken.push(angle);
      members.push(id);
      queue.push(id);

      // A bond into a ring that is not drawn yet (rings joined by a chain or a single bond): draw that
      // ring, and every ring fused to it, as regular polygons now, rather than atom by atom.
      const ring = (ringsOf.get(id) ?? []).find((r) => !usedRings.has(r) && r.every((x) => x === id || !placed.has(x)));
      if (ring) {
        const before = members.length;
        attachRingAtAtom(ring, id, bondLength, placed, members, angle);
        usedRings.add(ring);
        growRingSystems(rings, usedRings, bondLength, placed, members);
        queue.push(...members.slice(before));
      }
    }
  }
}

/** Direction for a new bond from `origin` that avoids clashes and keeps the ideal spread. */
function bestDirection(
  atomId: number,
  origin: Point2D,
  taken: number[],
  ideal: number,
  placed: Map<number, Point2D>,
  members: number[],
  bondLength: number,
  exact: boolean = false
): number {
  // Prefer directions pointing away from the centre of the component built so far.
  const c = centroid(members, placed);
  const outward =
    Math.hypot(origin.x - c.x, origin.y - c.y) < 1e-6 ? -Math.PI / 2 : Math.atan2(origin.y - c.y, origin.x - c.x);

  let best = outward;
  let bestScore = Infinity;
  const steps = Math.round(TWO_PI / DIRECTION_STEP);
  for (let step = 0; step < steps; step++) {
    const angle = step * DIRECTION_STEP;
    const x = origin.x + bondLength * Math.cos(angle);
    const y = origin.y + bondLength * Math.sin(angle);

    let clashes = 0;
    for (const [id, q] of placed) {
      if (id === atomId) continue;
      const d = Math.hypot(x - q.x, y - q.y);
      if (d < COLLISION_RADIUS * bondLength) clashes += 1;
    }

    let minSeparation = Infinity;
    for (const t of taken) minSeparation = Math.min(minSeparation, angularDistance(angle, t));
    const spreadViolation =
      taken.length === 0 ? 0 : exact ? Math.abs(ideal - minSeparation) : Math.max(0, ideal - minSeparation);

    const score = clashes * 1000 + spreadViolation * 10 + angularDistance(angle, outward) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = angle;
    }
  }
  return best;
}

// ---------- relaxation ----------

/** Gradient descent on bond length, bond angle and non-bonded repulsion terms. Updates `placed` in place. */
function relax(
  pairs: Array<[number, number]>,
  adjacency: Map<number, number[]>,
  linearAtoms: Set<number>,
  placed: Map<number, Point2D>,
  bondLength: number,
  chainAtoms: Set<number> = new Set()
): void {
  const ids = [...placed.keys()];
  const n = ids.length;
  const index = new Map<number, number>(ids.map((id, i) => [id, i]));

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  ids.forEach((id, i) => {
    const p = placed.get(id)!;
    x[i] = p.x;
    y[i] = p.y;
  });

  const bonded = new Uint8Array(n * n);
  const bondIdx: Array<[number, number]> = [];
  for (const [a, b] of pairs) {
    const i = index.get(a)!;
    const j = index.get(b)!;
    bondIdx.push([i, j]);
    bonded[i * n + j] = 1;
    bonded[j * n + i] = 1;
  }

  const neighbourIdx = ids.map((id) => (adjacency.get(id) ?? []).map((nb) => index.get(nb)!));
  const idealAngle = ids.map((id, i) =>
    linearAtoms.has(id) && neighbourIdx[i].length === 2 ? Math.PI : idealSpread(neighbourIdx[i].length)
  );

  // A bent chain atom that starts exactly straight would stay straight: the angle force vanishes at 180 degrees.
  // Nudge it sideways so the relaxation can bend it.
  for (let j = 0; j < n; j++) {
    const nb = neighbourIdx[j];
    if (nb.length !== 2 || idealAngle[j] >= Math.PI || !chainAtoms.has(ids[j])) continue;
    const ux = x[nb[0]] - x[j];
    const uy = y[nb[0]] - y[j];
    const vx = x[nb[1]] - x[j];
    const vy = y[nb[1]] - y[j];
    const cos = (ux * vx + uy * vy) / Math.max(Math.hypot(ux, uy) * Math.hypot(vx, vy), 1e-9);
    if (cos > -0.999) continue;
    const len = Math.max(Math.hypot(ux, uy), 1e-9);
    x[j] += (-uy / len) * 0.2 * bondLength;
    y[j] += (ux / len) * 0.2 * bondLength;
  }

  const L = bondLength;
  const kAngle = 0.5 * L * L;
  const repelDistance = REPULSION_RADIUS * L;
  const gx = new Float64Array(n);
  const gy = new Float64Array(n);

  for (let step = 0; step < RELAX_STEPS; step++) {
    const rate = 0.02 + 0.08 * (1 - step / RELAX_STEPS);
    gx.fill(0);
    gy.fill(0);

    // Bond length: E = (d - L)^2
    for (const [i, j] of bondIdx) {
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const d = Math.max(Math.hypot(dx, dy), 1e-9);
      const f = (2 * (d - L)) / d;
      gx[i] -= f * dx;
      gy[i] -= f * dy;
      gx[j] += f * dx;
      gy[j] += f * dy;
    }

    // Bond angles at each atom: E = kAngle * (theta - ideal)^2
    for (let j = 0; j < n; j++) {
      const nb = neighbourIdx[j];
      for (let a = 0; a < nb.length; a++) {
        for (let b = a + 1; b < nb.length; b++) {
          const i = nb[a];
          const k = nb[b];
          const ux = x[i] - x[j];
          const uy = y[i] - y[j];
          const vx = x[k] - x[j];
          const vy = y[k] - y[j];
          const lu = Math.max(Math.hypot(ux, uy), 1e-9);
          const lv = Math.max(Math.hypot(vx, vy), 1e-9);
          const c = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
          const s = Math.max(Math.sqrt(1 - c * c), 1e-4);
          const theta = Math.acos(c);
          const dEdc = (2 * kAngle * (theta - idealAngle[j])) * (-1 / s);

          const dcux = vx / (lu * lv) - (c * ux) / (lu * lu);
          const dcuy = vy / (lu * lv) - (c * uy) / (lu * lu);
          const dcvx = ux / (lu * lv) - (c * vx) / (lv * lv);
          const dcvy = uy / (lu * lv) - (c * vy) / (lv * lv);

          gx[i] += dEdc * dcux;
          gy[i] += dEdc * dcuy;
          gx[k] += dEdc * dcvx;
          gy[k] += dEdc * dcvy;
          gx[j] -= dEdc * (dcux + dcvx);
          gy[j] -= dEdc * (dcuy + dcvy);
        }
      }
    }

    // Non-bonded repulsion: E = w * (D - d)^2 for d < D
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bonded[i * n + j]) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d = Math.hypot(dx, dy);
        if (d >= repelDistance) continue;
        const dd = Math.max(d, 1e-9);
        const f = (2 * REPULSION_WEIGHT * (repelDistance - dd)) / dd;
        gx[i] += f * dx;
        gy[i] += f * dy;
        gx[j] -= f * dx;
        gy[j] -= f * dy;
      }
    }

    for (let i = 0; i < n; i++) {
      x[i] -= rate * gx[i];
      y[i] -= rate * gy[i];
    }
  }

  ids.forEach((id, i) => placed.set(id, new Point2D(x[i], y[i])));
}
