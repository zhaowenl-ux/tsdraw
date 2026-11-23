import { describe, it, expect } from 'vitest';
import { Editor, Tool, EditorDocument, describeTool } from '../src/app/editor';
import { regularPolygon, ringRadius, distanceToSegment } from '../src/app/geometry';
import { Point2D } from '../src/draw/Point2D';
import { BondType, BondChirality } from '../src/core/Bond';
import { CoordinateGenerator } from '../src/draw/CoordinateGenerator';
import { DrawingConfig } from '../src/draw/DrawingConfig';

const BL = 30;
const P = (x: number, y: number) => new Point2D(x, y);
const single: Tool = { kind: 'bond', type: BondType.SINGLE };
const double: Tool = { kind: 'bond', type: BondType.DOUBLE };
const wedge: Tool = { kind: 'stereo', chirality: BondChirality.WEDGE };
const hash: Tool = { kind: 'stereo', chirality: BondChirality.HASH };
const benzene: Tool = { kind: 'ring', size: 6, ringKind: 'aromatic' };
const kekule: Tool = { kind: 'ring', size: 6, ringKind: 'kekule' };
const select: Tool = { kind: 'select' };

/** Atom id at a point; fails the test if there is none. */
function atomAt(editor: Editor, x: number, y: number): number {
  const id = editor.hitAtom(P(x, y));
  if (id === undefined) throw new Error(`no atom at ${x},${y}`);
  return id;
}

describe('geometry', () => {
  it('regular polygons have side length equal to the bond length for sizes 3-8', () => {
    for (let n = 3; n <= 8; n++) {
      const v = regularPolygon(n, P(200, 200), BL);
      for (let i = 0; i < n; i++) {
        expect(v[i].distanceTo(v[(i + 1) % n])).toBeCloseTo(BL, 9);
      }
      expect(v[0].distanceTo(P(200, 200))).toBeCloseTo(ringRadius(n, BL), 9);
    }
  });

  it('rejects ring sizes below 3', () => {
    expect(() => ringRadius(2, BL)).toThrow();
  });

  it('distanceToSegment handles interior and end points', () => {
    expect(distanceToSegment(P(5, 3), P(0, 0), P(10, 0))).toBeCloseTo(3, 9);
    expect(distanceToSegment(P(-4, 3), P(0, 0), P(10, 0))).toBeCloseTo(5, 9);
  });
});

describe('bond tool: one click draws one bond', () => {
  it('a click on empty space draws a single bond centred on the click, one bond length long', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    expect(ed.atomCount()).toBe(2);
    expect(ed.bondCount()).toBe(1);
    const [a, b] = ed.getMolecule().getAtoms().map((x) => x.id);
    expect(ed.getPosition(a)!.distanceTo(ed.getPosition(b)!)).toBeCloseTo(BL, 9);
    expect(ed.getPosition(a)!.x).toBeCloseTo(85, 9);
    expect(ed.getPosition(b)!.x).toBeCloseTo(115, 9);
  });

  it('a click on an existing atom draws a bond from that atom, pointing away from its neighbours', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // atoms at x=85 and x=115
    const left = atomAt(ed, 85, 100);
    ed.cancelChain();
    ed.applyTool(single, P(85, 100)); // one click on the left atom
    expect(ed.atomCount()).toBe(3);
    expect(ed.bondCount()).toBe(2);
    const newAtom = ed.getMolecule().getBondsForAtom(left).map((b) => b.getOtherAtom(left)).find((id) => id !== atomAt(ed, 115, 100))!;
    // The new atom sits one bond length from the left atom, on the side away from its neighbour (to the left).
    expect(ed.getPosition(newAtom)!.x).toBeLessThan(85);
  });

  it('the next click extends the chain from the new end', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // bond 85-115, chain end at 115
    ed.applyTool(single, P(160, 100)); // extends to 145
    expect(ed.atomCount()).toBe(3);
    expect(ed.bondCount()).toBe(2);
    expect(ed.pending).not.toBeNull();
  });

  it('a click within the hit radius of the chain end stops the chain instead of extending it', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.applyTool(single, P(117, 100));
    expect(ed.pending).toBeNull();
    expect(ed.atomCount()).toBe(2);
  });

  it('clicking the chain end atom again stops the chain', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.applyTool(single, P(160, 100)); // chain now ends at x=145
    expect(ed.pending).not.toBeNull();
    const end = ed.getPosition(ed.pending!)!;
    ed.applyTool(single, end);
    expect(ed.pending).toBeNull();
  });

  it('bond preview shows a free bond before the first click and the chain segment after it', () => {
    const ed = new Editor(BL);
    const free = ed.bondPreview(P(100, 100))!;
    expect(free[0].distanceTo(free[1])).toBeCloseTo(BL, 9);
    ed.applyTool(single, P(100, 100));
    const next = ed.bondPreview(P(160, 100))!;
    expect(next[0].x).toBeCloseTo(115, 9);
    expect(next[0].distanceTo(next[1])).toBeCloseTo(BL, 9);
    // The new bond sits at 120 degrees to the bond behind it (which points at -x), so its x offset is +15.
    expect(next[1].x - next[0].x).toBeCloseTo(15, 6);
  });

  it('bond tool on an existing single bond upgrades it to double and clears its stereo', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // bond between x=85 and x=115
    const a = atomAt(ed, 85, 100);
    const b = atomAt(ed, 115, 100);
    ed.applyTool(wedge, P(115, 100)); // pick atom b as stereocentre
    ed.applyTool(wedge, P(100, 100)); // wedge on the bond
    expect(ed.getMolecule().getBond(a, b)!.chirality).toBe(BondChirality.WEDGE);

    ed.cancelChain();
    ed.pending = a; // start the next bond from atom a
    ed.applyTool(double, P(115, 100)); // connect to atom b
    const bond = ed.getMolecule().getBond(a, b)!;
    expect(bond.type).toBe(BondType.DOUBLE);
    expect(bond.chirality).toBe(BondChirality.NONE);
    expect(ed.getStereoCentre(a, b)).toBeUndefined();
  });
});

