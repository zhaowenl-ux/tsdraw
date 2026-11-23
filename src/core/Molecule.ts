import { Atom } from './Atom';
import { Bond } from './Bond';
import { Element } from './Element';
import { Vector3D } from './Vector3D';

/**
 * Represents a molecule - a collection of atoms and bonds
 * Properties: atoms, bonds, name, description, metadata
 */
export class Molecule {
  private atoms: Map<number, Atom> = new Map(); // Atoms indexed by ID
  private bonds: Bond[] = []; // All bonds in the molecule
  name: string; // Molecule name (e.g., "Ethanol", "Glucose")
  description: string; // Description of the molecule
  private nextAtomId: number = 0; // Auto-incrementing atom ID

  constructor(name: string = '', description: string = '') {
    this.name = name;
    this.description = description;
  }

  /**
   * Add an atom to the molecule
   * If no ID is provided, auto-increments from the highest existing ID
   */
  addAtom(element: Element, position: Vector3D = new Vector3D(0, 0, 0), charge: number = 0, id?: number): Atom {
    let atomId = id;

    if (atomId === undefined) {
      atomId = this.nextAtomId++;
    } else {
      // Update nextAtomId if necessary
      if (atomId >= this.nextAtomId) {
        this.nextAtomId = atomId + 1;
      }
    }

    if (this.atoms.has(atomId)) {
      throw new Error(`Atom with ID ${atomId} already exists in this molecule`);
    }

    const atom = new Atom(atomId, element, position, charge);
    this.atoms.set(atomId, atom);
    return atom;
  }

  /**
   * Remove an atom from the molecule (also removes associated bonds)
   */
  removeAtom(atomId: number): boolean {
    if (!this.atoms.has(atomId)) {
      return false;
    }

    // Remove all bonds involving this atom
    this.bonds = this.bonds.filter(bond => !bond.connects(atomId, atomId) && bond.atomId1 !== atomId && bond.atomId2 !== atomId);

    this.atoms.delete(atomId);
    return true;
  }

  /**
   * Get an atom by ID
   */
  getAtom(atomId: number): Atom | undefined {
    return this.atoms.get(atomId);
  }

  /**
   * Get all atoms
   */
  getAtoms(): Atom[] {
    return Array.from(this.atoms.values());
  }

  /**
   * Get atom count
   */
  getAtomCount(): number {
    return this.atoms.size;
  }

  /**
   * Check if an atom exists
   */
  hasAtom(atomId: number): boolean {
    return this.atoms.has(atomId);
  }

  /**
   * Add a bond between two atoms
   */
  addBond(bond: Bond): Bond {
    // Validate that both atoms exist
    if (!this.atoms.has(bond.atomId1) || !this.atoms.has(bond.atomId2)) {
      throw new Error(`Cannot create bond - one or both atoms do not exist in this molecule`);
    }

    // Check if bond already exists
    if (this.bonds.some(b => b.connects(bond.atomId1, bond.atomId2))) {
      throw new Error(`Bond between atoms ${bond.atomId1} and ${bond.atomId2} already exists`);
    }

    this.bonds.push(bond);
    return bond;
  }

  /**
   * Create and add a bond in one step
   */
  addBondBetween(atomId1: number, atomId2: number, type?: number, chirality?: number, conformation?: number): Bond {
    const bond = new Bond(atomId1, atomId2, type, chirality, conformation);
    return this.addBond(bond);
  }

