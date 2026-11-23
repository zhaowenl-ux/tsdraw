import { describe, it, expect } from 'vitest';
import { Molecule } from '../src/core/Molecule';
import { BondType } from '../src/core/Bond';
import { Vector3D } from '../src/core/Vector3D';
import { periodicTable } from '../src/core/Element';
import { maxValence, valenceProblems } from '../src/app/valence';
import { Editor } from '../src/app/editor';
import { Point2D } from '../src/draw/Point2D';

/** Atom 0 with the given element/charge, bonded to n carbons with the given bond types. */
function centre(symbol: string, types: BondType[], charge = 0): Molecule {
  const m = new Molecule('t');
  const a = m.addAtom(periodicTable.getBySymbol(symbol)!, new Vector3D(0, 0, 0), charge).id;
  for (const t of types) {
    const b = m.addAtom(periodicTable.getBySymbol('C')!, new Vector3D(0, 0, 0)).id;
    m.addBondBetween(a, b, t);
  }
  return m;
}
const S = BondType.SINGLE;
const D = BondType.DOUBLE;
const T = BondType.TRIPLE;
const flagged = (m: Molecule) => valenceProblems(m).size > 0;

describe('chemistry check: valence', () => {
  it('carbon: 4 bonds fine, 5 flagged; double and triple bonds count by order', () => {
    expect(flagged(centre('C', [S, S, S, S]))).toBe(false);
    expect(flagged(centre('C', [S, S, S, S, S]))).toBe(true);
    expect(flagged(centre('C', [D, D]))).toBe(false);
    expect(flagged(centre('C', [D, D, S]))).toBe(true);
    expect(flagged(centre('C', [T, D]))).toBe(true);
  });

  it('heteroatoms and charges', () => {
    expect(flagged(centre('N', [S, S, S]))).toBe(false);
    expect(flagged(centre('N', [S, S, S, S]))).toBe(true); // neutral N with 4 bonds
    expect(flagged(centre('N', [S, S, S, S], 1))).toBe(false); // ammonium
    expect(flagged(centre('O', [S, S, S]))).toBe(true);
    expect(flagged(centre('O', [S, S, S], 1))).toBe(false); // oxonium
    expect(flagged(centre('O', [S, S], -1))).toBe(true); // alkoxide has one bond
    expect(flagged(centre('S', [D, D, S, S]))).toBe(false); // sulfone
    expect(flagged(centre('P', [D, S, S, S]))).toBe(false); // phosphate
    expect(flagged(centre('F', [S, S]))).toBe(true);
    expect(maxValence('C', 1)).toBe(3);
    expect(maxValence('B', -1)).toBe(4);
    expect(maxValence('Fe', 0)).toBeUndefined(); // metals are not checked
  });

  it('aromatic rings are fine; a ring carbon with two substituents (5 bonds) is flagged', () => {
    const C = periodicTable.getBySymbol('C')!;
    const m = new Molecule('benzene');
    const ring = Array.from({ length: 6 }, () => m.addAtom(C, new Vector3D(0, 0, 0)).id);
    ring.forEach((id, i) => m.addBondBetween(id, ring[(i + 1) % 6], BondType.AROMATIC));
    const methyl = m.addAtom(C, new Vector3D(0, 0, 0)).id;
    m.addBondBetween(ring[0], methyl, S);
    expect(valenceProblems(m).size).toBe(0); // toluene
    const second = m.addAtom(C, new Vector3D(0, 0, 0)).id;
    m.addBondBetween(ring[0], second, S);
    expect([...valenceProblems(m).keys()]).toEqual([ring[0]]);
  });

  it('text-labelled atoms (NO2...) are not checked', () => {
    const ed = new Editor(30);
    const id = ed.setAtomText(undefined, 'NO2', new Point2D(100, 100))!;
    expect(ed.valenceProblems().has(id)).toBe(false);
  });
});
