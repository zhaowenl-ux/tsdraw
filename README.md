# TSDraw

TypeScript-based chemical structure drawing application, built from scratch.

## Project Structure

```
src/
  core/           Core data structures
    Element.ts    Element class and PeriodicTable
    index.ts      Core exports
  index.ts        Root exports

tests/            Unit tests
```

## Development

```bash
npm install
npm run build
npm run test
```

## Foundation (Phase 1)

- [x] Element class with atomic number, weight, valence, charges
- [x] PeriodicTable singleton with all common elements (40+ elements)
- [x] Vector3D class with 3D geometry operations
- [x] Atom class (Element reference + ID + charge + 3D position)
- [x] Bond class (atom IDs, type, chirality, E/Z conformation)
- [ ] Molecule class (atoms + bonds container)
- [ ] ChemDocument class

## Bond Features

- Bond types: single, double, triple, aromatic
- Chirality: wedge, hash, either (3D stereochemistry)
- Conformation: E/Z or cis/trans (for double bonds)
- Methods: connects(), getOtherAtom(), type checkers, serialization
