import { BondType } from '../core/Bond';
import { bondKey, kekulize } from '../core/Kekule';
import { Molecule } from '../core/Molecule';

/**
 * Chemistry check: atoms with more bonds than their element allows.
 *
 * Bond orders are summed (single 1, double 2, triple 3; aromatic bonds take their Kekulé
 * order) and compared with the largest normal valence of the element, adjusted for the
 * atom's formal charge (N+ may have 4 bonds like carbon, O- only 1, C+ and C- 3, B- 4...).
 */

/** Normal valences of main-group elements. Elements not listed here are not checked (metals etc.). */
const VALENCES: Record<string, number[]> = {
  H: [1],
  B: [3],
  C: [4],
  Si: [4],
  Ge: [4],
  N: [3],
  P: [3, 5],
  As: [3, 5],
  O: [2],
  S: [2, 4, 6],
  Se: [2, 4, 6],
  Te: [2, 4, 6],
  F: [1],
  Cl: [1, 3, 5, 7],
  Br: [1, 3, 5, 7],
  I: [1, 3, 5, 7],
};

/** How a formal charge changes the allowed valence, by element family. */
function chargeAdjusted(symbol: string, valence: number, charge: number): number {
  if (charge === 0) return valence;
  switch (symbol) {
    case 'H':
    case 'C':
    case 'Si':
    case 'Ge':
      return valence - Math.abs(charge); // carbocation and carbanion: 3 bonds
    case 'B':
      return valence - charge; // borate B-: 4 bonds
    default:
      return valence + charge; // ammonium N+: 4, oxonium O+: 3, alkoxide O-: 1
  }
}

/** Largest number of bonds (counting bond order) the atom may have, or undefined if not checked. */
export function maxValence(symbol: string, charge: number): number | undefined {
  const normal = VALENCES[symbol];
  if (!normal) return undefined;
  return Math.max(0, chargeAdjusted(symbol, Math.max(...normal), charge));
}

export interface ValenceProblem {
  symbol: string;
  /** Sum of bond orders on the atom. */
  bonds: number;
  /** Most bonds allowed. */
  max: number;
}

function order(type: BondType): number {
  switch (type) {
    case BondType.DOUBLE:
      return 2;
    case BondType.TRIPLE:
      return 3;
    case BondType.AROMATIC:
      return 1.5;
    default:
      return 1;
  }
}

/**
 * Atoms that exceed their valence. Atoms in `skip` (e.g. those showing a text label such as
 * NO2, whose bonding is inside the label) are not checked.
 */
export function valenceProblems(molecule: Molecule, skip: Set<number> = new Set()): Map<number, ValenceProblem> {
  const problems = new Map<number, ValenceProblem>();
  const kekule = kekulize(molecule);
  for (const atom of molecule.getAtoms()) {
    if (skip.has(atom.id)) continue;
    const symbol = atom.element.symbol;
    const max = maxValence(symbol, atom.charge);
    if (max === undefined) continue;
    let bonds = 0;
    for (const bond of molecule.getBondsForAtom(atom.id)) {
      const type =
        bond.type === BondType.AROMATIC ? kekule.get(bondKey(bond.atomId1, bond.atomId2)) ?? bond.type : bond.type;
      bonds += order(type);
    }
    // Aromatic bonds left without a Kekulé order count 1.5; round so a ring atom is not flagged by half a bond.
    if (Math.round(bonds) > max) problems.set(atom.id, { symbol, bonds: Math.round(bonds), max });
  }
  return problems;
}

/** Human-readable description of a problem, for the status bar. */
export function describeProblem(p: ValenceProblem, elementName: string): string {
  return `${elementName} has ${p.bonds} bonds; at most ${p.max} allowed`;
}

/**
 * Implicit hydrogens on an atom: the smallest normal valence (adjusted for charge) that its
 * bond orders fit, minus those bonds. 0 for elements that are not checked, or an over-full atom.
 */
export function implicitHydrogens(symbol: string, charge: number, bondOrderSum: number): number {
  const normal = VALENCES[symbol];
  if (!normal || symbol === 'H') return 0;
  const used = Math.round(bondOrderSum);
  for (const v of normal.map((n) => chargeAdjusted(symbol, n, charge)).sort((a, b) => a - b)) {
    if (v >= used) return v - used;
  }
  return 0;
}