describe('bond tool: redrawing a bond raises its order', () => {
  it('clicking a single bond twice more gives double, then triple, then back to single', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // bond between x=85 and x=115
    const a = atomAt(ed, 85, 100);
    const b = atomAt(ed, 115, 100);
    const bond = () => ed.getMolecule().getBond(a, b)!;

    ed.applyTool(single, P(100, 100)); // click the middle of the bond
    expect(bond().type).toBe(BondType.DOUBLE);
    ed.applyTool(single, P(100, 100));
    expect(bond().type).toBe(BondType.TRIPLE);
    ed.applyTool(single, P(100, 100));
    expect(bond().type).toBe(BondType.SINGLE);
    expect(ed.bondCount()).toBe(1);
    expect(ed.getMolecule().getAtomCount()).toBe(2);
  });

  it('drawing a single bond between two already-bonded atoms raises the order', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    const a = atomAt(ed, 85, 100);
    const b = atomAt(ed, 115, 100);
    ed.cancelChain();
    ed.pending = a;
    ed.applyTool(single, P(115, 100)); // a -> b again
    expect(ed.getMolecule().getBond(a, b)!.type).toBe(BondType.DOUBLE);
    ed.pending = a;
    ed.applyTool(single, P(115, 100));
    expect(ed.getMolecule().getBond(a, b)!.type).toBe(BondType.TRIPLE);
  });

  it('a bond click is undoable and shows no new-bond preview', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.cancelChain();
    expect(ed.bondPreview(P(100, 100))).toBeNull();
    ed.applyTool(single, P(100, 100));
    expect(ed.getMolecule().getBonds()[0].type).toBe(BondType.DOUBLE);
    ed.undo();
    expect(ed.getMolecule().getBonds()[0].type).toBe(BondType.SINGLE);
  });

  it('aromatic bonds are not changed by the single bond tool', () => {
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, P(100, 100));
    const before = ed.bondCount();
    const [bond] = ed.getMolecule().getBonds();
    const pa = ed.getPosition(bond.atomId1)!;
    const pb = ed.getPosition(bond.atomId2)!;
    ed.applyTool(single, P((pa.x + pb.x) / 2, (pa.y + pb.y) / 2));
    expect(ed.bondCount()).toBe(before);
    expect(ed.getMolecule().getBond(bond.atomId1, bond.atomId2)!.type).toBe(BondType.AROMATIC);
  });
});

