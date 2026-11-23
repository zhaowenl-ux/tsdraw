import { describe, it, expect } from 'vitest';
import { Editor } from '../src/app/editor';
import { labelAnchorElement, labelAtomCounts, reverseLabel } from '../src/app/labels';
import { Point2D } from '../src/draw/Point2D';
import { BondType } from '../src/core/Bond';

const P = (x: number, y: number) => new Point2D(x, y);
const counts = (label: string) => Object.fromEntries(labelAtomCounts(label) ?? []);

describe('atom text labels', () => {
  it('counts atoms in common groups', () => {
    expect(counts('NO2')).toEqual({ N: 1, O: 2 });
    expect(counts('COOH')).toEqual({ C: 1, O: 2, H: 1 });
    expect(counts('CF3')).toEqual({ C: 1, F: 3 });
    expect(counts('OMe')).toEqual({ O: 1, C: 1, H: 3 });
    expect(counts('C(CH3)3')).toEqual({ C: 4, H: 9 });
    expect(counts('SO2NH2')).toEqual({ S: 1, O: 2, N: 1, H: 2 });
    expect(labelAtomCounts('hello world')).toBeNull();
  });

  it('picks the bonding element and reverses for left-hand groups', () => {
    expect(labelAnchorElement('NO2')).toBe('N');
    expect(labelAnchorElement('COOH')).toBe('C');
    expect(labelAnchorElement('OMe')).toBe('O');
    expect(labelAnchorElement('Ph')).toBe('C');
    expect(reverseLabel('NO2')).toBe('O2N');
    expect(reverseLabel('COOH')).toBe('HOOC');
    expect(reverseLabel('CF3')).toBe('F3C');
    expect(reverseLabel('CO2Et')).toBe('EtO2C');
  });

  it('writes text on an atom, counts it in the formula, and survives undo and save', () => {
    const ed = new Editor(30);
    ed.applyTool({ kind: 'bond', type: BondType.SINGLE }, P(100, 100));
    ed.cancelChain();
    expect(ed.atomCount()).toBe(2);
    const start = ed.hitAtom(P(100, 100))!;
    const end = [...ed.atomIds()].find((id) => id !== start)!;
    // C-C becomes C-NO2: nitromethane.
    expect(ed.setAtomText(end, 'NO2')).toBe(end);
    expect(ed.getLabel(end)).toBe('NO2');
    expect(ed.getMolecule().getAtom(end)!.element.symbol).toBe('N');
    expect(ed.formula()).toBe('CH3NO2');

    const doc = ed.getDocument();
    expect(doc.atoms.find((a) => a.id === end)!.label).toBe('NO2');

    ed.undo();
    expect(ed.getLabel(end)).toBeUndefined();
    ed.redo();
    expect(ed.getLabel(end)).toBe('NO2');

    const copy = new Editor(30);
    copy.loadDocument(JSON.parse(JSON.stringify(doc)));
    expect(copy.getLabel(end)).toBe('NO2');
  });

  it('plain element symbols change the element; empty text clears the label', () => {
    const ed = new Editor(30);
    const id = ed.setAtomText(undefined, 'COOH', P(50, 50))!;
    expect(ed.getLabel(id)).toBe('COOH');
    expect(ed.formula()).toBe('CHO2');
    ed.setAtomText(id, 'Br');
    expect(ed.getLabel(id)).toBeUndefined();
    expect(ed.getMolecule().getAtom(id)!.element.symbol).toBe('Br');
    ed.setAtomText(id, 'CF3');
    ed.setAtomText(id, '');
    expect(ed.getLabel(id)).toBeUndefined();
  });

  it('an element tool click replaces the label', () => {
    const ed = new Editor(30);
    const id = ed.setAtomText(undefined, 'NO2', P(50, 50))!;
    ed.applyTool({ kind: 'atom', symbol: 'O' }, P(50, 50));
    expect(ed.getLabel(id)).toBeUndefined();
    expect(ed.getMolecule().getAtom(id)!.element.symbol).toBe('O');
  });
});
