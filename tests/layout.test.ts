import { describe, it, expect } from 'vitest';
import { Molecule } from '../src/core/Molecule';
import { BondType } from '../src/core/Bond';
import { Vector3D } from '../src/core/Vector3D';
import { periodicTable } from '../src/core/Element';
import { Point2D } from '../src/draw/Point2D';
import { layoutOrganic } from '../src/draw/OrganicLayout';

const L = 30;

/** Build a carbon skeleton from edges between atom indices 0..n-1. */
function skeleton(n: number, edges: Array<[number, number, BondType?]>): Molecule {
  const carbon = periodicTable.getBySymbol('C')!;
  const m = new Molecule('test');
  const ids = Array.from({ length: n }, () => m.addAtom(carbon, new Vector3D(0, 0, 0)).id);
  for (const [a, b, type] of edges) m.addBondBetween(ids[a], ids[b], type ?? BondType.SINGLE);
  return m;
}

function metrics(m: Molecule, pos: Map<number, Point2D>) {
  const ids = [...pos.keys()];
  const bondRatios = m.getBonds().map((b) => pos.get(b.atomId1)!.distanceTo(pos.get(b.atomId2)!) / L);
  let minSeparation = Infinity;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      minSeparation = Math.min(minSeparation, pos.get(ids[i])!.distanceTo(pos.get(ids[j])!) / L);
    }
  }
  // Largest deviation from 120 degrees at any atom with exactly two bonds (ring or chain).
  let worstAngleDeg = 0;
  for (const id of ids) {
    const nb = m.getBondsForAtom(id).map((b) => b.getOtherAtom(id));
    if (nb.length !== 2) continue;
    const c = pos.get(id)!;
    const u = pos.get(nb[0])!;
    const v = pos.get(nb[1])!;
    const ux = u.x - c.x, uy = u.y - c.y, vx = v.x - c.x, vy = v.y - c.y;
    const angle = (Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))) * 180) / Math.PI;
    worstAngleDeg = Math.max(worstAngleDeg, Math.abs(angle - 120));
  }
  return {
    minBondRatio: Math.min(...bondRatios),
    maxBondRatio: Math.max(...bondRatios),
    minSeparation,
    worstAngleDeg,
  };
}

