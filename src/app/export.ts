import { Bond, BondChirality, BondType } from '../core/Bond';
import { bondKey, kekulize } from '../core/Kekule';
import { Editor } from './editor';
import { implicitHydrogens } from './valence';

/**
 * Export a drawing as SMILES or as an MDL MOL file (V2000).
 *
 * Both work on a copy of the drawing in which text labels are expanded (NO2, COOH, Ph...).
 * Labels that cannot be expanded become a dummy atom "*" (the MOL file keeps their text as an alias).
 * Aromatic rings are written in Kekulé form. Stereochemistry comes from the drawing: wedge/hash
 * bonds become @/@@ in SMILES and wedge/hash flags in the MOL file; double bonds outside rings get
 * cis/trans marks (/ \) in SMILES (the MOL file carries cis/trans in its coordinates).
 */

export interface ExportResult {
  text: string;
  /** Labels written as "*" because they could not be expanded. */
  unknown: string[];
}

/** A copy of the drawing with every label that can be expanded turned into atoms. */
function prepared(source: Editor): { ed: Editor; unknown: Map<number, string> } {
  const ed = new Editor(source.bondLength);
  ed.loadDocument(source.getDocument());
  ed.clearSelection();
  ed.expandLabels();
  const unknown = new Map<number, string>();
  for (const atom of ed.getMolecule().getAtoms()) {
    const label = ed.getLabel(atom.id);
    if (label !== undefined) unknown.set(atom.id, label);
  }
  return { ed, unknown };
}

/** Bond order as written: aromatic bonds take their Kekulé order. */
function orderOf(bond: Bond, kekule: Map<string, BondType>): number {
  const type =
    bond.type === BondType.AROMATIC ? kekule.get(bondKey(bond.atomId1, bond.atomId2)) ?? BondType.SINGLE : bond.type;
  return type === BondType.DOUBLE ? 2 : type === BondType.TRIPLE ? 3 : 1;
}

// =====================================================================================
// MOL file (V2000)
// =====================================================================================

/** MOL coordinates are in angstroms with y up; a drawn bond becomes 1.5 A. */
const MOL_BOND_LENGTH = 1.5;

