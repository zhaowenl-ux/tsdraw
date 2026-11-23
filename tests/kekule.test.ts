import { describe, it, expect } from 'vitest';
import { Molecule } from '../src/core/Molecule';
import { BondType } from '../src/core/Bond';
import { PeriodicTable } from '../src/core/Element';
import { bondKey, kekulize } from '../src/core/Kekule';

const pt = PeriodicTable.getInstance();

/** Build a molecule from element symbols and aromatic edges. */
function build(symbols: string[], edges: [number, number][], type = BondType.AROMATIC): { mol: Molecule; ids: number[] } {
  const mol = new Molecule();
  const ids = symbols.map(s => mol.addAtom(pt.getBySymbol(s)!).id);
  for (const [a, b] of edges) mol.addBondBetween(ids[a], ids[b], type);
  return { mol, ids };
}

function ring(n: number, offset = 0): [number, number][] {
  return Array.from({ length: n }, (_, i) => [offset + i, offset + ((i + 1) % n)] as [number, number]);
}

function doublesPerAtom(mol: Molecule, k: Map<string, BondType>): Map<number, number> {
  const count = new Map<number, number>();
  for (const b of mol.getBonds()) {
    if (k.get(bondKey(b.atomId1, b.atomId2)) === BondType.DOUBLE) {
      count.set(b.atomId1, (count.get(b.atomId1) ?? 0) + 1);
      count.set(b.atomId2, (count.get(b.atomId2) ?? 0) + 1);
    }
  }
  return count;
}

describe('kekulize', () => {
  it('benzene gets 3 alternating double bonds', () => {
    const { mol, ids } = build(Array(6).fill('C'), ring(6));
    const k = kekulize(mol);
    expect([...k.values()].filter(t => t === BondType.DOUBLE)).toHaveLength(3);
    const d = doublesPerAtom(mol, k);
    for (const id of ids) expect(d.get(id)).toBe(1);
  });

  it('naphthalene gets 5 double bonds, every atom exactly one', () => {
    const { mol, ids } = build(Array(10).fill('C'), [...ring(6), [0, 6], [6, 7], [7, 8], [8, 9], [9, 1]]);
    const k = kekulize(mol);
    const d = doublesPerAtom(mol, k);
    for (const id of ids) expect(d.get(id)).toBe(1);
  });

  it('pyrrole leaves the nitrogen without a double bond', () => {
    const { mol, ids } = build(['N', 'C', 'C', 'C', 'C'], ring(5));
    const k = kekulize(mol);
    const d = doublesPerAtom(mol, k);
    expect(d.get(ids[0])).toBeUndefined();
    for (const id of ids.slice(1)) expect(d.get(id)).toBe(1);
  });

  it('pyridine is fully kekulized', () => {
    const { mol, ids } = build(['N', 'C', 'C', 'C', 'C', 'C'], ring(6));
    const d = doublesPerAtom(mol, kekulize(mol));
    for (const id of ids) expect(d.get(id)).toBe(1);
  });

  it('non-aromatic molecules are untouched', () => {
    const { mol } = build(Array(6).fill('C'), ring(6), BondType.SINGLE);
    expect(kekulize(mol).size).toBe(0);
  });
});
