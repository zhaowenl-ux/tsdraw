import { describe, it, expect } from 'vitest';
import { periodicCell, LANTHANIDE_ROW, ACTINIDE_ROW } from '../src/app/periodicLayout';
import { periodicTable } from '../src/core/Element';

describe('periodic table layout', () => {
  it('the element table holds all 118 elements', () => {
    const numbers = periodicTable.getAllElements().map((e) => e.atomicNumber);
    expect(numbers).toEqual(Array.from({ length: 118 }, (_, i) => i + 1));
  });

  it('every element has its own cell', () => {
    const cells = new Set<string>();
    for (let z = 1; z <= 118; z++) {
      const { row, column } = periodicCell(z);
      expect(column).toBeGreaterThanOrEqual(1);
      expect(column).toBeLessThanOrEqual(18);
      cells.add(`${row},${column}`);
    }
    expect(cells.size).toBe(118);
  });

  it('places landmark elements in their groups', () => {
    const at = (z: number) => {
      const c = periodicCell(z);
      return [c.row, c.column];
    };
    expect(at(1)).toEqual([1, 1]); // H
    expect(at(2)).toEqual([1, 18]); // He
    expect(at(6)).toEqual([2, 14]); // C
    expect(at(17)).toEqual([3, 17]); // Cl
    expect(at(21)).toEqual([4, 3]); // Sc
    expect(at(26)).toEqual([4, 8]); // Fe
    expect(at(56)).toEqual([6, 2]); // Ba
    expect(at(57)).toEqual([LANTHANIDE_ROW, 3]); // La
    expect(at(71)).toEqual([LANTHANIDE_ROW, 17]); // Lu
    expect(at(72)).toEqual([6, 4]); // Hf
    expect(at(86)).toEqual([6, 18]); // Rn
    expect(at(89)).toEqual([ACTINIDE_ROW, 3]); // Ac
    expect(at(104)).toEqual([7, 4]); // Rf
    expect(at(118)).toEqual([7, 18]); // Og
  });
});