export function toMolfile(source: Editor, title = 'tsdraw'): ExportResult {
  const { ed, unknown } = prepared(source);
  const molecule = ed.getMolecule();
  const kekule = kekulize(molecule);
  const atoms = molecule.getAtoms();
  const bonds = molecule.getBonds();
  const index = new Map(atoms.map((a, i) => [a.id, i + 1]));

  // Centre the drawing and scale it to angstroms.
  let cx = 0;
  let cy = 0;
  for (const a of atoms) {
    cx += ed.getPosition(a.id)!.x;
    cy += ed.getPosition(a.id)!.y;
  }
  cx /= Math.max(atoms.length, 1);
  cy /= Math.max(atoms.length, 1);
  const scale = MOL_BOND_LENGTH / ed.bondLength;

  const f = (x: number) => x.toFixed(4).padStart(10);
  const n3 = (x: number) => String(x).padStart(3);
  const lines: string[] = [title.slice(0, 80), `  tsdraw  ${molDate()}2D`, ''];
  lines.push(`${n3(atoms.length)}${n3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`);

  for (const a of atoms) {
    const p = ed.getPosition(a.id)!;
    const symbol = unknown.has(a.id) ? '*' : a.element.symbol;
    lines.push(`${f((p.x - cx) * scale)}${f(-(p.y - cy) * scale)}${f(0)} ${symbol.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  }

  for (const b of bonds) {
    let a1 = b.atomId1;
    let a2 = b.atomId2;
    let stereo = 0;
    if (b.chirality === BondChirality.WEDGE || b.chirality === BondChirality.HASH || b.chirality === BondChirality.EITHER) {
      // The stereo flag reads from the first atom: put the narrow end (the stereocentre) first.
      if ((ed.getStereoCentre(a1, a2) ?? a1) === a2) [a1, a2] = [a2, a1];
      stereo = b.chirality === BondChirality.WEDGE ? 1 : b.chirality === BondChirality.HASH ? 6 : 4;
    }
    lines.push(`${n3(index.get(a1)!)}${n3(index.get(a2)!)}${n3(orderOf(b, kekule))}${n3(stereo)}  0  0  0`);
  }

  const charged = atoms.filter((a) => a.charge !== 0);
  for (let i = 0; i < charged.length; i += 8) {
    const chunk = charged.slice(i, i + 8);
    lines.push(`M  CHG${n3(chunk.length)}${chunk.map((a) => ` ${n3(index.get(a.id)!)} ${n3(a.charge)}`).join('')}`);
  }
  for (const [id, label] of unknown) {
    lines.push(`A  ${n3(index.get(id)!)}`);
    lines.push(label);
  }
  lines.push('M  END');
  return { text: lines.join('\n') + '\n', unknown: [...new Set(unknown.values())] };
}

/** MMDDYYHHmm, as used on the second line of a MOL file. */
function molDate(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getFullYear() % 100)}${two(d.getHours())}${two(d.getMinutes())}`;
}

// =====================================================================================
// SMILES
// =====================================================================================

const ORGANIC_SUBSET = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I']);
/** Valences SMILES assumes for bare organic-subset atoms. */
const SMILES_VALENCE: Record<string, number[]> = {
  B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1],
};

export function toSmiles(source: Editor): ExportResult {
  const { ed, unknown } = prepared(source);
  const molecule = ed.getMolecule();
  const kekule = kekulize(molecule);
  const atoms = molecule.getAtoms();

  const neighbours = (v: number) =>
    molecule
      .getConnectedAtoms(v)
      .map((a) => a.id)
      .sort((a, b) => a - b);
  const bondOrder = (u: number, v: number) => orderOf(molecule.getBond(u, v)!, kekule);

  // ---- pass 1: depth-first spanning tree and ring-closure bonds ----
  const children = new Map<number, number[]>();
  const parentOf = new Map<number, number>();
  const seenEdges = new Set<string>();
  /** Ring closures: the digit is opened at `open` (written first) and closed at `close`. */
  const closures: Array<{ open: number; close: number }> = [];
  const visited = new Set<number>();
  const roots: number[] = [];
  const dfs = (v: number) => {
    visited.add(v);
    children.set(v, []);
    for (const w of neighbours(v)) {
      const key = bondKey(v, w);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      if (visited.has(w)) {
        closures.push({ open: w, close: v });
      } else {
        children.get(v)!.push(w);
        parentOf.set(w, v);
        dfs(w);
      }
    }
  };
  // Pieces in drawing order; each starts at a terminal atom where possible (more natural SMILES).
  for (const a of atoms) {
    if (visited.has(a.id)) continue;
    const piece = new Set<number>([a.id]);
    const queue = [a.id];
    for (let i = 0; i < queue.length; i++) {
      for (const w of neighbours(queue[i])) {
        if (piece.has(w)) continue;
        piece.add(w);
        queue.push(w);
      }
    }
    const start = [...piece].sort((x, y) => neighbours(x).length - neighbours(y).length || x - y)[0];
    roots.push(start);
    dfs(start);
  }
  // Within each atom, write the biggest branch last so it carries on the main chain.
  const size = new Map<number, number>();
  const subtree = (v: number): number => {
    let n = 1;
    for (const c of children.get(v)!) n += subtree(c);
    size.set(v, n);
    return n;
  };
  roots.forEach(subtree);
  for (const list of children.values()) list.sort((a, b) => size.get(a)! - size.get(b)!);

  // ---- cis/trans marks on single bonds next to double bonds ----
  const upOf = cisTransMarks(ed, kekule, parentOf);

  // ---- pass 2: write ----
  const freeDigits: number[] = [];
  let nextDigit = 1;
  const takeDigit = () => (freeDigits.length ? freeDigits.sort((a, b) => a - b).shift()! : nextDigit++);
  const openDigit = new Map<string, number>();
  const digitText = (d: number) => (d < 10 ? String(d) : `%${d}`);
  const orderText = (order: number) => (order === 2 ? '=' : order === 3 ? '#' : '');

  const bondSymbol = (u: number, v: number): string => {
    const order = bondOrder(u, v);
    if (order !== 1) return orderText(order);
    const up = upOf(u, v);
    return up === undefined ? '' : up ? '/' : '\\';
  };

  const atomText = (v: number, order: number[]): string => {
    if (unknown.has(v)) return '*';
    const atom = molecule.getAtom(v)!;
    const symbol = atom.element.symbol;
    const sum = neighbours(v).reduce((s, w) => s + bondOrder(v, w), 0);
    const h = implicitHydrogens(symbol, atom.charge, sum);
    const chirality = tetrahedral(ed, v, order, h, parentOf.has(v));
    // A bare symbol when SMILES would infer the same hydrogens by itself.
    if (ORGANIC_SUBSET.has(symbol) && atom.charge === 0 && !chirality) {
      const smilesH = (SMILES_VALENCE[symbol].find((n) => n >= sum) ?? sum) - sum;
      if (smilesH === h) return symbol;
    }
    const hText = h === 0 ? '' : h === 1 ? 'H' : `H${h}`;
    const c = atom.charge;
    const chargeText = c === 0 ? '' : `${c > 0 ? '+' : '-'}${Math.abs(c) > 1 ? Math.abs(c) : ''}`;
    return `[${symbol}${chirality}${hText}${chargeText}]`;
  };

  const write = (v: number): string => {
    // Ring-closure digits at v, in the order they are written.
    const ringPartners: number[] = [];
    let digits = '';
    for (const c of closures) {
      if (c.close !== v) continue;
      const d = openDigit.get(bondKey(c.open, c.close))!;
      digits += orderText(bondOrder(c.open, c.close)) + digitText(d);
      freeDigits.push(d);
      ringPartners.push(c.open);
    }
    for (const c of closures) {
      if (c.open !== v) continue;
      const d = takeDigit();
      openDigit.set(bondKey(c.open, c.close), d);
      digits += digitText(d);
      ringPartners.push(c.close);
    }
    const kids = children.get(v)!;
    const parent = parentOf.get(v);
    // Neighbours in SMILES order: the atom before, ring closures, then branches.
    const order = [...(parent !== undefined ? [parent] : []), ...ringPartners, ...kids];
    let out = atomText(v, order) + digits;
    kids.forEach((c, i) => {
      const branch = bondSymbol(v, c) + write(c);
      out += i < kids.length - 1 ? `(${branch})` : branch;
    });
    return out;
  };

  return { text: roots.map(write).join('.'), unknown: [...new Set(unknown.values())] };
}

/** Height of `neighbour` above the page seen from stereocentre `centre`: +1 wedge, -1 hash, 0 in the plane. */
function heightOf(ed: Editor, centre: number, neighbour: number): number {
  const bond = ed.getMolecule().getBond(centre, neighbour);
  if (!bond || ed.getStereoCentre(centre, neighbour) !== centre) return 0;
  return bond.chirality === BondChirality.WEDGE ? 1 : bond.chirality === BondChirality.HASH ? -1 : 0;
}

/**
 * '@' or '@@' for a drawn stereocentre (narrow end of a wedge/hash), given its neighbours in SMILES
 * order; '' when it is not one or the drawing leaves it undefined. An implicit hydrogen counts as the
 * neighbour right after the preceding atom, or as the first one when the atom starts the SMILES.
 */
export function tetrahedral(ed: Editor, v: number, order: number[], hydrogens: number, hasParent: boolean): string {
  const isCentre = ed
    .getMolecule()
    .getBondsForAtom(v)
    .some(
      (b) =>
        (b.chirality === BondChirality.WEDGE || b.chirality === BondChirality.HASH) &&
        ed.getStereoCentre(b.atomId1, b.atomId2) === v
    );
  if (!isCentre || order.length + hydrogens !== 4 || hydrogens > 1) return '';

  const c = ed.getPosition(v)!;
  const vectors = order.map((w): number[] => {
    const p = ed.getPosition(w)!;
    const len = Math.max(Math.hypot(p.x - c.x, p.y - c.y), 1e-9);
    return [(p.x - c.x) / len, -(p.y - c.y) / len, heightOf(ed, v, w)]; // y up, as on paper
  });
  if (hydrogens === 1) {
    // The hydrogen points away from the other three (and to the opposite face of a wedge/hash).
    const h = [0, 1, 2].map((k) => -vectors.reduce((s, u) => s + u[k], 0));
    vectors.splice(hasParent ? 1 : 0, 0, h);
  }
  const [a, b, d, e] = vectors;
  const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const det = (p: number[], q: number[], r: number[]) =>
    p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  const volume = det(sub(b, a), sub(d, a), sub(e, a));
  if (Math.abs(volume) < 0.05) return '';
  // Checked against RDKit: a negative volume in this neighbour order is anticlockwise ('@').
  return volume < 0 ? '@' : '@@';
}

/**
 * Cis/trans marks for single bonds next to double bonds outside rings.
 * Returns a lookup: for a bond written u then v, true for '/', false for '\\', undefined for none.
 */
function cisTransMarks(
  ed: Editor,
  kekule: Map<string, BondType>,
  parentOf: Map<number, number>
): (u: number, v: number) => boolean | undefined {
  const molecule = ed.getMolecule();
  /** Per bond key: +1 if the higher id is "up" relative to the lower one, -1 if down. */
  const marks = new Map<string, number>();
  const setUp = (from: number, to: number, isUp: boolean) => marks.set(bondKey(from, to), (from < to) === isUp ? 1 : -1);
  const getUp = (from: number, to: number): boolean | undefined => {
    const s = marks.get(bondKey(from, to));
    return s === undefined ? undefined : (from < to) === s > 0;
  };
  const isTree = (a: number, b: number) => parentOf.get(a) === b || parentOf.get(b) === a;

  for (const bond of molecule.getBonds()) {
    if (bond.type !== BondType.DOUBLE) continue;
    const a = bond.atomId1;
    const b = bond.atomId2;
    if (inRing(ed, a, b)) continue;
    const subs = (x: number, partner: number) =>
      molecule
        .getConnectedAtoms(x)
        .map((n) => n.id)
        .filter((n) => n !== partner && isTree(x, n) && orderOf(molecule.getBond(x, n)!, kekule) === 1);
    const onA = subs(a, b);
    const onB = subs(b, a);
    if (!onA.length || !onB.length) continue;
    // Prefer substituent bonds that already carry a mark (conjugated systems share them).
    const x = onA.find((n) => getUp(a, n) !== undefined) ?? onA[0];
    const y = onB.find((n) => getUp(b, n) !== undefined) ?? onB[0];
    const pa = ed.getPosition(a)!;
    const pb = ed.getPosition(b)!;
    const side = (n: number) => {
      const p = ed.getPosition(n)!;
      const cross = (pb.x - pa.x) * (p.y - pa.y) - (pb.y - pa.y) * (p.x - pa.x);
      return Math.abs(cross) < 0.05 * pa.distanceTo(pb) * pa.distanceTo(p) ? 0 : Math.sign(cross);
    };
    const sx = side(x);
    const sy = side(y);
    if (sx === 0 || sy === 0) continue; // drawn straight: no defined geometry
    const cis = sx === sy;
    // x "up" from a and y "up" from b on the same side means cis.
    let ux = getUp(a, x);
    let uy = getUp(b, y);
    if (ux === undefined && uy === undefined) ux = true;
    if (ux === undefined) ux = cis ? uy! : !uy!;
    if (uy === undefined) uy = cis ? ux : !ux;
    if ((ux === uy) !== cis) continue; // conflicting marks from a neighbouring double bond
    setUp(a, x, ux);
    setUp(b, y, uy);
  }
  // Written u then v: '/' means v is up relative to u.
  return (u, v) => getUp(u, v);
}

/** Whether bond a-b lies on a ring (b can be reached from a without it). */
function inRing(ed: Editor, a: number, b: number): boolean {
  const molecule = ed.getMolecule();
  const seen = new Set<number>([a]);
  const queue = [a];
  for (let i = 0; i < queue.length; i++) {
    for (const n of molecule.getConnectedAtoms(queue[i])) {
      if (queue[i] === a && n.id === b) continue;
      if (n.id === b) return true;
      if (!seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return false;
}
