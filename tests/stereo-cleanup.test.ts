import { describe, it, expect } from 'vitest';
import { Editor, EditorDocument } from '../src/app/editor';
import { BondChirality } from '../src/core/Bond';
import { CoordinateGenerator } from '../src/draw/CoordinateGenerator';
import { DrawingConfig } from '../src/draw/DrawingConfig';
import { stereoHandedness } from '../src/app/stereo';

const gen = new CoordinateGenerator(new DrawingConfig({ bondLength: 30 }));

/** Random tree-shaped drawings with a wedge or hash on every branching atom. */
function randomDrawing(seed: number): { doc: EditorDocument; centres: number[] } {
  let r = seed * 7919 + 17;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const n = 8 + Math.floor(rnd() * 8);
  const atoms = Array.from({ length: n }, (_, i) => ({
    id: i + 1, symbol: rnd() < 0.15 ? 'O' : 'C', charge: 0, x: 300 + rnd() * 200, y: 300 + rnd() * 200,
  }));
  const bonds: EditorDocument['bonds'] = [];
  const degree = new Map<number, number>();
  for (let i = 2; i <= n; i++) {
    let a = 1 + Math.floor(rnd() * (i - 1));
    while ((degree.get(a) ?? 0) >= 4) a = 1 + ((a) % (i - 1));
    bonds.push({ a, b: i, type: 1, chirality: 0, stereoCentre: null });
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(i, (degree.get(i) ?? 0) + 1);
  }
  const centres = [...degree].filter(([, d]) => d >= 3).map(([id]) => id);
  for (const c of centres) {
    const bond = bonds.find((b) => (b.a === c || b.b === c) && b.stereoCentre === null)!;
    if (!bond) continue;
    bond.chirality = rnd() < 0.5 ? BondChirality.WEDGE : BondChirality.HASH;
    bond.stereoCentre = c;
  }
  return { doc: { format: 'tsdraw-document', version: 1, name: 't', atoms, bonds }, centres };
}

describe('clean up keeps R/S at stereocentres', () => {
  it('no stereocentre changes handedness over many random drawings', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { doc, centres } = randomDrawing(seed);
      const ed = new Editor(30);
      ed.loadDocument(doc);
      const before = centres.map((c) => ed.stereoSign(c));
      ed.relayout(gen);
      centres.forEach((c, i) => {
        if (before[i] === 0) return;
        checked++;
        expect(ed.stereoSign(c), `seed ${seed}, centre ${c}`).toBe(before[i]);
      });
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('stereo handedness', () => {
  it('a wedge and a hash on the same position give opposite handedness; mirroring inverts it', () => {
    const up: Array<[number, number, number]> = [[1, 0, 1], [-0.5, 0.87, 0], [-0.5, -0.87, 0]];
    const down = up.map(([x, y, z]) => [x, y, -z] as [number, number, number]);
    const mirror = up.map(([x, y, z]) => [-x, y, z] as [number, number, number]);
    expect(stereoHandedness(up)).toBe(-stereoHandedness(down));
    expect(stereoHandedness(up)).toBe(-stereoHandedness(mirror));
    expect(stereoHandedness(up.map(([x, y]) => [x, y, 0] as [number, number, number]))).toBe(0);
  });
});
