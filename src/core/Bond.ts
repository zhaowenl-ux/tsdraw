/**
 * Enumeration of bond types
 */
export enum BondType {
  SINGLE = 1,
  DOUBLE = 2,
  TRIPLE = 3,
  AROMATIC = 4,
  QUADRUPLE = 4, // rare, but technically possible in some complexes
}

/**
 * Enumeration of bond chirality/stereochemistry (for single bonds)
 * Used to indicate 3D orientation (wedge/hash notation)
 */
export enum BondChirality {
  NONE = 0, // No stereochemistry
  WEDGE = 1, // Wedge bond (coming out of page)
  HASH = 2, // Hash bond (going into page)
  EITHER = 3, // Either/unknown stereochemistry
}

/**
 * Enumeration of double bond conformation (for double bonds)
 * Used to indicate E/Z or cis/trans geometry
 */
export enum BondConformation {
  NONE = 0, // No specified conformation or not applicable
  E = 1, // E conformation (higher priority groups on opposite sides)
  Z = 2, // Z conformation (higher priority groups on same side)
  EITHER = 3, // Either/unknown conformation
}

/**
 * Represents a bond between two atoms
 * Properties: atom IDs, bond type, chirality (wedge/hash), E/Z conformation
 */
export class Bond {
  readonly atomId1: number; // First atom ID (typically the lower ID)
  readonly atomId2: number; // Second atom ID (typically the higher ID)
  type: BondType; // Bond multiplicity
  chirality: BondChirality; // Wedge/hash stereochemistry
  conformation: BondConformation; // E/Z double bond geometry

  constructor(
    atomId1: number,
    atomId2: number,
    type: BondType = BondType.SINGLE,
    chirality: BondChirality = BondChirality.NONE,
    conformation: BondConformation = BondConformation.NONE
  ) {
    if (atomId1 < 0 || atomId2 < 0) {
      throw new Error('Atom IDs must be non-negative');
    }

    if (atomId1 === atomId2) {
      throw new Error('Cannot create a bond between an atom and itself');
    }

    // Store with lower ID first for consistency
    if (atomId1 < atomId2) {
      this.atomId1 = atomId1;
      this.atomId2 = atomId2;
    } else {
      this.atomId1 = atomId2;
      this.atomId2 = atomId1;
    }

    this.type = type;
    this.chirality = chirality;
    this.conformation = conformation;

    this.validateConformation();
  }

  /**
   * Validate that conformation is only set for double bonds
   */
  private validateConformation(): void {
    if (this.type !== BondType.DOUBLE && this.conformation !== BondConformation.NONE) {
      console.warn(
        `Conformation (E/Z) specified for non-double bond. Only valid for double bonds.`
      );
    }
  }

  /**
   * Check if this bond connects the given two atoms (order independent)
   */
  connects(id1: number, id2: number): boolean {
    return (
      (this.atomId1 === id1 && this.atomId2 === id2) ||
      (this.atomId1 === id2 && this.atomId2 === id1)
    );
  }

  /**
   * Get the bond order (number of bonds)
   */
  getOrder(): number {
    return this.type;
  }

  /**
   * Check if this is a single bond
   */
  isSingle(): boolean {
    return this.type === BondType.SINGLE;
  }

  /**
   * Check if this is a double bond
   */
  isDouble(): boolean {
    return this.type === BondType.DOUBLE;
  }

  /**
   * Check if this is a triple bond
   */
  isTriple(): boolean {
    return this.type === BondType.TRIPLE;
  }

  /**
   * Check if this is an aromatic bond
   */
  isAromatic(): boolean {
    return this.type === BondType.AROMATIC;
  }

  /**
   * Check if this bond has wedge/hash stereochemistry
   */
  hasStereo(): boolean {
    return this.chirality !== BondChirality.NONE;
  }

  /**
   * Check if this is a wedge bond
   */
  isWedge(): boolean {
    return this.chirality === BondChirality.WEDGE;
  }

  /**
   * Check if this is a hash bond
   */
  isHash(): boolean {
    return this.chirality === BondChirality.HASH;
  }

  /**
   * Check if this has E/Z conformation specified
   */
  hasConformation(): boolean {
    return this.conformation !== BondConformation.NONE;
  }

  /**
   * Get the other atom ID given one atom ID
   */
  getOtherAtom(atomId: number): number {
    if (atomId === this.atomId1) {
      return this.atomId2;
    } else if (atomId === this.atomId2) {
      return this.atomId1;
    } else {
      throw new Error(`Atom ${atomId} is not part of this bond`);
    }
  }

  /**
   * Set bond type
   */
  setType(type: BondType): void {
    this.type = type;
    this.validateConformation();
  }

  /**
   * Set chirality (wedge/hash)
   */
  setChirality(chirality: BondChirality): void {
    this.chirality = chirality;
  }

  /**
   * Set E/Z conformation
   */
  setConformation(conformation: BondConformation): void {
    this.conformation = conformation;
    this.validateConformation();
  }

  /**
   * Create a copy of this bond
   */
  clone(): Bond {
    return new Bond(this.atomId1, this.atomId2, this.type, this.chirality, this.conformation);
  }

  /**
   * Convert bond type enum to string
   */
  static typeToString(type: BondType): string {
    switch (type) {
      case BondType.SINGLE:
        return 'single';
      case BondType.DOUBLE:
        return 'double';
      case BondType.TRIPLE:
        return 'triple';
      case BondType.AROMATIC:
        return 'aromatic';
      default:
        return 'unknown';
    }
  }

  /**
   * Convert chirality enum to string
   */
  static chiralityToString(chirality: BondChirality): string {
    switch (chirality) {
      case BondChirality.NONE:
        return 'none';
      case BondChirality.WEDGE:
        return 'wedge';
      case BondChirality.HASH:
        return 'hash';
      case BondChirality.EITHER:
        return 'either';
      default:
        return 'unknown';
    }
  }

  /**
   * Convert conformation enum to string
   */
  static conformationToString(conformation: BondConformation): string {
    switch (conformation) {
      case BondConformation.NONE:
        return 'none';
      case BondConformation.E:
        return 'E';
      case BondConformation.Z:
        return 'Z';
      case BondConformation.EITHER:
        return 'either';
      default:
        return 'unknown';
    }
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): {
    atomId1: number;
    atomId2: number;
    type: number;
    chirality: number;
    conformation: number;
    typeString: string;
    chiralityString: string;
    conformationString: string;
  } {
    return {
      atomId1: this.atomId1,
      atomId2: this.atomId2,
      type: this.type,
      chirality: this.chirality,
      conformation: this.conformation,
      typeString: Bond.typeToString(this.type),
      chiralityString: Bond.chiralityToString(this.chirality),
      conformationString: Bond.conformationToString(this.conformation),
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    const typeStr = Bond.typeToString(this.type);
    const chiralityStr =
      this.chirality === BondChirality.NONE
        ? ''
        : ` ${Bond.chiralityToString(this.chirality)}`;
    const conformationStr =
      this.conformation === BondConformation.NONE
        ? ''
        : ` ${Bond.conformationToString(this.conformation)}`;

    return `Bond(${this.atomId1}-${this.atomId2}, ${typeStr}${chiralityStr}${conformationStr})`;
  }
}
