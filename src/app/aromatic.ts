/**
 * Aromatic ring perception for display (top bar › Aromatic / Kekulé).
 *
 * In "circle" display, each aromatic ring is drawn with single lines and an inner circle
 * (IUPAC GR-6); in Kekulé display, with alternating single and double bonds. Only the drawing
 * changes: the molecule, SMILES and MOL output stay in Kekulé form.
 *
 * A ring (5 to 7 atoms) counts as aromatic when every atom is part of the π system and the
 * ring holds 4n + 2 π electrons (Hückel), counted on the Kekulé form:
 *   1  an atom with a double bond to another ring atom (in this ring or a fused one);
 *   2  N, O, S, Se, P with no double bond (pyrrole, furan, thiophene), or a carbanion;
 *   0  a carbocation (tropylium).
 * An exocyclic double bond (C=O in a quinone or pyridone), a triple bond or an sp3 carbon
 * makes the ring non-aromatic.
 */
import { BondType } from '../core/Bond';
import { bondKey, kekulize } from '../core/Kekule';
import { Molecule } from '../core/Molecule';
import { smallRings } from '../draw/OrganicLayout';

const LONE_PAIR_DONORS = new Set(['N', 'O', 'S', 'Se', 'P']);

/** Aromatic rings of the molecule, each as ordered atom ids. */
export function aromaticRings(molecule: Molecule, kekule: Map<string, BondType> = kekulize(molecule)): number[][] {
  const adjacency = new Map<number, number[]>();
  for (const atom of molecule.getAtoms()) adjacency.set(atom.id, []);
  for (const b of molecule.getBonds()) {
    adjacency.get(b.atomId1)?.push(b.atomId2);
    adjacency.get(b.atomId2)?.push(b.atomId1);
  }
  const rings = smallRings(adjacency);
  if (rings.length === 0) return [];

  const ringAtoms = new Set(rings.flat());
  const order = (a: number, b: number): BondType | undefined => {
    const bond = molecule.getBond(a, b);
    if (!bond) return undefined;
    return bond.type === BondType.AROMATIC ? kekule.get(bondKey(a, b)) ?? BondType.SINGLE : bond.type;
  };

  /** π electrons the atom gives a ring, or null when it breaks the π system. */
  const electrons = (id: number): number | null => {
    const atom = molecule.getAtom(id);
    if (!atom) return null;
    let ringDouble = false;
    for (const w of adjacency.get(id) ?? []) {
      const t = order(id, w);
      if (t === BondType.TRIPLE) return null;
      if (t === BondType.DOUBLE) {
        if (!ringAtoms.has(w)) return null; // exocyclic C=O, C=C …
        ringDouble = true;
      }
    }
    if (ringDouble) return 1;
    const symbol = atom.element.symbol;
    if (LONE_PAIR_DONORS.has(symbol) && atom.charge <= 0) return 2;
    if (symbol === 'C' && atom.charge === -1) return 2;
    if ((symbol === 'C' || symbol === 'B') && (atom.charge === 1 || symbol === 'B')) return 0;
    return null;
  };

  const result: number[][] = [];
  for (const ring of rings) {
    if (ring.length < 5 || ring.length > 7) continue;
    let total = 0;
    let ok = true;
    for (const id of ring) {
      const e = electrons(id);
      if (e === null) {
        ok = false;
        break;
      }
      total += e;
    }
    // Every ring needs at least one double bond inside it, or a fused ring would claim it alone.
    const hasDouble = ring.some((id, i) => order(id, ring[(i + 1) % ring.length]) === BondType.DOUBLE);
    if (ok && hasDouble && total % 4 === 2) result.push(ring);
  }
  return result;
}

/** bondKey of every bond lying in one of the rings. */
export function ringBondKeys(rings: number[][]): Set<string> {
  const keys = new Set<string>();
  for (const ring of rings) ring.forEach((id, i) => keys.add(bondKey(id, ring[(i + 1) % ring.length])));
  return keys;
}
