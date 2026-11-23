import { describe, it, expect } from 'vitest';
import { Atom } from '../src/core/Atom';
import { Vector3D } from '../src/core/Vector3D';
import { periodicTable } from '../src/core/Element';

describe('Atom', () => {
  it('should create an atom with valid properties', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const pos = new Vector3D(1, 2, 3);
    const atom = new Atom(0, carbon, pos, 0);

    expect(atom.id).toBe(0);
    expect(atom.element).toBe(carbon);
    expect(atom.charge).toBe(0);
    expect(atom.position).toBe(pos);
  });

  it('should create atom with default position and charge', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(1, carbon);

    expect(atom.id).toBe(1);
    expect(atom.position.x).toBe(0);
    expect(atom.position.y).toBe(0);
    expect(atom.position.z).toBe(0);
    expect(atom.charge).toBe(0);
  });

  it('should throw error for negative atom ID', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    expect(() => new Atom(-1, carbon)).toThrow('Atom ID must be non-negative');
  });

  it('should get atomic number', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    expect(atom.getAtomicNumber()).toBe(6);
  });

  it('should get element symbol', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    expect(atom.getSymbol()).toBe('C');
  });

  it('should get element name', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    expect(atom.getName()).toBe('Carbon');
  });

  it('should get default valence', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    expect(atom.getDefaultValence()).toBe(4);
  });

  it('should set charge', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    atom.setCharge(1);
    expect(atom.charge).toBe(1);
  });

  it('should set position from xyz', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    atom.setPosition(5, 6, 7);
    expect(atom.position.x).toBe(5);
    expect(atom.position.y).toBe(6);
    expect(atom.position.z).toBe(7);
  });

  it('should set position from Vector3D', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon);
    const pos = new Vector3D(10, 20, 30);
    atom.setPositionVector(pos);
    expect(atom.position.x).toBe(10);
    expect(atom.position.y).toBe(20);
    expect(atom.position.z).toBe(30);
  });

  it('should get position as cloned Vector3D', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const pos = new Vector3D(1, 2, 3);
    const atom = new Atom(0, carbon, pos);
    const retrieved = atom.getPosition();
    expect(retrieved.equals(pos)).toBe(true);
    expect(retrieved).not.toBe(pos);
  });

  it('should calculate distance to another atom', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom1 = new Atom(0, carbon, new Vector3D(0, 0, 0));
    const atom2 = new Atom(1, carbon, new Vector3D(3, 4, 0));
    expect(atom1.distanceTo(atom2)).toBe(5);
  });

  it('should clone an atom with same ID', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const original = new Atom(5, carbon, new Vector3D(1, 2, 3), 1);
    const cloned = original.clone();

    expect(cloned.id).toBe(5);
    expect(cloned.element).toBe(carbon);
    expect(cloned.charge).toBe(1);
    expect(cloned.position.equals(original.position)).toBe(true);
    expect(cloned).not.toBe(original);
  });

  it('should clone an atom with new ID', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const original = new Atom(5, carbon, new Vector3D(1, 2, 3), 1);
    const cloned = original.clone(10);

    expect(cloned.id).toBe(10);
    expect(cloned.charge).toBe(1);
    expect(cloned.position.equals(original.position)).toBe(true);
  });

  it('should serialize to JSON', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(3, carbon, new Vector3D(1, 2, 3), 1);
    const json = atom.toJSON();

    expect(json.id).toBe(3);
    expect(json.atomicNumber).toBe(6);
    expect(json.symbol).toBe('C');
    expect(json.charge).toBe(1);
    expect(json.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should produce readable string representation', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const atom = new Atom(0, carbon, new Vector3D(1, 2, 3), 1);
    const str = atom.toString();

    expect(str).toContain('Atom');
    expect(str).toContain('id=0');
    expect(str).toContain('C');
    expect(str).toContain('+1');
  });

  it('should handle multiple atoms with different elements', () => {
    const carbon = periodicTable.getBySymbol('C')!;
    const nitrogen = periodicTable.getBySymbol('N')!;
    const oxygen = periodicTable.getBySymbol('O')!;

    const c = new Atom(0, carbon);
    const n = new Atom(1, nitrogen);
    const o = new Atom(2, oxygen);

    expect(c.getAtomicNumber()).toBe(6);
    expect(n.getAtomicNumber()).toBe(7);
    expect(o.getAtomicNumber()).toBe(8);
  });
});
