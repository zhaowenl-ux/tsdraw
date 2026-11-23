# TSDraw

A modern TypeScript library for working with chemical structures and molecular representations. TSDraw provides robust data structures for building chemistry applications, from simple molecule visualization to complex pharmaceutical formulations.

**Version:** 0.1.0  
**Status:** Active Development (Phase 1 complete)

---

## Features

### ✅ Core Chemistry Classes
- **Element** – Full periodic table with atomic properties (atomic number, weight, valence, common charges)
- **Atom** – Represents atoms with position (3D), charge, and element reference
- **Bond** – Models chemical bonds with types (single, double, triple, aromatic) and stereochemistry
- **Molecule** – Container for atoms and bonds with formula generation, weight calculation
- **Complex** – Multi-component systems (salts, hydrates, cocrystals, protein-ligand complexes)
- **Vector3D** – 3D geometry operations for molecular coordinates

### 🎯 Bond Features
- **Bond Types:** Single, double, triple, aromatic
- **Chirality:** Wedge, hash, either (3D stereochemistry representation)
- **Conformation:** E/Z notation for double bonds, cis/trans specification
- **Serialization:** Full JSON support for import/export

### 📦 Complex Systems
- Multi-component molecules (e.g., NaCl·H₂O)
- Salt forms and counterion tracking
- Hydrate and solvent component management
- Role-based component classification
- Formula and weight calculations for assemblies

---

## Installation

### Prerequisites
- Node.js 16+ 
- npm 7+

### Setup

```bash
# Clone or navigate to the project
cd tsdraw

# Install dependencies
npm install

# Run development server (with Vite)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Preview production build
npm run preview
```

---

## Quick Start

### Basic Usage

```typescript
import { PeriodicTable, Vector3D, Molecule } from 'tsdraw';

// Create a molecule
const ethanol = new Molecule('Ethanol', 'C₂H₆O');

// Get elements from the periodic table
const C = PeriodicTable.getElement(6);  // Carbon
const H = PeriodicTable.getElement(1);  // Hydrogen
const O = PeriodicTable.getElement(8);  // Oxygen

// Add atoms to the molecule
const c1 = ethanol.addAtom(C, new Vector3D(0, 0, 0));
const c2 = ethanol.addAtom(C, new Vector3D(1.5, 0, 0));
const o = ethanol.addAtom(O, new Vector3D(3, 0, 0));

// Add bonds
ethanol.addBondBetween(c1.id, c2.id);  // Single bond C-C
ethanol.addBondBetween(c2.id, o.id);   // Single bond C-O

// Query the molecule
console.log(ethanol.getFormula());           // "C2H6O"
console.log(ethanol.getMolecularWeight());   // ~46.07 g/mol
console.log(ethanol.getAtomCount());         // 3
console.log(ethanol.getBondCount());         // 2
console.log(ethanol.toString());             // Molecule "Ethanol" (C2H6O, 3 atoms, 2 bonds)
```

### Working with Bonds

```typescript
import { BondType, BondChirality } from 'tsdraw';

// Create a bond with specific properties
const bond = ethanol.addBondBetween(
  c1.id, 
  c2.id,
  BondType.DOUBLE,      // Double bond
  BondChirality.WEDGE,  // Wedge stereochemistry
);

// Check bond properties
if (bond.isDouble()) {
  console.log('This is a double bond');
}

// Get the other atom in a bond
const otherAtom = bond.getOtherAtom(c1.id);  // Returns c2

// Modify atoms connected to this atom
const connected = ethanol.getConnectedAtoms(c1.id);
```

### Complex Systems (Salts, Hydrates, Cocrystals)

