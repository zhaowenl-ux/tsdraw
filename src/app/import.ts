import { BondChirality, BondType } from '../core/Bond';
import { periodicTable } from '../core/Element';
import { layoutOrganic } from '../draw/OrganicLayout';
import { Point2D } from '../draw/Point2D';
import { Editor, EditorDocument } from './editor';
import { tetrahedral } from './export';
import { labelAnchorElement } from './labels';

/**
 * Reading molecules from text: MDL MOL files (V2000 and V3000) and SMILES.
 * Both give a tsdraw document with coordinates in canvas pixels (bond length = `bondLength`).
 *
 * - MOL files keep their own 2D coordinates (scaled, y flipped) and wedge/hash bonds.
 * - SMILES are laid out with the organic layout; cis/trans (/ \) is kept, and @/@@ stereocentres
 *   get a wedge or hash that gives the same configuration.
 * Atoms that are not elements (R, *, aliases) become text labels.
 */

export type ParsedDocument = Pick<EditorDocument, 'atoms' | 'bonds'>;
type DocAtom = EditorDocument['atoms'][number];
type DocBond = EditorDocument['bonds'][number];

/** Read clipboard text: a MOL file if it looks like one, otherwise the first SMILES on it. */
export function parseMolecule(text: string, bondLength: number): ParsedDocument {
  if (/M {2}END|V2000|V3000|M {2}V30 /.test(text)) return parseMolfile(text, bondLength);
  const first = text.trim().split(/\s+/)[0] ?? '';
  if (!first) throw new Error('Nothing to paste');
  return parseSmiles(first, bondLength);
}

// =====================================================================================
// MOL files
// =====================================================================================

export function parseMolfile(text: string, bondLength: number): ParsedDocument {
  const lines = text.replace(/\r/g, '').split('\n');
  // The counts line is the 4th line of a MOL file; tolerate missing header lines when pasted.
  let countsAt = lines.findIndex((l) => /V[23]000\s*$/.test(l));
  // A bare V3000 CTAB ("M  V30 BEGIN CTAB" ...) has no header or counts line.
  const bareV3000 = countsAt < 0 && lines.some((l) => l.startsWith('M  V30 '));
  if (countsAt < 0) countsAt = bareV3000 ? -1 : 3;
  const counts = lines[countsAt] ?? '';
  const raw = bareV3000 || counts.includes('V3000') ? readV3000(lines, countsAt) : readV2000(lines, countsAt);
  if (raw.atoms.length === 0) throw new Error('The MOL file has no atoms');

  // Scale so the median bond is one drawing bond long; MOL y points up, the canvas y down.
  const lengths = raw.bonds
    .map((b) => Math.hypot(raw.atoms[b.a].x - raw.atoms[b.b].x, raw.atoms[b.a].y - raw.atoms[b.b].y))
    .filter((d) => d > 1e-6)
    .sort((p, q) => p - q);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1.5;
  const scale = bondLength / median;

  const atoms: DocAtom[] = raw.atoms.map((a, i) => {
    const label = a.alias ?? (periodicTable.getBySymbol(a.symbol) ? undefined : a.symbol);
    const symbol = label !== undefined ? labelAnchorElement(label) : a.symbol;
    const entry: DocAtom = { id: i + 1, symbol, charge: a.charge, x: a.x * scale, y: -a.y * scale };
    return label !== undefined ? { ...entry, label } : entry;
  });
  const bonds: DocBond[] = raw.bonds.map((b) => {
    const stereo = b.type === 1 ? b.stereo : 0;
    const chirality =
      stereo === 1 ? BondChirality.WEDGE : stereo === 6 ? BondChirality.HASH : stereo === 4 ? BondChirality.EITHER : BondChirality.NONE;
    const type =
      b.type === 2 ? BondType.DOUBLE : b.type === 3 ? BondType.TRIPLE : b.type === 4 ? BondType.AROMATIC : BondType.SINGLE;
    return { a: b.a + 1, b: b.b + 1, type, chirality, stereoCentre: chirality === BondChirality.NONE ? null : b.a + 1 };
  });
  return { atoms, bonds };
}

interface RawMol {
  atoms: Array<{ symbol: string; x: number; y: number; charge: number; alias?: string }>;
  /** 0-based atom indexes; type 1/2/3/4 (aromatic); stereo in V2000 terms (1 wedge, 6 hash, 4 either). */
  bonds: Array<{ a: number; b: number; type: number; stereo: number }>;
}

