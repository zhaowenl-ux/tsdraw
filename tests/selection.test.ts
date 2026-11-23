import { describe, it, expect } from 'vitest';
import { Editor, describeTool } from '../src/app/editor';
import { pointInPolygon } from '../src/app/geometry';
import { Point2D } from '../src/draw/Point2D';

const P = (x: number, y: number) => new Point2D(x, y);

/** A benzene ring centred at (cx, cy) plus a separate lone atom far away. */
function drawing(): { ed: Editor; lone: number } {
  const ed = new Editor(30);
  ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, P(200, 200));
  const lone = ed.setAtomText(undefined, 'Br', P(500, 200))!;
  ed.clearSelection();
  return { ed, lone };
}

describe('lasso and rectangle selection', () => {
  it('pointInPolygon', () => {
    const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
    expect(pointInPolygon(P(5, 5), square)).toBe(true);
    expect(pointInPolygon(P(15, 5), square)).toBe(false);
  });

  it('a rectangle selects the atoms inside it, and the bonds between them', () => {
    const { ed, lone } = drawing();
    ed.selectAtoms(ed.atomsInRect(P(150, 150), P(250, 250)));
    expect(ed.selectedAtomIds().size).toBe(6);
    expect(ed.isSelected(lone)).toBe(false);
    const bond = ed.getMolecule().getBonds()[0];
    expect(ed.isSelected(bond.atomId1, bond.atomId2)).toBe(true);
  });

  it('a lasso selects the atoms inside the loop', () => {
    const { ed, lone } = drawing();
    const loop = Array.from({ length: 24 }, (_, i) => {
      const t = (2 * Math.PI * i) / 24;
      return P(500 + 20 * Math.cos(t), 200 + 20 * Math.sin(t));
    });
    ed.selectAtoms(ed.atomsInPolygon(loop));
    expect([...ed.selectedAtomIds()]).toEqual([lone]);
    ed.selectAtoms([]);
    expect(ed.selection).toBeNull();
  });

  it('a multi-atom selection can be moved (one undo step) and deleted', () => {
    const { ed } = drawing();
    const ids = ed.atomsInRect(P(150, 150), P(250, 250));
    ed.selectAtoms(ids);
    const before = ed.getPosition(ids[0])!.clone();
    ed.beginMove();
    ed.moveAtoms(ids, 10, 0);
    ed.moveAtoms(ids, 5, 5);
    expect(ed.getPosition(ids[0])!.x).toBeCloseTo(before.x + 15);
    ed.undo();
    expect(ed.getPosition(ids[0])!.x).toBeCloseTo(before.x);

    ed.selectAtoms(ids);
    expect(ed.deleteSelection()).toBe(true);
    expect(ed.atomCount()).toBe(1);
    expect(ed.bondCount()).toBe(0);
  });

  it('describes the selection modes', () => {
    expect(describeTool({ kind: 'select' })).toBe('Lasso select');
    expect(describeTool({ kind: 'select', mode: 'rect' })).toBe('Rectangle select');
  });
});
