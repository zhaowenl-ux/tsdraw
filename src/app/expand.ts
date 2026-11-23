import { BondType } from '../core/Bond';
import { periodicTable } from '../core/Element';
import { reverseLabel } from './labels';

/**
 * Expanding text labels (NO2, COOH, OMe, Ph...) into real atoms and bonds.
 *
 * A fragment is a small graph whose atom 0 is the attachment atom: the one that takes the
 * labelled atom's place and its bonds to the rest of the molecule.
 */
export interface Fragment {
  atoms: Array<{ symbol: string; charge: number }>;
  bonds: Array<[number, number, BondType]>;
}

/** Known groups, written as SMILES with the attachment atom first. */
const GROUPS: Record<string, string> = {
  // nitrogen
  NO2: '[N+](=O)[O-]',
  NO: 'N=O',
  NH2: 'N',
  NHMe: 'NC',
  NMe2: 'N(C)C',
  NEt2: 'N(CC)CC',
  NHAc: 'NC(C)=O',
  NHBoc: 'NC(=O)OC(C)(C)C',
  N3: 'N=[N+]=[N-]',
  NCO: 'N=C=O',
  NCS: 'N=C=S',
  CN: 'C#N',
  NC: '[N+]#[C-]',
  CONH2: 'C(N)=O',
  CONHMe: 'C(=O)NC',
  CONMe2: 'C(=O)N(C)C',
  // carbonyls
  COOH: 'C(=O)O',
  CO2H: 'C(=O)O',
  CHO: 'C=O',
  COMe: 'C(C)=O',
  Ac: 'C(C)=O',
  COOMe: 'C(=O)OC',
  CO2Me: 'C(=O)OC',
  COOEt: 'C(=O)OCC',
  CO2Et: 'C(=O)OCC',
  CO2tBu: 'C(=O)OC(C)(C)C',
  COOtBu: 'C(=O)OC(C)(C)C',
  COCl: 'C(Cl)=O',
  Boc: 'C(=O)OC(C)(C)C',
  Cbz: 'C(=O)OCc1ccccc1',
  Bz: 'C(=O)c1ccccc1',
  // oxygen
  OH: 'O',
  OMe: 'OC',
  OEt: 'OCC',
  OiPr: 'OC(C)C',
  OtBu: 'OC(C)(C)C',
  OPh: 'Oc1ccccc1',
  OBn: 'OCc1ccccc1',
  OAc: 'OC(C)=O',
  OCF3: 'OC(F)(F)F',
  OTf: 'OS(=O)(=O)C(F)(F)F',
  OTs: 'OS(=O)(=O)c1ccc(C)cc1',
  OMs: 'OS(C)(=O)=O',
  CH2OH: 'CO',
  // sulfur
  SH: 'S',
  SMe: 'SC',
  SCN: 'SC#N',
  SO2Me: 'S(C)(=O)=O',
  Ms: 'S(C)(=O)=O',
  SO3H: 'S(=O)(=O)O',
  SO2NH2: 'S(N)(=O)=O',
  SO2Cl: 'S(Cl)(=O)=O',
  Ts: 'S(=O)(=O)c1ccc(C)cc1',
  Tf: 'S(=O)(=O)C(F)(F)F',
  SF5: 'S(F)(F)(F)(F)F',
  // carbon
  Me: 'C',
  CH3: 'C',
  Et: 'CC',
  Pr: 'CCC',
  nPr: 'CCC',
  iPr: 'C(C)C',
  Bu: 'CCCC',
  nBu: 'CCCC',
  iBu: 'CC(C)C',
  sBu: 'C(C)CC',
  tBu: 'C(C)(C)C',
  CF3: 'C(F)(F)F',
  CCl3: 'C(Cl)(Cl)Cl',
  CHF2: 'C(F)F',
  Ph: 'c1ccccc1',
  Bn: 'Cc1ccccc1',
  Vinyl: 'C=C',
  // silicon
  TMS: '[Si](C)(C)C',
  SiMe3: '[Si](C)(C)C',
  TBS: '[Si](C)(C)C(C)(C)C',
  TBDMS: '[Si](C)(C)C(C)(C)C',
};

