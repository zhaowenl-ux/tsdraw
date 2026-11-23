import { Element } from './Element';
import { Vector3D } from './Vector3D';

/**
 * Represents an atom in a molecule
 * Properties: atom ID in molecule, Element reference, charge, 3D coordinates
 */
export class Atom {
  readonly id: number; // Unique ID within the molecule
  readonly element: Element; // Reference to the Element
  charge: number; // Formal charge
  position: Vector3D; // 3D coordinates

  constructor(
    id: number,
    element: Element,
    position: Vector3D = new Vector3D(0, 0, 0),
    charge: number = 0
  ) {
    if (id < 0) {
      throw new Error('Atom ID must be non-negative');
    }

    if (!element.isValidCharge(charge)) {
      console.warn(
        `Charge ${charge} may not be typical for ${element.symbol}, but is allowed`
      );
    }

    this.id = id;
    this.element = element;
    this.position = position;
    this.charge = charge;
  }

  /**
   * Get the atomic number
   */
  getAtomicNumber(): number {
    return this.element.atomicNumber;
  }

  /**
   * Get the element symbol
   */
  getSymbol(): string {
    return this.element.symbol;
  }

  /**
   * Get the element name
   */
  getName(): string {
    return this.element.name;
  }

  /**
   * Get the default valence for this atom's element
   */
  getDefaultValence(): number {
    return this.element.getDefaultValence();
  }

  /**
   * Set the charge (with validation warning)
   */
  setCharge(charge: number): void {
    if (!this.element.isValidCharge(charge)) {
      console.warn(
        `Charge ${charge} may not be typical for ${this.element.symbol}, but is allowed`
      );
    }
    this.charge = charge;
  }

  /**
   * Set the 3D position
   */
  setPosition(x: number, y: number, z: number = 0): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  /**
   * Set position from a Vector3D
   */
  setPositionVector(pos: Vector3D): void {
    this.position = pos.clone();
  }

  /**
   * Get position as a Vector3D
   */
  getPosition(): Vector3D {
    return this.position.clone();
  }

  /**
   * Calculate distance to another atom
   */
  distanceTo(other: Atom): number {
    return this.position.distanceTo(other.position);
  }

  /**
   * Create a copy of this atom
   */
  clone(newId?: number): Atom {
    return new Atom(
      newId !== undefined ? newId : this.id,
      this.element,
      this.position.clone(),
      this.charge
    );
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): {
    id: number;
    atomicNumber: number;
    symbol: string;
    charge: number;
    position: { x: number; y: number; z: number };
  } {
    return {
      id: this.id,
      atomicNumber: this.element.atomicNumber,
      symbol: this.element.symbol,
      charge: this.charge,
      position: this.position.toJSON(),
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    const chargeStr = this.charge === 0 ? '' : ` ${this.charge > 0 ? '+' : ''}${this.charge}`;
    return `Atom(id=${this.id}, ${this.element.symbol}${chargeStr}, pos=${this.position.toString()})`;
  }
}