```typescript
import { Complex, MoleculeComponent, MoleculeRole } from 'tsdraw';

// Create molecules for each component
const apiMolecule = new Molecule('Ibuprofen', 'Active Pharmaceutical Ingredient');
const hclMolecule = new Molecule('HCl', 'Hydrochloride counter-ion');
const waterMolecule = new Molecule('H2O', 'Hydration water');

// Create components with roles and stoichiometry
const apiComponent = new MoleculeComponent(
  apiMolecule,
  MoleculeRole.PARENT,  // Primary drug molecule
  1                      // 1 molecule of API
);

const saltComponent = new MoleculeComponent(
  hclMolecule,
  MoleculeRole.SALT,    // Counter-ion or salt form
  1                      // 1 mole of HCl
);

const hydrateComponent = new MoleculeComponent(
  waterMolecule,
  MoleculeRole.HYDRATE,  // Water of crystallization
  2                       // 2 moles of H2O (monohydrate)
);

// Build the complex
const complex = new Complex('Ibuprofen HCl dihydrate', 'Crystalline salt form');
complex.addComponent(apiComponent);
complex.addComponent(saltComponent);
complex.addComponent(hydrateComponent);

// Query complex properties
console.log(complex.getComplexFormula());     // "C13H18O2·HCl·2H2O"
console.log(complex.getTotalWeight());        // Combined molecular weight
console.log(complex.getHydrationNumber());    // 2
console.log(complex.isSalt());                // true
console.log(complex.isHydrate());             // true
console.log(complex.toString());              // Complex "Ibuprofen HCl dihydrate" (...)
```

### Exporting and Serialization

```typescript
// Convert molecule to JSON
const jsonData = ethanol.toJSON();
// {
//   name: 'Ethanol',
//   description: 'C₂H₆O',
//   formula: 'C2H6O',
//   molecularWeight: 46.06844,
//   totalCharge: 0,
//   atoms: [...],
//   bonds: [...]
// }

// Convert complex to JSON
const complexJson = complex.toJSON();
// {
//   name: 'Ibuprofen HCl dihydrate',
//   description: '...',
//   complexFormula: 'C13H18O2·HCl·2H2O',
//   componentCount: 3,
//   totalWeight: ...,
//   totalCharge: 0,
//   totalAtoms: ...,
//   totalBonds: ...,
//   isHydrate: true,
//   isSalt: true,
//   hydrationNumber: 2,
//   components: [...]
// }

// Export to JSON string
const jsonString = JSON.stringify(ethanol, null, 2);
```

---

## API Reference

### Core Classes

#### `Element`
Represents a chemical element from the periodic table.

```typescript
// Access the periodic table
const carbon = PeriodicTable.getElement(6);
const hydrogen = PeriodicTable.getElement(1);

// Properties
console.log(carbon.atomicNumber);      // 6
console.log(carbon.symbol);            // "C"
console.log(carbon.name);              // "Carbon"
console.log(carbon.atomicWeight);      // 12.011
console.log(carbon.valence);           // 4
console.log(carbon.commonCharges);     // [0]
```

#### `Vector3D`
3D coordinate vector for atomic positions.

```typescript
const pos1 = new Vector3D(1, 2, 3);
const pos2 = new Vector3D(4, 5, 6);

// Operations
const distance = pos1.distanceTo(pos2);
const midpoint = pos1.midpoint(pos2);
const clone = pos1.clone();
```

#### `Atom`
Individual atom within a molecule.

```typescript
const atom = molecule.addAtom(
  element,                         // Element object
  new Vector3D(0, 0, 0),          // Position in 3D space
  0,                               // Formal charge (optional)
  42                               // Atom ID (optional, auto-generated)
);

// Properties
console.log(atom.id);              // Unique atom ID
console.log(atom.element);         // Element object
console.log(atom.position);        // Vector3D
console.log(atom.charge);          // Formal charge
console.log(atom.getSymbol());     // Element symbol
```

#### `Bond`
Bond between two atoms.

```typescript
const bond = new Bond(
  atomId1,
  atomId2,
  BondType.SINGLE,           // Bond type
  BondChirality.NEITHER,     // Stereochemistry
  BondConformation.NONE      // Double bond conformation
);

// Methods
bond.connects(atomId1, atomId2);        // boolean
bond.getOtherAtom(atomId);              // number (other atom ID)
bond.isSingle();                        // boolean
bond.isDouble();                        // boolean
bond.isTriple();                        // boolean
bond.isAromatic();                      // boolean
bond.toJSON();                          // Serializable object
```

**Bond Types:**
- `SINGLE` (1)
- `DOUBLE` (2)
- `TRIPLE` (3)
- `AROMATIC` (4)

**Chirality:**
- `WEDGE` (1) – Coming out of page
- `HASH` (2) – Going into page
- `EITHER` (3) – Unspecified stereochemistry

**Conformation (Double Bonds):**
- `NONE` (0)
- `E` (1) – E-alkene (trans)
- `Z` (2) – Z-alkene (cis)
- `CIS_TRANS` (3) – Legacy cis/trans notation

