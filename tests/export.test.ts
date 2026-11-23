import { describe, it, expect } from 'vitest';
import { Editor, EditorDocument } from '../src/app/editor';
import { toMolfile, toSmiles } from '../src/app/export';
import { Point2D } from '../src/draw/Point2D';

/*
 * Drawings below were made by RDKit (2D coordinates + wedges) from known SMILES. The expected
 * SMILES were checked with RDKit: they read back as the same molecule, stereo included.
 * (The export was also round-tripped on 40 drug-like molecules: morphine, steroids, retinol,
 * tamoxifen, quinine, penicillin G ... with no differences.)
 */
const L_ALANINE: EditorDocument = {"format": "tsdraw-document", "version": 1, "name": "t", "atoms": [{"id": 1, "symbol": "C", "charge": 0, "x": 330.0, "y": 274.01923788646684}, {"id": 2, "symbol": "C", "charge": 0, "x": 315.0, "y": 300.0}, {"id": 3, "symbol": "N", "charge": 0, "x": 330.00000000000006, "y": 325.98076211353316}, {"id": 4, "symbol": "C", "charge": 0, "x": 285.0, "y": 300.0}, {"id": 5, "symbol": "O", "charge": 0, "x": 269.99999999999994, "y": 274.01923788646684}, {"id": 6, "symbol": "O", "charge": 0, "x": 270.0, "y": 325.98076211353316}], "bonds": [{"a": 2, "b": 1, "type": 1, "chirality": 2, "stereoCentre": 2}, {"a": 2, "b": 3, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 2, "b": 4, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 4, "b": 5, "type": 2, "chirality": 0, "stereoCentre": null}, {"a": 4, "b": 6, "type": 1, "chirality": 0, "stereoCentre": null}]};
const D_ALANINE: EditorDocument = {"format": "tsdraw-document", "version": 1, "name": "t", "atoms": [{"id": 1, "symbol": "C", "charge": 0, "x": 330.0, "y": 274.01923788646684}, {"id": 2, "symbol": "C", "charge": 0, "x": 315.0, "y": 300.0}, {"id": 3, "symbol": "N", "charge": 0, "x": 330.00000000000006, "y": 325.98076211353316}, {"id": 4, "symbol": "C", "charge": 0, "x": 285.0, "y": 300.0}, {"id": 5, "symbol": "O", "charge": 0, "x": 269.99999999999994, "y": 274.01923788646684}, {"id": 6, "symbol": "O", "charge": 0, "x": 270.0, "y": 325.98076211353316}], "bonds": [{"a": 2, "b": 1, "type": 1, "chirality": 1, "stereoCentre": 2}, {"a": 2, "b": 3, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 2, "b": 4, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 4, "b": 5, "type": 2, "chirality": 0, "stereoCentre": null}, {"a": 4, "b": 6, "type": 1, "chirality": 0, "stereoCentre": null}]};
const E_BUTENE: EditorDocument = {"format": "tsdraw-document", "version": 1, "name": "t", "atoms": [{"id": 1, "symbol": "C", "charge": 0, "x": 260.40773874932466, "y": 302.72999066999716}, {"id": 2, "symbol": "C", "charge": 0, "x": 288.012427850575, "y": 290.9834533238977}, {"id": 3, "symbol": "C", "charge": 0, "x": 311.987572149425, "y": 309.0165466761023}, {"id": 4, "symbol": "C", "charge": 0, "x": 339.59226125067534, "y": 297.27000933000284}], "bonds": [{"a": 1, "b": 2, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 2, "b": 3, "type": 2, "chirality": 0, "stereoCentre": null}, {"a": 3, "b": 4, "type": 1, "chirality": 0, "stereoCentre": null}]};
const Z_BUTENE: EditorDocument = {"format": "tsdraw-document", "version": 1, "name": "t", "atoms": [{"id": 1, "symbol": "C", "charge": 0, "x": 270.0, "y": 312.9903810567666}, {"id": 2, "symbol": "C", "charge": 0, "x": 285.0, "y": 287.0096189432334}, {"id": 3, "symbol": "C", "charge": 0, "x": 315.0, "y": 287.0096189432334}, {"id": 4, "symbol": "C", "charge": 0, "x": 330.0, "y": 312.9903810567666}], "bonds": [{"a": 1, "b": 2, "type": 1, "chirality": 0, "stereoCentre": null}, {"a": 2, "b": 3, "type": 2, "chirality": 0, "stereoCentre": null}, {"a": 3, "b": 4, "type": 1, "chirality": 0, "stereoCentre": null}]};
const PYRIDINE: EditorDocument = {"format": "tsdraw-document", "version": 1, "name": "t", "atoms": [{"id": 1, "symbol": "C", "charge": 0, "x": 330.0, "y": 300.0}, {"id": 2, "symbol": "C", "charge": 0, "x": 315.0, "y": 274.01923788646684}, {"id": 3, "symbol": "C", "charge": 0, "x": 285.0, "y": 274.01923788646684}, {"id": 4, "symbol": "N", "charge": 0, "x": 270.0, "y": 300.0}, {"id": 5, "symbol": "C", "charge": 0, "x": 285.0, "y": 325.98076211353316}, {"id": 6, "symbol": "C", "charge": 0, "x": 315.0, "y": 325.98076211353316}], "bonds": [{"a": 1, "b": 2, "type": 4, "chirality": 0, "stereoCentre": null}, {"a": 2, "b": 3, "type": 4, "chirality": 0, "stereoCentre": null}, {"a": 3, "b": 4, "type": 4, "chirality": 0, "stereoCentre": null}, {"a": 4, "b": 5, "type": 4, "chirality": 0, "stereoCentre": null}, {"a": 5, "b": 6, "type": 4, "chirality": 0, "stereoCentre": null}, {"a": 6, "b": 1, "type": 4, "chirality": 0, "stereoCentre": null}]};