/** Fragment for a label, or null when it cannot be expanded. Reversed writings (O2N, HOOC, MeO) are understood. */
export function fragmentFor(label: string): Fragment | null {
  const text = label.trim();
  for (const candidate of [text, reverseLabel(text)]) {
    if (GROUPS[candidate]) return parseSmiles(GROUPS[candidate]);
    const condensed = parseCondensed(candidate);
    if (condensed) return condensed;
  }
  return null;
}

// ---------- a small SMILES reader (enough for the groups above) ----------

const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];

export function parseSmiles(smiles: string): Fragment {
  const atoms: Fragment['atoms'] = [];
  const aromatic: boolean[] = [];
  const bonds: Fragment['bonds'] = [];
  const stack: number[] = [];
  const rings = new Map<string, [number, BondType | null]>();
  let previous = -1;
  let pending: BondType | null = null;
  let i = 0;

  const addAtom = (symbol: string, charge: number, isAromatic: boolean) => {
    const index = atoms.length;
    atoms.push({ symbol, charge });
    aromatic.push(isAromatic);
    if (previous >= 0) bonds.push([previous, index, bondBetween(previous, index, pending)]);
    pending = null;
    previous = index;
  };
  const bondBetween = (a: number, b: number, explicit: BondType | null): BondType =>
    explicit ?? (aromatic[a] && aromatic[b] ? BondType.AROMATIC : BondType.SINGLE);

  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(') {
      stack.push(previous);
      i++;
    } else if (ch === ')') {
      previous = stack.pop()!;
      i++;
    } else if (ch === '=') {
      pending = BondType.DOUBLE;
      i++;
    } else if (ch === '#') {
      pending = BondType.TRIPLE;
      i++;
    } else if (/[0-9]/.test(ch)) {
      const open = rings.get(ch);
      if (open) {
        bonds.push([open[0], previous, bondBetween(open[0], previous, open[1] ?? pending)]);
        rings.delete(ch);
      } else {
        rings.set(ch, [previous, pending]);
      }
      pending = null;
      i++;
    } else if (ch === '[') {
      const end = smiles.indexOf(']', i);
      const inner = smiles.slice(i + 1, end);
      const m = inner.match(/^([A-Z][a-z]?)([+-]?)(\d*)$/)!;
      const charge = m[2] ? (m[2] === '+' ? 1 : -1) * (m[3] ? Number(m[3]) : 1) : 0;
      addAtom(m[1], charge, false);
      i = end + 1;
    } else if (/[cnos]/.test(ch)) {
      addAtom(ch.toUpperCase(), 0, true);
      i++;
    } else {
      const symbol = ORGANIC.find((s) => smiles.startsWith(s, i))!;
      addAtom(symbol, 0, false);
      i += symbol.length;
    }
  }
  return { atoms, bonds };
}

// ---------- condensed formulas: CH2CH2OH, CH2Ph, C(CH3)3, CH2CF3 ... ----------

const NORMAL_VALENCE: Record<string, number[]> = {
  C: [4], N: [3], O: [2], S: [2, 4, 6], P: [3, 5], B: [3], Si: [4], F: [1], Cl: [1], Br: [1], I: [1],
};
const TERMINAL = new Set(['F', 'Cl', 'Br', 'I']);

/**
 * Read a condensed formula written left to right from the attachment atom: each heavy atom bonds to
 * the one before it; hydrogens and halogens (and groups in brackets, or known groups such as Me, Ph)
 * hang off the atom before them. All bonds are single, so the result is only accepted when every
 * atom's written hydrogens exactly fill its valence (CH2CH2OH yes; CO2H is left to the table above).
 */
