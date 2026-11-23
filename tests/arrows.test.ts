import { describe, expect, it } from 'vitest';
import { Point2D } from '../src/draw/Point2D';
import { Editor } from '../src/app/editor';
import { arrowEnd, arrowShape } from '../src/app/arrows';

describe('reaction arrows', () => {
  it('a click places a default-length arrow, a drag the dragged one; both are undoable', () => {
    const ed = new Editor(30);
    ed.applyTool({ kind: 'arrow', arrow: 'forward' }, new Point2D(10, 10));
    const [a] = ed.getArrows();
    expect(a.to.x - a.from.x).toBeCloseTo(75);
    ed.addArrow('retro', new Point2D(0, 50), new Point2D(100, 50));
    expect(ed.arrowCount()).toBe(2);
    expect(ed.isEmpty()).toBe(false);
    ed.undo();
    expect(ed.arrowCount()).toBe(1);
    ed.redo();
    expect(ed.getArrows()[1].kind).toBe('retro');
  });

  it('round-trips through a document and is left out of partial documents', () => {
    const ed = new Editor(30);
    ed.applyTool({ kind: 'atom', symbol: 'O' }, new Point2D(0, 0));
    ed.addArrow('equilibrium', new Point2D(20, 0), new Point2D(80, 0));
    const doc = JSON.parse(JSON.stringify(ed.getDocument()));
    expect(doc.arrows).toHaveLength(1);
    expect(ed.getDocument([...ed.atomIds()]).arrows).toBeUndefined();
    const copy = new Editor(30);
    copy.loadDocument(doc);
    expect(copy.getArrows()[0]).toMatchObject({ kind: 'equilibrium' });
    expect(new Editor(30).getDocument().arrows).toBeUndefined();
    expect(() => copy.loadDocument({ ...doc, arrows: [{ id: 1, kind: 'bogus', x1: 0, y1: 0, x2: 1, y2: 1 }] })).toThrow();
  });

  it('selects, moves, stretches and deletes arrows', () => {
    const ed = new Editor(30);
    const id = ed.addArrow('both', new Point2D(0, 0), new Point2D(100, 0));
    expect(ed.hitArrow(new Point2D(50, 3))).toBe(id);
    expect(ed.arrowGripAt(new Point2D(99, 1))).toEqual({ id, end: 'to' });
    ed.moveArrows([id], 10, 20);
    ed.setArrowEnd(id, 'to', new Point2D(10, 120));
    expect(ed.getArrows()[0].from).toMatchObject({ x: 10, y: 20 });
    expect(ed.getArrows()[0].to).toMatchObject({ x: 10, y: 120 });
    ed.selectAtoms([], ed.arrowsInRect(new Point2D(0, 0), new Point2D(30, 200)));
    expect(ed.isArrowSelected(id)).toBe(true);
    expect(ed.deleteSelection()).toBe(true);
    expect(ed.isEmpty()).toBe(true);
  });

  it('scales with the bond length', () => {
    const ed = new Editor(30);
    ed.addArrow('forward', new Point2D(0, 0), new Point2D(60, 0));
    ed.setBondLength(60);
    const [a] = ed.getArrows();
    expect(a.to.x - a.from.x).toBeCloseTo(120);
  });

  it('straightens nearly horizontal arrows and snaps with a step', () => {
    const end = arrowEnd(new Point2D(0, 0), new Point2D(100, 3));
    expect(end.y).toBeCloseTo(0);
    expect(arrowEnd(new Point2D(0, 0), new Point2D(100, 30)).y).toBe(30);
    const snapped = arrowEnd(new Point2D(0, 0), new Point2D(100, 30), 15);
    expect(Math.atan2(snapped.y, snapped.x) * (180 / Math.PI)).toBeCloseTo(15);
  });

  it('gives each kind its heads', () => {
    const arrow = (kind: 'forward' | 'equilibrium' | 'both' | 'retro') => arrowShape({ kind, from: new Point2D(0, 0), to: new Point2D(100, 0) }, 1.5);
    expect(arrow('forward').heads).toHaveLength(1);
    expect(arrow('both').heads).toHaveLength(2);
    expect(arrow('equilibrium').lines).toHaveLength(2);
    expect(arrow('retro').open).toHaveLength(1);
  });
});
