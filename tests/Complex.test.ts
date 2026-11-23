import { describe, it, expect, beforeEach } from 'vitest';
import { Complex } from '../src/core/Complex';
import { MoleculeComponent, MoleculeRole } from '../src/core/MoleculeComponent';
import { Molecule } from '../src/core/Molecule';
import { PeriodicTable } from '../src/core/Element';
import { Vector3D } from '../src/core/Vector3D';

describe('Complex', () => {
  const pt = PeriodicTable.getInstance();

  // Create water molecule
  const createWater = (): Molecule => {
    const mol = new Molecule('Water', 'H2O');
    mol.addAtom(pt.getBySymbol('H'), new Vector3D(0.96, 0, 0));
    mol.addAtom(pt.getBySymbol('O'), new Vector3D(0, 0, 0));
    mol.addAtom(pt.getBySymbol('H'), new Vector3D(-0.24, 0.93, 0));
    return mol;
  };

  // Create chloride molecule (for salt testing)
  const createChloride = (): Molecule => {
    const mol = new Molecule('Chloride', 'Cl');
    mol.addAtom(pt.getByNumber(17)!, new Vector3D(0, 0, 0), -1);
    return mol;
  };

  let complex: Complex;
  let waterComponent: MoleculeComponent;
  let chlorideComponent: MoleculeComponent;

  beforeEach(() => {
    complex = new Complex('Test Complex', 'A test complex');
    waterComponent = new MoleculeComponent(createWater(), 1, MoleculeRole.SOLVENT);
    chlorideComponent = new MoleculeComponent(createChloride(), 1, MoleculeRole.SALT);
  });

  describe('Constructor and Properties', () => {
    it('should create an empty complex with name and description', () => {
      expect(complex.name).toBe('Test Complex');
      expect(complex.description).toBe('A test complex');
      expect(complex.getComponentCount()).toBe(0);
    });

    it('should create a complex with default values', () => {
      const empty = new Complex();
      expect(empty.name).toBe('');
      expect(empty.description).toBe('');
      expect(empty.getComponentCount()).toBe(0);
    });
  });

  describe('Adding and Removing Components', () => {
    it('should add a component with auto-increment ID', () => {
      const comp1 = complex.addComponent(waterComponent);
      const comp2 = complex.addComponent(chlorideComponent);

      expect(complex.getComponentCount()).toBe(2);
      expect(complex.hasComponent(0)).toBe(true);
      expect(complex.hasComponent(1)).toBe(true);
    });

    it('should add a component with specified ID', () => {
      complex.addComponent(waterComponent, 5);
      expect(complex.hasComponent(5)).toBe(true);
      expect(complex.getComponent(5)).toBe(waterComponent);
    });

    it('should throw error when adding component with duplicate ID', () => {
      complex.addComponent(waterComponent, 5);
      expect(() => {
        complex.addComponent(chlorideComponent, 5);
      }).toThrow('Component with ID 5 already exists in this complex');
    });

    it('should remove a component', () => {
      complex.addComponent(waterComponent, 0);
      expect(complex.getComponentCount()).toBe(1);
      expect(complex.removeComponent(0)).toBe(true);
      expect(complex.getComponentCount()).toBe(0);
    });

    it('should return false when removing non-existent component', () => {
      expect(complex.removeComponent(999)).toBe(false);
    });
  });

  describe('Querying Components', () => {
    beforeEach(() => {
      complex.addComponent(waterComponent, 0);
      complex.addComponent(chlorideComponent, 1);
    });

    it('should get a component by ID', () => {
      const comp = complex.getComponent(0);
      expect(comp).toBe(waterComponent);
    });

    it('should return undefined for non-existent component', () => {
      expect(complex.getComponent(999)).toBeUndefined();
    });

    it('should get all components', () => {
      const comps = complex.getComponents();
      expect(comps).toHaveLength(2);
      expect(comps).toContain(waterComponent);
      expect(comps).toContain(chlorideComponent);
    });

    it('should get components by role', () => {
      const solvents = complex.getComponentsByRole(MoleculeRole.SOLVENT);
      expect(solvents).toHaveLength(1);
      expect(solvents[0]).toBe(waterComponent);

      const salts = complex.getComponentsByRole(MoleculeRole.SALT);
      expect(salts).toHaveLength(1);
      expect(salts[0]).toBe(chlorideComponent);
    });

    it('should check if component exists', () => {
      expect(complex.hasComponent(0)).toBe(true);
      expect(complex.hasComponent(999)).toBe(false);
    });
  });

  describe('Role-Specific Queries', () => {
    it('should get parent component', () => {
      const parent = new MoleculeComponent(createWater(), 1, MoleculeRole.PARENT);
      complex.addComponent(parent);
      expect(complex.getParentComponent()).toBe(parent);
    });

    it('should return undefined if no parent component', () => {
      complex.addComponent(waterComponent);
      expect(complex.getParentComponent()).toBeUndefined();
    });

    it('should get solvent components', () => {
      complex.addComponent(waterComponent, 0);
      complex.addComponent(new MoleculeComponent(createWater(), 1, MoleculeRole.SOLVENT), 1);

      const solvents = complex.getSolventComponents();
      expect(solvents).toHaveLength(2);
    });

    it('should get salt components', () => {
      complex.addComponent(chlorideComponent, 0);
      complex.addComponent(new MoleculeComponent(createChloride(), 1, MoleculeRole.COUNTERION), 1);

      const salts = complex.getSaltComponents();
      expect(salts).toHaveLength(2);
    });
  });

  describe('Complex Formula', () => {
    it('should return empty formula for empty complex', () => {
      expect(complex.getComplexFormula()).toBe('');
    });

    it('should return single formula for single component', () => {
      complex.addComponent(waterComponent);
      expect(complex.getComplexFormula()).toBe('H2O');
    });

    it('should combine formulas with bullet separator', () => {
      complex.addComponent(chlorideComponent, 0);
      complex.addComponent(waterComponent, 1);

      const formula = complex.getComplexFormula();
      expect(formula).toContain('·');
      expect(formula).toContain('H2O');
      expect(formula).toContain('Cl');
    });

    it('should include stoichiometry in formula', () => {
      const water2 = new MoleculeComponent(createWater(), 2, MoleculeRole.HYDRATE);
      complex.addComponent(chlorideComponent, 0);
      complex.addComponent(water2, 1);

      const formula = complex.getComplexFormula();
      expect(formula).toContain('2H2O');
    });

    it('should handle fractional stoichiometry in formula', () => {
      const hemiwater = new MoleculeComponent(createWater(), 0.5, MoleculeRole.HYDRATE);
      complex.addComponent(chlorideComponent, 0);
      complex.addComponent(hemiwater, 1);

      const formula = complex.getComplexFormula();
      expect(formula).toContain('0.5H2O');
    });
  });

  describe('Weight and Charge Calculations', () => {
    beforeEach(() => {
      complex.addComponent(waterComponent, 0);
      complex.addComponent(chlorideComponent, 1);
    });

    it('should calculate total weight', () => {
      const weight = complex.getTotalWeight();
      expect(weight).toBeGreaterThan(0);
      // H2O (18.015) + Cl (35.45) ≈ 53.465
      expect(weight).toBeCloseTo(53.465, 0);
    });

    it('should calculate total charge', () => {
      const charge = complex.getTotalCharge();
      expect(charge).toBe(-1); // Only Cl has charge
    });

    it('should handle multiple components with stoichiometry', () => {
      const complex2 = new Complex('Salt hydrate', '');
      const water2 = new MoleculeComponent(createWater(), 2, MoleculeRole.HYDRATE);
      complex2.addComponent(chlorideComponent, 0);
      complex2.addComponent(water2, 1);

      const weight = complex2.getTotalWeight();
      // Cl (35.45) + 2×H2O (36.03) ≈ 71.48
      expect(weight).toBeCloseTo(71.48, 0);
    });
  });

  describe('Atom and Bond Counts', () => {
    it('should count total atoms across components', () => {
      complex.addComponent(waterComponent, 0); // 3 atoms (O, H, H)
      complex.addComponent(chlorideComponent, 1); // 1 atom (Cl)

      expect(complex.getTotalAtomCount()).toBe(4);
    });

    it('should count total bonds across components', () => {
      const water = createWater();
      water.addAtom(pt.getBySymbol('H')); // Add extra atoms to create bonds
      waterComponent = new MoleculeComponent(water, 1, MoleculeRole.SOLVENT);

      complex.addComponent(waterComponent);
      expect(complex.getTotalBondCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Complex Type Checks', () => {
    it('should identify simple complex (single component)', () => {
      complex.addComponent(waterComponent);
      expect(complex.isSimple()).toBe(true);

      complex.addComponent(chlorideComponent);
      expect(complex.isSimple()).toBe(false);
    });

    it('should identify hydrate', () => {
      const hydrate = new MoleculeComponent(createWater(), 1, MoleculeRole.HYDRATE);
      complex.addComponent(chlorideComponent);
      expect(complex.isHydrate()).toBe(false);

      complex.addComponent(hydrate);
      expect(complex.isHydrate()).toBe(true);
    });

    it('should identify salt', () => {
      complex.addComponent(waterComponent);
      expect(complex.isSalt()).toBe(false);

      complex.addComponent(chlorideComponent);
      expect(complex.isSalt()).toBe(true);
    });
  });

  describe('Hydration Number', () => {
    it('should return 0 for non-hydrate', () => {
      complex.addComponent(waterComponent, 0);
      complex.addComponent(chlorideComponent, 1);
      expect(complex.getHydrationNumber()).toBe(0);
    });

    it('should return hydration number for monohydrate', () => {
      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT);
      const hydrate = new MoleculeComponent(createWater(), 1, MoleculeRole.HYDRATE);
      complex.addComponent(parent);
      complex.addComponent(hydrate);

      expect(complex.getHydrationNumber()).toBe(1);
    });

    it('should sum stoichiometry for polyhydrate', () => {
      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT);
      const dihydrate = new MoleculeComponent(createWater(), 2, MoleculeRole.HYDRATE);
      complex.addComponent(parent);
      complex.addComponent(dihydrate);

      expect(complex.getHydrationNumber()).toBe(2);
    });

    it('should handle fractional hydration', () => {
      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT);
      const hemihydrate = new MoleculeComponent(createWater(), 0.5, MoleculeRole.HYDRATE);
      complex.addComponent(parent);
      complex.addComponent(hemihydrate);

      expect(complex.getHydrationNumber()).toBe(0.5);
    });
  });

  describe('Cloning', () => {
    beforeEach(() => {
      complex.addComponent(waterComponent, 0);
      complex.addComponent(chlorideComponent, 1);
    });

    it('should clone a complex with same properties', () => {
      const cloned = complex.clone();
      expect(cloned.name).toBe('Test Complex');
      expect(cloned.description).toBe('A test complex');
      expect(cloned.getComponentCount()).toBe(2);
    });

    it('should clone with new name and description', () => {
      const cloned = complex.clone('New Name', 'New Description');
      expect(cloned.name).toBe('New Name');
      expect(cloned.description).toBe('New Description');
    });

    it('should create independent component copies', () => {
      const cloned = complex.clone();
      expect(cloned.getComponent(0)).not.toBe(waterComponent);
      expect(cloned.getComponentCount()).toBe(complex.getComponentCount());
    });
  });

  describe('Serialization', () => {
    beforeEach(() => {
      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT);
      const salt = new MoleculeComponent(createWater(), 1, MoleculeRole.SALT);
      const hydrate = new MoleculeComponent(createWater(), 1, MoleculeRole.HYDRATE);
      complex.addComponent(parent);
      complex.addComponent(salt);
      complex.addComponent(hydrate);
    });

    it('should convert to JSON', () => {
      const json = complex.toJSON();

      expect(json.name).toBe('Test Complex');
      expect(json.description).toBe('A test complex');
      expect(json.componentCount).toBe(3);
      expect(json.isHydrate).toBe(true);
      expect(json.isSalt).toBe(true);
      expect(json.hydrationNumber).toBe(1);
    });

    it('should include complex formula in JSON', () => {
      const json = complex.toJSON();
      expect(json.complexFormula).toContain('·');
    });

    it('should include all component JSONs', () => {
      const json = complex.toJSON();
      expect(json.components).toHaveLength(3);
    });

    it('should include total weight and charge', () => {
      const json = complex.toJSON();
      expect(json.totalWeight).toBeGreaterThan(0);
      expect(json.totalCharge).toBeLessThanOrEqual(0);
    });
  });

  describe('String Representation', () => {
    it('should convert to string with name', () => {
      complex.addComponent(waterComponent);
      const str = complex.toString();

      expect(str).toContain('Test Complex');
      expect(str).toContain('H2O');
    });

    it('should include component count', () => {
      complex.addComponent(waterComponent);
      complex.addComponent(chlorideComponent);
      const str = complex.toString();

      expect(str).toContain('2 components');
    });

    it('should include atom count', () => {
      complex.addComponent(waterComponent); // 3 atoms
      const str = complex.toString();

      expect(str).toContain('atoms');
    });
  });

  describe('Real-World Examples', () => {
    it('should handle NaCl monohydrate (NaCl·H2O)', () => {
      const salt = new Complex('Sodium Chloride Monohydrate', 'NaCl·H2O');

      // Create NaCl parent (simplified as Cl for this test)
      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT);
      const hydrate = new MoleculeComponent(createWater(), 1, MoleculeRole.HYDRATE);

      salt.addComponent(parent);
      salt.addComponent(hydrate);

      expect(salt.getComplexFormula()).toContain('Cl');
      expect(salt.getComplexFormula()).toContain('H2O');
      expect(salt.isHydrate()).toBe(true);
      expect(salt.getHydrationNumber()).toBe(1);
    });

    it('should handle pharmaceutical salt (Drug·HCl·2H2O)', () => {
      const pharma = new Complex('Ibuprofen HCl Dihydrate', 'Drug·HCl·2H2O');

      const api = new MoleculeComponent(createWater(), 1, MoleculeRole.PARENT, 'API');
      const salt = new MoleculeComponent(createChloride(), 1, MoleculeRole.SALT, 'HCl');
      const water = new MoleculeComponent(createWater(), 2, MoleculeRole.HYDRATE);

      pharma.addComponent(api);
      pharma.addComponent(salt);
      pharma.addComponent(water);

      expect(pharma.getComponentCount()).toBe(3);
      expect(pharma.isHydrate()).toBe(true);
      expect(pharma.isSalt()).toBe(true);
      expect(pharma.getHydrationNumber()).toBe(2);
    });

    it('should handle hemihydrate (CaCO3·0.5H2O)', () => {
      const hemi = new Complex('Calcium Carbonate Hemihydrate', 'CaCO3·0.5H2O');

      const parent = new MoleculeComponent(createChloride(), 1, MoleculeRole.PARENT, 'CaCO3');
      const water = new MoleculeComponent(createWater(), 0.5, MoleculeRole.HYDRATE);

      hemi.addComponent(parent);
      hemi.addComponent(water);

      expect(hemi.getHydrationNumber()).toBe(0.5);
      expect(hemi.getComplexFormula()).toContain('0.5H2O');
    });

    it('should handle cocrystal (API·Coformer)', () => {
      const cocrystal = new Complex('API Cocrystal', 'API·Coformer');

      const api = new MoleculeComponent(createWater(), 1, MoleculeRole.PARENT, 'API');
      const coformer = new MoleculeComponent(createChloride(), 1, MoleculeRole.COCRYSTAL, 'Coformer');

      cocrystal.addComponent(api);
      cocrystal.addComponent(coformer);

      expect(cocrystal.isHydrate()).toBe(false);
      expect(cocrystal.isSalt()).toBe(false);
      expect(cocrystal.getComponentCount()).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle complex with many components', () => {
      for (let i = 0; i < 10; i++) {
        const comp = new MoleculeComponent(createWater(), 1, MoleculeRole.SOLVENT);
        complex.addComponent(comp, i);
      }

      expect(complex.getComponentCount()).toBe(10);
    });

    it('should handle very high stoichiometry', () => {
      const hydrate = new MoleculeComponent(createWater(), 100, MoleculeRole.HYDRATE);
      complex.addComponent(hydrate);

      expect(complex.getHydrationNumber()).toBe(100);
    });

    it('should handle neutral and charged components together', () => {
      const neutral = new MoleculeComponent(createWater(), 1, MoleculeRole.SOLVENT);
      const charged = new MoleculeComponent(createChloride(), 1, MoleculeRole.COUNTERION);

      complex.addComponent(neutral);
      complex.addComponent(charged);

      expect(complex.getTotalCharge()).toBe(-1);
    });

    it('should handle mixed roles', () => {
      const parent = new MoleculeComponent(createWater(), 1, MoleculeRole.PARENT);
      const salt = new MoleculeComponent(createChloride(), 1, MoleculeRole.SALT);
      const hydrate = new MoleculeComponent(createWater(), 0.5, MoleculeRole.HYDRATE);
      const solvent = new MoleculeComponent(createWater(), 0.25, MoleculeRole.SOLVENT);

      complex.addComponent(parent);
      complex.addComponent(salt);
      complex.addComponent(hydrate);
      complex.addComponent(solvent);

      expect(complex.getComponentCount()).toBe(4);
      expect(complex.getSolventComponents().length).toBeGreaterThan(0);
    });
  });
});