function parseCondensed(text: string): Fragment | null {
  const frag: Fragment = { atoms: [], bonds: [] };
  const hydrogens: number[] = [];
  const read = parseInto(text, frag, hydrogens, -1);
  if (read === null || frag.atoms.length === 0) return null;

  // The attachment atom also has its bond to the rest of the molecule.
  const order = (t: BondType) => (t === BondType.DOUBLE ? 2 : t === BondType.TRIPLE ? 3 : t === BondType.AROMATIC ? 1.5 : 1);
  for (let k = 0; k < frag.atoms.length; k++) {
    if (hydrogens[k] < 0) continue;
    const allowed = NORMAL_VALENCE[frag.atoms[k].symbol];
    if (!allowed) return null;
    let used = (k === 0 ? 1 : 0) + hydrogens[k];
    for (const [a, b, t] of frag.bonds) if (a === k || b === k) used += order(t);
    if (!allowed.includes(Math.round(used))) return null;
  }
  return frag;
}

/** Parse `text` into `frag`, bonding its first atom to `parent` (or none). Returns the index of the first atom. */
function parseInto(text: string, frag: Fragment, hydrogens: number[], parent: number): number | null {
  let current = parent;
  let first = -1;
  let i = 0;
  const attach = (sub: Fragment, times: number) => {
    for (let n = 0; n < times; n++) {
      const offset = frag.atoms.length;
      frag.atoms.push(...sub.atoms);
      sub.atoms.forEach(() => hydrogens.push(-1)); // groups from the table: implicit hydrogens, not checked
      for (const [a, b, t] of sub.bonds) frag.bonds.push([a + offset, b + offset, t]);
      if (current >= 0) frag.bonds.push([current, offset, BondType.SINGLE]);
      if (first < 0) first = offset;
    }
  };
  const count = (): number => {
    let j = i;
    while (j < text.length && /[0-9]/.test(text[j])) j++;
    const n = j > i ? Number(text.slice(i, j)) : 1;
    i = j;
    return n;
  };

  while (i < text.length) {
    if (text[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      }
      if (depth !== 0 || current < 0) return null;
      const inner = text.slice(i + 1, j - 1);
      i = j;
      const times = count();
      for (let n = 0; n < times; n++) if (parseInto(inner, frag, hydrogens, current) === null) return null;
      continue;
    }
    const group = Object.keys(GROUPS)
      .filter((k) => k.length >= 2 && /^[A-Z][a-z]/.test(k) && !periodicTable.getBySymbol(k))
      .sort((a, b) => b.length - a.length)
      .find((k) => text.startsWith(k, i));
    if (group) {
      i += group.length;
      const times = count();
      if (current < 0 && times === 1) {
        // A group at the start is the attachment itself, and later atoms continue from its first atom.
        attach(parseSmiles(GROUPS[group]), 1);
        current = first;
      } else {
        attach(parseSmiles(GROUPS[group]), times);
      }
      continue;
    }
    const m = text.slice(i).match(/^([A-Z][a-z]?)/);
    if (!m || !periodicTable.getBySymbol(m[1])) return null;
    const symbol = m[1];
    i += symbol.length;
    const times = count();
    if (symbol === 'H') {
      if (current < 0 || hydrogens[current] < 0) return null;
      hydrogens[current] += times;
      continue;
    }
    if (TERMINAL.has(symbol) || times > 1) {
      if (current < 0 && times === 1) {
        // A lone halogen at the start (rare): it is the attachment atom.
      } else {
        if (current < 0) return null;
        for (let n = 0; n < times; n++) {
          frag.atoms.push({ symbol, charge: 0 });
          hydrogens.push(0);
          frag.bonds.push([current, frag.atoms.length - 1, BondType.SINGLE]);
        }
        continue;
      }
    }
    frag.atoms.push({ symbol, charge: 0 });
    hydrogens.push(0);
    const index = frag.atoms.length - 1;
    if (current >= 0) frag.bonds.push([current, index, BondType.SINGLE]);
    if (first < 0) first = index;
    current = index;
  }
  return first < 0 ? null : first;
}