function load(doc: EditorDocument): Editor {
  const ed = new Editor(30);
  ed.loadDocument(doc);
  return ed;
}

describe('SMILES export', () => {
  it('writes simple molecules, Kekulé rings and charges', () => {
    expect(toSmiles(load(PYRIDINE)).text).toBe('C1=CC=NC=C1');
    const ed = new Editor(30);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, new Point2D(300, 300));
    const top = ed.hitAtom(new Point2D(300, 270))!;
    ed.applyTool({ kind: 'bond', type: 1 }, ed.getPosition(top)!);
    ed.cancelChain();
    const end = [...ed.atomIds()].find((a) => ed.getMolecule().getBondsForAtom(a).length === 1)!;
    ed.setAtomText(end, 'NO2'); // a label is expanded on export
    expect(toSmiles(ed).text).toBe('O=[N+]([O-])C1=CC=CC=C1');
  });

  it('keeps R/S from wedges: L- and D-alanine', () => {
    expect(toSmiles(load(L_ALANINE)).text).toBe('C[C@H](N)C(=O)O');
    expect(toSmiles(load(D_ALANINE)).text).toBe('C[C@@H](N)C(=O)O');
  });

  it('keeps E/Z from the drawing', () => {
    expect(toSmiles(load(E_BUTENE)).text).toBe('C\\C=C\\C'); // same as C/C=C/C
    expect(toSmiles(load(Z_BUTENE)).text).toBe('C\\C=C/C'); // same as C/C=C\\C
  });

  it('writes pieces separated by dots, and unknown labels as *', () => {
    const ed = new Editor(30);
    ed.setAtomText(undefined, 'OMe', new Point2D(100, 100));
    ed.setAtomText(undefined, 'xyz', new Point2D(300, 100));
    const result = toSmiles(ed);
    expect(result.text).toBe('OC.*');
    expect(result.unknown).toEqual(['xyz']);
  });
});

describe('MOL file export', () => {
  it('writes a V2000 MOL file: counts, atoms, Kekulé bonds, wedges from the stereocentre, charges', () => {
    const mol = toMolfile(load(L_ALANINE)).text.split('\n');
    expect(mol[3]).toMatch(/^  6  5  0  0  0  0  0  0  0  0999 V2000$/);
    const atoms = mol.slice(4, 10).map((l) => l.slice(31, 34).trim());
    expect(atoms).toEqual(['C', 'C', 'N', 'C', 'O', 'O']);
    const bonds = mol.slice(10, 15);
    // The wedge/hash bond starts at the stereocentre (atom 2).
    expect(bonds.some((l) => /^  2  \d  1  [16]/.test(l))).toBe(true);
    expect(mol[15]).toBe('M  END');

    const nitro = new Editor(30);
    nitro.setAtomText(undefined, 'NO2', new Point2D(100, 100));
    const text = toMolfile(nitro).text;
    expect(text).toMatch(/M  CHG  2   1   1   3  -1/);
  });

  it('keeps unknown labels as * atoms with their text as an alias', () => {
    const ed = new Editor(30);
    ed.setAtomText(undefined, 'xyz', new Point2D(100, 100));
    const text = toMolfile(ed).text;
    expect(text).toContain(' *   0');
    expect(text).toContain('A    1\nxyz\n');
  });
});
