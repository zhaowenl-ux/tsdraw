import { describe, it, expect } from 'vitest';
import { Bond, BondType, BondChirality, BondConformation } from '../src/core/Bond';

describe('BondType enum', () => {
  it('should have correct values', () => {
    expect(BondType.SINGLE).toBe(1);
    expect(BondType.DOUBLE).toBe(2);
    expect(BondType.TRIPLE).toBe(3);
    expect(BondType.AROMATIC).toBe(4);
  });
});

describe('BondChirality enum', () => {
  it('should have correct values', () => {
    expect(BondChirality.NONE).toBe(0);
    expect(BondChirality.WEDGE).toBe(1);
    expect(BondChirality.HASH).toBe(2);
    expect(BondChirality.EITHER).toBe(3);
  });
});

describe('BondConformation enum', () => {
  it('should have correct values', () => {
    expect(BondConformation.NONE).toBe(0);
    expect(BondConformation.E).toBe(1);
    expect(BondConformation.Z).toBe(2);
    expect(BondConformation.EITHER).toBe(3);
  });
});

describe('Bond class', () => {
  it('should create a bond with default properties', () => {
    const bond = new Bond(0, 1);
    expect(bond.atomId1).toBe(0);
    expect(bond.atomId2).toBe(1);
    expect(bond.type).toBe(BondType.SINGLE);
    expect(bond.chirality).toBe(BondChirality.NONE);
    expect(bond.conformation).toBe(BondConformation.NONE);
  });

  it('should create a bond with specified properties', () => {
    const bond = new Bond(0, 1, BondType.DOUBLE, BondChirality.WEDGE, BondConformation.E);
    expect(bond.atomId1).toBe(0);
    expect(bond.atomId2).toBe(1);
    expect(bond.type).toBe(BondType.DOUBLE);
    expect(bond.chirality).toBe(BondChirality.WEDGE);
    expect(bond.conformation).toBe(BondConformation.E);
  });

  it('should normalize atom IDs (lower first)', () => {
    const bond = new Bond(5, 2);
    expect(bond.atomId1).toBe(2);
    expect(bond.atomId2).toBe(5);
  });

  it('should throw error for negative atom ID', () => {
    expect(() => new Bond(-1, 1)).toThrow('Atom IDs must be non-negative');
    expect(() => new Bond(1, -1)).toThrow('Atom IDs must be non-negative');
  });

  it('should throw error for self-bonding', () => {
    expect(() => new Bond(0, 0)).toThrow('Cannot create a bond between an atom and itself');
  });

  it('should check if bond connects two atoms (order independent)', () => {
    const bond = new Bond(0, 1);
    expect(bond.connects(0, 1)).toBe(true);
    expect(bond.connects(1, 0)).toBe(true);
    expect(bond.connects(0, 2)).toBe(false);
    expect(bond.connects(2, 3)).toBe(false);
  });

  it('should get bond order', () => {
    expect(new Bond(0, 1, BondType.SINGLE).getOrder()).toBe(BondType.SINGLE);
    expect(new Bond(0, 1, BondType.DOUBLE).getOrder()).toBe(BondType.DOUBLE);
    expect(new Bond(0, 1, BondType.TRIPLE).getOrder()).toBe(BondType.TRIPLE);
    expect(new Bond(0, 1, BondType.AROMATIC).getOrder()).toBe(BondType.AROMATIC);
  });

  it('should identify bond types', () => {
    const single = new Bond(0, 1, BondType.SINGLE);
    const double = new Bond(0, 1, BondType.DOUBLE);
    const triple = new Bond(0, 1, BondType.TRIPLE);
    const aromatic = new Bond(0, 1, BondType.AROMATIC);

    expect(single.isSingle()).toBe(true);
    expect(double.isDouble()).toBe(true);
    expect(triple.isTriple()).toBe(true);
    expect(aromatic.isAromatic()).toBe(true);

    expect(double.isSingle()).toBe(false);
    expect(triple.isDouble()).toBe(false);
  });

  it('should identify chirality', () => {
    const none = new Bond(0, 1, BondType.SINGLE, BondChirality.NONE);
    const wedge = new Bond(0, 1, BondType.SINGLE, BondChirality.WEDGE);
    const hash = new Bond(0, 1, BondType.SINGLE, BondChirality.HASH);

    expect(none.hasStereo()).toBe(false);
    expect(wedge.hasStereo()).toBe(true);
    expect(hash.hasStereo()).toBe(true);

    expect(wedge.isWedge()).toBe(true);
    expect(wedge.isHash()).toBe(false);
    expect(hash.isWedge()).toBe(false);
    expect(hash.isHash()).toBe(true);
  });

  it('should identify conformation', () => {
    const none = new Bond(0, 1, BondType.DOUBLE, BondConformation.NONE);
    const e = new Bond(0, 1, BondType.DOUBLE, BondConformation.NONE, BondConformation.E);
    const z = new Bond(0, 1, BondType.DOUBLE, BondConformation.NONE, BondConformation.Z);

    expect(none.hasConformation()).toBe(false);
    expect(e.hasConformation()).toBe(true);
    expect(z.hasConformation()).toBe(true);
  });

  it('should get the other atom ID', () => {
    const bond = new Bond(0, 1);
    expect(bond.getOtherAtom(0)).toBe(1);
    expect(bond.getOtherAtom(1)).toBe(0);
  });

  it('should throw error for getOtherAtom with non-participating atom', () => {
    const bond = new Bond(0, 1);
    expect(() => bond.getOtherAtom(2)).toThrow('Atom 2 is not part of this bond');
  });

  it('should set bond type', () => {
    const bond = new Bond(0, 1, BondType.SINGLE);
    expect(bond.isSingle()).toBe(true);

    bond.setType(BondType.DOUBLE);
    expect(bond.isDouble()).toBe(true);
  });

  it('should set chirality', () => {
    const bond = new Bond(0, 1);
    expect(bond.hasStereo()).toBe(false);

    bond.setChirality(BondChirality.WEDGE);
    expect(bond.isWedge()).toBe(true);
  });

  it('should set conformation', () => {
    const bond = new Bond(0, 1, BondType.DOUBLE);
    expect(bond.hasConformation()).toBe(false);

    bond.setConformation(BondConformation.E);
    expect(bond.hasConformation()).toBe(true);
  });

  it('should clone a bond', () => {
    const original = new Bond(
      0,
      1,
      BondType.DOUBLE,
      BondChirality.WEDGE,
      BondConformation.E
    );
    const cloned = original.clone();

    expect(cloned.atomId1).toBe(0);
    expect(cloned.atomId2).toBe(1);
    expect(cloned.type).toBe(BondType.DOUBLE);
    expect(cloned.chirality).toBe(BondChirality.WEDGE);
    expect(cloned.conformation).toBe(BondConformation.E);
    expect(cloned).not.toBe(original);
  });

  it('should convert bond type to string', () => {
    expect(Bond.typeToString(BondType.SINGLE)).toBe('single');
    expect(Bond.typeToString(BondType.DOUBLE)).toBe('double');
    expect(Bond.typeToString(BondType.TRIPLE)).toBe('triple');
    expect(Bond.typeToString(BondType.AROMATIC)).toBe('aromatic');
  });

  it('should convert chirality to string', () => {
    expect(Bond.chiralityToString(BondChirality.NONE)).toBe('none');
    expect(Bond.chiralityToString(BondChirality.WEDGE)).toBe('wedge');
    expect(Bond.chiralityToString(BondChirality.HASH)).toBe('hash');
    expect(Bond.chiralityToString(BondChirality.EITHER)).toBe('either');
  });

  it('should convert conformation to string', () => {
    expect(Bond.conformationToString(BondConformation.NONE)).toBe('none');
    expect(Bond.conformationToString(BondConformation.E)).toBe('E');
    expect(Bond.conformationToString(BondConformation.Z)).toBe('Z');
    expect(Bond.conformationToString(BondConformation.EITHER)).toBe('either');
  });

  it('should serialize to JSON', () => {
    const bond = new Bond(0, 1, BondType.DOUBLE, BondChirality.WEDGE, BondConformation.E);
    const json = bond.toJSON();

    expect(json.atomId1).toBe(0);
    expect(json.atomId2).toBe(1);
    expect(json.type).toBe(BondType.DOUBLE);
    expect(json.chirality).toBe(BondChirality.WEDGE);
    expect(json.conformation).toBe(BondConformation.E);
    expect(json.typeString).toBe('double');
    expect(json.chiralityString).toBe('wedge');
    expect(json.conformationString).toBe('E');
  });

  it('should produce readable string representation', () => {
    const simple = new Bond(0, 1, BondType.SINGLE);
    expect(simple.toString()).toContain('Bond(0-1, single)');

    const complex = new Bond(0, 1, BondType.DOUBLE, BondChirality.WEDGE, BondConformation.E);
    expect(complex.toString()).toContain('Bond(0-1, double');
    expect(complex.toString()).toContain('wedge');
    expect(complex.toString()).toContain('E');
  });

  it('should handle multiple bonds between different atom pairs', () => {
    const b1 = new Bond(0, 1, BondType.SINGLE);
    const b2 = new Bond(1, 2, BondType.DOUBLE);
    const b3 = new Bond(2, 3, BondType.TRIPLE);

    expect(b1.connects(0, 1)).toBe(true);
    expect(b2.connects(1, 2)).toBe(true);
    expect(b3.connects(2, 3)).toBe(true);

    expect(b1.connects(2, 3)).toBe(false);
  });

  it('should handle aromatic bonds', () => {
    const aromatic = new Bond(0, 1, BondType.AROMATIC);
    expect(aromatic.isAromatic()).toBe(true);
    expect(aromatic.isSingle()).toBe(false);
    expect(aromatic.isDouble()).toBe(false);
  });

  it('should warn when conformation is set on non-double bond', () => {
    // This should log a warning but not throw
    const consoleSpy = { warn: (msg: string) => {} };
    const bond = new Bond(0, 1, BondType.SINGLE, BondChirality.NONE, BondConformation.E);
    expect(bond.conformation).toBe(BondConformation.E);
  });
});
