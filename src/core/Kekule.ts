import { BondType } from './Bond';
import { Molecule } from './Molecule';

/** Unique key for an (unordered) atom pair. */
export function bondKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Search budget per aromatic system; beyond this the best result found so far is used. */
const MAX_STEPS = 200_000;

/**
 * Assign a Kekulé structure to the aromatic bonds of a molecule.
 *
 * Returns a map from bondKey(atomId1, atomId2) to SINGLE or DOUBLE for every
 * AROMATIC bond. The molecule itself is not modified, so the aromatic flag is
 * kept for valence counting and export; only the display uses this assignment.
 *
 * Double bonds are placed by a maximum matching over the aromatic atoms.
 * Atoms that already carry a non-aromatic double/triple bond (e.g. C=O in a
 * pyridone) are excluded. When the system has an odd atom count (pyrrole,
 * furan, thiophene...) heteroatoms are preferred as the atoms left without a
 * double bond.
 */
export function kekulize(molecule: Molecule): Map<string, BondType> {
  const result = new Map<string, BondType>();
  const aromatic = molecule.getBonds().filter(b => b.type === BondType.AROMATIC);
  if (aromatic.length === 0) return result;

  for (const b of aromatic) result.set(bondKey(b.atomId1, b.atomId2), BondType.SINGLE);

  // Atoms that cannot take another double bond.
  const blocked = new Set<number>();
  for (const b of molecule.getBonds()) {
    if (b.type === BondType.DOUBLE || b.type === BondType.TRIPLE) {
      blocked.add(b.atomId1);
      blocked.add(b.atomId2);
    }
  }

  const adj = new Map<number, number[]>();
  for (const b of aromatic) {
    if (blocked.has(b.atomId1) || blocked.has(b.atomId2)) continue;
    if (!adj.has(b.atomId1)) adj.set(b.atomId1, []);
    if (!adj.has(b.atomId2)) adj.set(b.atomId2, []);
    adj.get(b.atomId1)!.push(b.atomId2);
    adj.get(b.atomId2)!.push(b.atomId1);
  }

  const isHetero = (id: number): boolean => molecule.getAtom(id)?.element.symbol !== 'C';

  // Solve each connected aromatic system on its own.
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj.get(v)!) {
        if (!seen.has(w)) {
          seen.add(w);
          stack.push(w);
        }
      }
    }

    // Most constrained atoms first, carbons before heteroatoms.
    comp.sort((x, y) => adj.get(x)!.length - adj.get(y)!.length || Number(isHetero(x)) - Number(isHetero(y)));
    const order = new Map(comp.map((id, i) => [id, i]));

    const mate = new Map<number, number>();
    let best: Map<number, number> = new Map();
    let bestScore = -Infinity;
    let steps = 0;
    const maxPairs = Math.floor(comp.length / 2);

    // Score: matched pairs dominate; tie-break by leaving heteroatoms unmatched.
    const score = (pairs: number, unmatchedC: number): number => pairs * 1000 - unmatchedC;

    const search = (i: number, pairs: number, unmatchedC: number): boolean => {
      if (++steps > MAX_STEPS) return true;
      // Upper bound: every remaining atom could still be paired.
      const remaining = comp.length - i;
      if (score(pairs + Math.floor(remaining / 2), unmatchedC) <= bestScore) return false;

      while (i < comp.length && mate.has(comp[i])) i++;
      if (i === comp.length) {
        const s = score(pairs, unmatchedC);
        if (s > bestScore) {
          bestScore = s;
          best = new Map(mate);
        }
        return pairs === maxPairs && unmatchedC === 0;
      }

      const v = comp[i];
      for (const w of adj.get(v)!) {
        if (mate.has(w) || order.get(w)! < i) continue;
        mate.set(v, w);
        mate.set(w, v);
        const done = search(i + 1, pairs + 1, unmatchedC);
        mate.delete(v);
        mate.delete(w);
        if (done) return true;
      }
      // Leave v without a double bond.
      return search(i + 1, pairs, unmatchedC + (isHetero(v) ? 0 : 1));
    };

    search(0, 0, 0);

    for (const [v, w] of best) {
      if (v < w) result.set(bondKey(v, w), BondType.DOUBLE);
    }
  }

  return result;
}