#### `Molecule`
Container for atoms and bonds.

```typescript
const mol = new Molecule('Name', 'Description');

// Add/remove atoms
mol.addAtom(element, position, charge, id?);
mol.removeAtom(atomId);

// Query atoms
mol.getAtom(atomId);                  // Atom | undefined
mol.getAtoms();                       // Atom[]
mol.getAtomCount();                   // number
mol.hasAtom(atomId);                  // boolean
mol.getConnectedAtoms(atomId);        // Atom[]

// Add/remove bonds
mol.addBond(bond);                    // Bond
mol.addBondBetween(id1, id2, type?, chirality?, conformation?);  // Bond
mol.removeBond(atomId1, atomId2);     // boolean

// Query bonds
mol.getBond(atomId1, atomId2);        // Bond | undefined
mol.getBonds();                       // Bond[]
mol.getBondCount();                   // number
mol.getBondsForAtom(atomId);          // Bond[]

// Molecular properties
mol.getFormula();                     // string (e.g., "C2H6O")
mol.getMolecularWeight();             // number
mol.getTotalCharge();                 // number

// Utilities
mol.clone(newName?, newDescription?); // Molecule
mol.toJSON();                         // Serializable object
mol.toString();                       // String representation
```

#### `MoleculeComponent`
A component within a multi-component system.

```typescript
const component = new MoleculeComponent(
  molecule,                    // Molecule object
  MoleculeRole.PARENT,        // Role
  1                           // Stoichiometry (moles)
);

// Methods
component.getMolecule();              // Molecule
component.getRole();                  // MoleculeRole
component.getStoichiometry();         // number
component.getFormulaWithStoichiometry(); // string (e.g., "C2H6O·2")
component.getTotalWeight();           // number
component.getTotalCharge();           // number
component.isParent();                 // boolean
component.isSalt();                   // boolean
component.isSolvent();                // boolean
component.clone();                    // MoleculeComponent
component.toJSON();                   // Serializable object
```

**MoleculeRole:**
- `PARENT` – Primary drug/molecule
- `SALT` – Counter-ion or salt form
- `HYDRATE` – Water of crystallization
- `SOLVENT` – Organic or other solvent

#### `Complex`
Multi-component molecular system.

```typescript
const complex = new Complex('Name', 'Description');

// Add/remove components
complex.addComponent(component, id?);
complex.removeComponent(componentId);

// Query components
complex.getComponent(componentId);          // MoleculeComponent | undefined
complex.getComponents();                    // MoleculeComponent[]
complex.getComponentCount();                // number
complex.hasComponent(componentId);          // boolean
complex.getComponentsByRole(role);          // MoleculeComponent[]

// Component types
complex.getParentComponent();               // MoleculeComponent | undefined
complex.getSaltComponents();                // MoleculeComponent[]
complex.getSolventComponents();             // MoleculeComponent[]

// Complex properties
complex.getComplexFormula();                // string (e.g., "C2H6O·HCl·2H2O")
complex.getTotalWeight();                   // number
complex.getTotalCharge();                   // number
complex.getTotalAtomCount();                // number
complex.getTotalBondCount();                // number
complex.getHydrationNumber();               // number

// State queries
complex.isSimple();                         // boolean (only one component)
complex.isHydrate();                        // boolean
complex.isSalt();                           // boolean

// Utilities
complex.clone(newName?, newDescription?);   // Complex
complex.toJSON();                           // Serializable object
complex.toString();                         // String representation
```

---

## Project Structure

```
tsdraw/
├── src/
│   ├── core/                    # Core chemistry classes
│   │   ├── Element.ts           # Chemical elements & periodic table
│   │   ├── Vector3D.ts          # 3D coordinate operations
│   │   ├── Atom.ts              # Individual atoms
│   │   ├── Bond.ts              # Chemical bonds
│   │   ├── Molecule.ts          # Atom & bond containers
│   │   ├── MoleculeComponent.ts # Components in complexes
│   │   ├── Complex.ts           # Multi-component systems
│   │   └── index.ts             # Module exports
│   └── index.ts                 # Package root exports
│
├── tests/                       # Unit tests (Vitest)
│   ├── Element.test.ts
│   ├── Vector3D.test.ts
│   ├── Atom.test.ts
│   ├── Bond.test.ts
│   ├── Molecule.test.ts
│   ├── MoleculeComponent.test.ts
│   └── Complex.test.ts
│
├── dist/                        # Compiled output (Vite)
├── node_modules/                # Dependencies
├── package.json                 # Project metadata & scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite build configuration
├── tsdraw-drawing-ui_2.html     # Sample HTML UI (interactive viewer)
└── README.md                    # This file
```

