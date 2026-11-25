import { describe, expect, it } from 'vitest';
import { parseSmiles } from '../src/app/import';
import { aromaticRings } from '../src/app/aromatic';
import { Editor } from '../src/app/editor';
import { Molecule } from '../src/core/Molecule';
import { Point2D } from '../src/draw/Point2D';

function mol(smiles: string): Molecule {
  const ed = new Editor(30);
  ed.insertDocument(parseSmiles(smiles, 30), new Point2D(0, 0));
  return ed.getMolecule();
}

describe('aromatic ring perception', () => {
  it.each([
    ['c1ccccc1', 1],
    ['C1=CC=CC=C1', 1],
    ['c1ccncc1', 1],
    ['c1cc[nH]c1', 1],
    ['c1ccsc1', 1],
    ['c1ccc2ccccc2c1', 2],
    ['c1ccc2[nH]ccc2c1', 2],
    ['CC(=O)Oc1ccccc1C(=O)O', 1],
  ])('%s has %i aromatic ring(s)', (smiles, n) => {
    expect(aromaticRings(mol(smiles)).length).toBe(n);
  });

  it.each(['C1CCCCC1', 'C1=CCCC=C1', 'O=C1C=CC(=O)C=C1', 'C1=CC=CC=CC=C1'])('%s is not aromatic', (smiles) => {
    expect(aromaticRings(mol(smiles)).length).toBe(0);
  });
});