describe('organic layout', () => {
  it('benzene is a regular hexagon: bonds at bond length, angles near 120 degrees, no overlap', () => {
    const m = skeleton(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
    const pos = layoutOrganic(m, L);
    const r = metrics(m, pos);
    expect(r.minBondRatio).toBeGreaterThan(0.95);
    expect(r.maxBondRatio).toBeLessThan(1.05);
    expect(r.minSeparation).toBeGreaterThan(0.8);
    expect(r.worstAngleDeg).toBeLessThan(10);
  });

  it('a straight-chain alkane keeps bond lengths and spreads atoms without overlap', () => {
    const m = skeleton(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
    const r = metrics(m, layoutOrganic(m, L));
    expect(r.minBondRatio).toBeGreaterThan(0.95);
    expect(r.maxBondRatio).toBeLessThan(1.05);
    expect(r.minSeparation).toBeGreaterThan(0.8);
  });

  it('a quaternary carbon (neopentane) has four non-overlapping branches', () => {
    const m = skeleton(5, [[0, 1], [0, 2], [0, 3], [0, 4]]);
    const r = metrics(m, layoutOrganic(m, L));
    expect(r.minBondRatio).toBeGreaterThan(0.95);
    expect(r.maxBondRatio).toBeLessThan(1.05);
    expect(r.minSeparation).toBeGreaterThan(0.8);
  });

  it('a branched chain with a ring attached does not overlap itself', () => {
    // Benzene (0-5) with a three-carbon chain (6-7-8) hanging from atom 0.
    const m = skeleton(9, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [7, 8]]);
    const r = metrics(m, layoutOrganic(m, L));
    expect(r.minSeparation).toBeGreaterThan(0.8);
    expect(r.maxBondRatio).toBeLessThan(1.05);
  });

  it('a fused bicyclic (naphthalene skeleton) lays out without overlap', () => {
    const m = skeleton(10, [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [5, 6], [6, 7], [7, 8], [8, 9], [9, 4],
    ]);
    const r = metrics(m, layoutOrganic(m, L));
    expect(r.minSeparation).toBeGreaterThan(0.8);
    expect(r.maxBondRatio).toBeLessThan(1.1);
  });

  it('disconnected pieces are placed side by side without overlap', () => {
    const m = skeleton(5, [[0, 1], [1, 2], [3, 4]]);
    const pos = layoutOrganic(m, L);
    expect(pos.size).toBe(5);
    expect(metrics(m, pos).minSeparation).toBeGreaterThan(0.8);
  });

  it('every atom gets a finite position', () => {
    const m = skeleton(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);
    const pos = layoutOrganic(m, L);
    for (const p of pos.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('an empty molecule gives an empty layout', () => {
    expect(layoutOrganic(new Molecule('empty'), L).size).toBe(0);
  });
});

describe('chain angles after layout', () => {
  /** Angle in degrees at atom index `centre` between its two neighbours. */
  function angleAt(m: Molecule, pos: Map<number, Point2D>, centreIndex: number): number {
    const id = m.getAtoms()[centreIndex].id;
    const nb = m.getBondsForAtom(id).map((b) => b.getOtherAtom(id));
    const c = pos.get(id)!;
    const u = pos.get(nb[0])!;
    const v = pos.get(nb[1])!;
    const cos = ((u.x - c.x) * (v.x - c.x) + (u.y - c.y) * (v.y - c.y)) / (c.distanceTo(u) * c.distanceTo(v));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  it('a double bond is bent at 120 degrees, never drawn straight (propene, propanal-like)', () => {
    const propene = skeleton(3, [[0, 1, BondType.DOUBLE], [1, 2]]);
    expect(angleAt(propene, layoutOrganic(propene, L), 1)).toBeCloseTo(120, 0);
    const butene = skeleton(4, [[0, 1], [1, 2, BondType.DOUBLE], [2, 3]]);
    const pos = layoutOrganic(butene, L);
    expect(angleAt(butene, pos, 1)).toBeCloseTo(120, 0);
    expect(angleAt(butene, pos, 2)).toBeCloseTo(120, 0);
  });

  it('triple bonds and cumulated double bonds (allene) stay straight', () => {
    const butyne = skeleton(4, [[0, 1], [1, 2, BondType.TRIPLE], [2, 3]]);
    const pos = layoutOrganic(butyne, L);
    expect(angleAt(butyne, pos, 1)).toBeCloseTo(180, 0);
    const allene = skeleton(3, [[0, 1, BondType.DOUBLE], [1, 2, BondType.DOUBLE]]);
    expect(angleAt(allene, layoutOrganic(allene, L), 1)).toBeCloseTo(180, 0);
  });
});

describe('double bond Z/E (cis/trans) is kept by clean up', () => {
  /** +1 if the two substituents are on the same side of the a=b bond (cis/Z), -1 if opposite (trans/E). */
  function cisSign(pos: Map<number, Point2D>, a: number, b: number, onA: number, onB: number): number {
    const side = (p: Point2D) => {
      const A = pos.get(a)!;
      const B = pos.get(b)!;
      return Math.sign((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
    };
    return side(pos.get(onA)!) * side(pos.get(onB)!);
  }

  /** Drawn positions for atoms 0..n-1 of a skeleton, by index. */
  function drawn(m: Molecule, points: Array<[number, number]>): Map<number, Point2D> {
    const ids = m.getAtoms().map((a) => a.id);
    return new Map(points.map(([x, y], i) => [ids[i], new Point2D(x, y)]));
  }

  // 2-butene: 0-1=2-3
  const butene = () => skeleton(4, [[0, 1], [1, 2, BondType.DOUBLE], [2, 3]]);
  const cisDrawing: Array<[number, number]> = [[0, 0], [15, 26], [45, 26], [60, 0]];
  const transDrawing: Array<[number, number]> = [[0, 0], [15, 26], [45, 26], [60, 52]];

  it('cis (Z) stays cis and trans (E) stays trans', () => {
    for (const [points, expected] of [[cisDrawing, 1], [transDrawing, -1]] as const) {
      const m = butene();
      const ids = m.getAtoms().map((a) => a.id);
      const pos = layoutOrganic(m, L, drawn(m, [...points]));
      expect(cisSign(pos, ids[1], ids[2], ids[0], ids[3])).toBe(expected);
    }
  });

  it('keeps Z for a longer chain on both ends ((Z)-oct-4-ene)', () => {
    // 0-1-2-3=4-5-6-7, drawn with 2 and 5 on the same side of 3=4
    const m = skeleton(8, [[0, 1], [1, 2], [2, 3], [3, 4, BondType.DOUBLE], [4, 5], [5, 6], [6, 7]]);
    const ids = m.getAtoms().map((a) => a.id);
    const points: Array<[number, number]> = [[-30, 60], [-15, 34], [0, 0], [15, 26], [45, 26], [60, 0], [75, 34], [90, 60]];
    const pos = layoutOrganic(m, L, drawn(m, points));
    expect(cisSign(pos, ids[3], ids[4], ids[2], ids[5])).toBe(1);
  });

  it('a double bond drawn straight has no arrangement to keep, and lays out bent', () => {
    const m = butene();
    const pos = layoutOrganic(m, L, drawn(m, [[0, 0], [30, 0], [60, 0], [90, 0]]));
    const ids = m.getAtoms().map((a) => a.id);
    expect(Math.abs(cisSign(pos, ids[1], ids[2], ids[0], ids[3]))).toBe(1);
  });
});
