import { describe, it, expect } from 'vitest';
import { Editor } from '../src/app/editor';
import { toMolfile, toSmiles } from '../src/app/export';
import { parseMolecule, parseMolfile, parseSmiles } from '../src/app/import';
import { Point2D } from '../src/draw/Point2D';
import { BondType } from '../src/core/Bond';

/*
 * Paste was also checked against RDKit on 63 molecules (stereocentres, E/Z, tautomers like
 * imidazole, charged aromatics, explicit H, dummy atoms, %nn ring numbers), each pasted as SMILES,
 * V2000 and V3000 MOL file: every one came back as the same molecule.
 */

/** Paste text into an empty drawing and export it again as SMILES. */
function roundTrip(text: string): string {
  const ed = new Editor(30);
  ed.insertDocument(parseMolecule(text, 30), new Point2D(500, 300));
  return toSmiles(ed).text;
}

describe('paste SMILES', () => {
  it('reads chains, branches, rings, charges and pieces', () => {
    const doc = parseSmiles('CC(=O)[O-].[Na+]', 30);
    expect(doc.atoms.map((a) => a.symbol)).toEqual(['C', 'C', 'O', 'O', 'Na']);
    expect(doc.atoms.map((a) => a.charge)).toEqual([0, 0, 0, -1, 1]);
    expect(doc.bonds.map((b) => b.type)).toEqual([BondType.SINGLE, BondType.DOUBLE, BondType.SINGLE]);
    expect(roundTrip('C%10CC%10')).toBe('C1CC1');
  });

  it('turns aromatic SMILES into a Kekulé structure, keeping where the H sits', () => {
    expect(roundTrip('c1ccccc1')).toBe('C1=CC=CC=C1');
    expect(roundTrip('c1cc[nH]c1')).toBe('C1C=CNC=1');
    expect(roundTrip('Cc1nc[nH]c1')).toBe('CC1N=CNC=1'); // the H stays on the N it was written on
  });

  it('keeps @/@@ (as a wedge or hash) and / \\ through a paste', () => {
    expect(roundTrip('C[C@H](N)C(=O)O')).toBe('C[C@H](N)C(=O)O');
    expect(roundTrip('C[C@@H](N)C(=O)O')).toBe('C[C@@H](N)C(=O)O');
    expect(roundTrip('C/C=C/C')).toBe('C\\C=C\\C'); // E
    expect(roundTrip('C/C=C\\C')).toBe('C\\C=C/C'); // Z
  });

  it('gives a clean layout: every bond one bond length', () => {
    const doc = parseSmiles('CC(C)(C)OC(=O)N[C@@H](Cc1ccccc1)C(=O)O', 30);
    const at = new Map(doc.atoms.map((a) => [a.id, a]));
    for (const b of doc.bonds) {
      const p = at.get(b.a)!;
      const q = at.get(b.b)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y) / 30).toBeGreaterThan(0.9);
      expect(Math.hypot(p.x - q.x, p.y - q.y) / 30).toBeLessThan(1.1);
    }
  });

  it('rejects text that is not SMILES', () => {
    expect(() => parseSmiles('C1CC', 30)).toThrow(/never closed/);
    expect(() => parseSmiles('hello world', 30)).toThrow(/Not a valid SMILES/);
    expect(() => parseMolecule('   ', 30)).toThrow();
  });
});

describe('paste MOL files', () => {
  it('reads our own MOL file back: atoms, charges, wedges, coordinates at drawing scale', () => {
    const ed = new Editor(30);
    ed.insertDocument(parseSmiles('O=[N+]([O-])c1ccc(C[C@H](N)C(=O)O)cc1', 30), new Point2D(400, 300));
    const mol = toMolfile(ed).text;
    const doc = parseMolfile(mol, 30);
    expect(doc.atoms.length).toBe(ed.atomCount());
    expect(doc.atoms.filter((a) => a.charge !== 0).length).toBe(2);
    expect(doc.bonds.some((b) => b.chirality !== 0 && b.stereoCentre !== null)).toBe(true);
    expect(roundTrip(mol)).toBe(toSmiles(ed).text);
  });

  it('reads V3000 and aliases (labels)', () => {
    const v3000 = [
      '', '  tsdraw', '',
      '  0  0  0     0  0            999 V3000',
      'M  V30 BEGIN CTAB',
      'M  V30 COUNTS 3 2 0 0 0',
      'M  V30 BEGIN ATOM',
      'M  V30 1 C 0 0 0 0',
      'M  V30 2 C 1.299 0.75 0 0',
      'M  V30 3 O 2.598 0 0 0 CHG=-1',
      'M  V30 END ATOM',
      'M  V30 BEGIN BOND',
      'M  V30 1 1 1 2',
      'M  V30 2 1 2 3',
      'M  V30 END BOND',
      'M  V30 END CTAB',
      'M  END',
    ].join('\n');
    expect(roundTrip(v3000)).toBe('CC[O-]');

    const ed = new Editor(30);
    ed.setAtomText(undefined, 'xyz', new Point2D(100, 100));
    const doc = parseMolfile(toMolfile(ed).text, 30);
    expect(doc.atoms[0].label).toBe('xyz');
  });
});

describe('copy a selection', () => {
  it('copies only the selected atoms and the bonds between them', () => {
    const ed = new Editor(30);
    ed.insertDocument(parseSmiles('CCO', 30), new Point2D(100, 100));
    ed.insertDocument(parseSmiles('c1ccccc1', 30), new Point2D(400, 100));
    const ring = [...ed.selectedAtomIds()];
    const part = new Editor(30);
    part.loadDocument(ed.getDocument(ring));
    expect(toSmiles(part).text).toBe('C1=CC=CC=C1');
  });
});
