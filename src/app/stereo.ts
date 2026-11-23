/**
 * Handedness of a stereocentre drawn in 2D with wedges and hashes.
 *
 * Each neighbour becomes a 3D direction: its 2D direction from the centre (unit length) plus a
 * height of +1 (wide end of a wedge from the centre), -1 (hash) or 0 (in the plane).
 * - 4 neighbours (in a fixed order): sign of the volume of the tetrahedron they span.
 * - 3 neighbours (the 4th is an implicit hydrogen): sign of their triple product about the centre.
 * Returns +1 or -1, or 0 when the drawing does not define it (no wedge, or a flat/degenerate layout).
 * The sign only has meaning when compared with the same atom's sign in another drawing.
 */
export function stereoHandedness(directions: Array<[number, number, number]>): number {
  const det = (a: number[], b: number[], c: number[]) =>
    a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  let volume: number;
  if (directions.length === 3) {
    volume = det(directions[0], directions[1], directions[2]);
  } else if (directions.length === 4) {
    const [p, q, r, s] = directions;
    const sub = (u: number[], v: number[]) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
    volume = det(sub(q, p), sub(r, p), sub(s, p));
  } else {
    return 0;
  }
  return Math.abs(volume) < 0.05 ? 0 : Math.sign(volume);
}
