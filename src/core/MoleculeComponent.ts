import { Molecule } from './Molecule';

/**
 * Enumeration of molecular roles in a chemical system
 * Describes the functional role of a molecule in a compound or reaction
 */
export enum MoleculeRole {
  PARENT = 'parent',           // Primary/main component (e.g., API in pharmaceutical)
  SALT = 'salt',               // Salt form or counterion (e.g., HCl salt)
  SOLVENT = 'solvent',         // Solvent molecule (e.g., water, DMSO)
  HYDRATE = 'hydrate',         // Water in a hydrate (e.g., monohydrate)
  COCRYSTAL = 'cocrystal',     // Another organic molecule in a cocrystal
  COUNTERION = 'counterion',   // Ionic counterpart (e.g., Na+ in NaCl)
  LIGAND = 'ligand',           // Ligand in a complex
  IMPURITY = 'impurity',       // Unwanted component or byproduct
  ADDITIVE = 'additive',       // Minor component added intentionally (e.g., surfactant)
  BUFFER = 'buffer',           // pH buffer component
  EXCIPIENT = 'excipient',     // Inert pharmaceutical ingredient
  UNSPECIFIED = 'unspecified', // Role not specified
}

/**
 * Represents a molecule component with a specific role and stoichiometry
 * Used to describe molecules in salts, hydrates, mixtures, and complex systems
 *
 * Example: In sodium chloride monohydrate (NaCl·H2O)
 *   - Component 1: NaCl (role: PARENT, stoichiometry: 1)
 *   - Component 2: H2O (role: HYDRATE, stoichiometry: 1)
 */
export class MoleculeComponent {
  readonly molecule: Molecule;
  private stoichiometry: number; // Number of molecules of this component (must be > 0)
  role: MoleculeRole;
  notes?: string; // Optional notes about this component

  constructor(
    molecule: Molecule,
    stoichiometry: number = 1,
    role: MoleculeRole = MoleculeRole.UNSPECIFIED,
    notes?: string
  ) {
    if (stoichiometry <= 0) {
      throw new Error('Stoichiometry must be greater than 0');
    }

    if (!Number.isInteger(stoichiometry) && stoichiometry !== Math.floor(stoichiometry)) {
      // Allow fractional stoichiometry (e.g., 0.5 for half-hydrate)
      // But warn if it's not a simple fraction
      if (!this.isSimpleFraction(stoichiometry)) {
        console.warn(
          `Stoichiometry ${stoichiometry} is not an integer. This may represent a complex ratio.`
        );
      }
    }

    this.molecule = molecule;
    this.stoichiometry = stoichiometry;
    this.role = role;
    this.notes = notes;
  }

  /**
   * Check if a number is a simple fraction (e.g., 0.5, 1.5, 2.5)
   */
  private isSimpleFraction(num: number): boolean {
    // Check if the number can be expressed as a simple fraction with small denominator
    const fractions = [0.25, 0.33, 0.5, 0.67, 0.75, 1.5, 2.5];
    return fractions.some(f => Math.abs(num - f) < 0.01);
  }

  /**
   * Get the stoichiometry (coefficient) of this component
   */
  getStoichiometry(): number {
    return this.stoichiometry;
  }

  /**
   * Set the stoichiometry with validation
   */
  setStoichiometry(stoichiometry: number): void {
    if (stoichiometry <= 0) {
      throw new Error('Stoichiometry must be greater than 0');
    }
    this.stoichiometry = stoichiometry;
  }

  /**
   * Get the role of this molecule
   */
  getRole(): MoleculeRole {
    return this.role;
  }

  /**
   * Set the role of this molecule
   */
  setRole(role: MoleculeRole): void {
    this.role = role;
  }

  /**
   * Get the molecule
   */
  getMolecule(): Molecule {
    return this.molecule;
  }

  /**
   * Get the formula of the component with stoichiometry
   * Example: "H2O" with stoichiometry 2 becomes "2H2O"
   */
  getFormulaWithStoichiometry(): string {
    const baseFormula = this.molecule.getFormula();
    if (this.stoichiometry === 1) {
      return baseFormula;
    }

    // Format as decimal or integer, removing unnecessary trailing zeros
    let stoichStr: string;
    if (this.stoichiometry === Math.floor(this.stoichiometry)) {
      stoichStr = String(this.stoichiometry);
    } else {
      // Use toFixed and then remove trailing zeros
      stoichStr = this.stoichiometry.toFixed(2).replace(/\.?0+$/, '');
    }

    return `${stoichStr}${baseFormula}`;
  }

  /**
   * Check if this component is a solvent
   */
  isSolvent(): boolean {
    return this.role === MoleculeRole.SOLVENT || this.role === MoleculeRole.HYDRATE;
  }

  /**
   * Check if this component is the main component
   */
  isParent(): boolean {
    return this.role === MoleculeRole.PARENT;
  }

  /**
   * Check if this component is a salt/counterion
   */
  isSalt(): boolean {
    return this.role === MoleculeRole.SALT || this.role === MoleculeRole.COUNTERION;
  }

  /**
   * Get the total molecular weight of this component
   * (molecule weight × stoichiometry)
   */
  getTotalWeight(): number {
    return this.molecule.getMolecularWeight() * this.stoichiometry;
  }

  /**
   * Get the total charge of this component
   * (molecule charge × stoichiometry)
   */
  getTotalCharge(): number {
    return this.molecule.getTotalCharge() * this.stoichiometry;
  }

  /**
   * Clone this component with a new stoichiometry
   */
  clone(newStoichiometry?: number, newRole?: MoleculeRole): MoleculeComponent {
    return new MoleculeComponent(
      this.molecule.clone(), // Clone the molecule too
      newStoichiometry !== undefined ? newStoichiometry : this.stoichiometry,
      newRole !== undefined ? newRole : this.role,
      this.notes
    );
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): {
    moleculeName: string;
    moleculeFormula: string;
    role: string;
    stoichiometry: number;
    totalWeight: number;
    totalCharge: number;
    formulaWithStoichiometry: string;
    notes?: string;
  } {
    return {
      moleculeName: this.molecule.name,
      moleculeFormula: this.molecule.getFormula(),
      role: this.role,
      stoichiometry: this.stoichiometry,
      totalWeight: this.getTotalWeight(),
      totalCharge: this.getTotalCharge(),
      formulaWithStoichiometry: this.getFormulaWithStoichiometry(),
      notes: this.notes,
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    const roleStr = this.role !== MoleculeRole.UNSPECIFIED ? ` [${this.role}]` : '';
    const formulaStr = this.getFormulaWithStoichiometry();
    const notesStr = this.notes ? ` - ${this.notes}` : '';
    return `${formulaStr}${roleStr}${notesStr}`;
  }
}
