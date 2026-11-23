import { describe, it, expect, beforeEach } from 'vitest';
import { MoleculeComponent, MoleculeRole } from '../src/core/MoleculeComponent';
import { Molecule } from '../src/core/Molecule';
import { PeriodicTable } from '../src/core/Element';
import { Vector3D } from '../src/core/Vector3D';
import { BondType } from '../src/core/Bond';

describe('MoleculeComponent', () => {
  const pt = PeriodicTable.getInstance();

  // Create water molecule (H2O) - shared across tests
  const createWater = (): Molecule => {
    const mol = new Molecule('Water', 'H2O');
    mol.addAtom(pt.getBySymbol('H'), new Vector3D(0.96, 0, 0));
    mol.addAtom(pt.getBySymbol('O'), new Vector3D(0, 0, 0));
    mol.addAtom(pt.getBySymbol('H'), new Vector3D(-0.24, 0.93, 0));
    return mol;
  };

  // Create NaCl-like molecule for testing (simplified as Cl)
  const createChloride = (): Molecule => {
    const mol = new Molecule('Chloride', 'Cl');
    mol.addAtom(pt.getByNumber(17)!, new Vector3D(0, 0, 0), -1); // Cl atomic number 17
    return mol;
  };

  let waterMolecule: Molecule;
  let nacl: Molecule;

  beforeEach(() => {
    waterMolecule = createWater();
    nacl = createChloride();
  });

  describe('Constructor and Properties', () => {
    it('should create a component with default values', () => {
      const component = new MoleculeComponent(waterMolecule);
      expect(component.getStoichiometry()).toBe(1);
      expect(component.getRole()).toBe(MoleculeRole.UNSPECIFIED);
      expect(component.getMolecule()).toBe(waterMolecule);
    });

    it('should create a component with specified role and stoichiometry', () => {
      const component = new MoleculeComponent(
        waterMolecule,
        2,
        MoleculeRole.HYDRATE,
        'Dihydrate form'
      );
      expect(component.getStoichiometry()).toBe(2);
      expect(component.getRole()).toBe(MoleculeRole.HYDRATE);
      expect(component.notes).toBe('Dihydrate form');
    });

    it('should throw error for zero stoichiometry', () => {
      expect(() => {
        new MoleculeComponent(waterMolecule, 0);
      }).toThrow('Stoichiometry must be greater than 0');
    });

    it('should throw error for negative stoichiometry', () => {
      expect(() => {
        new MoleculeComponent(waterMolecule, -1);
      }).toThrow('Stoichiometry must be greater than 0');
    });

    it('should allow fractional stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 0.5);
      expect(component.getStoichiometry()).toBe(0.5);
    });
  });

  describe('Stoichiometry Management', () => {
    let component: MoleculeComponent;

    beforeEach(() => {
      component = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);
    });

    it('should get stoichiometry', () => {
      expect(component.getStoichiometry()).toBe(1);
    });

    it('should set stoichiometry', () => {
      component.setStoichiometry(3);
      expect(component.getStoichiometry()).toBe(3);
    });

    it('should validate stoichiometry on set', () => {
      expect(() => {
        component.setStoichiometry(0);
      }).toThrow('Stoichiometry must be greater than 0');
    });

    it('should allow fractional stoichiometry on set', () => {
      component.setStoichiometry(1.5);
      expect(component.getStoichiometry()).toBe(1.5);
    });
  });

  describe('Role Management', () => {
    let component: MoleculeComponent;

    beforeEach(() => {
      component = new MoleculeComponent(waterMolecule);
    });

    it('should get role', () => {
      expect(component.getRole()).toBe(MoleculeRole.UNSPECIFIED);
    });

    it('should set role', () => {
      component.setRole(MoleculeRole.SOLVENT);
      expect(component.getRole()).toBe(MoleculeRole.SOLVENT);
    });

    it('should support all defined roles', () => {
      const roles = [
        MoleculeRole.PARENT,
        MoleculeRole.SALT,
        MoleculeRole.SOLVENT,
        MoleculeRole.HYDRATE,
        MoleculeRole.COCRYSTAL,
        MoleculeRole.COUNTERION,
        MoleculeRole.LIGAND,
        MoleculeRole.IMPURITY,
        MoleculeRole.ADDITIVE,
        MoleculeRole.BUFFER,
        MoleculeRole.EXCIPIENT,
      ];

      for (const role of roles) {
        component.setRole(role);
        expect(component.getRole()).toBe(role);
      }
    });
  });

  describe('Formula with Stoichiometry', () => {
    it('should return formula without coefficient when stoichiometry is 1', () => {
      const component = new MoleculeComponent(waterMolecule, 1);
      expect(component.getFormulaWithStoichiometry()).toBe('H2O');
    });

    it('should return formula with integer coefficient', () => {
      const component = new MoleculeComponent(waterMolecule, 3);
      expect(component.getFormulaWithStoichiometry()).toBe('3H2O');
    });

    it('should return formula with decimal coefficient', () => {
      const component = new MoleculeComponent(waterMolecule, 0.5);
      expect(component.getFormulaWithStoichiometry()).toContain('0.5H2O');
    });

    it('should handle two decimal places for fractional stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 1.5);
      expect(component.getFormulaWithStoichiometry()).toContain('1.5H2O');
    });
  });

  describe('Role Checkers', () => {
    it('should identify solvent roles', () => {
      const solvent = new MoleculeComponent(waterMolecule, 1, MoleculeRole.SOLVENT);
      const hydrate = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);
      const parent = new MoleculeComponent(waterMolecule, 1, MoleculeRole.PARENT);

      expect(solvent.isSolvent()).toBe(true);
      expect(hydrate.isSolvent()).toBe(true);
      expect(parent.isSolvent()).toBe(false);
    });

    it('should identify parent role', () => {
      const parent = new MoleculeComponent(waterMolecule, 1, MoleculeRole.PARENT);
      const salt = new MoleculeComponent(waterMolecule, 1, MoleculeRole.SALT);

      expect(parent.isParent()).toBe(true);
      expect(salt.isParent()).toBe(false);
    });

    it('should identify salt roles', () => {
      const salt = new MoleculeComponent(nacl, 1, MoleculeRole.SALT);
      const counterion = new MoleculeComponent(nacl, 1, MoleculeRole.COUNTERION);
      const parent = new MoleculeComponent(waterMolecule, 1, MoleculeRole.PARENT);

      expect(salt.isSalt()).toBe(true);
      expect(counterion.isSalt()).toBe(true);
      expect(parent.isSalt()).toBe(false);
    });
  });

  describe('Weight Calculations', () => {
    it('should calculate total weight for single component', () => {
      const component = new MoleculeComponent(waterMolecule, 1);
      const weight = component.getTotalWeight();
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeCloseTo(18.015, 1); // H2O ≈ 18.015
    });

    it('should calculate total weight with stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 2);
      const weight = component.getTotalWeight();
      expect(weight).toBeCloseTo(36.03, 1); // 2 × H2O
    });

    it('should handle fractional stoichiometry in weight', () => {
      const component = new MoleculeComponent(waterMolecule, 0.5);
      const weight = component.getTotalWeight();
      expect(weight).toBeCloseTo(9.0, 1); // 0.5 × H2O
    });
  });

  describe('Charge Calculations', () => {
    it('should calculate total charge for neutral molecule', () => {
      const component = new MoleculeComponent(waterMolecule);
      expect(component.getTotalCharge()).toBe(0);
    });

    it('should calculate total charge with stoichiometry', () => {
      const component = new MoleculeComponent(nacl, 2); // Cl with -1 charge
      expect(component.getTotalCharge()).toBe(-2);
    });

    it('should handle fractional stoichiometry in charge', () => {
      const component = new MoleculeComponent(nacl, 0.5); // 0.5 × (Cl-1)
      expect(component.getTotalCharge()).toBe(-0.5);
    });
  });

  describe('Cloning', () => {
    it('should clone a component with same properties', () => {
      const original = new MoleculeComponent(
        waterMolecule,
        2,
        MoleculeRole.HYDRATE,
        'Dihydrate'
      );
      const cloned = original.clone();

      expect(cloned.getStoichiometry()).toBe(2);
      expect(cloned.getRole()).toBe(MoleculeRole.HYDRATE);
      expect(cloned.notes).toBe('Dihydrate');
    });

    it('should clone with new stoichiometry', () => {
      const original = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);
      const cloned = original.clone(3);

      expect(cloned.getStoichiometry()).toBe(3);
      expect(cloned.getRole()).toBe(MoleculeRole.HYDRATE);
    });

    it('should clone with new role', () => {
      const original = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);
      const cloned = original.clone(undefined, MoleculeRole.SOLVENT);

      expect(cloned.getStoichiometry()).toBe(1);
      expect(cloned.getRole()).toBe(MoleculeRole.SOLVENT);
    });

    it('should create independent molecule copies', () => {
      const original = new MoleculeComponent(waterMolecule);
      const cloned = original.clone();

      expect(cloned.getMolecule()).not.toBe(waterMolecule);
      expect(cloned.getMolecule().getFormula()).toBe(waterMolecule.getFormula());
    });
  });

  describe('Serialization', () => {
    it('should convert to JSON', () => {
      const component = new MoleculeComponent(waterMolecule, 2, MoleculeRole.HYDRATE);
      const json = component.toJSON();

      expect(json.moleculeName).toBe('Water');
      expect(json.moleculeFormula).toBe('H2O');
      expect(json.role).toBe(MoleculeRole.HYDRATE);
      expect(json.stoichiometry).toBe(2);
      expect(json.formulaWithStoichiometry).toBe('2H2O');
    });

    it('should include total weight in JSON', () => {
      const component = new MoleculeComponent(waterMolecule, 1);
      const json = component.toJSON();

      expect(json.totalWeight).toBeGreaterThan(0);
    });

    it('should include total charge in JSON', () => {
      const component = new MoleculeComponent(nacl, 1);
      const json = component.toJSON();

      expect(json.totalCharge).toBe(-1);
    });

    it('should include notes in JSON when present', () => {
      const component = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE, 'Test note');
      const json = component.toJSON();

      expect(json.notes).toBe('Test note');
    });
  });

  describe('String Representation', () => {
    it('should convert to string with stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 2, MoleculeRole.HYDRATE);
      const str = component.toString();

      expect(str).toContain('2H2O');
      expect(str).toContain(MoleculeRole.HYDRATE);
    });

    it('should include notes in string when present', () => {
      const component = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE, 'Monohydrate');
      const str = component.toString();

      expect(str).toContain('Monohydrate');
    });

    it('should omit role when unspecified', () => {
      const component = new MoleculeComponent(waterMolecule, 1);
      const str = component.toString();

      expect(str).not.toContain(MoleculeRole.UNSPECIFIED);
    });
  });

  describe('Real-World Examples', () => {
    it('should handle sodium chloride monohydrate (NaCl·H2O)', () => {
      // Create parent compound (simplified as Cl for this test)
      const parent = new MoleculeComponent(nacl, 1, MoleculeRole.PARENT);
      const water = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);

      expect(parent.getFormulaWithStoichiometry()).toBe('Cl');
      expect(water.getFormulaWithStoichiometry()).toBe('H2O');
      expect(parent.getTotalCharge()).toBe(-1);
      expect(water.getTotalCharge()).toBe(0);
    });

    it('should handle calcium carbonate hemihydrate (CaCO3·0.5H2O)', () => {
      const parent = new MoleculeComponent(nacl, 1, MoleculeRole.PARENT, 'CaCO3');
      const hemihydrate = new MoleculeComponent(waterMolecule, 0.5, MoleculeRole.HYDRATE);

      expect(parent.getFormulaWithStoichiometry()).toBe('Cl');
      expect(hemihydrate.getFormulaWithStoichiometry()).toContain('0.5H2O');
      expect(hemihydrate.getTotalWeight()).toBeCloseTo(9.0, 1);
    });

    it('should handle pharmaceutical salt form (Drug·HCl·H2O)', () => {
      const drug = new MoleculeComponent(waterMolecule, 1, MoleculeRole.PARENT, 'Drug molecule');
      const hcl = new MoleculeComponent(nacl, 1, MoleculeRole.SALT, 'HCl salt');
      const water = new MoleculeComponent(waterMolecule, 1, MoleculeRole.HYDRATE);

      expect(drug.isParent()).toBe(true);
      expect(hcl.isSalt()).toBe(true);
      expect(water.isSolvent()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 100);
      expect(component.getStoichiometry()).toBe(100);
      expect(component.getTotalWeight()).toBeCloseTo(1801.5, 0);
    });

    it('should handle very small stoichiometry', () => {
      const component = new MoleculeComponent(waterMolecule, 0.001);
      expect(component.getStoichiometry()).toBe(0.001);
      expect(component.getTotalWeight()).toBeCloseTo(0.018, 3);
    });

    it('should handle molecule with zero charge', () => {
      const component = new MoleculeComponent(waterMolecule, 5);
      expect(component.getTotalCharge()).toBe(0);
    });

    it('should handle molecule with high charge', () => {
      const charged = new Molecule('Charged', 'C+3');
      charged.addAtom(pt.getBySymbol('C'), new Vector3D(0, 0, 0), 3);
      const component = new MoleculeComponent(charged, 2);
      expect(component.getTotalCharge()).toBe(6);
    });
  });
});