describe('atom tool', () => {
  it('places an element on empty space and changes the element of an existing atom, keeping its bonds', () => {
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'atom', symbol: 'C' }, P(100, 100));
    ed.applyTool({ kind: 'atom', symbol: 'C' }, P(100, 100)); // same element: no-op
    expect(ed.atomCount()).toBe(1);

    ed.applyTool(single, P(100, 100)); // click the carbon: bond to a new carbon
    expect(ed.bondCount()).toBe(1);
    const other = ed.getMolecule().getAtoms().map((a) => a.id).find((id) => id !== atomAt(ed, 100, 100))!;

    ed.applyTool({ kind: 'atom', symbol: 'O' }, ed.getPosition(other)!);
    const oxygen = ed.getMolecule().getAtoms().find((a) => a.element.symbol === 'O');
    expect(oxygen).toBeDefined();
    expect(ed.atomCount()).toBe(2);
    expect(ed.bondCount()).toBe(1);
    expect(ed.getMolecule().getBondsForAtom(oxygen!.id)).toHaveLength(1);
  });
});

describe('ring tool', () => {
  it('benzene (aromatic) has 6 atoms and 6 aromatic bonds, all at bond length', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    expect(ed.atomCount()).toBe(6);
    expect(ed.bondCount()).toBe(6);
    for (const bond of ed.getMolecule().getBonds()) {
      expect(bond.type).toBe(BondType.AROMATIC);
      expect(ed.getPosition(bond.atomId1)!.distanceTo(ed.getPosition(bond.atomId2)!)).toBeCloseTo(BL, 6);
    }
  });

  it('Kekulé benzene alternates double and single bonds so no two double bonds share an atom', () => {
    const ed = new Editor(BL);
    ed.applyTool(kekule, P(300, 300));
    const bonds = ed.getMolecule().getBonds();
    expect(bonds.filter((b) => b.type === BondType.DOUBLE)).toHaveLength(3);
    expect(bonds.filter((b) => b.type === BondType.SINGLE)).toHaveLength(3);
    const doubleAtoms = bonds
      .filter((b) => b.type === BondType.DOUBLE)
      .flatMap((b) => [b.atomId1, b.atomId2]);
    expect(new Set(doubleAtoms).size).toBe(6);
  });

  it('cyclohexane is saturated and every atom has exactly two ring bonds', () => {
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'single' }, P(300, 300));
    for (const atom of ed.getMolecule().getAtoms()) {
      expect(ed.getMolecule().getBondsForAtom(atom.id)).toHaveLength(2);
    }
    expect(ed.getMolecule().getBonds().every((b) => b.type === BondType.SINGLE)).toBe(true);
  });

  it('a ring clicked on an existing atom shares that atom when it can (spiro on a saturated carbon)', () => {
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'single' }, P(300, 300));
    const top = 300 - ringRadius(6, BL); // vertex 0 is directly above the centre
    const anchor = atomAt(ed, 300, top);
    ed.applyTool({ kind: 'ring', size: 5, ringKind: 'single' }, P(300, top)); // click the atom
    expect(ed.atomCount()).toBe(6 + 4);
    expect(ed.bondCount()).toBe(6 + 5);
    expect(ed.getMolecule().getBondsForAtom(anchor)).toHaveLength(4); // 2 + 2: spiro centre
    expect(ed.valenceProblems().size).toBe(0);
  });

  it('a ring clicked on an atom that cannot share hangs from it by a new bond (no valence error)', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const top = 300 - ringRadius(6, BL);
    const anchor = atomAt(ed, 300, top);
    ed.applyTool({ kind: 'ring', size: 5, ringKind: 'single' }, P(300, top)); // cyclopentylbenzene
    expect(ed.atomCount()).toBe(6 + 5);
    expect(ed.bondCount()).toBe(6 + 5 + 1);
    expect(ed.getMolecule().getBondsForAtom(anchor)).toHaveLength(3);
    expect(ed.valenceProblems().size).toBe(0);
    ed.applyTool(benzene, P(300, top + 2 * ringRadius(6, BL))); // the bottom atom: biphenyl
    expect(ed.atomCount()).toBe(6 + 5 + 6);
    expect(ed.valenceProblems().size).toBe(0);
  });

  it('a ring attached to an atom turns to the best orientation: clear of the rest of the drawing', () => {
    // A CH2 between two cyclohexanes: the only free direction is between them.
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'single' }, P(200, 300));
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'single' }, P(400, 300));
    const before = [...ed.atomIds()];
    const left = atomAt(ed, 200 + BL * Math.cos(Math.PI / 6), 300 - BL / 2);
    ed.applyTool(single, ed.getPosition(left)!);
    ed.cancelChain();
    const ch2 = [...ed.atomIds()].find((id) => !before.includes(id))!;
    const right = atomAt(ed, 400 - BL * Math.cos(Math.PI / 6), 300 - BL / 2);
    ed.applyTool(single, ed.getPosition(ch2)!);
    ed.cancelChain();
    const old = [...ed.atomIds()];
    ed.applyTool(benzene, ed.getPosition(ch2)!);
    const added = [...ed.atomIds()].filter((id) => !old.includes(id));
    expect(added.length).toBeGreaterThanOrEqual(5);
    for (const a of added)
      for (const b of old) expect(ed.getPosition(a)!.distanceTo(ed.getPosition(b)!) / BL).toBeGreaterThan(0.85);
    void right;
  });

  it('ring preview has the requested number of vertices', () => {
    expect(new Editor(BL).ringPreview(P(0, 0), 7)).toHaveLength(7);
  });
});

