import { describe, it, expect } from 'vitest';
import { Editor, Tool } from '../src/app/editor';
import { Point2D } from '../src/draw/Point2D';
import { BondType, BondChirality } from '../src/core/Bond';
import { CoordinateGenerator } from '../src/draw/CoordinateGenerator';
import { DrawingConfig } from '../src/draw/DrawingConfig';
import { parseSmiles } from '../src/app/import';

const BL = 30;
const P = (x: number, y: number) => new Point2D(x, y);
const benzene: Tool = { kind: 'ring', size: 6, ringKind: 'aromatic' };
const gen = () => new CoordinateGenerator(new DrawingConfig({ bondLength: BL }));

function centre(ed: Editor, ids: number[]): Point2D {
  return ed.pieceCentre(ids);
}

/** Smallest distance between any two atoms, in bond lengths. */
function minSeparation(ed: Editor): number {
  const ids = [...ed.atomIds()];
  let min = Infinity;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      min = Math.min(min, ed.getPosition(ids[i])!.distanceTo(ed.getPosition(ids[j])!) / BL);
  return min;
}

describe('clean up', () => {
  it('turns a distorted ring with a side chain into a regular hexagon, with no overlapping atoms', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const ring = [...ed.atomIds()];
    // Squash the ring and add a two-atom chain.
    ed.moveAtoms([ring[0]], 12, 20);
    ed.moveAtoms([ring[3]], -8, -15);
    ed.applyTool({ kind: 'bond', type: BondType.SINGLE }, ed.getPosition(ring[1])!);
    ed.cancelChain();
    ed.relayout(gen());
    for (const bond of ed.getMolecule().getBonds()) {
      const d = ed.getPosition(bond.atomId1)!.distanceTo(ed.getPosition(bond.atomId2)!);
      expect(d / BL).toBeGreaterThan(0.95);
      expect(d / BL).toBeLessThan(1.05);
    }
    expect(minSeparation(ed)).toBeGreaterThan(0.9);
  });

  it('keeps each piece where it was, and gives every atom of every piece a position', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(200, 200));
    const left = [...ed.atomIds()];
    ed.applyTool(benzene, P(700, 400));
    const right = [...ed.atomIds()].filter((id) => !left.includes(id));
    const before = [centre(ed, left), centre(ed, right)];
    ed.relayout(gen());
    const after = [centre(ed, left), centre(ed, right)];
    for (let i = 0; i < 2; i++) expect(after[i].distanceTo(before[i])).toBeLessThan(1e-6);
    for (const id of ed.atomIds()) expect(Number.isFinite(ed.getPosition(id)!.x)).toBe(true);
  });

  it('keeps the orientation of a piece that is already clean', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const ids = [...ed.atomIds()];
    const before = ids.map((id) => ed.getPosition(id)!.clone());
    ed.relayout(gen());
    ids.forEach((id, i) => expect(ed.getPosition(id)!.distanceTo(before[i])).toBeLessThan(1));
  });

  it('is one undo step', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const id = [...ed.atomIds()][0];
    ed.moveAtoms([id], 15, 15);
    const moved = ed.getPosition(id)!.clone();
    ed.relayout(gen());
    ed.undo();
    expect(ed.getPosition(id)!.distanceTo(moved)).toBeLessThan(1e-9);
  });

  it('never mirrors a piece with wedge bonds', () => {
    // Checked indirectly: the stereo bond is still there and the piece still has clean bonds.
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const ring = [...ed.atomIds()];
    ed.applyTool({ kind: 'bond', type: BondType.SINGLE, style: BondChirality.WEDGE }, ed.getPosition(ring[0])!);
    ed.cancelChain();
    ed.relayout(gen());
    expect(ed.getMolecule().getBonds().some((b) => b.chirality === BondChirality.WEDGE)).toBe(true);
  });
});

describe('clean up of overlapping pieces', () => {
  it('slides pieces drawn on top of each other apart', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    ed.applyTool(benzene, P(310, 312)); // a second ring almost on top of the first
    ed.relayout(gen());
    expect(minSeparation(ed)).toBeGreaterThan(0.9);
  });
});

describe('rings joined by chains are drawn as regular polygons', () => {
  /** Smallest angle (as the 1-3 distance, in bond lengths) between two bonds of an atom with at most 3 bonds. */
  function sharpest(ed: Editor): number {
    const adj = new Map<number, number[]>();
    for (const b of ed.getMolecule().getBonds()) {
      (adj.get(b.atomId1) ?? adj.set(b.atomId1, []).get(b.atomId1)!).push(b.atomId2);
      (adj.get(b.atomId2) ?? adj.set(b.atomId2, []).get(b.atomId2)!).push(b.atomId1);
    }
    let min = Infinity;
    for (const ns of adj.values()) {
      if (ns.length > 3) continue;
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++)
          min = Math.min(min, ed.getPosition(ns[i])!.distanceTo(ed.getPosition(ns[j])!) / BL);
    }
    return min;
  }

  for (const [name, smiles] of [
    ['imatinib', 'CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5'],
    ['losartan', 'CCCCC1=NC(=C(N1CC2=CC=C(C=C2)C3=CC=CC=C3C4=NNN=N4)CO)Cl'],
    ['biphenyl', 'c1ccccc1-c1ccccc1'],
  ]) {
    it(`${name}: no ring is twisted, before or after clean up`, () => {
      const ed = new Editor(BL);
      ed.loadDocument({ format: 'tsdraw-document', version: 1, name, ...parseSmiles(smiles, BL) });
      expect(sharpest(ed)).toBeGreaterThan(1.55); // every angle at least ~100 degrees
      ed.relayout(gen());
      expect(sharpest(ed)).toBeGreaterThan(1.55);
      expect(minSeparation(ed)).toBeGreaterThan(0.9);
    });
  }
});
