# Drawing System Tasks

## Active

- [ ] **Phase 2A: Foundation Classes**
  - [ ] Create `src/draw` folder structure
  - [ ] Develop `DrawingStyle.ts` - color, font, line width config
  - [ ] Develop `CoordinateGenerator.ts` - convert 3D to 2D layout
  - [ ] Develop `Point2D.ts` - 2D coordinate utilities

- [ ] **Phase 2B: Renderer Abstraction**
  - [ ] Develop `Renderer.ts` - abstract interface
  - [ ] Develop `CanvasRenderer.ts` - HTML5 Canvas implementation
  - [ ] Develop `SVGRenderer.ts` - SVG implementation

- [ ] **Phase 2C: Drawing Components**
  - [ ] Develop `AtomDrawer.ts` - draw individual atoms with labels, charges
  - [ ] Develop `BondDrawer.ts` - draw bonds (single/double/triple/aromatic)
  - [ ] Draw stereochemistry (wedge/hash bonds)

- [ ] **Phase 2D: Molecule Drawing**
  - [ ] Develop `MoleculeDrawer.ts` - orchestrate atom/bond drawing
  - [ ] Implement auto-layout for 2D coordinates
  - [ ] Add bounds calculation and scaling

- [ ] **Phase 2E: Interactive Features**
  - [ ] Develop `InteractionHandler.ts` - click detection, selection
  - [ ] Implement drag-to-move atoms
  - [ ] Implement click-to-add/remove bonds

## Waiting On

## Someday

- [ ] **Phase 3: Advanced Rendering**
  - [ ] Aromaticity ring highlighting
  - [ ] Implicit hydrogen display options
  - [ ] Bond angle/length visualization
  - [ ] 3D molecular viewer (Three.js)

- [ ] **Phase 4: Export & Sharing**
  - [ ] PNG/SVG export
  - [ ] Print support
  - [ ] Copy-to-clipboard
  - [ ] Share via URL

## Done

- [x] ~~Create comprehensive README.md~~ (2026-09-16)
- [x] ~~Define drawing system requirements~~ (2026-09-16)