function readV2000(lines: string[], countsAt: number): RawMol {
  const counts = lines[countsAt];
  const nAtoms = parseInt(counts.slice(0, 3), 10);
  const nBonds = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(nAtoms) || !Number.isFinite(nBonds)) throw new Error('Bad MOL file counts line');
  const atoms: RawMol['atoms'] = [];
  const bonds: RawMol['bonds'] = [];
  const chargeCode: Record<number, number> = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
  for (let i = 0; i < nAtoms; i++) {
    const l = lines[countsAt + 1 + i] ?? '';
    atoms.push({
      x: parseFloat(l.slice(0, 10)),
      y: parseFloat(l.slice(10, 20)),
      symbol: l.slice(31, 34).trim(),
      charge: chargeCode[parseInt(l.slice(36, 39), 10)] ?? 0,
    });
  }
  for (let i = 0; i < nBonds; i++) {
    const l = lines[countsAt + 1 + nAtoms + i] ?? '';
    bonds.push({
      a: parseInt(l.slice(0, 3), 10) - 1,
      b: parseInt(l.slice(3, 6), 10) - 1,
      type: parseInt(l.slice(6, 9), 10),
      stereo: parseInt(l.slice(9, 12), 10) || 0,
    });
  }
  // Properties: M  CHG replaces the charges of the atom block; A lines give aliases.
  let chgSeen = false;
  for (let i = countsAt + 1 + nAtoms + nBonds; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('M  END')) break;
    if (l.startsWith('M  CHG')) {
      if (!chgSeen) atoms.forEach((a) => (a.charge = 0));
      chgSeen = true;
      const n = parseInt(l.slice(6, 9), 10);
      for (let k = 0; k < n; k++) {
        const idx = parseInt(l.slice(9 + 8 * k, 13 + 8 * k), 10) - 1;
        const val = parseInt(l.slice(13 + 8 * k, 17 + 8 * k), 10);
        if (atoms[idx]) atoms[idx].charge = val;
      }
    } else if (l.startsWith('A  ')) {
      const idx = parseInt(l.slice(3, 6), 10) - 1;
      if (atoms[idx]) atoms[idx].alias = (lines[i + 1] ?? '').trim();
      i++;
    }
  }
  return { atoms, bonds };
}

function readV3000(lines: string[], countsAt: number): RawMol {
  // Join continuation lines ("-" at the end) and keep only the V30 content.
  const v30: string[] = [];
  for (let i = countsAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('M  V30 ')) continue;
    let body = l.slice(7);
    while (body.endsWith('-') && i + 1 < lines.length) body = body.slice(0, -1) + lines[++i].slice(7);
    v30.push(body.trim());
  }
  const atoms: RawMol['atoms'] = [];
  const bonds: RawMol['bonds'] = [];
  const index = new Map<string, number>();
  let block = '';
  for (const l of v30) {
    if (l.startsWith('BEGIN ')) block = l.slice(6);
    else if (l.startsWith('END ')) block = '';
    else if (block === 'ATOM') {
      const f = l.split(/\s+/);
      index.set(f[0], atoms.length);
      const charge = Number((l.match(/CHG=(-?\d+)/) ?? [])[1] ?? 0);
      atoms.push({ symbol: f[1], x: parseFloat(f[2]), y: parseFloat(f[3]), charge });
    } else if (block === 'BOND') {
      const f = l.split(/\s+/);
      const cfg = Number((l.match(/CFG=(\d)/) ?? [])[1] ?? 0);
      // V3000 CFG: 1 wedge, 3 hash, 2 either.
      const stereo = cfg === 1 ? 1 : cfg === 3 ? 6 : cfg === 2 ? 4 : 0;
      bonds.push({ a: index.get(f[2])!, b: index.get(f[3])!, type: Number(f[1]), stereo });
    }
  }
  return { atoms, bonds };
}

// =====================================================================================
// SMILES
// =====================================================================================

interface SAtom {
  symbol: string;
  aromatic: boolean;
  charge: number;
  /** Hydrogens written in brackets; null for bare atoms (implicit). */
  hCount: number | null;
  chiral: '' | '@' | '@@';
  /** Neighbours in the order SMILES lists them (the atom before, ring closures, then later atoms). */
  order: number[];
  hasPrevious: boolean;
  /** Text label for atoms that are not elements (*). */
  label?: string;
}
interface SBond {
  a: number;
  b: number;
  /** 1, 2, 3, or 0 for aromatic (implicit between aromatic atoms, or ':'). */
  order: number;
  /** '/' or '\\' as written from a to b, for cis/trans. */
  dir: '' | '/' | '\\';
}

const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
const AROMATIC_ORGANIC = ['b', 'c', 'n', 'o', 'p', 's'];