describe('wedge and hash stereo', () => {
  it('wedge on a bond records the picked atom as stereocentre; the same wedge again removes it', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // bond between x=85 and x=115
    const a = atomAt(ed, 85, 100);
    const b = atomAt(ed, 115, 100);

    ed.applyTool(wedge, P(115, 100)); // stereo tool on an atom picks the centre
    ed.applyTool(wedge, P(100, 100)); // then on the bond
    expect(ed.getMolecule().getBond(a, b)!.chirality).toBe(BondChirality.WEDGE);
    expect(ed.getStereoCentre(a, b)).toBe(b);

    ed.applyTool(wedge, P(100, 100)); // same chirality toggles it off
    expect(ed.getMolecule().getBond(a, b)!.chirality).toBe(BondChirality.NONE);
    expect(ed.getStereoCentre(a, b)).toBeUndefined();
  });

  it('stereo is ignored on double bonds and does not create an undo step', () => {
    const ed = new Editor(BL);
    ed.applyTool(double, P(100, 100));
    ed.applyTool(double, P(160, 100));
    const depth = ed.undoDepth();
    ed.applyTool(hash, P(115, 100));
    expect(ed.getMolecule().getBonds()[0].chirality).toBe(BondChirality.NONE);
    expect(ed.undoDepth()).toBe(depth);
  });
});

describe('selection, delete, clear', () => {
  it('deleting an atom removes its bonds and its position', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const top = 300 - ringRadius(6, BL);
    const id = atomAt(ed, 300, top);
    ed.applyTool(select, P(300, top));
    expect(ed.selection).toEqual({ kind: 'atom', id });
    expect(ed.deleteSelection()).toBe(true);
    expect(ed.atomCount()).toBe(5);
    expect(ed.bondCount()).toBe(4);
    expect(ed.getPosition(id)).toBeUndefined();
  });

  it('selecting and deleting a bond keeps its atoms', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.applyTool(select, P(100, 100));
    expect(ed.selection?.kind).toBe('bond');
    ed.deleteSelection();
    expect(ed.bondCount()).toBe(0);
    expect(ed.atomCount()).toBe(2);
  });

  it('clear removes everything and can be undone', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    ed.clear();
    expect(ed.atomCount()).toBe(0);
    expect(ed.undo()).toBe(true);
    expect(ed.atomCount()).toBe(6);
  });
});

describe('undo / redo / save / load', () => {
  it('undo and redo restore atoms and bonds exactly', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    const afterChain = ed.getDocument();
    ed.applyTool(benzene, P(300, 300));
    expect(ed.atomCount()).toBe(8);
    expect(ed.undo()).toBe(true);
    expect(ed.getDocument()).toEqual(afterChain);
    expect(ed.redo()).toBe(true);
    expect(ed.atomCount()).toBe(8);
  });

  it('a new change after undo clears the redo stack', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    ed.undo();
    expect(ed.canRedo()).toBe(true);
    ed.applyTool({ kind: 'atom', symbol: 'C' }, P(50, 50));
    expect(ed.canRedo()).toBe(false);
  });

  it('save then load reproduces the same drawing, including positions and formula', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const doc = JSON.parse(JSON.stringify(ed.getDocument())) as EditorDocument;
    const other = new Editor(BL);
    other.loadDocument(doc);
    expect(other.atomCount()).toBe(6);
    expect(other.bondCount()).toBe(6);
    expect(other.getDocument()).toEqual(doc);
    expect(other.formula()).toBe(ed.formula());
  });

  it('loading an invalid document throws and leaves the drawing unchanged', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    expect(() => ed.loadDocument({ format: 'nope' } as unknown as EditorDocument)).toThrow();
    expect(ed.atomCount()).toBe(6);
  });
});

