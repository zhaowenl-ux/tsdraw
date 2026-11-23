import { describe, it, expect } from 'vitest';
import { Element, PeriodicTable, periodicTable } from '../src/core/Element';

describe('Element class', () => {
  it('should create an element with correct properties', () => {
    const carbon = new Element(6, 'C', 'Carbon', 12.011, [4], [-4, -3, -2, -1, 0, 1, 2, 3, 4]);

    expect(carbon.atomicNumber).toBe(6);
    expect(carbon.symbol).toBe('C');
    expect(carbon.name).toBe('Carbon');
    expect(carbon.atomicWeight).toBe(12.011);
  });

  it('should get default valence', () => {
    const carbon = new Element(6, 'C', 'Carbon', 12.011, [4, 2], [-4, 0]);
    expect(carbon.getDefaultValence()).toBe(4);
  });

  it('should validate valence', () => {
    const carbon = new Element(6, 'C', 'Carbon', 12.011, [4, 2], [-4, 0]);
    expect(carbon.isValidValence(4)).toBe(true);
    expect(carbon.isValidValence(2)).toBe(true);
    expect(carbon.isValidValence(3)).toBe(false);
  });

  it('should validate charge', () => {
    const carbon = new Element(6, 'C', 'Carbon', 12.011, [4], [-4, 0, 4]);
    expect(carbon.isValidCharge(0)).toBe(true);
    expect(carbon.isValidCharge(-4)).toBe(true);
    expect(carbon.isValidCharge(4)).toBe(true);
    expect(carbon.isValidCharge(2)).toBe(false);
  });
});

describe('PeriodicTable', () => {
  it('should return singleton instance', () => {
    const table1 = PeriodicTable.getInstance();
    const table2 = PeriodicTable.getInstance();
    expect(table1).toBe(table2);
  });

  it('should get element by atomic number', () => {
    const carbon = periodicTable.getByNumber(6);
    expect(carbon).toBeDefined();
    expect(carbon?.symbol).toBe('C');
    expect(carbon?.name).toBe('Carbon');
  });

  it('should get element by symbol (case-insensitive)', () => {
    const carbon1 = periodicTable.getBySymbol('C');
    const carbon2 = periodicTable.getBySymbol('c');
    const carbon3 = periodicTable.getBySymbol('CARBON');

    expect(carbon1).toBeDefined();
    expect(carbon1?.atomicNumber).toBe(6);
    expect(carbon2?.atomicNumber).toBe(6);
    expect(carbon3).toBeUndefined(); // Only symbol works, not full name
  });

  it('should return all elements in order', () => {
    const allElements = periodicTable.getAllElements();
    expect(allElements.length).toBeGreaterThan(0);

    for (let i = 1; i < allElements.length; i++) {
      expect(allElements[i].atomicNumber).toBeGreaterThan(allElements[i - 1].atomicNumber);
    }
  });

  it('should get all element symbols', () => {
    const symbols = periodicTable.getAllSymbols();
    expect(symbols).toContain('C');
    expect(symbols).toContain('N');
    expect(symbols).toContain('O');
    expect(symbols).toContain('H');
  });

  it('should check if symbol exists', () => {
    expect(periodicTable.hasSymbol('C')).toBe(true);
    expect(periodicTable.hasSymbol('c')).toBe(true);
    expect(periodicTable.hasSymbol('Xyz')).toBe(false);
  });
});

describe('multi-letter symbol lookup (regression)', () => {
  it('finds two-letter symbols regardless of case', () => {
    expect(periodicTable.getBySymbol('Cl')?.name).toBe('Chlorine');
    expect(periodicTable.getBySymbol('CL')?.name).toBe('Chlorine');
    expect(periodicTable.getBySymbol('br')?.symbol).toBe('Br');
    expect(periodicTable.hasSymbol('Cl')).toBe(true);
  });

  it('getAllSymbols returns the proper-case symbols', () => {
    const symbols = periodicTable.getAllSymbols();
    expect(symbols).toContain('Cl');
    expect(symbols).toContain('C');
  });
});