export function parseSmiles(smiles: string, bondLength: number): ParsedDocument {
  const { atoms, bonds } = readSmiles(smiles);
  if (atoms.length === 0) throw new Error('Empty SMILES');
  const types = kekulizeSmiles(atoms, bonds);

  // Build a drawing (no coordinates yet) and lay it out, keeping cis/trans from / and \.
  const doc: EditorDocument = {
    format: 'tsdraw-document',
    version: 1,
    name: 'pasted',
    atoms: atoms.map((a, i) => {
      const entry: DocAtom = { id: i + 1, symbol: a.label ? 'C' : a.symbol, charge: a.charge, x: 0, y: 0 };
      return a.label ? { ...entry, label: a.label } : entry;
    }),
    bonds: bonds.map((b, i) => ({ a: b.a + 1, b: b.b + 1, type: types[i], chirality: BondChirality.NONE, stereoCentre: null })),
  };
  const ed = new Editor(bondLength);
  ed.loadDocument(doc);
  const positions = layoutOrganic(ed.getMolecule(), bondLength, undefined, cisTransOf(bonds, types));
  // Turn the layout square to the page: bonds as close as possible to multiples of 30 degrees.
  const turn = squareAngle(doc.bonds.map((b) => [positions.get(b.a)!, positions.get(b.b)!]));
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  for (const a of doc.atoms) {
    const p = positions.get(a.id) ?? new Point2D(0, 0);
    a.x = p.x * c - p.y * s;
    a.y = p.x * s + p.y * c;
  }
  ed.loadDocument(doc);

  // Stereocentres: a wedge (or hash) on one bond, whichever gives the written @/@@.
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    if (!atom.chiral) continue;
    const order = atom.order.map((n) => n + 1);
    const h = atom.hCount ?? 0;
    if (order.length + h !== 4 || h > 1) continue;
    const centre = i + 1;
    // Prefer a bond to an atom that is not a stereocentre itself, outside rings, to a small branch.
    const candidates = [...order].sort((p, q) => {
      const score = (n: number) =>
        (atoms[n - 1].chiral ? 10 : 0) + (inRing(bonds, centre - 1, n - 1) ? 5 : 0) + atoms[n - 1].order.length;
      return score(p) - score(q);
    });
    for (const n of candidates) {
      const bond = doc.bonds.find((b) => (b.a === centre && b.b === n) || (b.a === n && b.b === centre))!;
      if (bond.chirality !== BondChirality.NONE || bond.type !== BondType.SINGLE) continue;
      bond.chirality = BondChirality.WEDGE;
      bond.stereoCentre = centre;
      ed.loadDocument(doc);
      const got = tetrahedral(ed, centre, order, h, atom.hasPrevious);
      if (got === '') {
        bond.chirality = BondChirality.NONE;
        bond.stereoCentre = null;
        continue;
      }
      if (got !== atom.chiral) bond.chirality = BondChirality.HASH;
      ed.loadDocument(doc);
      break;
    }
  }
  return { atoms: doc.atoms, bonds: doc.bonds };
}