describe('layout clean-up uses the library layout engine', () => {
  it('keeps every atom and bond and gives finite coordinates', () => {
    const config = new DrawingConfig({ bondLength: BL });
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    ed.relayout(new CoordinateGenerator(config), P(600, 350));
    expect(ed.atomCount()).toBe(6);
    expect(ed.bondCount()).toBe(6);
    for (const atom of ed.getMolecule().getAtoms()) {
      const p = ed.getPosition(atom.id)!;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('ortho-fused rings and formula', () => {
  it('a ring clicked on a bond of benzene fuses onto it: naphthalene skeleton (10 atoms, 11 bonds)', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const v = regularPolygon(6, P(300, 300), BL);
    const mid = P((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, mid);
    expect(ed.atomCount()).toBe(10);
    expect(ed.bondCount()).toBe(11);
    const fusedAtoms = ed.getMolecule().getAtoms().filter((a) => ed.getMolecule().getBondsForAtom(a.id).length === 3);
    expect(fusedAtoms).toHaveLength(2);
    for (const bond of ed.getMolecule().getBonds()) {
      expect(ed.getPosition(bond.atomId1)!.distanceTo(ed.getPosition(bond.atomId2)!)).toBeCloseTo(BL, 6);
    }
    // No two atoms are drawn on top of each other.
    const atoms = ed.getMolecule().getAtoms();
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const d = ed.getPosition(atoms[i].id)!.distanceTo(ed.getPosition(atoms[j].id)!);
        expect(d).toBeGreaterThan(BL * 0.8);
      }
    }
  });

  it('a fused ring is drawn on the side away from the first ring', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const v = regularPolygon(6, P(300, 300), BL);
    ed.applyTool({ kind: 'ring', size: 6, ringKind: 'aromatic' }, P((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2));
    const newAtoms = ed.getMolecule().getAtoms().filter((a) => {
      const p = ed.getPosition(a.id)!;
      return Math.hypot(p.x - 300, p.y - 300) > ringRadius(6, BL) + 1;
    });
    expect(newAtoms).toHaveLength(4);
  });

  it('formula counts implicit hydrogens: benzene C6H6, cyclohexane C6H12, empty drawing has no formula', () => {
    const benz = new Editor(BL);
    benz.applyTool(benzene, P(300, 300));
    expect(benz.formula()).toBe('C6H6');

    const kek = new Editor(BL);
    kek.applyTool(kekule, P(300, 300));
    expect(kek.formula()).toBe('C6H6');

    const cyclohexane = new Editor(BL);
    cyclohexane.applyTool({ kind: 'ring', size: 6, ringKind: 'single' }, P(300, 300));
    expect(cyclohexane.formula()).toBe('C6H12');

    expect(new Editor(BL).formula()).toBe('');
  });

  it('replacing a ring atom with a heteroatom updates the hydrogens: C5H5Cl and C5H5O', () => {
    const chloro = new Editor(BL);
    chloro.applyTool(benzene, P(300, 300));
    const top = 300 - ringRadius(6, BL);
    chloro.applyTool({ kind: 'atom', symbol: 'Cl' }, P(300, top)); // the atom tool replaces the carbon
    expect(chloro.formula()).toBe('C5H5Cl');

    const oxa = new Editor(BL);
    oxa.applyTool(benzene, P(300, 300));
    oxa.applyTool({ kind: 'atom', symbol: 'O' }, P(300, top));
    expect(oxa.formula()).toBe('C5H5O');
  });

  it('methanol CH4O: a single bond whose right-hand atom is changed to oxygen keeps its hydrogens right', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(200, 200)); // carbon at 185, second atom at 215
    ed.cancelChain();
    ed.applyTool({ kind: 'atom', symbol: 'O' }, P(215, 200));
    expect(ed.formula()).toBe('CH4O');
  });
});

describe('rotating a piece by dragging', () => {
  it('connectedPiece returns every atom bonded to the start atom but no others', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    ed.applyTool(single, P(600, 600)); // separate bond, not connected to the ring
    const ringAtom = atomAt(ed, 300, 300 - ringRadius(6, BL));
    expect(ed.connectedPiece(ringAtom)).toHaveLength(6);
  });

  it('rotating keeps every bond length and moves the piece around its centre', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const ids = ed.connectedPiece(atomAt(ed, 300, 300 - ringRadius(6, BL)));
    const pivot = ed.pieceCentre(ids);
    const before = ids.map((id) => ed.getPosition(id)!.clone());
    ed.rotateAtoms(ids, pivot, Math.PI / 3);
    for (const bond of ed.getMolecule().getBonds()) {
      expect(ed.getPosition(bond.atomId1)!.distanceTo(ed.getPosition(bond.atomId2)!)).toBeCloseTo(BL, 6);
    }
    // The centre stays put and every atom keeps its distance from it.
    const after = ids.map((id) => ed.getPosition(id)!);
    expect(ed.pieceCentre(ids).distanceTo(pivot)).toBeLessThan(1e-6);
    ids.forEach((_, i) => expect(after[i].distanceTo(pivot)).toBeCloseTo(before[i].distanceTo(pivot), 6));
    expect(after[0].distanceTo(before[0])).toBeGreaterThan(1);
  });

  it('a whole rotation drag is a single undo step', () => {
    const ed = new Editor(BL);
    ed.applyTool(benzene, P(300, 300));
    const start = ed.getDocument();
    const ids = ed.connectedPiece(atomAt(ed, 300, 300 - ringRadius(6, BL)));
    const pivot = ed.pieceCentre(ids);
    ed.beginRotation();
    for (let i = 0; i < 10; i++) ed.rotateAtoms(ids, pivot, Math.PI / 60);
    expect(ed.undo()).toBe(true);
    expect(ed.getDocument()).toEqual(start);
  });
});