  /**
   * Remove a bond between two atoms
   */
  removeBond(atomId1: number, atomId2: number): boolean {
    const index = this.bonds.findIndex(b => b.connects(atomId1, atomId2));
    if (index !== -1) {
      this.bonds.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a bond between two atoms
   */
  getBond(atomId1: number, atomId2: number): Bond | undefined {
    return this.bonds.find(b => b.connects(atomId1, atomId2));
  }

  /**
   * Get all bonds
   */
  getBonds(): Bond[] {
    return [...this.bonds];
  }

  /**
   * Get all bonds connected to an atom
   */
  getBondsForAtom(atomId: number): Bond[] {
    return this.bonds.filter(b => b.connects(atomId, atomId) || b.atomId1 === atomId || b.atomId2 === atomId);
  }

  /**
   * Get bond count
   */
  getBondCount(): number {
    return this.bonds.length;
  }

  /**
   * Get the atoms connected to a given atom
   */
  getConnectedAtoms(atomId: number): Atom[] {
    const atom = this.getAtom(atomId);
    if (!atom) {
      throw new Error(`Atom ${atomId} not found`);
    }

    const connectedBonds = this.getBondsForAtom(atomId);
    const connectedAtomIds = connectedBonds.map(b => b.getOtherAtom(atomId));

    return connectedAtomIds
      .map(id => this.getAtom(id))
      .filter((atom): atom is Atom => atom !== undefined);
  }

  /**
   * Get the atomic formula (e.g., "C2H6" for ethane)
   */
  getFormula(): string {
    const composition: { [symbol: string]: number } = {};

    // Count atoms by element
    for (const atom of this.atoms.values()) {
      const symbol = atom.getSymbol();
      composition[symbol] = (composition[symbol] || 0) + 1;
    }

    // Sort symbols (C and H first if present, then alphabetically)
    const symbols = Object.keys(composition).sort((a, b) => {
      if (a === 'C' && b !== 'C') return -1;
      if (a !== 'C' && b === 'C') return 1;
      if (a === 'H' && b !== 'H') return -1;
      if (a !== 'H' && b === 'H') return 1;
      return a.localeCompare(b);
    });

    // Build formula string
    return symbols.map(symbol => {
      const count = composition[symbol];
      return count === 1 ? symbol : `${symbol}${count}`;
    }).join('');
  }

  /**
   * Calculate molecular weight
   */
  getMolecularWeight(): number {
    return Array.from(this.atoms.values()).reduce((sum, atom) => sum + atom.element.atomicWeight, 0);
  }

  /**
   * Calculate total formal charge
   */
  getTotalCharge(): number {
    return Array.from(this.atoms.values()).reduce((sum, atom) => sum + atom.charge, 0);
  }

  /**
   * Clone the molecule with a new name
   */
  clone(newName?: string, newDescription?: string): Molecule {
    const cloned = new Molecule(
      newName !== undefined ? newName : this.name,
      newDescription !== undefined ? newDescription : this.description
    );

    // Clone all atoms
    const atomIdMap: { [oldId: number]: number } = {};
    for (const [oldId, atom] of this.atoms) {
      const newAtom = cloned.addAtom(atom.element, atom.position.clone(), atom.charge);
      atomIdMap[oldId] = newAtom.id;
    }

    // Clone all bonds using the new atom IDs
    for (const bond of this.bonds) {
      const newBond = new (bond.constructor as any)(
        atomIdMap[bond.atomId1],
        atomIdMap[bond.atomId2],
        bond.type,
        bond.chirality,
        bond.conformation
      );
      cloned.addBond(newBond);
    }

    return cloned;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): {
    name: string;
    description: string;
    formula: string;
    molecularWeight: number;
    totalCharge: number;
    atoms: any[];
    bonds: any[];
  } {
    return {
      name: this.name,
      description: this.description,
      formula: this.getFormula(),
      molecularWeight: this.getMolecularWeight(),
      totalCharge: this.getTotalCharge(),
      atoms: this.getAtoms().map(atom => atom.toJSON()),
      bonds: this.bonds.map(bond => bond.toJSON()),
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    const name = this.name ? ` "${this.name}"` : '';
    const formula = this.getFormula();
    const atomCount = this.getAtomCount();
    const bondCount = this.getBondCount();
    return `Molecule${name} (${formula}, ${atomCount} atoms, ${bondCount} bonds)`;
  }
}
