import { describe, it, expect } from 'vitest';
import { Editor } from '../src/app/editor';
import { fragmentFor, parseSmiles } from '../src/app/expand';
import { Point2D } from '../src/draw/Point2D';
import { BondType } from '../src/core/Bond';

const P = (x: number, y: number) => new Point2D(x, y);

/** Benzene with one substituent atom carrying `label`. Returns the editor and the label atom. */
function arylWith(label: string): { ed: Editor; id: number } {
  const ed = new Editor(30);
  ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, P(300, 300));
  const top = ed.hitAtom(P(300, 270))!;
  ed.applyTool({ kind: 'bond', type: BondType.SINGLE }, ed.getPosition(top)!);
  ed.cancelChain();
  const id = [...ed.atomIds()].find((a) => ed.getMolecule().getBondsForAtom(a).length === 1)!;
  ed.setAtomText(id, label);
  return { ed, id };
}

describe('fragments', () => {
  it('reads SMILES with branches, charges and aromatic rings', () => {
    const nitro = parseSmiles('[N+](=O)[O-]');
    expect(nitro.atoms).toEqual([{ symbol: 'N', charge: 1 }, { symbol: 'O', charge: 0 }, { symbol: 'O', charge: -1 }]);
    expect(nitro.bonds).toEqual([[0, 1, BondType.DOUBLE], [0, 2, BondType.SINGLE]]);
    const ph = parseSmiles('c1ccccc1');
    expect(ph.atoms.length).toBe(6);
    expect(ph.bonds.length).toBe(6);
    expect(ph.bonds.every(([, , t]) => t === BondType.AROMATIC)).toBe(true);
  });

  it('knows common groups, reversed writings and condensed formulas', () => {
    for (const label of ['NO2', 'COOH', 'CO2Me', 'OMe', 'CF3', 'Ph', 'O2N', 'HOOC', 'MeO', 'F3C', 'CH2CH2OH', 'CH2Ph', 'C(CH3)3', 'CH2CF3']) {
      expect(fragmentFor(label), label).not.toBeNull();
    }
    expect(fragmentFor('C(CH3)3')!.atoms.length).toBe(4);
    expect(fragmentFor('CH2CH2OH')!.atoms.map((a) => a.symbol)).toEqual(['C', 'C', 'O']);
    expect(fragmentFor('hello')).toBeNull();
    expect(fragmentFor('CH5')).toBeNull(); // hydrogens do not fit carbon
  });
});

describe('expand labels', () => {
  it('expands NO2 on benzene into a charged nitro group with no valence errors and the same formula', () => {
    const { ed, id } = arylWith('NO2');
    const formulaBefore = ed.formula();
    const result = ed.expandLabels();
    expect(result).toEqual({ expanded: 1, failed: [] });
    expect(ed.getLabel(id)).toBeUndefined();
    expect(ed.atomCount()).toBe(9);
    expect(ed.getMolecule().getAtom(id)!.charge).toBe(1);
    expect(ed.formula()).toBe(formulaBefore);
    expect(ed.valenceProblems().size).toBe(0);
  });

  it('expands COOH with sensible geometry: bonds one bond length, nothing on top of the ring', () => {
    const { ed } = arylWith('COOH');
    const before = ed.formula();
    ed.expandLabels();
    expect(ed.formula()).toBe(before);
    for (const b of ed.getMolecule().getBonds()) {
      const d = ed.getPosition(b.atomId1)!.distanceTo(ed.getPosition(b.atomId2)!);
      expect(d / 30).toBeGreaterThan(0.9);
      expect(d / 30).toBeLessThan(1.1);
    }
    const ids = [...ed.atomIds()];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(ed.getPosition(ids[i])!.distanceTo(ed.getPosition(ids[j])!)).toBeGreaterThan(20);
  });

  it('is one undo step, reports unknown labels, and only expands selected labels when some are selected', () => {
    const ed = new Editor(30);
    const a = ed.setAtomText(undefined, 'OMe', P(100, 100))!;
    const b = ed.setAtomText(undefined, 'CF3', P(400, 100))!;
    ed.setAtomText(undefined, 'xyz', P(700, 100));
    ed.selectAtoms([a]);
    expect(ed.expandLabels()).toEqual({ expanded: 1, failed: [] });
    expect(ed.getLabel(b)).toBe('CF3');
    expect(ed.expandLabels()).toEqual({ expanded: 1, failed: ['xyz'] });
    ed.undo();
    expect(ed.getLabel(b)).toBe('CF3');
  });
});