describe('default bond angles', () => {
  it('a single bond from an atom with one neighbour sits at 120 degrees, not straight on', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // neighbour at 85, atom at 115
    const left = atomAt(ed, 85, 100);
    ed.cancelChain();
    ed.applyTool(single, P(85, 100)); // one click on the left atom
    const newest = ed.pending!;
    const pos = ed.getPosition(left)!;
    const vNew = { x: ed.getPosition(newest)!.x - pos.x, y: ed.getPosition(newest)!.y - pos.y };
    const vOld = { x: 115 - 85, y: 0 };
    const cos = (vNew.x * vOld.x + vNew.y * vOld.y) / (Math.hypot(vNew.x, vNew.y) * Math.hypot(vOld.x, vOld.y));
    expect(Math.acos(cos) * 180 / Math.PI).toBeCloseTo(120, 6);
  });

  it('a triple bond stays linear: 180 degrees from the bond behind it', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // neighbour at 85, atom at 115
    const right = atomAt(ed, 115, 100);
    ed.cancelChain();
    ed.pending = right;
    ed.applyTool({ kind: 'bond', type: BondType.TRIPLE }, P(160, 100));
    const newest = ed.pending!;
    expect(ed.getPosition(newest)!.x - 115).toBeCloseTo(30, 6);
    expect(ed.getPosition(newest)!.y).toBeCloseTo(100, 6);
  });
});

describe('wedge, hash and wavy bonds drawn with the bond tool', () => {
  const wedgeBond: Tool = { kind: 'bond', type: BondType.SINGLE, style: BondChirality.WEDGE };
  const hashBond: Tool = { kind: 'bond', type: BondType.SINGLE, style: BondChirality.HASH };
  const wavyBond: Tool = { kind: 'bond', type: BondType.SINGLE, style: BondChirality.EITHER };

  it('one click on empty space draws a styled bond with the first atom as the narrow end', () => {
    const ed = new Editor(BL);
    ed.applyTool(hashBond, P(100, 100));
    expect(ed.atomCount()).toBe(2);
    expect(ed.bondCount()).toBe(1);
    const [a, b] = ed.getMolecule().getAtoms().map((x) => x.id);
    expect(ed.getMolecule().getBond(a, b)!.chirality).toBe(BondChirality.HASH);
    expect(ed.getStereoCentre(a, b)).toBe(a);
  });

  it('a click on an atom draws a styled bond from it, and the chain keeps the style', () => {
    const ed = new Editor(BL);
    ed.applyTool(wedgeBond, P(100, 100));
    ed.applyTool(wedgeBond, P(160, 100)); // extend the chain
    expect(ed.atomCount()).toBe(3);
    const chirality = ed.getMolecule().getBonds().map((b) => b.chirality);
    expect(chirality).toEqual([BondChirality.WEDGE, BondChirality.WEDGE]);
  });

  it('a styled bond to an existing atom keeps the style and an existing bond can be restyled', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // plain bond 85-115
    const a = atomAt(ed, 85, 100);
    const b = atomAt(ed, 115, 100);
    ed.cancelChain();
    ed.pending = a;
    ed.applyTool(wavyBond, P(115, 100)); // connect a to b in wavy style
    expect(ed.getMolecule().getBond(a, b)!.chirality).toBe(BondChirality.EITHER);
    expect(ed.getStereoCentre(a, b)).toBe(a);
  });

  it('style is ignored on double bonds, and describeTool names the bond style', () => {
    const ed = new Editor(BL);
    ed.applyTool({ kind: 'bond', type: BondType.DOUBLE, style: BondChirality.WEDGE }, P(100, 100));
    const bond = ed.getMolecule().getBonds()[0];
    expect(bond.type).toBe(BondType.DOUBLE);
    expect(bond.chirality).toBe(BondChirality.NONE);
    expect(describeTool(wedgeBond)).toBe('Wedge bond (up)');
    expect(describeTool(hashBond)).toBe('Hash bond (down)');
    expect(describeTool(wavyBond)).toBe('Wavy bond (both)');
  });
});