---

## Development Workflow

### TypeScript & Type Safety
The project uses **TypeScript 5.5+** with strict type checking enabled. All classes and methods have full type annotations.

```typescript
import { Molecule, PeriodicTable, BondType } from 'tsdraw';
// Full autocomplete and type checking in your IDE
```

### Testing with Vitest
Each core class has corresponding test coverage.

```bash
# Run all tests
npm run test

# Run with UI
npm run test -- --ui

# Watch mode
npm run test -- --watch
```

Example test:
```typescript
import { describe, it, expect } from 'vitest';
import { Molecule, PeriodicTable } from 'tsdraw';

describe('Molecule', () => {
  it('should calculate formula correctly', () => {
    const mol = new Molecule();
    const C = PeriodicTable.getElement(6);
    const H = PeriodicTable.getElement(1);
    
    mol.addAtom(C);
    mol.addAtom(H);
    mol.addAtom(H);
    mol.addAtom(H);
    mol.addAtom(H);
    
    expect(mol.getFormula()).toBe('CH4');  // Methane
  });
});
```

### Build Process
Uses **Vite** for fast compilation and bundling:

```bash
# Development server (HMR enabled)
npm run dev       # http://localhost:5173

# Type check + build
npm run build     # Output: dist/

# Preview production build
npm run preview
```

---

## Use Cases

### 1. **Pharmaceutical Research**
- Track drug formulations (salts, hydrates, polymorphs)
- Calculate molecular properties (weight, charge, formula)
- Manage cocrystal systems and complexes

### 2. **Chemistry Education**
- Interactive molecule builder
- Visual representation of structures
- Formula and property calculations

### 3. **Chemical Informatics**
- Data model for chemical structures
- JSON serialization for storage/APIs
- Integration with cheminformatics workflows

### 4. **Computational Chemistry**
- Coordinate management for 3D structures
- Bond topology and stereochemistry
- Foundation for force fields and modeling

---

## Future Roadmap

### Phase 2: Extended Functionality
- [ ] SMILES/InChI format support
- [ ] Aromaticity detection and ring analysis
- [ ] Connectivity and substructure matching
- [ ] 2D coordinate generation
- [ ] Stereochemistry perception

### Phase 3: UI & Visualization
- [ ] Interactive 2D structure editor
- [ ] 3D molecular viewer (Three.js integration)
- [ ] Drag-and-drop bond drawing
- [ ] Undo/redo support
- [ ] SVG export for publication

### Phase 4: Chemistry Tools
- [ ] Molecular descriptor calculations
- [ ] Reaction SMARTS support
- [ ] Property prediction models
- [ ] Spectroscopy data integration
- [ ] Lab experiment tracking

---

## Contributing

This project is in active development. Contributions are welcome!

### Guidelines
1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Use clear commit messages

### Development Setup
```bash
git clone <repo>
cd tsdraw
npm install
npm run dev
# Make changes, test, commit
```

---

## License

MIT License - Free to use in personal and commercial projects.

---

## Resources

- **TypeScript Docs:** https://www.typescriptlang.org/docs/
- **Vitest Guide:** https://vitest.dev/
- **Chemistry Basics:** [NIST Chemistry WebBook](https://webbook.nist.gov/chemistry/)
- **Stereochemistry:** [PubChem Stereochemistry Primer](https://pubchem.ncbi.nlm.nih.gov/)

---

## Changelog

### v0.1.0 (Current)
- ✅ Element and periodic table
- ✅ Vector3D geometry
- ✅ Atom and Bond classes
- ✅ Molecule container
- ✅ MoleculeComponent and Complex
- ✅ Full unit test coverage
- ✅ JSON serialization
- 🎯 Ready for Phase 2 planning

---

## Questions & Support

For issues, questions, or suggestions, please refer to the project documentation or reach out to the development team.

**Happy chemistry coding! 🧪**
