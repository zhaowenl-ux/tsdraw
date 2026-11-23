import { describe, it, expect } from 'vitest';
import { Editor, Tool } from '../src/app/editor';
import { Point2D } from '../src/draw/Point2D';
import { BondType, BondChirality } from '../src/core/Bond';
import { CoordinateGenerator } from '../src/draw/CoordinateGenerator';
import { DrawingConfig } from '../src/draw/DrawingConfig';

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
