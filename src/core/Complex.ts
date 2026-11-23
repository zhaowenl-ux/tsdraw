import { MoleculeComponent, MoleculeRole } from './MoleculeComponent';

/**
 * Represents a complex system with multiple molecular components
 * Used for crystals, salts, hydrates, formulations, and multi-component assemblies
 *
 * Examples:
 * - NaCl·H₂O (salt monohydrate)
 * - Drug·HCl·2H₂O (pharmaceutical salt form with hydration)
 * - API·Coformer·Solvent (cocrystal with solvent)
 * - Protein·Ligand (protein-ligand complex)
 */
export class Complex {
  private components: Map<number, MoleculeComponent> = new Map(); // Components indexed by ID
  name: string; // Name of the complex (e.g., "Ibuprofen HCl monohydrate")
  description: string; // Description
  private nextComponentId: number = 0; // Auto-incrementing component ID

  constructor(name: string = '', description: string = '') {
    this.name = name;
    this.description = description;
  }

  /**
   * Add a molecule component to the complex
   * Returns the component with its assigned ID
   */
  addComponent(component: MoleculeComponent, id?: number): MoleculeComponent {
    let componentId = id;

    if (componentId === undefined) {
      componentId = this.nextComponentId++;
    } else {
      if (componentId >= this.nextComponentId) {
        this.nextComponentId = componentId + 1;
      }
    }

    if (this.components.has(componentId)) {
      throw new Error(`Component with ID ${componentId} already exists in this complex`);
    }

    this.components.set(componentId, component);
    return component;
  }

  /**
   * Remove a component from the complex
   */
  removeComponent(componentId: number): boolean {
    if (!this.components.has(componentId)) {
      return false;
    }
    this.components.delete(componentId);
    return true;
  }

  /**
   * Get a component by ID
   */
  getComponent(componentId: number): MoleculeComponent | undefined {
    return this.components.get(componentId);
  }

  /**
   * Get all components
   */
  getComponents(): MoleculeComponent[] {
    return Array.from(this.components.values());
  }

  /**
   * Get components by role
   */
  getComponentsByRole(role: MoleculeRole): MoleculeComponent[] {
    return Array.from(this.components.values()).filter(c => c.getRole() === role);
  }

  /**
   * Get component count
   */
  getComponentCount(): number {
    return this.components.size;
  }

  /**
   * Check if a component exists
   */
  hasComponent(componentId: number): boolean {
    return this.components.has(componentId);
  }

  /**
   * Get the parent component (primary component)
   */
  getParentComponent(): MoleculeComponent | undefined {
    return Array.from(this.components.values()).find(c => c.isParent());
  }

  /**
   * Get all solvent/hydrate components
   */
  getSolventComponents(): MoleculeComponent[] {
    return Array.from(this.components.values()).filter(c => c.isSolvent());
  }

  /**
   * Get all salt/counterion components
   */
  getSaltComponents(): MoleculeComponent[] {
    return Array.from(this.components.values()).filter(c => c.isSalt());
  }

  /**
   * Get the combined formula of all components
   * Example: "NaCl·H₂O" for NaCl monohydrate
   */
  getComplexFormula(): string {
    const components = Array.from(this.components.values());
    if (components.length === 0) {
      return '';
    }

    // Get formulas with stoichiometry from each component
    const formulas = components
      .map(comp => comp.getFormulaWithStoichiometry())
      .filter(f => f.length > 0);

    return formulas.join('·'); // Use · (bullet) as separator, traditional in chemistry
  }

  /**
   * Calculate total molecular weight of the complex
   * (sum of all component weights)
   */
  getTotalWeight(): number {
    return Array.from(this.components.values()).reduce(
      (sum, comp) => sum + comp.getTotalWeight(),
      0
    );
  }

  /**
   * Calculate total formal charge of the complex
   * (sum of all component charges)
   */
  getTotalCharge(): number {
    return Array.from(this.components.values()).reduce(
      (sum, comp) => sum + comp.getTotalCharge(),
      0
    );
  }

  /**
   * Get total atom count across all components
   */
  getTotalAtomCount(): number {
    return Array.from(this.components.values()).reduce(
      (sum, comp) => sum + comp.getMolecule().getAtomCount(),
      0
    );
  }

  /**
   * Get total bond count across all components
   */
  getTotalBondCount(): number {
    return Array.from(this.components.values()).reduce(
      (sum, comp) => sum + comp.getMolecule().getBondCount(),
      0
    );
  }

  /**
   * Check if this is a simple complex (only one component)
   */
  isSimple(): boolean {
    return this.components.size === 1;
  }

  /**
   * Check if this is a hydrate (has hydrate components)
   */
  isHydrate(): boolean {
    return this.getSolventComponents().some(c => c.getRole() === MoleculeRole.HYDRATE);
  }

  /**
   * Check if this is a salt (has salt/counterion components)
   */
  isSalt(): boolean {
    return this.getSaltComponents().length > 0;
  }

  /**
   * Get the hydration number (total moles of water if hydrate)
   */
  getHydrationNumber(): number {
    return this.getComponentsByRole(MoleculeRole.HYDRATE).reduce(
      (sum, comp) => sum + comp.getStoichiometry(),
      0
    );
  }

  /**
   * Clone the complex with new name/description
   */
  clone(newName?: string, newDescription?: string): Complex {
    const cloned = new Complex(
      newName !== undefined ? newName : this.name,
      newDescription !== undefined ? newDescription : this.description
    );

    // Clone all components
    for (const [id, comp] of this.components) {
      cloned.addComponent(comp.clone(), id);
    }

    return cloned;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): {
    name: string;
    description: string;
    complexFormula: string;
    componentCount: number;
    totalWeight: number;
    totalCharge: number;
    totalAtoms: number;
    totalBonds: number;
    isHydrate: boolean;
    isSalt: boolean;
    hydrationNumber: number;
    components: any[];
  } {
    return {
      name: this.name,
      description: this.description,
      complexFormula: this.getComplexFormula(),
      componentCount: this.getComponentCount(),
      totalWeight: this.getTotalWeight(),
      totalCharge: this.getTotalCharge(),
      totalAtoms: this.getTotalAtomCount(),
      totalBonds: this.getTotalBondCount(),
      isHydrate: this.isHydrate(),
      isSalt: this.isSalt(),
      hydrationNumber: this.getHydrationNumber(),
      components: this.getComponents().map(comp => comp.toJSON()),
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    const name = this.name ? ` "${this.name}"` : '';
    const formula = this.getComplexFormula();
    const compCount = this.getComponentCount();
    const atomCount = this.getTotalAtomCount();
    const bondCount = this.getTotalBondCount();
    return `Complex${name} (${formula}, ${compCount} components, ${atomCount} atoms, ${bondCount} bonds)`;
  }
}