/** Tokenise and read a SMILES string into atoms and bonds (indexes from 0). */
function readSmiles(smiles: string): { atoms: SAtom[]; bonds: SBond[] } {
  const atoms: SAtom[] = [];
  const bonds: SBond[] = [];
  const stack: number[] = [];
  const rings = new Map<number, { atom: number; slot: number; order: number | null; dir: SBond['dir'] }>();
  let previous = -1;
  let pendingOrder: number | null = null;
  let pendingDir: SBond['dir'] = '';
  let i = 0;

  const fail = (why: string): never => {
    throw new Error(`Not a valid SMILES (${why} at position ${i + 1})`);
  };
  const bondOrder = (a: number, b: number, explicit: number | null) =>
    explicit ?? (atoms[a].aromatic && atoms[b].aromatic ? 0 : 1);
  const addAtom = (atom: SAtom) => {
    const index = atoms.length;
    atoms.push(atom);
    if (previous >= 0) {
      bonds.push({ a: previous, b: index, order: bondOrder(previous, index, pendingOrder), dir: pendingDir });
      atoms[previous].order.push(index);
      atom.order.push(previous);
      atom.hasPrevious = true;
    }
    pendingOrder = null;
    pendingDir = '';
    previous = index;
  };
  const newAtom = (symbol: string, aromatic: boolean): SAtom => ({
    symbol, aromatic, charge: 0, hCount: null, chiral: '', order: [], hasPrevious: false,
  });

  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(') {
      if (previous < 0) fail('branch with no atom before it');
      stack.push(previous);
      i++;
    } else if (ch === ')') {
      if (!stack.length) fail('unmatched )');
      previous = stack.pop()!;
      i++;
    } else if (ch === '.') {
      previous = -1;
      i++;
    } else if (ch === '-' || ch === '=' || ch === '#' || ch === '$' || ch === ':') {
      pendingOrder = ch === '-' ? 1 : ch === '=' ? 2 : ch === '#' ? 3 : ch === '$' ? 4 : 0;
      i++;
    } else if (ch === '/' || ch === '\\') {
      pendingDir = ch;
      pendingOrder = 1;
      i++;
    } else if (/[0-9%]/.test(ch)) {
      if (previous < 0) fail('ring number with no atom');
      let digit: number;
      if (ch === '%') {
        digit = Number(smiles.slice(i + 1, i + 3));
        if (!Number.isFinite(digit)) fail('bad %nn ring number');
        i += 3;
      } else {
        digit = Number(ch);
        i++;
      }
      const open = rings.get(digit);
      if (open) {
        const order = bondOrder(open.atom, previous, pendingOrder ?? open.order);
        bonds.push({ a: open.atom, b: previous, order, dir: '' });
        atoms[open.atom].order[open.slot] = previous;
        atoms[previous].order.push(open.atom);
        rings.delete(digit);
      } else {
        rings.set(digit, { atom: previous, slot: atoms[previous].order.length, order: pendingOrder, dir: pendingDir });
        atoms[previous].order.push(-1); // filled when the ring closes
      }
      pendingOrder = null;
      pendingDir = '';
    } else if (ch === '[') {
      const end = smiles.indexOf(']', i);
      if (end < 0) fail('unclosed [');
      const inner = smiles.slice(i + 1, end);
      const m = inner.match(/^(\d*)(\*|[A-Z][a-z]?|[a-z]{1,2})(@{1,2}(?:TH[12]|AL[12]|SP[123]|TB\d+|OH\d+)?)?(H\d*)?([+-]+\d*)?(:\d+)?$/);
      if (!m) fail(`cannot read [${inner}]`);
      const [, , sym, chiral, hs, chg] = m!;
      let atom: SAtom;
      if (sym === '*') {
        atom = { ...newAtom('C', false), label: '*' };
      } else {
        const aromatic = sym === sym.toLowerCase();
        const symbol = aromatic ? sym[0].toUpperCase() + sym.slice(1) : sym;
        if (!periodicTable.getBySymbol(symbol)) fail(`unknown element ${sym}`);
        atom = newAtom(symbol, aromatic);
      }
      atom.hCount = hs ? (hs.length > 1 ? Number(hs.slice(1)) : 1) : 0;
      if (chiral === '@' || chiral === '@@') atom.chiral = chiral;
      if (chg) {
        const sign = chg[0] === '+' ? 1 : -1;
        const digits = chg.replace(/[+-]/g, '');
        atom.charge = sign * (digits ? Number(digits) : chg.length);
      }
      addAtom(atom);
      i = end + 1;
    } else if (ch === '*') {
      addAtom({ ...newAtom('C', false), label: '*' });
      i++;
    } else {
      const organic = ORGANIC.find((s) => smiles.startsWith(s, i));
      if (organic) {
        addAtom(newAtom(organic, false));
        i += organic.length;
      } else if (AROMATIC_ORGANIC.includes(ch)) {
        addAtom(newAtom(ch.toUpperCase(), true));
        i++;
      } else {
        fail(`unexpected "${ch}"`);
      }
    }
  }
  if (rings.size) throw new Error('Not a valid SMILES (a ring is never closed)');
  if (stack.length) throw new Error('Not a valid SMILES (unclosed branch)');
  return { atoms, bonds };
}

/** Normal valence used to decide which aromatic atoms take a double bond. */
const AROMATIC_VALENCE: Record<string, number> = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, Se: 2, As: 3 };

/**
 * Turn aromatic bonds into single/double bonds. An aromatic atom takes one double bond when its
 * valence is not already filled by its other bonds and its written hydrogens (so [nH] in pyrrole does
 * not, but n in pyridine does). Double bonds are placed by a maximum matching; if no complete
 * assignment exists the bonds stay aromatic.
 */
