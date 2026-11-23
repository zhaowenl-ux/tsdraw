import { describe, it, expect, beforeEach } from 'vitest';
import { Molecule } from '../src/core/Molecule';
import { Atom } from '../src/core/Atom';
import { Bond, BondType, BondChirality, BondConformation } from '../src/core/Bond';
import { PeriodicTable } from '../src/core/Element';
import { Vector3D } from '../src/core/Vector3D';

describe('Molecule', () => {
  let molecule: Molecule;
  const pt = PeriodicTable.getInstance();

  beforeEach(() => {
    molecule = new Molecule('Test Molecule', 'A test molecule');
  });

  describe('Constructor and Properties', () => {
    it('should create a molecule with name and description', () => {
      expect(molecule.name).toBe('Test Molecule');
      expect(molecule.description).toBe('A test molecule');
    });

    it('should create an empty molecule with default values', () => {
      const emptyMol = new Molecule();
      expect(emptyMol.name).toBe('');
      expect(emptyMol.description).toBe('');
      expect(emptyMol.getAtomCount()).toBe(0);
      expect(emptyMol.getBondCount()).toBe(0);
    });
  });

  describe('Adding and Removing Atoms', () => {
    it('should add an atom with auto-increment ID', () => {
      const atom1 = molecule.addAtom(pt.getBySymbol('C'));
      const atom2 = molecule.addAtom(pt.getBySymbol('H'));

      expect(atom1.id).toBe(0);
      expect(atom2.id).toBe(1);
      expect(molecule.getAtomCount()).toBe(2);
    });

    it('should add an atom with specified ID', () => {
      const atom = molecule.addAtom(pt.getBySymbol('C'), new Vector3D(1, 2, 3), 0, 5);
      expect(atom.id).toBe(5);
      expect(molecule.getAtom(5)).toBe(atom);
    });

    it('should add an atom with position and charge', () => {
      const pos = new Vector3D(1.5, 2.5, 3.5);
      const atom = molecule.addAtom(pt.getBySymbol('N'), pos, 1);

      expect(atom.charge).toBe(1);
      expect(atom.position.x).toBe(1.5);
      expect(atom.position.y).toBe(2.5);
      expect(atom.position.z).toBe(3.5);
    });

    it('should throw error when adding atom with duplicate ID', () => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(), 0, 5);
      expect(() => {
        molecule.addAtom(pt.getBySymbol('H'), new Vector3D(), 0, 5);
      }).toThrow('Atom with ID 5 already exists in this molecule');
    });

    it('should remove an atom', () => {
      const atom = molecule.addAtom(pt.getBySymbol('C'));
      expect(molecule.getAtomCount()).toBe(1);
      expect(molecule.removeAtom(atom.id)).toBe(true);
      expect(molecule.getAtomCount()).toBe(0);
    });

    it('should return false when removing non-existent atom', () => {
      expect(molecule.removeAtom(999)).toBe(false);
    });

    it('should remove bonds when removing an atom', () => {
      const atom1 = molecule.addAtom(pt.getBySymbol('C'));
      const atom2 = molecule.addAtom(pt.getBySymbol('H'));
      const bond = new Bond(atom1.id, atom2.id);
      molecule.addBond(bond);

      expect(molecule.getBondCount()).toBe(1);
      molecule.removeAtom(atom1.id);
      expect(molecule.getBondCount()).toBe(0);
    });
  });

  describe('Querying Atoms', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addAtom(pt.getBySymbol('O'), new Vector3D(0, 1, 0), 0, 2);
    });

    it('should get an atom by ID', () => {
      const atom = molecule.getAtom(1);
      expect(atom).toBeDefined();
      expect(atom?.getSymbol()).toBe('H');
    });

    it('should return undefined for non-existent atom', () => {
      expect(molecule.getAtom(999)).toBeUndefined();
    });

    it('should check if atom exists', () => {
      expect(molecule.hasAtom(0)).toBe(true);
      expect(molecule.hasAtom(999)).toBe(false);
    });

    it('should get all atoms', () => {
      const atoms = molecule.getAtoms();
      expect(atoms).toHaveLength(3);
      expect(atoms.map(a => a.getSymbol())).toEqual(['C', 'H', 'O']);
    });

    it('should get atom count', () => {
      expect(molecule.getAtomCount()).toBe(3);
    });
  });

  describe('Adding and Removing Bonds', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(-1, 0, 0), 0, 2);
    });

    it('should add a bond between two atoms', () => {
      const bond = new Bond(0, 1, BondType.SINGLE);
      const addedBond = molecule.addBond(bond);

      expect(molecule.getBondCount()).toBe(1);
      expect(addedBond).toBe(bond);
    });

    it('should create and add a bond in one step', () => {
      const bond = molecule.addBondBetween(0, 1, BondType.DOUBLE);
      expect(bond.getOrder()).toBe(BondType.DOUBLE);
      expect(molecule.getBondCount()).toBe(1);
    });

    it('should throw error when adding bond with non-existent atom', () => {
      const bond = new Bond(0, 999);
      expect(() => molecule.addBond(bond)).toThrow(
        'Cannot create bond - one or both atoms do not exist in this molecule'
      );
    });

    it('should throw error when adding duplicate bond', () => {
      const bond1 = new Bond(0, 1);
      molecule.addBond(bond1);

      const bond2 = new Bond(0, 1);
      expect(() => molecule.addBond(bond2)).toThrow(
        'Bond between atoms 0 and 1 already exists'
      );
    });

    it('should remove a bond', () => {
      molecule.addBondBetween(0, 1);
      expect(molecule.getBondCount()).toBe(1);
      expect(molecule.removeBond(0, 1)).toBe(true);
      expect(molecule.getBondCount()).toBe(0);
    });

    it('should return false when removing non-existent bond', () => {
      expect(molecule.removeBond(0, 1)).toBe(false);
    });
  });

  describe('Querying Bonds', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(0, 1, 0), 0, 2);
      molecule.addBondBetween(0, 1, BondType.SINGLE);
      molecule.addBondBetween(0, 2, BondType.SINGLE);
    });

    it('should get a bond between two atoms', () => {
      const bond = molecule.getBond(0, 1);
      expect(bond).toBeDefined();
      expect(bond?.connects(0, 1)).toBe(true);
    });

    it('should find bond regardless of atom order', () => {
      const bond1 = molecule.getBond(0, 1);
      const bond2 = molecule.getBond(1, 0);
      expect(bond1).toBe(bond2);
    });

    it('should get all bonds', () => {
      const bonds = molecule.getBonds();
      expect(bonds).toHaveLength(2);
    });

    it('should get bonds for an atom', () => {
      const bonds = molecule.getBondsForAtom(0);
      expect(bonds).toHaveLength(2);
      expect(bonds.every(b => b.atomId1 === 0 || b.atomId2 === 0)).toBe(true);
    });

    it('should get bond count', () => {
      expect(molecule.getBondCount()).toBe(2);
    });
  });

  describe('Connected Atoms', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(-1, 0, 0), 0, 2);
      molecule.addAtom(pt.getBySymbol('O'), new Vector3D(0, 1, 0), 0, 3);
      molecule.addBondBetween(0, 1);
      molecule.addBondBetween(0, 2);
      molecule.addBondBetween(0, 3);
    });

    it('should get atoms connected to a given atom', () => {
      const connected = molecule.getConnectedAtoms(0);
      expect(connected).toHaveLength(3);
      expect(connected.map(a => a.getSymbol()).sort()).toEqual(['H', 'H', 'O']);
    });

    it('should throw error for non-existent atom', () => {
      expect(() => molecule.getConnectedAtoms(999)).toThrow('Atom 999 not found');
    });
  });

  describe('Molecular Properties', () => {
    it('should calculate molecular formula for ethane (C2H6)', () => {
      const ethane = new Molecule('Ethane', '');
      ethane.addAtom(pt.getBySymbol('C'));
      ethane.addAtom(pt.getBySymbol('C'));
      ethane.addAtom(pt.getBySymbol('H'));
      ethane.addAtom(pt.getBySymbol('H'));
      ethane.addAtom(pt.getBySymbol('H'));
      ethane.addAtom(pt.getBySymbol('H'));
      ethane.addAtom(pt.getBySymbol('H'));
      ethane.addAtom(pt.getBySymbol('H'));

      expect(ethane.getFormula()).toBe('C2H6');
    });

    it('should calculate molecular formula for water (H2O)', () => {
      const water = new Molecule('Water', '');
      water.addAtom(pt.getBySymbol('O'));
      water.addAtom(pt.getBySymbol('H'));
      water.addAtom(pt.getBySymbol('H'));

      expect(water.getFormula()).toBe('H2O');
    });

    it('should calculate molecular weight for ethane', () => {
      const ethane = new Molecule('Ethane', '');
      ethane.addAtom(pt.getBySymbol('C'));
      ethane.addAtom(pt.getBySymbol('C'));
      for (let i = 0; i < 6; i++) {
        ethane.addAtom(pt.getBySymbol('H'));
      }

      const weight = ethane.getMolecularWeight();
      // C: 12.01 * 2 = 24.02, H: 1.008 * 6 = 6.048, Total ≈ 30.07
      expect(weight).toBeCloseTo(30.07, 1);
    });

    it('should calculate total charge', () => {
      const mol = new Molecule('Charged', '');
      mol.addAtom(pt.getBySymbol('N'), new Vector3D(), 1); // +1
      mol.addAtom(pt.getBySymbol('O'), new Vector3D(), -1); // -1
      mol.addAtom(pt.getBySymbol('C'), new Vector3D(), 0); // 0

      expect(mol.getTotalCharge()).toBe(0);
    });
  });

  describe('Cloning', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addBondBetween(0, 1);
    });

    it('should clone a molecule with same name', () => {
      const cloned = molecule.clone();
      expect(cloned.name).toBe('Test Molecule');
      expect(cloned.getAtomCount()).toBe(2);
      expect(cloned.getBondCount()).toBe(1);
    });

    it('should clone with new name and description', () => {
      const cloned = molecule.clone('Cloned', 'A cloned molecule');
      expect(cloned.name).toBe('Cloned');
      expect(cloned.description).toBe('A cloned molecule');
    });

    it('should create independent copy', () => {
      const cloned = molecule.clone();
      cloned.addAtom(pt.getBySymbol('O'));

      expect(molecule.getAtomCount()).toBe(2);
      expect(cloned.getAtomCount()).toBe(3);
    });

    it('should clone all atom properties', () => {
      const original = molecule.getAtom(0)!;
      const cloned = molecule.clone();
      const clonedAtom = cloned.getAtom(0)!;

      expect(clonedAtom.getSymbol()).toBe(original.getSymbol());
      expect(clonedAtom.charge).toBe(original.charge);
      expect(clonedAtom.position.x).toBe(original.position.x);
    });

    it('should clone all bonds correctly', () => {
      const cloned = molecule.clone();
      const originalBond = molecule.getBond(0, 1)!;
      const clonedBond = cloned.getBond(0, 1)!;

      expect(clonedBond.type).toBe(originalBond.type);
      expect(clonedBond.chirality).toBe(originalBond.chirality);
    });
  });

  describe('Serialization', () => {
    beforeEach(() => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 1, 1);
      molecule.addBondBetween(0, 1, BondType.DOUBLE);
    });

    it('should convert to JSON', () => {
      const json = molecule.toJSON();

      expect(json.name).toBe('Test Molecule');
      expect(json.description).toBe('A test molecule');
      expect(json.formula).toBe('CH');
      expect(json.atoms).toHaveLength(2);
      expect(json.bonds).toHaveLength(1);
      expect(json.totalCharge).toBe(1);
    });

    it('should include molecular weight in JSON', () => {
      const json = molecule.toJSON();
      expect(json.molecularWeight).toBeGreaterThan(0);
      expect(json.molecularWeight).toBeCloseTo(13.02, 1); // C: 12.01 + H: 1.008 ≈ 13.02
    });
  });

  describe('String Representation', () => {
    it('should convert to string with name', () => {
      const str = molecule.toString();
      expect(str).toContain('Test Molecule');
    });

    it('should include formula in string', () => {
      molecule.addAtom(pt.getBySymbol('C'));
      molecule.addAtom(pt.getBySymbol('H'));
      molecule.addAtom(pt.getBySymbol('H'));

      const str = molecule.toString();
      expect(str).toContain('CH2');
    });

    it('should include atom and bond counts', () => {
      molecule.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 0, 0);
      molecule.addAtom(pt.getBySymbol('H'), new Vector3D(1, 0, 0), 0, 1);
      molecule.addBondBetween(0, 1);

      const str = molecule.toString();
      expect(str).toContain('2 atoms');
      expect(str).toContain('1 bonds');
    });
  });

  describe('Complex Molecules', () => {
    it('should handle methane (CH4)', () => {
      const methane = new Molecule('Methane', 'CH4');
      const c = methane.addAtom(pt.getBySymbol('C'));
      const h1 = methane.addAtom(pt.getBySymbol('H'));
      const h2 = methane.addAtom(pt.getBySymbol('H'));
      const h3 = methane.addAtom(pt.getBySymbol('H'));
      const h4 = methane.addAtom(pt.getBySymbol('H'));

      methane.addBondBetween(c.id, h1.id);
      methane.addBondBetween(c.id, h2.id);
      methane.addBondBetween(c.id, h3.id);
      methane.addBondBetween(c.id, h4.id);

      expect(methane.getFormula()).toBe('CH4');
      expect(methane.getAtomCount()).toBe(5);
      expect(methane.getBondCount()).toBe(4);
      expect(methane.getConnectedAtoms(c.id)).toHaveLength(4);
    });

    it('should handle ethene (C2H4) with double bond', () => {
      const ethene = new Molecule('Ethene', 'C2H4');
      const c1 = ethene.addAtom(pt.getBySymbol('C'));
      const c2 = ethene.addAtom(pt.getBySymbol('C'));
      const h1 = ethene.addAtom(pt.getBySymbol('H'));
      const h2 = ethene.addAtom(pt.getBySymbol('H'));
      const h3 = ethene.addAtom(pt.getBySymbol('H'));
      const h4 = ethene.addAtom(pt.getBySymbol('H'));

      ethene.addBondBetween(c1.id, c2.id, BondType.DOUBLE);
      ethene.addBondBetween(c1.id, h1.id);
      ethene.addBondBetween(c1.id, h2.id);
      ethene.addBondBetween(c2.id, h3.id);
      ethene.addBondBetween(c2.id, h4.id);

      expect(ethene.getFormula()).toBe('C2H4');
      expect(ethene.getBondCount()).toBe(5);
      const c1Bonds = ethene.getBondsForAtom(c1.id);
      expect(c1Bonds.some(b => b.isDouble())).toBe(true);
    });
  });
});