describe('swinging a newly attached piece', () => {
  const ring6: Tool = { kind: 'ring', size: 6, ringKind: 'single' };

  it('a ring attached at an atom can be swung about that atom, keeping every bond length', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // bond 85-115
    ed.cancelChain();
    const anchor = atomAt(ed, 115, 100);
    const before = ed.atomIds();
    ed.applyTool(ring6, P(115, 100));
    const piece = ed.attachedPiece(before, anchor)!;
    expect(piece).toHaveLength(5);

    ed.swingAtoms(piece, anchor, P(115, 200)); // point the ring straight down
    const pivot = ed.getPosition(anchor)!;
    const centre = ed.pieceCentre(piece);
    expect(centre.x).toBeCloseTo(pivot.x, 6);
    expect(centre.y).toBeGreaterThan(pivot.y);
    for (const bond of ed.getMolecule().getBonds()) {
      const d = ed.getPosition(bond.atomId1)!.distanceTo(ed.getPosition(bond.atomId2)!);
      expect(d).toBeCloseTo(BL, 6);
    }
  });

  it('a new bond from an atom swings toward the cursor, snapped to 15 degrees', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.cancelChain();
    const anchor = atomAt(ed, 115, 100);
    const before = ed.atomIds();
    ed.applyTool(single, P(115, 100));
    const piece = ed.attachedPiece(before, anchor)!;
    expect(piece).toHaveLength(1);
    ed.swingAtoms(piece, anchor, P(115 + 100, 100 + 20), 15); // about 11 degrees below horizontal -> snaps to 15
    const end = ed.getPosition(piece[0])!;
    const angle = (Math.atan2(end.y - 100, end.x - 115) * 180) / Math.PI;
    expect(angle).toBeCloseTo(15, 6);
  });

  it('closing a ring adds no new atoms, so there is nothing to swing', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // chain end at 115
    const left = atomAt(ed, 85, 100);
    ed.applyTool(single, P(160, 100)); // extend
    const before = ed.atomIds();
    ed.applyTool(single, ed.getPosition(left)!); // bond back to the first atom
    expect(ed.attachedPiece(before, left)).toBeNull();
  });
});

describe('attach points', () => {
  it('a chain end that lands on an existing atom joins it (closing the ring) and is marked first', () => {
    const ed = new Editor(BL);
    const h = 15 * Math.sqrt(3);
    ed.applyTool(single, P(100, 100)); // A(85,100) - B(115,100), chain at B
    const a = atomAt(ed, 85, 100);
    ed.applyTool(single, P(130, 100 + h)); // C
    ed.applyTool(single, P(115, 100 + 2 * h)); // D
    ed.applyTool(single, P(85, 100 + 2 * h)); // E
    ed.applyTool(single, P(70, 100 + h)); // F
    const f = ed.pending!;
    const click = P(75, 85); // outside A's hit radius, but the bond from F would end on A
    expect(ed.attachPoints(single, click).sort()).toEqual([a, f].sort());
    ed.applyTool(single, click);
    expect(ed.atomCount()).toBe(6);
    expect(ed.bondCount()).toBe(6);
    expect(ed.getMolecule().getBond(f, a)).toBeDefined();
  });

  it('a ring clicked on an atom marks that atom as its attach point', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.cancelChain();
    const right = atomAt(ed, 115, 100);
    expect(ed.attachPoints(benzene, P(115, 100))).toEqual([right]);
  });

  it('nothing is marked over empty space far from the drawing', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100));
    ed.cancelChain();
    expect(ed.attachPoints(single, P(400, 400))).toEqual([]);
    expect(ed.attachPoints(benzene, P(400, 400))).toEqual([]);
  });
});

