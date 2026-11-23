# DrawingConfig - Central Configuration Guide

## What It Does

**DrawingConfig** is the single source of truth for all drawing settings in a session. It ensures that all components (layout generators, renderers, drawers) use **consistent bond lengths and styles**.

```
DrawingConfig
├── bondLength: 30px       ← Used by CoordinateGenerator AND BondDrawer
├── atomRadius: 20px       ← Used by AtomDrawer and hit testing
├── style: DrawingStyle    ← Colors, fonts, line widths
├── layoutStrategy         ← Which algorithm to use
└── renderingOptions       ← Quality, antialiasing, interaction settings
```

---

## Before: Inconsistency Problem ❌

```typescript
// OLD: Each class had its own bond length
const coordGen = new CoordinateGenerator(30);      // 30 pixels
const renderer = new CanvasRenderer(canvas, 800, 600);  // Unconnected
const drawer = new BondDrawer();                   // Unconnected

// Problem: If you want to change bond length, you have to update:
// - CoordinateGenerator constructor
// - All calculations in BondDrawer manually
// - No way to switch themes mid-session
```

## After: Unified Configuration ✅

```typescript
// NEW: Single configuration controls everything
const config = new DrawingConfig({ bondLength: 35 });

const coordGen = new CoordinateGenerator(config);       // Uses config.bondLength
const renderer = new CanvasRenderer(canvas, 800, 600, config);  // Uses config.style
const drawer = new BondDrawer(config);                 // Uses config.style

// Consistency: Change config once, everything updates
// Switch themes: config.setStyle(DrawingStyle.darkTheme())
```

---

## Complete API

### Creating a Config

```typescript
// Default (30px bonds, light theme)
const config = new DrawingConfig();

// Custom settings
const config = new DrawingConfig({
  bondLength: 35,
  atomRadius: 25,
  style: DrawingStyle.publicationTheme(),
  layoutStrategy: 'organic',
  useAntiAlias: true,
  renderQuality: 'high'
});

// Preset configurations
const pubConfig = DrawingConfig.publication(35);     // 35px publication-quality
const colorConfig = DrawingConfig.colorful(40);      // Colorful elements
const interactConfig = DrawingConfig.interactive(40);  // With selection/hover
const darkConfig = DrawingConfig.dark(30);           // Dark theme
const fastConfig = DrawingConfig.minimal(25);        // Fast, low quality
```

### Using a Config

```typescript
// Pass to components
const coordGen = new CoordinateGenerator(config);
const renderer = new CanvasRenderer(canvas, 800, 600, config);
const bondDrawer = new BondDrawer(config);
const atomDrawer = new AtomDrawer(config);  // Coming next
const molDrawer = new MoleculeDrawer(config);  // Coming next

// All use same settings automatically
```

### Modifying a Config

```typescript
// Update bond length (affects CoordinateGenerator)
config.setBondLength(40);

// Update atom radius (affects hit testing)
config.setAtomRadius(25);

// Switch layout algorithm
config.setLayoutStrategy('tree');

// Switch theme
config.setStyle(DrawingStyle.darkTheme());

// Enable interaction
config.setInteraction(true, 'both');

// Chainable API
config
  .setBondLength(35)
  .setAtomRadius(25)
  .setInteraction(true)
  .setLayoutStrategy('organic');
```

### Cloning and Overriding

```typescript
// Clone with overrides (doesn't modify original)
const darkConfig = config.clone({ 
  style: DrawingStyle.darkTheme(),
  bondLength: 40
});

// Update in-place
config.update({
  bondLength: 35,
  useAntiAlias: false
});
```

---

## Complete Example: Unified Drawing Session

```typescript
import { Molecule, PeriodicTable } from './core';
import {
  DrawingConfig,
  DrawingStyle,
  CoordinateGenerator,
  CanvasRenderer,
  BondDrawer,
  Point2D
} from './draw';

// 1. Create config (single source of truth)
const config = DrawingConfig.publication(35);

// 2. Create molecule
const ethane = new Molecule('Ethane');
const C = PeriodicTable.getElement(6);
const c1 = ethane.addAtom(C, new Point2D(0, 0));
const c2 = ethane.addAtom(C, new Point2D(1.5, 0));
ethane.addBondBetween(c1.id, c2.id);

// 3. Generate 2D layout using config
const coordGen = new CoordinateGenerator(config);
const coords = coordGen.generateCoordinates(ethane);
// ✅ Uses config.bondLength (35px)
// ✅ Uses config.layoutStrategy ('organic')

// 4. Create renderer using config
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas, 800, 600, config);
// ✅ Uses config.style (publication theme)
// ✅ Uses config.renderQuality ('high')

// 5. Create drawers using config
const bondDrawer = new BondDrawer(config);
// ✅ Uses config.style

// 6. Draw the molecule
renderer.clear();

// Draw bonds
for (const bond of ethane.getBonds()) {
  const from = coords.get(bond.atomId1)!;
  const to = coords.get(bond.atomId2)!;
  bondDrawer.draw(bond, from, to, renderer);
}

// 7. Switch to dark theme (one line!)
config.setStyle(DrawingStyle.darkTheme());
renderer.clear();  // Redraw with new colors

// Everything automatically uses the new theme
for (const bond of ethane.getBonds()) {
  const from = coords.get(bond.atomId1)!;
  const to = coords.get(bond.atomId2)!;
  bondDrawer.draw(bond, from, to, renderer);  // ✅ Uses dark theme automatically
}

renderer.render();

// 8. Export
const png = await renderer.exportPNG();
renderer.saveAsFile('ethane.png');
```

