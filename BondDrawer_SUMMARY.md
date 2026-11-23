# BondDrawer Class Summary

## What It Does

**BondDrawer** is a high-level API for drawing chemical bonds with all stereochemistry and styling options. It separates the **data model** (core/Bond) from the **visualization** (draw/BondDrawer).

```
core/Bond.ts           →  Stores bond data (atomId1, atomId2, type, chirality)
draw/BondDrawer.ts     →  Renders the bond using any Renderer (Canvas or SVG)
```

---

## Core Method: `draw()`

```typescript
const drawer = new BondDrawer();

drawer.draw(
  bond,           // core/Bond object
  fromPos,        // Point2D (from atom position)
  toPos,          // Point2D (to atom position)
  renderer,       // Renderer (Canvas or SVG)
  style           // DrawingStyle (optional)
);
```

This automatically detects bond type and renders it appropriately:
- **Single, Double, Triple, Aromatic** - Draws correct geometry
- **Wedge/Hash/Wavy** - Renders stereochemistry
- **E/Z Conformation** - Marks directional double bonds

---

## Key Capabilities

### 1️⃣ Bond Types (Automatic Detection)
```typescript
// All handled automatically by draw()
bond.isSingle()   → Regular solid line
bond.isDouble()   → Two parallel lines
bond.isTriple()   → Three parallel lines
bond.isAromatic() → Dashed line
```

### 2️⃣ Stereochemistry (3D Information)
```typescript
// Single bonds with stereochemistry
BondChirality.WEDGE  → Filled triangle (coming toward viewer)
BondChirality.HASH   → Dashed lines (going away from viewer)
BondChirality.EITHER → Wavy line (unspecified)
```

### 3️⃣ Double Bond Conformation (E/Z Notation)
```typescript
// E (trans) vs Z (cis) for double bonds
BondConformation.E        → Trans configuration (label: E)
BondConformation.Z        → Cis configuration (label: Z)
BondConformation.CIS_TRANS → Legacy notation
```

### 4️⃣ Styling & Highlighting
```typescript
// Draw with custom color (for selection, highlighting, etc.)
drawer.drawWithColor(bond, from, to, '#FF0000', renderer);

// Draw with custom width (for emphasis)
drawer.drawWithWidth(bond, from, to, 2.5, renderer);

// Draw with selection highlight
drawer.drawSelected(bond, from, to, renderer);

// Draw with hover highlight
drawer.drawHovered(bond, from, to, renderer);
```

### 5️⃣ Batch Drawing
```typescript
// Draw multiple bonds at once
const bonds = [
  { bond: bond1, fromPos: pos1, toPos: pos2 },
  { bond: bond2, fromPos: pos3, toPos: pos4 },
  { bond: bond3, fromPos: pos5, toPos: pos6 },
];

drawer.drawMultiple(bonds, renderer, style);
```

### 6️⃣ Interactive/Geometry Methods
```typescript
// Hit testing (is point near this bond?)
const isNear = drawer.hitTest(bond, from, to, clickPos, tolerance=5);

// Get closest point on bond to a position
const closest = drawer.getClosestPoint(bond, from, to, point);

// Bond geometry
drawer.getLength(from, to);              // Returns number
drawer.getMidpoint(from, to);            // Returns Point2D
drawer.getAngle(from, to);               // Returns radians
drawer.getAngleDegrees(from, to);        // Returns degrees
drawer.getPerpendicularVector(from, to); // Returns Point2D
```

### 7️⃣ Debug Info
```typescript
const info = drawer.getInfo(bond, from, to);
// Returns:
// {
//   type: "Double",
//   chirality: "Wedge",
//   conformation: "E (trans)",
//   length: 30.5,
//   angle: 45.2
// }
```

---

## Usage Example

```typescript
import { Bond, BondType, BondChirality } from './core';
import { BondDrawer } from './draw';
import { CanvasRenderer, Point2D, DrawingStyle } from './draw';

// Create a double bond with E conformation
const doubleBond = new Bond(0, 1, BondType.DOUBLE);
doubleBond.conformation = BondConformation.E;

// Get canvas and create renderer
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, 800, 600);

// Define bond positions
const fromPos = new Point2D(100, 100);
const toPos = new Point2D(150, 100);

// Draw the bond
const drawer = new BondDrawer();
drawer.draw(doubleBond, fromPos, toPos, renderer);

// Render to canvas
renderer.render();
```

---

## Complete Example: Multiple Bonds

```typescript
import { Molecule, PeriodicTable } from './core';
import { BondDrawer } from './draw';
import { CanvasRenderer, CoordinateGenerator, DrawingStyle, Point2D } from './draw';

// Create ethylene (C=C)
const ethylene = new Molecule('Ethylene');
const C = PeriodicTable.getElement(6);

const c1 = ethylene.addAtom(C, new Point2D(0, 0));
const c2 = ethylene.addAtom(C, new Point2D(1.5, 0));

// Add double bond
const doubleBond = ethylene.addBondBetween(c1.id, c2.id, BondType.DOUBLE);

// Generate 2D layout
const coordGen = new CoordinateGenerator(30);
const coords = coordGen.generateCoordinates(ethylene);

// Render
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, 800, 600);
renderer.clear();

// Draw all bonds
const drawer = new BondDrawer();
for (const bond of ethylene.getBonds()) {
  const from = coords.get(bond.atomId1)!;
  const to = coords.get(bond.atomId2)!;
  drawer.draw(bond, from, to, renderer);
}

renderer.render();
```

---

## Class Statistics

| Property | Value |
|----------|-------|
| Lines of Code | 380+ |
| Methods | 18 |
| Public Methods | 12 |
| Private Methods | 2 |
| Helper Methods | 4 |
| Supports CanvasRenderer | ✅ Yes |
| Supports SVGRenderer | ✅ Yes |
| Zero External Dependencies | ✅ Yes |

---

## Architecture

### Separation of Concerns
```
core/Bond
├─ Data: atomId1, atomId2, type, chirality, conformation
└─ Methods: connects(), getOtherAtom(), toJSON()

draw/BondDrawer
├─ Rendering: draw(), drawSingle(), drawDouble(), etc.
├─ Styling: drawWithColor(), drawSelected(), drawHovered()
├─ Geometry: getLength(), getAngle(), getMidpoint()
└─ Interaction: hitTest(), getClosestPoint()
```

### Key Design Patterns
- **Strategy Pattern** - Different rendering for single/double/triple/aromatic
- **Composition** - Uses Renderer, Point2D, DrawingStyle
- **Abstraction** - Works with any Renderer implementation

---

## Next Steps

With **BondDrawer** complete, we can now build:

1. **AtomDrawer** - Similar high-level API for atoms
2. **MoleculeDrawer** - Orchestrates BondDrawer + AtomDrawer for full molecules
3. **InteractionHandler** - Uses BondDrawer.hitTest() for click detection

---

**Status:** ✅ Complete and ready to use  
**Last Updated:** 2026-09-16
