/**
 * Represents a chemical element with its properties
 */
export class Element {
  readonly atomicNumber: number;
  readonly symbol: string;
  readonly name: string;
  readonly atomicWeight: number;
  readonly potentialBonds: number[]; // typical valences/bond counts
  readonly potentialCharges: number[]; // possible oxidation states

  constructor(
    atomicNumber: number,
    symbol: string,
    name: string,
    atomicWeight: number,
    potentialBonds: number[],
    potentialCharges: number[]
  ) {
    this.atomicNumber = atomicNumber;
    this.symbol = symbol;
    this.name = name;
    this.atomicWeight = atomicWeight;
    this.potentialBonds = potentialBonds;
    this.potentialCharges = potentialCharges;
  }

  /**
   * Get default valence (most common bond count)
   */
  getDefaultValence(): number {
    return this.potentialBonds[0] ?? 0;
  }

  /**
   * Check if a valence value is valid for this element
   */
  isValidValence(bondCount: number): boolean {
    return this.potentialBonds.includes(bondCount);
  }

  /**
   * Check if a charge is valid for this element
   */
  isValidCharge(charge: number): boolean {
    return this.potentialCharges.includes(charge);
  }
}

/**
 * Periodic Table - loaded at initialization
 * Contains all common elements with their properties
 */
export class PeriodicTable {
  private static instance: PeriodicTable;
  private elements: Map<number, Element> = new Map();
  private elementsBySymbol: Map<string, Element> = new Map();

  private constructor() {
    this.loadPeriodicTable();
  }

  static getInstance(): PeriodicTable {
    if (!PeriodicTable.instance) {
      PeriodicTable.instance = new PeriodicTable();
    }
    return PeriodicTable.instance;
  }