describe('swinging onto existing atoms', () => {
  it('a new bond swung onto an existing atom marks it and joins it on release', () => {
    const ed = new Editor(BL);
    ed.applyTool(single, P(100, 100)); // A(85,100) - B(115,100)
    ed.cancelChain();
    ed.applyTool(single, P(130, 130)); // D(115,130) - E(145,130), one bond length below B
    ed.cancelChain();
    const b = atomAt(ed, 115, 100);
    const d = atomAt(ed, 115, 130);

    const before = ed.atomIds();
    ed.applyTool(single, ed.getPosition(b)!); // new bond B-X
    const piece = ed.attachedPiece(before, b)!;
    ed.swingAtoms(piece, b, P(115, 200)); // swing X straight down onto D
    const contacts = ed.pieceContacts(piece, b);
    expect([...contacts.values()]).toEqual([d]);

    ed.mergeContacts(contacts);
    expect(ed.atomCount()).toBe(4);
    expect(ed.bondCount()).toBe(3);
    expect(ed.getMolecule().getBond(b, d)).toBeDefined();
  });
});

describe('ring tool: press an atom (ring added, grey), drag to turn it, release to settle it', () => {
  /** Ethane drawn with one click; returns the editor and the right-hand (terminal) carbon. */
  function ethane(): { ed: Editor; end: number } {
    const ed = new Editor(BL);
    ed.applyTool(single, P(300, 300));
    const ids = [...ed.atomIds()];
    const end = ids.reduce((a, b) => (ed.getPosition(a)!.x >= ed.getPosition(b)!.x ? a : b));
    return { ed, end };
  }
  function centre(ed: Editor, ids: number[]): Point2D {
    const ps = [...ids].map((id) => ed.getPosition(id)!);
    return P(ps.reduce((s, q) => s + q.x, 0) / ps.length, ps.reduce((s, q) => s + q.y, 0) / ps.length);
  }

  it('pressing adds the ring to the molecule at once, as a piece that can swing about the atom', () => {
    const { ed, end } = ethane();
    const before = ed.atomIds();
    ed.placeRingAtAtom(end, 6, 'single');
    expect(ed.formula()).toBe('C7H14'); // methylcyclohexane
    const piece = ed.attachedPiece(before, end);
    expect(piece).toHaveLength(5); // the five new ring atoms; the pressed atom is the sixth
  });

  it('dragging turns the ring around the pressed atom; Shift snaps to 30 degree steps', () => {
    const { ed, end } = ethane();
    const before = ed.atomIds();
    ed.placeRingAtAtom(end, 6, 'single');
    const piece = ed.attachedPiece(before, end)!;
    const a = ed.getPosition(end)!;
    for (const [mx, my] of [[400, 300], [300, 400], [320, 220], [260, 260]]) {
      ed.swingAtoms(piece, end, P(mx, my));
      const c = centre(ed, [...piece, end]);
      const want = Math.atan2(my - a.y, mx - a.x);
      const got = Math.atan2(c.y - a.y, c.x - a.x);
      expect(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)))).toBeLessThan(1e-6);
      expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(ringRadius(6, BL), 6);
      expect(ed.getPosition(end)!.distanceTo(a)).toBeLessThan(1e-9); // the pressed atom stays put
    }
    ed.swingAtoms(piece, end, P(a.x + 100, a.y + 40), 30);
    const c = centre(ed, [...piece, end]);
    expect(Math.atan2(c.y - a.y, c.x - a.x)).toBeCloseTo(Math.PI / 6, 6);
    expect(ed.formula()).toBe('C7H14');
  });

  it('the whole press-drag-release is one undo step (Esc while held undoes it too)', () => {
    const { ed, end } = ethane();
    const before = ed.atomIds();
    ed.placeRingAtAtom(end, 6, 'single');
    ed.swingAtoms(ed.attachedPiece(before, end)!, end, P(300, 400));
    ed.undo();
    expect(ed.formula()).toBe('C2H6');
  });
});