---

## Preset Configurations

### Publication Theme
```typescript
const config = DrawingConfig.publication(30);
// Perfect for scientific papers and presentations
// - High quality (high antialiasing)
// - Black on white
// - Large, readable bonds
// - All implicit hydrogens shown
```

### Colorful Theme
```typescript
const config = DrawingConfig.colorful(35);
// Great for teaching and visualization
// - Element colors (CPK coloring)
// - Larger atoms and bonds
// - Colorful and engaging
```

### Interactive Theme
```typescript
const config = DrawingConfig.interactive(40);
// For editing and interaction
// - Larger hit targets
// - Selection highlighting enabled
// - Hover effects enabled
// - Optimal for mouse/touch input
```

### Dark Theme
```typescript
const config = DrawingConfig.dark(30);
// For dark mode applications
// - White on dark background
// - Reduces eye strain
// - Professional appearance
```

### Minimal/Fast Theme
```typescript
const config = DrawingConfig.minimal(25);
// For large molecules with many atoms
// - Fast rendering (no antialiasing)
// - Low quality, smaller bonds
// - Optimized for performance
```

---

## Architecture: Unified Flow

```
┌─────────────────────────────────┐
│    DrawingConfig (Single Source) │
├─────────────────────────────────┤
│ bondLength: 35                  │
│ atomRadius: 25                  │
│ style: DrawingStyle             │
│ layoutStrategy: 'organic'       │
│ renderQuality: 'high'           │
└────────┬────────────────────────┘
         │
    ┌────┴────┬──────────┬────────┬─────────┐
    │          │          │        │         │
    ▼          ▼          ▼        ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐
│CoordGen│ │Renderer│ │Bond   │ │Atom  │ │Mol   │
│        │ │        │ │Drawer │ │Drawer│ │Drawer│
│bondLen │ │style   │ │style  │ │radius│ │all   │
└────────┘ └────────┘ └────────┘ └──────┘ └──────┘
```

---

## Settings Reference

| Setting | Type | Default | Used By |
|---------|------|---------|---------|
| bondLength | number | 30 | CoordinateGenerator, BondDrawer spacing |
| atomRadius | number | 20 | AtomDrawer, hit testing |
| style | DrawingStyle | lightTheme() | All renderers and drawers |
| layoutStrategy | string | 'organic' | CoordinateGenerator |
| useAntiAlias | boolean | true | CanvasRenderer |
| renderQuality | string | 'high' | Renderer optimization |
| enableInteraction | boolean | false | InteractionHandler |
| selectionMode | string | 'both' | InteractionHandler |
| hoverEnabled | boolean | true | InteractionHandler |

---

## Key Benefits

✅ **Single Configuration Point** - Change settings once, affects everywhere  
✅ **Consistency Guaranteed** - All components use same bond length  
✅ **Easy Theme Switching** - One method call to change appearance  
✅ **Flexible Presets** - Common configurations ready to use  
✅ **Chainable API** - Build configs fluently  
✅ **Cloneable** - Create variants without affecting original  
✅ **Extensible** - Easy to add new settings  

---

## When to Use Each Preset

| Scenario | Preset | Why |
|----------|--------|-----|
| Scientific paper | `publication()` | Publication quality, high resolution |
| Teaching materials | `colorful()` | Engaging colors, large bonds |
| Interactive editor | `interactive()` | Larger hit targets, visual feedback |
| Dark UI | `dark()` | Appropriate colors for dark background |
| Large molecules (1000+ atoms) | `minimal()` | Fast rendering |
| Custom needs | `new DrawingConfig({...})` | Full control |

---

## Migration from Old Code

**Old (Before):**
```typescript
const coordGen = new CoordinateGenerator(30);
const renderer = new CanvasRenderer(canvas, 800, 600);
const drawer = new BondDrawer();
```

**New (After):**
```typescript
const config = new DrawingConfig({ bondLength: 30 });
const coordGen = new CoordinateGenerator(config);
const renderer = new CanvasRenderer(canvas, 800, 600, config);
const drawer = new BondDrawer(config);
```

That's it! All components now use consistent settings.

---

**Status:** ✅ DrawingConfig complete and integrated  
**Version:** 1.0.0  
**Last Updated:** 2026-09-16