function kekulizeSmiles(atoms: SAtom[], bonds: SBond[]): BondType[] {
  const types = bonds.map((b) =>
    b.order === 2 ? BondType.DOUBLE : b.order === 3 ? BondType.TRIPLE : b.order === 0 ? BondType.AROMATIC : BondType.SINGLE
  );
  const aromaticBonds = bonds.map((_, i) => i).filter((i) => types[i] === BondType.AROMATIC);
  if (aromaticBonds.length === 0) return types;

  const needs = atoms.map((a, idx) => {
    if (!a.aromatic) return false;
    let valence = AROMATIC_VALENCE[a.symbol] ?? 0;
    // Charged atoms behave like their neighbours in the table: N+ like C, O+ like N, C- like N...
    if (a.charge) valence += a.symbol === 'C' || a.symbol === 'B' ? -Math.abs(a.charge) : a.charge;
    let used = a.hCount ?? 0;
    for (const b of bonds) {
      if (b.a !== idx && b.b !== idx) continue;
      used += b.order === 0 ? 1 : b.order;
    }
    return valence - used >= 1;
  });

  // Maximum matching over aromatic bonds between atoms that need a double bond (augmenting paths).
  const mate = new Map<number, number>(); // atom -> bond index
  const adj = new Map<number, number[]>();
  for (const i of aromaticBonds) {
    const { a, b } = bonds[i];
    if (!needs[a] || !needs[b]) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(i);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(i);
  }
  const other = (i: number, v: number) => (bonds[i].a === v ? bonds[i].b : bonds[i].a);
  const augment = (v: number, seen: Set<number>): boolean => {
    for (const i of adj.get(v) ?? []) {
      const w = other(i, v);
      if (seen.has(w)) continue;
      seen.add(w);
      const wBond = mate.get(w);
      if (wBond === undefined || augment(other(wBond, w), seen)) {
        mate.set(v, i);
        mate.set(w, i);
        return true;
      }
    }
    return false;
  };
  for (const v of adj.keys()) if (!mate.has(v)) augment(v, new Set([v]));
  const complete = atoms.every((_, idx) => !needs[idx] || mate.has(idx));
  if (!complete) return types; // leave aromatic; the editor shows its own Kekulé form

  const doubles = new Set(mate.values());
  for (const i of aromaticBonds) types[i] = doubles.has(i) ? BondType.DOUBLE : BondType.SINGLE;
  return types;
}

/** Cis/trans constraints from / and \ around double bonds (atom ids from 1, as in the document). */
function cisTransOf(bonds: SBond[], types: BondType[]) {
  const result: Array<{ a: number; b: number; onA: number; onB: number; cis: boolean }> = [];
  /** For a directional bond touching `v`: its other atom, and whether that atom is "up" relative to v. */
  const marked = (v: number, partner: number) => {
    for (const b of bonds) {
      if (!b.dir || (b.a !== v && b.b !== v)) continue;
      const n = b.a === v ? b.b : b.a;
      if (n === partner) continue;
      // Written a then b: '/' means b is up relative to a.
      const bUpFromA = b.dir === '/';
      return { n, up: b.a === v ? bUpFromA : !bUpFromA };
    }
    return null;
  };
  bonds.forEach((bond, i) => {
    if (types[i] !== BondType.DOUBLE || bond.order !== 2) return;
    const x = marked(bond.a, bond.b);
    const y = marked(bond.b, bond.a);
    if (!x || !y) return;
    result.push({ a: bond.a + 1, b: bond.b + 1, onA: x.n + 1, onB: y.n + 1, cis: x.up === y.up });
  });
  return result;
}

/** Whether bond a-b lies on a ring in the parsed SMILES. */
function inRing(bonds: SBond[], a: number, b: number): boolean {
  const adj = new Map<number, number[]>();
  for (const bd of bonds) {
    (adj.get(bd.a) ?? adj.set(bd.a, []).get(bd.a)!).push(bd.b);
    (adj.get(bd.b) ?? adj.set(bd.b, []).get(bd.b)!).push(bd.a);
  }
  const seen = new Set([a]);
  const queue = [a];
  for (let k = 0; k < queue.length; k++) {
    for (const n of adj.get(queue[k]) ?? []) {
      if (queue[k] === a && n === b) continue;
      if (n === b) return true;
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

/** Rotation (radians, within +-15 degrees) that brings bond directions closest to multiples of 30 degrees. */
function squareAngle(segments: Array<[Point2D, Point2D]>): number {
  if (segments.length === 0) return 0;
  const directions = segments.map(([p, q]) => Math.atan2(q.y - p.y, q.x - p.x));
  let best = 0;
  let bestCost = Infinity;
  for (let k = -30; k <= 30; k++) {
    const t = (k / 30) * (Math.PI / 12);
    const cost = directions.reduce((sum, d) => sum + 1 - Math.cos(12 * (d + t)), 0);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = t;
    }
  }
  return best;
}