  private loadPeriodicTable(): void {
    const elements = [
      // H
      new Element(1, 'H', 'Hydrogen', 1.008, [1], [-1, 0, 1]),
      // C
      new Element(6, 'C', 'Carbon', 12.011, [4], [-4, -3, -2, -1, 0, 1, 2, 3, 4]),
      // N
      new Element(7, 'N', 'Nitrogen', 14.007, [3, 4, 5], [-3, -2, -1, 0, 1, 2, 3, 4, 5]),
      // O
      new Element(8, 'O', 'Oxygen', 15.999, [2], [-2, -1, 0, 1, 2]),
      // F
      new Element(9, 'F', 'Fluorine', 18.998, [1], [-1, 0]),
      // P
      new Element(15, 'P', 'Phosphorus', 30.974, [3, 5], [-3, -2, -1, 0, 1, 2, 3, 4, 5]),
      // S
      new Element(16, 'S', 'Sulfur', 32.06, [2, 4, 6], [-2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // Cl
      new Element(17, 'Cl', 'Chlorine', 35.45, [1], [-1, 0, 1, 3, 5, 7]),
      // Br
      new Element(35, 'Br', 'Bromine', 79.904, [1], [-1, 0, 1, 3, 5, 7]),
      // I
      new Element(53, 'I', 'Iodine', 126.90, [1], [-1, 0, 1, 3, 5, 7]),
      // B
      new Element(5, 'B', 'Boron', 10.811, [3, 4], [-1, 0, 1, 2, 3, 4]),
      // Si
      new Element(14, 'Si', 'Silicon', 28.085, [4], [-4, -3, -2, -1, 0, 1, 2, 3, 4]),
      // Na
      new Element(11, 'Na', 'Sodium', 22.990, [1], [-1, 0, 1]),
      // K
      new Element(19, 'K', 'Potassium', 39.098, [1], [-1, 0, 1]),
      // Ca
      new Element(20, 'Ca', 'Calcium', 40.078, [2], [0, 1, 2]),
      // Mg
      new Element(12, 'Mg', 'Magnesium', 24.305, [2], [0, 1, 2]),
      // Fe
      new Element(26, 'Fe', 'Iron', 55.845, [2, 3], [-2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // Cu
      new Element(29, 'Cu', 'Copper', 63.546, [1, 2], [-1, 0, 1, 2, 3]),
      // Zn
      new Element(30, 'Zn', 'Zinc', 65.38, [2], [0, 1, 2]),
      // Sn
      new Element(50, 'Sn', 'Tin', 118.71, [2, 4], [-4, -2, 0, 1, 2, 3, 4]),
      // Pb
      new Element(82, 'Pb', 'Lead', 207.2, [2, 4], [-4, -3, -2, -1, 0, 1, 2, 3, 4]),
      // Al
      new Element(13, 'Al', 'Aluminum', 26.982, [3], [-3, -2, -1, 0, 1, 2, 3]),
      // Li
      new Element(3, 'Li', 'Lithium', 6.941, [1], [-1, 0, 1]),
      // Be
      new Element(4, 'Be', 'Beryllium', 9.012, [2], [0, 1, 2]),
      // Ni
      new Element(28, 'Ni', 'Nickel', 58.693, [2], [-1, 0, 1, 2, 3, 4]),
      // Co
      new Element(27, 'Co', 'Cobalt', 58.933, [2, 3], [-3, -1, 0, 1, 2, 3, 4, 5]),
      // Hg
      new Element(80, 'Hg', 'Mercury', 200.59, [1, 2], [0, 1, 2, 3, 4]),
      // Ag
      new Element(47, 'Ag', 'Silver', 107.87, [1], [-1, 0, 1, 2, 3]),
      // Au
      new Element(79, 'Au', 'Gold', 196.97, [1, 3], [-3, -2, -1, 0, 1, 2, 3, 4, 5]),
      // Cr
      new Element(24, 'Cr', 'Chromium', 51.996, [2, 3, 6], [-2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // Mn
      new Element(25, 'Mn', 'Manganese', 54.938, [2, 3, 4, 5, 6, 7], [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]),
      // Mo
      new Element(42, 'Mo', 'Molybdenum', 95.96, [3, 4, 5, 6], [-4, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // W
      new Element(74, 'W', 'Tungsten', 183.84, [2, 3, 4, 5, 6], [-4, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // V
      new Element(23, 'V', 'Vanadium', 50.942, [2, 3, 4, 5], [-3, -1, 0, 1, 2, 3, 4, 5]),
      // Ti
      new Element(22, 'Ti', 'Titanium', 47.867, [2, 3, 4], [-2, -1, 0, 1, 2, 3, 4]),
      // Zr
      new Element(40, 'Zr', 'Zirconium', 91.224, [2, 3, 4], [-2, -1, 0, 1, 2, 3, 4]),
      // Nb
      new Element(41, 'Nb', 'Niobium', 92.906, [2, 3, 4, 5], [-3, -1, 0, 1, 2, 3, 4, 5]),
      // Tc
      new Element(43, 'Tc', 'Technetium', 98, [4, 5, 6, 7], [-3, -1, 0, 1, 2, 3, 4, 5, 6, 7]),
      // Ru
      new Element(44, 'Ru', 'Ruthenium', 101.07, [2, 3, 4, 5, 6, 8], [-4, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8]),
      // Rh
      new Element(45, 'Rh', 'Rhodium', 102.91, [2, 3, 4, 5, 6], [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // Pd
      new Element(46, 'Pd', 'Palladium', 106.42, [2, 3, 4], [-2, -1, 0, 1, 2, 3, 4]),
      // Re
      new Element(75, 'Re', 'Rhenium', 186.21, [2, 3, 4, 5, 6, 7], [-3, -1, 0, 1, 2, 3, 4, 5, 6, 7]),
      // Os
      new Element(76, 'Os', 'Osmium', 190.23, [2, 3, 4, 5, 6, 8], [-4, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8]),
      // Ir
      new Element(77, 'Ir', 'Iridium', 192.22, [2, 3, 4, 5, 6], [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // Pt
      new Element(78, 'Pt', 'Platinum', 195.08, [2, 3, 4, 5, 6], [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
      // As
      new Element(33, 'As', 'Arsenic', 74.922, [3, 5], [-3, -2, -1, 0, 1, 2, 3, 4, 5]),
      // Se
      new Element(34, 'Se', 'Selenium', 78.971, [2, 4, 6], [-2, -1, 0, 1, 2, 4, 6]),
      // Remaining elements, so the table is complete (1-118).
      // Superheavy elements (109+) have no established chemistry: valence 0, charge 0.
      new Element(2, 'He', 'Helium', 4.0026, [0], [0]),
      new Element(10, 'Ne', 'Neon', 20.180, [0], [0]),
      new Element(18, 'Ar', 'Argon', 39.948, [0], [0]),
      new Element(21, 'Sc', 'Scandium', 44.956, [3], [0, 1, 2, 3]),
      new Element(31, 'Ga', 'Gallium', 69.723, [3], [-1, 0, 1, 2, 3]),
      new Element(32, 'Ge', 'Germanium', 72.630, [4], [-4, 0, 1, 2, 3, 4]),
      new Element(36, 'Kr', 'Krypton', 83.798, [0], [0, 2]),
      new Element(37, 'Rb', 'Rubidium', 85.468, [1], [-1, 0, 1]),
      new Element(38, 'Sr', 'Strontium', 87.62, [2], [0, 1, 2]),
      new Element(39, 'Y', 'Yttrium', 88.906, [3], [0, 1, 2, 3]),
      new Element(48, 'Cd', 'Cadmium', 112.41, [2], [0, 1, 2]),
      new Element(49, 'In', 'Indium', 114.82, [3], [-1, 0, 1, 2, 3]),
      new Element(51, 'Sb', 'Antimony', 121.76, [3, 5], [-3, 0, 3, 5]),
      new Element(52, 'Te', 'Tellurium', 127.60, [2, 4, 6], [-2, 0, 2, 4, 6]),
      new Element(54, 'Xe', 'Xenon', 131.29, [0, 2, 4, 6], [0, 2, 4, 6, 8]),
      new Element(55, 'Cs', 'Caesium', 132.91, [1], [-1, 0, 1]),
      new Element(56, 'Ba', 'Barium', 137.33, [2], [0, 1, 2]),
      new Element(57, 'La', 'Lanthanum', 138.91, [3], [0, 1, 2, 3]),
      new Element(58, 'Ce', 'Cerium', 140.12, [3, 4], [0, 2, 3, 4]),
      new Element(59, 'Pr', 'Praseodymium', 140.91, [3], [0, 2, 3, 4]),
      new Element(60, 'Nd', 'Neodymium', 144.24, [3], [0, 2, 3, 4]),
      new Element(61, 'Pm', 'Promethium', 145, [3], [0, 2, 3]),
      new Element(62, 'Sm', 'Samarium', 150.36, [3], [0, 2, 3]),
      new Element(63, 'Eu', 'Europium', 151.96, [3, 2], [0, 2, 3]),
      new Element(64, 'Gd', 'Gadolinium', 157.25, [3], [0, 1, 2, 3]),
      new Element(65, 'Tb', 'Terbium', 158.93, [3], [0, 1, 2, 3, 4]),
      new Element(66, 'Dy', 'Dysprosium', 162.50, [3], [0, 2, 3, 4]),
      new Element(67, 'Ho', 'Holmium', 164.93, [3], [0, 2, 3]),
      new Element(68, 'Er', 'Erbium', 167.26, [3], [0, 2, 3]),
      new Element(69, 'Tm', 'Thulium', 168.93, [3], [0, 2, 3]),
      new Element(70, 'Yb', 'Ytterbium', 173.05, [3], [0, 2, 3]),
      new Element(71, 'Lu', 'Lutetium', 174.97, [3], [0, 2, 3]),
      new Element(72, 'Hf', 'Hafnium', 178.49, [4], [-2, 0, 1, 2, 3, 4]),
      new Element(73, 'Ta', 'Tantalum', 180.95, [5], [-3, -1, 0, 1, 2, 3, 4, 5]),
      new Element(81, 'Tl', 'Thallium', 204.38, [1, 3], [-1, 0, 1, 3]),
      new Element(83, 'Bi', 'Bismuth', 208.98, [3, 5], [-3, 0, 1, 2, 3, 5]),
      new Element(84, 'Po', 'Polonium', 209, [2, 4], [-2, 0, 2, 4, 6]),
      new Element(85, 'At', 'Astatine', 210, [1], [-1, 0, 1, 3, 5, 7]),
      new Element(86, 'Rn', 'Radon', 222, [0], [0, 2, 6]),
      new Element(87, 'Fr', 'Francium', 223, [1], [0, 1]),
      new Element(88, 'Ra', 'Radium', 226, [2], [0, 2]),
      new Element(89, 'Ac', 'Actinium', 227, [3], [0, 3]),
      new Element(90, 'Th', 'Thorium', 232.04, [4], [0, 1, 2, 3, 4]),
      new Element(91, 'Pa', 'Protactinium', 231.04, [5], [0, 2, 3, 4, 5]),
      new Element(92, 'U', 'Uranium', 238.03, [6, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]),
      new Element(93, 'Np', 'Neptunium', 237, [5], [0, 2, 3, 4, 5, 6, 7]),
      new Element(94, 'Pu', 'Plutonium', 244, [4], [0, 2, 3, 4, 5, 6, 7, 8]),
      new Element(95, 'Am', 'Americium', 243, [3], [0, 2, 3, 4, 5, 6, 7]),
      new Element(96, 'Cm', 'Curium', 247, [3], [0, 3, 4, 6]),
      new Element(97, 'Bk', 'Berkelium', 247, [3], [0, 2, 3, 4]),
      new Element(98, 'Cf', 'Californium', 251, [3], [0, 2, 3, 4]),
      new Element(99, 'Es', 'Einsteinium', 252, [3], [0, 2, 3, 4]),
      new Element(100, 'Fm', 'Fermium', 257, [3], [0, 2, 3]),
      new Element(101, 'Md', 'Mendelevium', 258, [3], [0, 2, 3]),
      new Element(102, 'No', 'Nobelium', 259, [2], [0, 2, 3]),
      new Element(103, 'Lr', 'Lawrencium', 266, [3], [0, 3]),
      new Element(104, 'Rf', 'Rutherfordium', 267, [4], [0, 4]),
      new Element(105, 'Db', 'Dubnium', 268, [5], [0, 5]),
      new Element(106, 'Sg', 'Seaborgium', 269, [6], [0, 6]),
      new Element(107, 'Bh', 'Bohrium', 270, [7], [0, 7]),
      new Element(108, 'Hs', 'Hassium', 277, [8], [0, 8]),
      new Element(109, 'Mt', 'Meitnerium', 278, [0], [0]),
      new Element(110, 'Ds', 'Darmstadtium', 281, [0], [0]),
      new Element(111, 'Rg', 'Roentgenium', 282, [0], [0]),
      new Element(112, 'Cn', 'Copernicium', 285, [0], [0]),
      new Element(113, 'Nh', 'Nihonium', 286, [0], [0]),
      new Element(114, 'Fl', 'Flerovium', 289, [0], [0]),
      new Element(115, 'Mc', 'Moscovium', 290, [0], [0]),
      new Element(116, 'Lv', 'Livermorium', 293, [0], [0]),
      new Element(117, 'Ts', 'Tennessine', 294, [0], [0]),
      new Element(118, 'Og', 'Oganesson', 294, [0], [0]),
    ];

    for (const element of elements) {
      this.elements.set(element.atomicNumber, element);
      this.elementsBySymbol.set(element.symbol.toUpperCase(), element);
    }
  }

  /**
   * Get element by atomic number
   */
  getByNumber(atomicNumber: number): Element | undefined {
    return this.elements.get(atomicNumber);
  }

  /**
   * Get element by symbol (case-insensitive)
   */
  getBySymbol(symbol: string): Element | undefined {
    return this.elementsBySymbol.get(symbol.toUpperCase());
  }

  /**
   * Get all elements
   */
  getAllElements(): Element[] {
    return Array.from(this.elements.values()).sort((a, b) => a.atomicNumber - b.atomicNumber);
  }

  /**
   * Get all element symbols
   */
  getAllSymbols(): string[] {
    return Array.from(this.elements.values()).map((e) => e.symbol).sort();
  }

  /**
   * Check if an element exists by symbol
   */
  hasSymbol(symbol: string): boolean {
    return this.elementsBySymbol.has(symbol.toUpperCase());
  }
}

// Export singleton instance
export const periodicTable = PeriodicTable.getInstance();
