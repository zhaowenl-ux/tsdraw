import { Molecule } from '../core/Molecule';
import { Bond, BondType, BondChirality } from '../core/Bond';
import { Vector3D } from '../core/Vector3D';
import { periodicTable } from '../core/Element';
import { Point2D } from '../draw/Point2D';
import { CoordinateGenerator } from '../draw/CoordinateGenerator';
import { labelAnchorElement, labelAtomCounts } from './labels';
import { ValenceProblem, maxValence, valenceProblems } from './valence';
import { stereoHandedness } from './stereo';
import { fragmentFor } from './expand';
import { layoutOrganic } from '../draw/OrganicLayout';
import { pointInPolygon, regularPolygon, ringCentreFromAnchor, ringRadius, distanceToSegment } from './geometry';
import { Arrow, ArrowKind, MIN_ARROW_LENGTH, arrowName, distanceToArrow, isArrowKind } from './arrows';

export type BondOrder = BondType.SINGLE | BondType.DOUBLE | BondType.TRIPLE;
export type StereoChirality = BondChirality.WEDGE | BondChirality.HASH | BondChirality.EITHER;
export type RingKind = 'single' | 'aromatic' | 'kekule';

/** How the select tool picks a region: freehand lasso or rectangle. */
export type SelectMode = 'lasso' | 'rect' | 'circle';

export type Tool =
  | { kind: 'select'; mode?: SelectMode }
  | { kind: 'atom'; symbol: string }
  | { kind: 'text' }
  | { kind: 'bond'; type: BondOrder; style?: StereoChirality }
  | { kind: 'stereo'; chirality: StereoChirality }
  | { kind: 'ring'; size: number; ringKind: RingKind }
  /** Reaction arrows: drag to draw, or click for one of default length. */
  | { kind: 'arrow'; arrow: ArrowKind };

export type Selection =
  | { kind: 'atom'; id: number }
  | { kind: 'bond'; a: number; b: number }
  | { kind: 'arrow'; id: number }
  /** Several atoms (from a lasso or rectangle); bonds between them count as selected too. Also any arrows taken. */
  | { kind: 'atoms'; ids: number[]; arrows?: number[] }
  | null;

/** Which end of an arrow is grabbed when dragging it with the select tool. */
export type ArrowGrip = { id: number; end: 'from' | 'to' | 'body' };

/** Plain, JSON-serialisable snapshot of a drawing (used for undo, save and open). */
export interface EditorDocument {
  format: 'tsdraw-document';
  version: 1;
  name: string;
  /** `label` is free text shown instead of the element symbol (e.g. NO2, COOH). */
  atoms: Array<{ id: number; symbol: string; charge: number; x: number; y: number; label?: string }>;
  bonds: Array<{ a: number; b: number; type: number; chirality: number; stereoCentre: number | null }>;
  /** Reaction arrows (optional: drawings without arrows leave it out). */
  arrows?: Array<{ id: number; kind: ArrowKind; x1: number; y1: number; x2: number; y2: number }>;
}

const HIT_RADIUS = 6; // px; kept well under half the bond length so bonds stay easy to pick near atoms
const BOND_HIT_TOLERANCE = 6;
const MERGE_FRACTION = 0.3; // ring vertices closer than this (x bondLength) merge with existing atoms
const CHAIN_MIN_FRACTION = 0.3; // clicks closer than this (x bondLength) do not create a bond
const UNDO_LIMIT = 100;
/** Pick distance for arrows, and for grabbing an arrow's end to stretch it. */
const ARROW_HIT_TOLERANCE = 6;
const ARROW_END_GRIP = 7;
/** A click (no drag) with the arrow tool places an arrow this many bond lengths long. */
const DEFAULT_ARROW_BONDS = 2.5;
/** After clean up, separate pieces are at least this far apart (x bondLength). */
const PIECE_GAP = 1.5;
/** Clean up turns each piece by a multiple of this angle (30 degrees). */
const CLEAN_SNAP = Math.PI / 6;

type BondEnd = { id: number | null; at: Point2D };
type BondPlan =
  | { kind: 'edit'; bond: Bond }
  | { kind: 'stop' }
  | { kind: 'none' }
  | { kind: 'draw'; from: BondEnd; to: BondEnd };

export function bondKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * UI-independent editing model for a molecular drawing.
 * All coordinates are canvas pixels; atom IDs are the core Molecule's numeric IDs.
 */
export class Editor {
  private molecule: Molecule = new Molecule('Untitled');
  private docName = 'Untitled';
  private positions = new Map<number, Point2D>();
  private stereoCentres = new Map<string, number>();
  /** Text labels (functional groups) shown instead of the element symbol. */
  private labels = new Map<number, string>();
  /** Reaction arrows, by id (ids are separate from atom ids). */
  private arrows = new Map<number, Arrow>();
  private nextArrowId = 1;
  private undoStack: EditorDocument[] = [];
  private redoStack: EditorDocument[] = [];

  /** Atom from which the next chain bond will be drawn (bond tool). */
  pending: number | null = null;
  selection: Selection = null;

  private _bondLength: number;

  constructor(bondLength: number = 30) {
    this._bondLength = bondLength;
  }

  get bondLength(): number {
    return this._bondLength;
  }

  /**
   * Change the bond length (Settings › Drawing). The drawing, and every undo/redo step, is scaled about
   * the drawing's centre, so the structure keeps its shape and undo still lines up. Not an undo step itself.
   */
  setBondLength(length: number): void {
    if (!(length > 0) || length === this._bondLength) return;
    const k = length / this._bondLength;
    this._bondLength = length;
    if (this.positions.size === 0 && this.arrows.size === 0) return;
    const c = this.positions.size ? this.pieceCentre([...this.positions.keys()]) : this.arrowsCentre();
    const scale = (x: number, y: number) => new Point2D(c.x + (x - c.x) * k, c.y + (y - c.y) * k);
    for (const [id, p] of this.positions) this.positions.set(id, scale(p.x, p.y));
    for (const a of this.arrows.values()) {
      a.from = scale(a.from.x, a.from.y);
      a.to = scale(a.to.x, a.to.y);
    }
    for (const doc of [...this.undoStack, ...this.redoStack]) {
      for (const atom of doc.atoms) {
        const p = scale(atom.x, atom.y);
        atom.x = p.x;
        atom.y = p.y;
      }
      for (const a of doc.arrows ?? []) {
        const p = scale(a.x1, a.y1);
        const q = scale(a.x2, a.y2);
        [a.x1, a.y1, a.x2, a.y2] = [p.x, p.y, q.x, q.y];
      }
    }
  }

  // ---------- queries ----------

  getMolecule(): Molecule {
    return this.molecule;
  }

  getPosition(id: number): Point2D | undefined {
    return this.positions.get(id);
  }

  /** Chemistry check: atoms with more bonds than their element allows (text-labelled atoms are skipped). */
  valenceProblems(): Map<number, ValenceProblem> {
    return valenceProblems(this.molecule, new Set(this.labels.keys()));
  }

  /** Text label of an atom (e.g. NO2), or undefined if it shows its element symbol. */
  getLabel(id: number): string | undefined {
    return this.labels.get(id);
  }

  /** Atom ID that is the stereocentre (narrow end of a wedge/hash) for this bond. */
  getStereoCentre(a: number, b: number): number | undefined {
    return this.stereoCentres.get(bondKey(a, b));
  }

  atomCount(): number {
    return this.molecule.getAtomCount();
  }

  bondCount(): number {
    return this.molecule.getBondCount();
  }

  /** True when there are no atoms and no arrows. */
  isEmpty(): boolean {
    return this.atomCount() === 0 && this.arrows.size === 0;
  }

  // ---------- reaction arrows ----------

  /** All arrows with their ids (copies: change them with the arrow methods). */
  getArrows(): Array<{ id: number } & Arrow> {
    return [...this.arrows].map(([id, a]) => ({ id, kind: a.kind, from: a.from.clone(), to: a.to.clone() }));
  }

  arrowCount(): number {
    return this.arrows.size;
  }

  /**
   * Add an arrow (one undo step) and select it. A very short one (a click) becomes a default-length
   * arrow pointing right from `from`. Returns its id.
   */
  addArrow(kind: ArrowKind, from: Point2D, to?: Point2D): number {
    let end = to;
    if (!end || from.distanceTo(end) < MIN_ARROW_LENGTH) {
      end = new Point2D(from.x + this.bondLength * DEFAULT_ARROW_BONDS, from.y);
    }
    this.checkpoint();
    const id = this.nextArrowId++;
    this.arrows.set(id, { kind, from: from.clone(), to: end.clone() });
    this.pending = null;
    this.selection = { kind: 'arrow', id };
    return id;
  }

  /** The arrow under p (closest within the pick distance). */
  hitArrow(p: Point2D, tolerance: number = ARROW_HIT_TOLERANCE): number | undefined {
    let best: number | undefined;
    let bestDistance = tolerance;
    for (const [id, a] of this.arrows) {
      const d = distanceToArrow(a, p);
      if (d <= bestDistance) {
        best = id;
        bestDistance = d;
      }
    }
    return best;
  }

  /** The arrow, and which part of it (an end, to stretch it, or the shaft, to move it), under p. */
  arrowGripAt(p: Point2D): ArrowGrip | undefined {
    for (const [id, a] of this.arrows) {
      if (a.to.distanceTo(p) <= ARROW_END_GRIP) return { id, end: 'to' };
      if (a.from.distanceTo(p) <= ARROW_END_GRIP) return { id, end: 'from' };
    }
    const id = this.hitArrow(p);
    return id === undefined ? undefined : { id, end: 'body' };
  }

  /** Move one end of an arrow to p (part of a drag: call beginMove first). */
  setArrowEnd(id: number, end: 'from' | 'to', p: Point2D): void {
    const a = this.arrows.get(id);
    if (!a) return;
    const other = end === 'to' ? a.from : a.to;
    if (other.distanceTo(p) < MIN_ARROW_LENGTH) return;
    a[end] = p.clone();
  }

  /** Shift the given arrows by (dx, dy). */
  moveArrows(ids: Iterable<number>, dx: number, dy: number): void {
    for (const id of ids) {
      const a = this.arrows.get(id);
      if (!a) continue;
      a.from = new Point2D(a.from.x + dx, a.from.y + dy);
      a.to = new Point2D(a.to.x + dx, a.to.y + dy);
    }
  }

  /** Arrows covered by the current selection. */
  selectedArrowIds(): Set<number> {
    const sel = this.selection;
    if (sel?.kind === 'arrow') return new Set([sel.id]);
    if (sel?.kind === 'atoms') return new Set(sel.arrows ?? []);
    return new Set();
  }

  isArrowSelected(id: number): boolean {
    return this.selectedArrowIds().has(id);
  }

  /** Arrows whose middle lies inside the polygon (lasso). */
  arrowsInPolygon(polygon: Point2D[]): number[] {
    if (polygon.length < 3) return [];
    return [...this.arrows].filter(([, a]) => pointInPolygon(midpoint(a), polygon)).map(([id]) => id);
  }

  /** Arrows whose middle lies inside the rectangle with corners a and b. */
  arrowsInRect(a: Point2D, b: Point2D): number[] {
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return [...this.arrows]
      .filter(([, arrow]) => {
        const m = midpoint(arrow);
        return m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1;
      })
      .map(([id]) => id);
  }

  private arrowsCentre(): Point2D {
    let x = 0;
    let y = 0;
    for (const a of this.arrows.values()) {
      x += a.from.x + a.to.x;
      y += a.from.y + a.to.y;
    }
    const n = 2 * Math.max(1, this.arrows.size);
    return new Point2D(x / n, y / n);
  }

  /** Molecular formula in Hill order, with implicit hydrogens counted from default valences. */
  formula(): string {
    return this.atomCount() === 0 ? '' : hillFormula(this.molecule, this.labels);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undoDepth(): number {
    return this.undoStack.length;
  }

  hitAtom(p: Point2D, radius: number = HIT_RADIUS): number | undefined {
    let best: number | undefined;
    let bestDistance = radius;
    for (const [id, pos] of this.positions) {
      if (!this.molecule.hasAtom(id)) continue;
      const d = pos.distanceTo(p);
      if (d <= bestDistance) {
        best = id;
        bestDistance = d;
      }
    }
    return best;
  }

  hitBond(p: Point2D, tolerance: number = BOND_HIT_TOLERANCE): Bond | undefined {
    let best: Bond | undefined;
    let bestDistance = tolerance;
    for (const bond of this.molecule.getBonds()) {
      const a = this.positions.get(bond.atomId1);
      const b = this.positions.get(bond.atomId2);
      if (!a || !b) continue;
      const d = distanceToSegment(p, a, b);
      if (d <= bestDistance) {
        best = bond;
        bestDistance = d;
      }
    }
    return best;
  }

  /**
   * Where the next chain bond would end if the user clicked at p (for previews).
   * Returns null when no bond would be drawn.
   */
  bondEndpoint(p: Point2D, type: BondOrder = BondType.SINGLE): Point2D | null {
    if (this.pending === null) return null;
    const plan = this.planBond(p, type);
    return plan.kind === 'draw' ? plan.to.at : null;
  }

  /**
   * Segment the bond tool would draw for a click at p (for previews).
   * With no chain in progress a click draws a free bond, or starts one from the atom under it.
   */
  bondPreview(p: Point2D, type: BondOrder = BondType.SINGLE): [Point2D, Point2D] | null {
    const plan = this.planBond(p, type);
    return plan.kind === 'draw' ? [plan.from.at, plan.to.at] : null;
  }

  /**
   * Existing atoms the current tool would join a new bond or ring to for a click at p:
   * the atom it starts from, and any existing atom an end or ring vertex lands on (and merges with).
   */
  attachPoints(tool: Tool, p: Point2D): number[] {
    if (tool.kind === 'bond') {
      const plan = this.planBond(p, tool.type);
      if (plan.kind !== 'draw') return [];
      return [plan.from.id, plan.to.id].filter((id): id is number => id !== null);
    }
    if (tool.kind === 'ring') {
      const { vertices, shared, stem } = this.ringLayout(p, tool.size, tool.ringKind);
      const ids = vertices.map((v, i) => shared.get(i) ?? this.findAtomNear(v, this.bondLength * MERGE_FRACTION));
      if (stem !== undefined) ids.push(stem);
      return [...new Set(ids.filter((id): id is number => id !== undefined))];
    }
    return [];
  }

  /** Vertices a ring would occupy if placed by a click at p (for previews). */
  ringPreview(p: Point2D, size: number, ringKind: RingKind = 'single'): Point2D[] {
    return this.ringLayout(p, size, ringKind).vertices;
  }

  /** The new bond a ring placed by a click at p would hang from, if any (for previews). */
  ringPreviewStem(p: Point2D, size: number, ringKind: RingKind = 'single'): [Point2D, Point2D] | null {
    const { vertices, stem } = this.ringLayout(p, size, ringKind);
    const from = stem !== undefined ? this.positions.get(stem) : undefined;
    return from ? [from, vertices[0]] : null;
  }

  // ---------- tool dispatch ----------

  applyTool(tool: Tool, p: Point2D): void {
    switch (tool.kind) {
      case 'select':
        this.selectAt(p);
        return;
      case 'atom':
        this.placeAtom(p, tool.symbol);
        return;
      case 'text':
        // The text itself is typed in the UI and applied with setAtomText; a click just selects.
        this.selectAt(p);
        return;
      case 'bond':
        this.bondClick(p, tool.type, tool.style);
        return;
      case 'stereo':
        this.stereoClick(p, tool.chirality);
        return;
      case 'ring':
        this.ringClick(p, tool.size, tool.ringKind);
        return;
      case 'arrow':
        this.addArrow(tool.arrow, p);
        return;
    }
  }

  cancelChain(): void {
    this.pending = null;
  }

  clearSelection(): void {
    this.selection = null;
  }

  /** Atoms covered by the current selection (none for a single bond). */
  selectedAtomIds(): Set<number> {
    const sel = this.selection;
    if (sel?.kind === 'atom') return new Set([sel.id]);
    if (sel?.kind === 'atoms') return new Set(sel.ids);
    return new Set();
  }

  /** Select several atoms (and arrows) at once; empty lists clear the selection. */
  selectAtoms(ids: Iterable<number>, arrowIds: Iterable<number> = []): void {
    const list = [...new Set(ids)].filter((id) => this.molecule.hasAtom(id));
    const arrows = [...new Set(arrowIds)].filter((id) => this.arrows.has(id));
    if (list.length === 0 && arrows.length === 0) this.selection = null;
    else this.selection = arrows.length ? { kind: 'atoms', ids: list, arrows } : { kind: 'atoms', ids: list };
  }

  /** Atoms whose positions lie inside the polygon (lasso). */
  atomsInPolygon(polygon: Point2D[]): number[] {
    if (polygon.length < 3) return [];
    return [...this.positions].filter(([id, p]) => this.molecule.hasAtom(id) && pointInPolygon(p, polygon)).map(([id]) => id);
  }

  /** Atoms whose positions lie inside the rectangle with corners a and b. */
  atomsInRect(a: Point2D, b: Point2D): number[] {
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return [...this.positions]
      .filter(([id, p]) => this.molecule.hasAtom(id) && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
      .map(([id]) => id);
  }

  /** Whether the atom, or the bond between a and b, is part of the current selection. */
  isSelected(a: number, b?: number): boolean {
    const sel = this.selection;
    if (!sel) return false;
    if (b === undefined) return this.selectedAtomIds().has(a);
    if (sel.kind === 'bond') return (sel.a === a && sel.b === b) || (sel.a === b && sel.b === a);
    if (sel.kind === 'atoms') return sel.ids.includes(a) && sel.ids.includes(b);
    return false;
  }

  /** Start moving atoms (one undo step); then call moveAtoms as the pointer moves. */
  beginMove(): void {
    this.checkpoint();
  }

  /** Shift the given atoms by (dx, dy). */
  moveAtoms(ids: Iterable<number>, dx: number, dy: number): void {
    for (const id of ids) {
      const p = this.positions.get(id);
      if (p) this.positions.set(id, new Point2D(p.x + dx, p.y + dy));
    }
  }

  /** Delete the current selection (atoms with their bonds, or a single bond). */
  deleteSelection(): boolean {
    const sel = this.selection;
    if (!sel) return false;
    this.checkpoint();
    for (const id of this.selectedArrowIds()) this.arrows.delete(id);
    if (sel.kind === 'arrow') {
      // only the arrow
    } else if (sel.kind === 'atom' || sel.kind === 'atoms') {
      const ids = sel.kind === 'atom' ? [sel.id] : sel.ids;
      for (const id of ids) {
        this.molecule.removeAtom(id);
        this.positions.delete(id);
        this.labels.delete(id);
        for (const key of [...this.stereoCentres.keys()]) {
          const [a, b] = key.split('-').map(Number);
          if (a === id || b === id) this.stereoCentres.delete(key);
        }
        if (this.pending === id) this.pending = null;
      }
    } else {
      this.molecule.removeBond(sel.a, sel.b);
      this.stereoCentres.delete(bondKey(sel.a, sel.b));
    }
    this.selection = null;
    return true;
  }

  /** Atom ids of the connected piece that contains atomId (including atomId). */
  connectedPiece(atomId: number): number[] {
    const seen = new Set<number>([atomId]);
    const queue = [atomId];
    for (let i = 0; i < queue.length; i++) {
      for (const next of this.molecule.getConnectedAtoms(queue[i])) {
        if (!seen.has(next.id)) {
          seen.add(next.id);
          queue.push(next.id);
        }
      }
    }
    return queue;
  }

  /** Centre of the drawn positions of the given atoms. */
  pieceCentre(ids: number[]): Point2D {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of ids) {
      const p = this.positions.get(id);
      if (!p) continue;
      x += p.x;
      y += p.y;
      n += 1;
    }
    return n === 0 ? new Point2D(0, 0) : new Point2D(x / n, y / n);
  }

  /**
   * Start a rotation drag: records one undo step for the whole drag.
   * Call rotateAtoms as the pointer moves.
   */
  beginRotation(): void {
    this.checkpoint();
  }

  /** Rotate the given atoms about pivot by angle (radians, canvas convention). Bond lengths are kept. */
  rotateAtoms(ids: number[], pivot: Point2D, angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const id of ids) {
      const p = this.positions.get(id);
      if (!p) continue;
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      this.positions.set(id, new Point2D(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c));
    }
  }

  /** IDs of every atom currently in the drawing. */
  atomIds(): Set<number> {
    return new Set(this.molecule.getAtoms().map((a) => a.id));
  }

  /**
   * Atoms added since `before` (a snapshot from atomIds), provided they hang off `anchor` alone,
   * so the new piece can be swung about that atom without stretching any bond.
   * Returns null when nothing was added or the new atoms are also bonded to other existing atoms.
   */
  attachedPiece(before: Set<number>, anchor: number): number[] | null {
    const added = this.molecule.getAtoms().map((a) => a.id).filter((id) => !before.has(id));
    if (added.length === 0 || !this.molecule.hasAtom(anchor)) return null;
    const allowed = new Set([...added, anchor]);
    for (const id of added) {
      if (this.molecule.getConnectedAtoms(id).some((n) => !allowed.has(n.id))) return null;
    }
    if (!this.molecule.getConnectedAtoms(anchor).some((n) => added.includes(n.id))) return null;
    return added;
  }

  /**
   * Swing atoms about the pivot atom so that their centre points toward `toward`.
   * With `snapDegrees` the direction is rounded to that step. No undo step is recorded
   * (the swing is part of the action that created the atoms).
   */
  swingAtoms(ids: number[], pivotId: number, toward: Point2D, snapDegrees: number = 0): void {
    const pivot = this.positions.get(pivotId);
    if (!pivot || toward.distanceTo(pivot) < 1e-9) return;
    const centre = this.pieceCentre(ids);
    let target = Math.atan2(toward.y - pivot.y, toward.x - pivot.x);
    if (snapDegrees > 0) {
      const step = (snapDegrees * Math.PI) / 180;
      target = Math.round(target / step) * step;
    }
    const current = Math.atan2(centre.y - pivot.y, centre.x - pivot.x);
    this.rotateAtoms(ids, pivot, target - current);
  }

  /**
   * Existing atoms that atoms of a swung piece have landed on: piece atom -> existing atom.
   * The pivot and the piece itself are ignored.
   */
  pieceContacts(ids: number[], pivotId: number): Map<number, number> {
    const inPiece = new Set([...ids, pivotId]);
    const tolerance = this.bondLength * MERGE_FRACTION;
    const contacts = new Map<number, number>();
    const taken = new Set<number>();
    for (const id of ids) {
      const pos = this.positions.get(id);
      if (!pos) continue;
      let best: number | undefined;
      let bestDistance = tolerance;
      for (const [other, q] of this.positions) {
        if (inPiece.has(other) || taken.has(other) || !this.molecule.hasAtom(other)) continue;
        const d = pos.distanceTo(q);
        if (d < bestDistance) {
          best = other;
          bestDistance = d;
        }
      }
      if (best !== undefined) {
        contacts.set(id, best);
        taken.add(best);
      }
    }
    return contacts;
  }

  /**
   * Merge each piece atom into the existing atom it landed on: its bonds move to that atom
   * and the piece atom is removed. Part of the action that created the piece (no undo step).
   */
  mergeContacts(contacts: Map<number, number>): void {
    for (const [from, into] of contacts) {
      for (const bond of this.molecule.getBondsForAtom(from)) {
        const other = bond.getOtherAtom(from);
        const target = contacts.get(other) ?? other;
        if (target !== into && !this.molecule.getBond(into, target)) {
          this.molecule.addBondBetween(into, target, bond.type, bond.chirality);
        }
      }
      for (const key of [...this.stereoCentres.keys()]) {
        const [a, b] = key.split('-').map(Number);
        if (a === from || b === from) this.stereoCentres.delete(key);
      }
      this.molecule.removeAtom(from);
      this.positions.delete(from);
      this.labels.delete(from);
      if (this.pending === from) this.pending = into;
    }
  }

  /**
   * Write text on an atom, e.g. NO2, COOH, CF3, OMe (undoable).
   * - A plain element symbol (Br, S, ...) just changes the element.
   * - Any other text becomes the atom's label; the atom underneath takes the label's first element
   *   (N for NO2, C for COOH) so bonding and valence stay sensible.
   * - Empty text removes the label.
   * With `atomId` undefined, a new free-standing atom with the text is placed at `at`.
   * Returns the atom id, or undefined if nothing changed.
   */
  setAtomText(atomId: number | undefined, text: string, at?: Point2D): number | undefined {
    const value = text.trim();
    if (atomId === undefined) {
      if (!value || !at) return undefined;
      this.checkpoint();
      const isElement = periodicTable.getBySymbol(value) !== undefined;
      const id = this.newAtom(isElement ? value : labelAnchorElement(value), at);
      if (!isElement) this.labels.set(id, value);
      this.selection = { kind: 'atom', id };
      return id;
    }

    const atom = this.molecule.getAtom(atomId);
    if (!atom) return undefined;
    const current = this.labels.get(atomId);
    if (!value) {
      if (current === undefined) return undefined;
      this.checkpoint();
      this.labels.delete(atomId);
      return atomId;
    }
    if (periodicTable.getBySymbol(value)) {
      if (current === undefined && atom.element.symbol === value) return undefined;
      this.checkpoint();
      this.labels.delete(atomId);
      this.setElement(atomId, value);
    } else {
      if (current === value) return undefined;
      this.checkpoint();
      this.labels.set(atomId, value);
      this.setElement(atomId, labelAnchorElement(value));
    }
    this.selection = { kind: 'atom', id: atomId };
    return atomId;
  }

  /**
   * Expand text labels (NO2, COOH, OMe, Ph...) into atoms and bonds (one undo step).
   * Only labels on selected atoms are expanded when the selection has any; otherwise all of them.
   * The labelled atom becomes the group's attachment atom and keeps its bonds; the rest of the group
   * is laid out pointing away from the molecule.
   * Returns how many labels were expanded and which could not be (unknown groups).
   */
  expandLabels(): { expanded: number; failed: string[] } {
    const selected = [...this.selectedAtomIds()].filter((id) => this.labels.has(id));
    const targets = selected.length > 0 ? selected : [...this.labels.keys()];
    const plans = targets.map((id) => ({ id, label: this.labels.get(id)!, fragment: fragmentFor(this.labels.get(id)!) }));
    const ok = plans.filter((p) => p.fragment !== null);
    const failed = plans.filter((p) => p.fragment === null).map((p) => p.label);
    if (ok.length === 0) return { expanded: 0, failed };

    this.checkpoint();
    for (const { id, fragment } of ok) {
      const frag = fragment!;
      const anchor = this.molecule.getAtom(id);
      const at = this.positions.get(id);
      if (!anchor || !at) continue;

      // The labelled atom becomes the attachment atom (atom 0 of the group).
      this.labels.delete(id);
      this.setElement(id, frag.atoms[0].symbol);
      this.molecule.getAtom(id)!.charge = frag.atoms[0].charge;

      // Lay out the group together with the neighbour it hangs from, then fit that bond onto the drawing.
      const parent = this.molecule.getConnectedAtoms(id)[0];
      const temp = new Molecule('group');
      const tempIds: number[] = [];
      for (const a of frag.atoms) tempIds.push(temp.addAtom(periodicTable.getBySymbol(a.symbol)!, new Vector3D(0, 0, 0), a.charge).id);
      for (const [a, b, t] of frag.bonds) temp.addBondBetween(tempIds[a], tempIds[b], t);
      let parentTemp: number | undefined;
      if (parent) {
        parentTemp = temp.addAtom(parent.element, new Vector3D(0, 0, 0)).id;
        temp.addBondBetween(parentTemp, tempIds[0], BondType.SINGLE);
      }
      const local = layoutOrganic(temp, this.bondLength);
      const l0 = local.get(tempIds[0])!;
      let place: (q: Point2D, mirror: boolean) => Point2D;
      const parentPos = parent ? this.positions.get(parent.id) : undefined;
      if (parentPos && parentTemp !== undefined) {
        const lp = local.get(parentTemp)!;
        const want = Math.atan2(at.y - parentPos.y, at.x - parentPos.x);
        place = (q, mirror) => {
          // Mirror across the parent->anchor axis of the local layout, then rotate and move onto the drawing.
          const have = Math.atan2(l0.y - lp.y, l0.x - lp.x);
          let dx = q.x - l0.x;
          let dy = q.y - l0.y;
          if (mirror) {
            const c2 = Math.cos(2 * have);
            const s2 = Math.sin(2 * have);
            [dx, dy] = [dx * c2 + dy * s2, dx * s2 - dy * c2];
          }
          const t = want - have;
          return new Point2D(at.x + dx * Math.cos(t) - dy * Math.sin(t), at.y + dx * Math.sin(t) + dy * Math.cos(t));
        };
      } else {
        place = (q, mirror) => new Point2D(at.x + (mirror ? -1 : 1) * (q.x - l0.x), at.y + q.y - l0.y);
      }

      // Of the two mirror images, take the one that keeps further from the atoms already there.
      const others = [...this.positions].filter(([k]) => k !== id).map(([, p]) => p);
      const clearance = (mirror: boolean) => {
        let min = Infinity;
        for (let k = 1; k < tempIds.length; k++) {
          const p = place(local.get(tempIds[k])!, mirror);
          for (const o of others) min = Math.min(min, p.distanceTo(o));
        }
        return min;
      };
      const mirror = clearance(true) > clearance(false) + 1e-6;

      const newIds = [id];
      for (let k = 1; k < frag.atoms.length; k++) {
        newIds.push(this.newAtom(frag.atoms[k].symbol, place(local.get(tempIds[k])!, mirror)));
        this.molecule.getAtom(newIds[k])!.charge = frag.atoms[k].charge;
      }
      for (const [a, b, t] of frag.bonds) this.molecule.addBondBetween(newIds[a], newIds[b], t);
    }
    this.selection = null;
    return { expanded: ok.length, failed };
  }

  /**
   * Add a document's atoms and bonds to the drawing (one undo step), centred on `centre`, and select them.
   * Returns the new atom ids.
   */
  insertDocument(doc: Pick<EditorDocument, 'atoms' | 'bonds'>, centre: Point2D): number[] {
    if (doc.atoms.length === 0) return [];
    const cx = doc.atoms.reduce((s, a) => s + a.x, 0) / doc.atoms.length;
    const cy = doc.atoms.reduce((s, a) => s + a.y, 0) / doc.atoms.length;
    this.checkpoint();
    const ids = new Map<number, number>();
    for (const a of doc.atoms) {
      const element = periodicTable.getBySymbol(a.symbol) ? a.symbol : 'C';
      const id = this.newAtom(element, new Point2D(a.x - cx + centre.x, a.y - cy + centre.y));
      this.molecule.getAtom(id)!.charge = a.charge;
      if (typeof a.label === 'string' && a.label.trim()) this.labels.set(id, a.label.trim());
      ids.set(a.id, id);
    }
    for (const b of doc.bonds) {
      const a1 = ids.get(b.a);
      const a2 = ids.get(b.b);
      if (a1 === undefined || a2 === undefined || a1 === a2 || this.molecule.getBond(a1, a2)) continue;
      this.molecule.addBondBetween(a1, a2, b.type, b.chirality);
      const centreId = b.stereoCentre === null ? undefined : ids.get(b.stereoCentre);
      if (centreId !== undefined) this.stereoCentres.set(bondKey(a1, a2), centreId);
    }
    this.pending = null;
    this.selectAtoms(ids.values());
    return [...ids.values()];
  }

  /** Remove everything (undoable). */
  clear(): void {
    this.checkpoint();
    this.restore({ format: 'tsdraw-document', version: 1, name: this.docName, atoms: [], bonds: [] });
  }

  /**
   * Clean up: re-run the library's layout over the whole drawing (undoable).
   * Each connected piece gets clean geometry but stays where the user put it: the new layout of
   * the piece is turned (and possibly mirrored) to best match its current orientation, then centred
   * on its current centre. Single atoms are not moved.
   * Stereochemistry is kept: double bonds keep their Z/E arrangement, and stereocentres their R/S
   * configuration (by choosing the mirror image, or else by swapping that centre's wedges and hashes).
   * `_centre` is ignored; it is kept so older callers still compile.
   */
  relayout(generator: CoordinateGenerator, _centre?: Point2D): void {
    if (this.atomCount() === 0) return;
    // Passing the drawn positions keeps each double bond's Z/E (cis/trans) arrangement.
    const coords = generator.generateCoordinates(this.molecule, undefined, this.positions);
    if (coords.size === 0) return;

    const next = new Map<number, Point2D>();
    const pieces: number[][] = [];
    /** Stereocentres whose wedges/hashes must be swapped to keep their configuration. */
    const flips: number[] = [];
    const done = new Set<number>();
    for (const atom of this.molecule.getAtoms()) {
      if (done.has(atom.id)) continue;
      const piece = this.connectedPiece(atom.id);
      piece.forEach((id) => done.add(id));
      const ids = piece.filter((id) => coords.has(id) && this.positions.has(id));
      if (ids.length < 2) continue;
      const index = new Map(ids.map((id, i) => [id, i]));
      const bondPairs = this.molecule
        .getBonds()
        .filter((b) => index.has(b.atomId1) && index.has(b.atomId2))
        .map((b) => [index.get(b.atomId1)!, index.get(b.atomId2)!] as [number, number]);
      const fits = alignPiece(
        ids.map((id) => this.positions.get(id)!),
        ids.map((id) => coords.get(id)!),
        bondPairs
      );

      // Stereocentres (atoms at the narrow end of a wedge or hash) must keep their R/S configuration.
      // Mirroring a piece inverts every centre in it, so take the orientation that keeps the most;
      // without stereocentres, the one closest to the drawing.
      const drawn = this.stereoConfigs(ids, (id) => this.positions.get(id)!);
      const kept = (points: Point2D[]): number => {
        const at = (id: number) => points[index.get(id)!];
        return [...drawn].filter(([c, sign]) => this.stereoSign(c, at) === sign).length;
      };
      const [plainKept, mirroredKept] = [kept(fits.plain.points), kept(fits.mirrored.points)];
      const useMirror =
        mirroredKept !== plainKept ? mirroredKept > plainKept : fits.mirrored.error < fits.plain.error;
      const chosen = useMirror ? fits.mirrored.points : fits.plain.points;

      // Any centre still inverted (e.g. two centres that only the drawn geometry related) keeps its
      // configuration by turning its wedges into hashes and vice versa.
      for (const [c, sign] of drawn) {
        // Opposite handedness: swap. Undefined (0) after layout: leave the wedges as they are.
        if (this.stereoSign(c, (id) => chosen[index.get(id)!]) === -sign) flips.push(c);
      }
      ids.forEach((id, i) => next.set(id, chosen[i]));
      pieces.push(ids);
    }
    if (next.size === 0) return;
    this.separatePieces(pieces, next);
    this.checkpoint();
    for (const [id, p] of next) this.positions.set(id, p);
    for (const c of flips) {
      for (const bond of this.molecule.getBondsForAtom(c)) {
        if (this.stereoCentres.get(bondKey(bond.atomId1, bond.atomId2)) !== c) continue;
        if (bond.chirality === BondChirality.WEDGE) bond.chirality = BondChirality.HASH;
        else if (bond.chirality === BondChirality.HASH) bond.chirality = BondChirality.WEDGE;
      }
    }
  }

  /**
   * Height of each neighbour of a stereocentre out of the page: +1 at the wide end of a wedge drawn
   * from the centre, -1 for a hash, 0 for a bond in the plane.
   */
  private stereoHeight(centre: number, neighbour: number): number {
    const bond = this.molecule.getBond(centre, neighbour);
    if (!bond || this.stereoCentres.get(bondKey(centre, neighbour)) !== centre) return 0;
    if (bond.chirality === BondChirality.WEDGE) return 1;
    if (bond.chirality === BondChirality.HASH) return -1;
    return 0;
  }

  /** Handedness (+1/-1, 0 if undefined) of a stereocentre with its neighbours at the given positions. */
  stereoSign(centre: number, at: (id: number) => Point2D = (id) => this.positions.get(id)!): number {
    const c = at(centre);
    const neighbours = this.molecule.getConnectedAtoms(centre).map((x) => x.id).sort((x, y) => x - y);
    return stereoHandedness(
      neighbours.map((id) => {
        const p = at(id);
        const len = Math.max(Math.hypot(p.x - c.x, p.y - c.y), 1e-9);
        return [(p.x - c.x) / len, (p.y - c.y) / len, this.stereoHeight(centre, id)];
      })
    );
  }

  /** Stereocentres among `ids` (narrow end of a wedge or hash) whose handedness is defined, with that handedness. */
  private stereoConfigs(ids: number[], at: (id: number) => Point2D): Map<number, number> {
    const configs = new Map<number, number>();
    const inPiece = new Set(ids);
    for (const [key, centre] of this.stereoCentres) {
      if (!inPiece.has(centre) || configs.has(centre)) continue;
      const [a, b] = key.split('-').map(Number);
      const bond = this.molecule.getBond(a, b);
      if (!bond || (bond.chirality !== BondChirality.WEDGE && bond.chirality !== BondChirality.HASH)) continue;
      const sign = this.stereoSign(centre, at);
      if (sign !== 0) configs.set(centre, sign);
    }
    return configs;
  }

  /**
   * Pieces drawn on top of each other would stay tangled after clean up, since each keeps its place.
   * Bigger pieces stay put; each smaller one that comes within PIECE_GAP bond lengths of a piece
   * already settled is slid away from it, along the line between their centres, until it is clear.
   */
  private separatePieces(pieces: number[][], next: Map<number, Point2D>): void {
    const gap = PIECE_GAP * this.bondLength;
    const at = (id: number) => next.get(id) ?? this.positions.get(id)!;
    const settled: number[] = [];
    // Atoms not moved by the layout (lone atoms) count as settled obstacles too.
    for (const id of this.molecule.getAtoms().map((a) => a.id)) if (!next.has(id)) settled.push(id);

    for (const piece of [...pieces].sort((a, b) => b.length - a.length)) {
      const clashes = (): boolean =>
        piece.some((id) => settled.some((other) => at(id).distanceTo(at(other)) < gap));
      if (settled.length > 0 && clashes()) {
        const mine = this.pieceCentreOf(piece, at);
        const theirs = this.pieceCentreOf(settled, at);
        let dx = mine.x - theirs.x;
        let dy = mine.y - theirs.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) {
          dx = 1;
          dy = 0;
        } else {
          dx /= len;
          dy /= len;
        }
        const step = this.bondLength / 2;
        for (let k = 0; k < 400 && clashes(); k++) {
          for (const id of piece) {
            const q = at(id);
            next.set(id, new Point2D(q.x + dx * step, q.y + dy * step));
          }
        }
      }
      settled.push(...piece);
    }
  }

  private pieceCentreOf(ids: number[], at: (id: number) => Point2D): Point2D {
    let x = 0;
    let y = 0;
    for (const id of ids) {
      x += at(id).x;
      y += at(id).y;
    }
    return new Point2D(x / ids.length, y / ids.length);
  }

  // ---------- undo / redo / persistence ----------

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.getDocument());
    this.restore(previous);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.getDocument());
    this.restore(next);
    return true;
  }

  /** The drawing as a document; with `ids`, only those atoms and the bonds between them. */
  getDocument(ids?: Iterable<number>): EditorDocument {
    const keep = ids ? new Set(ids) : null;
    return {
      format: 'tsdraw-document',
      version: 1,
      name: this.docName,
      atoms: this.molecule.getAtoms().filter((atom) => !keep || keep.has(atom.id)).map((atom) => {
        const p = this.positions.get(atom.id) ?? new Point2D(0, 0);
        const label = this.labels.get(atom.id);
        const entry = { id: atom.id, symbol: atom.element.symbol, charge: atom.charge, x: p.x, y: p.y };
        return label === undefined ? entry : { ...entry, label };
      }),
      bonds: this.molecule.getBonds().filter((bond) => !keep || (keep.has(bond.atomId1) && keep.has(bond.atomId2))).map((bond) => ({
        a: bond.atomId1,
        b: bond.atomId2,
        type: bond.type,
        chirality: bond.chirality,
        stereoCentre: this.stereoCentres.get(bondKey(bond.atomId1, bond.atomId2)) ?? null,
      })),
      // Arrows belong to the whole drawing; a document of just some atoms (copy, export) has none.
      ...(keep || this.arrows.size === 0
        ? {}
        : {
            arrows: [...this.arrows].map(([id, a]) => ({ id, kind: a.kind, x1: a.from.x, y1: a.from.y, x2: a.to.x, y2: a.to.y })),
          }),
    };
  }

  /** Replace the drawing with a saved document. Undoable. Throws on invalid input. */
  loadDocument(doc: EditorDocument): void {
    if (!doc || doc.format !== 'tsdraw-document' || doc.version !== 1) {
      throw new Error('Not a tsdraw document (expected format "tsdraw-document", version 1)');
    }
    this.checkpoint();
    this.restore(doc);
  }

  // ---------- internals ----------

  private checkpoint(): void {
    this.undoStack.push(this.getDocument());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Rebuild the molecule from a document. Builds fully before assigning, so a failure leaves state intact. */
  private restore(doc: EditorDocument): void {
    const molecule = new Molecule(doc.name);
    const positions = new Map<number, Point2D>();
    const centres = new Map<string, number>();
    const labels = new Map<number, string>();
    const arrows = new Map<number, Arrow>();
    for (const a of Array.isArray(doc.arrows) ? doc.arrows : []) {
      const nums = [a.id, a.x1, a.y1, a.x2, a.y2];
      if (!isArrowKind(a.kind) || nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error('Invalid arrow in document');
      }
      arrows.set(a.id, { kind: a.kind, from: new Point2D(a.x1, a.y1), to: new Point2D(a.x2, a.y2) });
    }

    for (const a of doc.atoms) {
      const element = periodicTable.getBySymbol(a.symbol);
      if (!element) throw new Error(`Unknown element symbol: ${a.symbol}`);
      molecule.addAtom(element, new Vector3D(a.x, a.y, 0), a.charge, a.id);
      positions.set(a.id, new Point2D(a.x, a.y));
      if (typeof a.label === 'string' && a.label.trim()) labels.set(a.id, a.label.trim());
    }
    for (const b of doc.bonds) {
      molecule.addBondBetween(b.a, b.b, b.type, b.chirality);
      if (b.stereoCentre !== null) centres.set(bondKey(b.a, b.b), b.stereoCentre);
    }

    this.molecule = molecule;
    this.docName = doc.name;
    this.positions = positions;
    this.stereoCentres = centres;
    this.labels = labels;
    this.arrows = arrows;
    this.nextArrowId = Math.max(this.nextArrowId, ...[...arrows.keys()].map((id) => id + 1));
    this.pending = null;
    this.selection = null;
  }

  private newAtom(symbol: string, p: Point2D): number {
    const element = periodicTable.getBySymbol(symbol);
    if (!element) throw new Error(`Unknown element symbol: ${symbol}`);
    const atom = this.molecule.addAtom(element, new Vector3D(p.x, p.y, 0));
    this.positions.set(atom.id, p.clone());
    return atom.id;
  }

  /** Change an atom's element, keeping its position, charge and bonds. */
  private setElement(id: number, symbol: string): void {
    const element = periodicTable.getBySymbol(symbol);
    const atom = this.molecule.getAtom(id);
    if (!element || !atom || atom.element.symbol === symbol) return;
    const bonds = this.molecule.getBondsForAtom(id);
    const position = atom.position.clone();
    const charge = atom.charge;
    this.molecule.removeAtom(id);
    this.molecule.addAtom(element, position, charge, id);
    for (const bond of bonds) this.molecule.addBond(bond);
  }

  private findAtomNear(p: Point2D, tolerance: number): number | undefined {
    let best: number | undefined;
    let bestDistance = tolerance;
    for (const [id, pos] of this.positions) {
      if (!this.molecule.hasAtom(id)) continue;
      const d = pos.distanceTo(p);
      if (d < bestDistance) {
        best = id;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Target point for a chain bond from origin toward the click, or null if the click is too close. */
  private chainTarget(fromId: number, origin: Point2D, p: Point2D, type: BondOrder): Point2D | null {
    if (origin.distanceTo(p) < this.bondLength * CHAIN_MIN_FRACTION) return null;
    return this.newBondTarget(fromId, p, type);
  }

  /**
   * Where a new bond from atomId ends, for a click at p.
   * - Triple bonds are linear: straight on from the atom's one neighbour (or away from its neighbours).
   * - Single and double bonds made from an atom with one neighbour sit at 120 degrees to it,
   *   on the side nearest the click, so chains zigzag instead of running straight.
   * - Otherwise the bond points away from the atom's existing neighbours.
   */
  private newBondTarget(atomId: number, p: Point2D, type: BondOrder): Point2D {
    const pos = this.positions.get(atomId)!;
    const neighbours = this.molecule
      .getConnectedAtoms(atomId)
      .map((a) => this.positions.get(a.id))
      .filter((q): q is Point2D => q !== undefined);

    if (type !== BondType.TRIPLE && neighbours.length === 1) {
      const theta = Math.atan2(neighbours[0].y - pos.y, neighbours[0].x - pos.x);
      const candidates = [theta + (2 * Math.PI) / 3, theta - (2 * Math.PI) / 3].map(
        (a) => new Point2D(pos.x + this.bondLength * Math.cos(a), pos.y + this.bondLength * Math.sin(a))
      );
      return candidates.reduce((best, c) => (c.distanceTo(p) < best.distanceTo(p) ? c : best));
    }
    if (type === BondType.TRIPLE && neighbours.length === 1) {
      const dx = pos.x - neighbours[0].x;
      const dy = pos.y - neighbours[0].y;
      const len = Math.hypot(dx, dy) || 1;
      return new Point2D(pos.x + (this.bondLength * dx) / len, pos.y + (this.bondLength * dy) / len);
    }
    return this.outwardPoint(atomId);
  }

  private selectAt(p: Point2D): void {
    const atom = this.hitAtom(p);
    if (atom !== undefined) {
      this.selection = { kind: 'atom', id: atom };
      return;
    }
    const bond = this.hitBond(p);
    if (bond) {
      this.selection = { kind: 'bond', a: bond.atomId1, b: bond.atomId2 };
      return;
    }
    const arrow = this.hitArrow(p);
    this.selection = arrow === undefined ? null : { kind: 'arrow', id: arrow };
  }

  private placeAtom(p: Point2D, symbol: string): void {
    const hit = this.hitAtom(p);
    if (hit !== undefined) {
      if (this.molecule.getAtom(hit)?.element.symbol !== symbol || this.labels.has(hit)) {
        this.checkpoint();
        this.labels.delete(hit);
        this.setElement(hit, symbol);
      }
      this.selection = { kind: 'atom', id: hit };
      return;
    }
    this.checkpoint();
    const id = this.newAtom(symbol, p);
    this.selection = { kind: 'atom', id };
  }

  /** Add a bond, or change the order of an existing one (which clears its stereo). */
  /**
   * Connect a and b. `style` (wedge, hash or wavy) is applied to single bonds only.
   * The stereo narrow end is `a`, the atom the bond was started from.
   */
  private connect(a: number, b: number, type: BondOrder, style?: StereoChirality): void {
    const existing = this.molecule.getBond(a, b);
    if (existing && type === BondType.SINGLE && style === undefined) {
      // Drawing a plain single bond over an existing bond raises its order:
      // single -> double -> triple -> single. Aromatic bonds are left alone.
      if (existing.type === BondType.AROMATIC) return;
      existing.type = nextBondOrder(existing.type);
      existing.chirality = BondChirality.NONE;
      this.stereoCentres.delete(bondKey(a, b));
      return;
    }
    if (existing) {
      if (existing.type !== type) {
        existing.type = type;
        existing.chirality = BondChirality.NONE;
        this.stereoCentres.delete(bondKey(a, b));
      }
    } else {
      this.molecule.addBondBetween(a, b, type);
    }
    const bond = this.molecule.getBond(a, b);
    if (bond && style !== undefined && bond.type === BondType.SINGLE) {
      bond.chirality = style;
      this.stereoCentres.set(bondKey(a, b), a);
    }
  }

  /** The bond the bond tool would edit at p: a bond under the cursor that is not covered by an atom. */
  bondUnderCursor(p: Point2D): Bond | undefined {
    if (this.hitAtom(p) !== undefined) return undefined;
    return this.hitBond(p);
  }

  /** A bond end: an existing atom (id) or a new atom to be placed at `at` (id null). */
  private bondEnd(at: Point2D, other?: number | null): BondEnd {
    // A new end that lands on an existing atom joins that atom instead of overlapping it.
    const near = this.findAtomNear(at, this.bondLength * MERGE_FRACTION);
    if (near !== undefined && near !== other) return { id: near, at: this.positions.get(near)! };
    return { id: null, at };
  }

  private existingEnd(id: number): BondEnd {
    return { id, at: this.positions.get(id)! };
  }

  /** What a bond-tool click at p would do. Shared by the click itself, its preview and the attach marks. */
  private planBond(p: Point2D, type: BondOrder): BondPlan {
    // Clicking on an existing bond edits it instead of drawing a new one.
    const onBond = this.bondUnderCursor(p);
    if (onBond) return { kind: 'edit', bond: onBond };

    const hit = this.hitAtom(p);
    const from = this.pending;

    if (from === null) {
      // One click draws one bond. The chain can be extended from its new end with further clicks.
      if (hit !== undefined) {
        return { kind: 'draw', from: this.existingEnd(hit), to: this.bondEnd(this.newBondTarget(hit, p, type), hit) };
      }
      const half = this.bondLength / 2;
      const a = this.bondEnd(new Point2D(p.x - half, p.y));
      const b = this.bondEnd(new Point2D(p.x + half, p.y), a.id);
      return { kind: 'draw', from: a, to: b };
    }

    if (hit === from) return { kind: 'stop' };
    // Clicking an atom already bonded to the chain end (typically the atom the last bond started from)
    // draws a new bond from that atom, as if no chain were in progress.
    if (hit !== undefined && this.molecule.getBond(from, hit)) {
      return { kind: 'draw', from: this.existingEnd(hit), to: this.bondEnd(this.newBondTarget(hit, p, type), hit) };
    }
    if (hit !== undefined) return { kind: 'draw', from: this.existingEnd(from), to: this.existingEnd(hit) };

    const origin = this.positions.get(from);
    if (!origin) return { kind: 'stop' };
    const target = this.chainTarget(from, origin, p, type);
    if (!target) return { kind: 'none' };
    return { kind: 'draw', from: this.existingEnd(from), to: this.bondEnd(target, from) };
  }

  private bondClick(p: Point2D, type: BondOrder, style?: StereoChirality): void {
    const plan = this.planBond(p, type);
    switch (plan.kind) {
      case 'edit':
        this.checkpoint();
        this.connect(plan.bond.atomId1, plan.bond.atomId2, type, style);
        this.pending = null;
        return;
      case 'stop':
        this.pending = null;
        return;
      case 'none':
        return;
      case 'draw': {
        this.checkpoint();
        const a = plan.from.id ?? this.newAtom('C', plan.from.at);
        const b = plan.to.id ?? this.newAtom('C', plan.to.at);
        this.connect(a, b, type, style);
        this.pending = b;
        return;
      }
    }
  }

  private stereoClick(p: Point2D, chirality: StereoChirality): void {
    const atomHit = this.hitAtom(p);
    if (atomHit !== undefined) {
      // Clicking an atom picks the stereocentre for the next bond click.
      this.selection = { kind: 'atom', id: atomHit };
      return;
    }
    const bond = this.hitBond(p);
    if (!bond || bond.type !== BondType.SINGLE) return;

    const key = bondKey(bond.atomId1, bond.atomId2);
    this.checkpoint();

    if (bond.chirality === chirality) {
      bond.chirality = BondChirality.NONE;
      this.stereoCentres.delete(key);
      return;
    }

    const selected = this.selection?.kind === 'atom' ? this.selection.id : undefined;
    const isEndpoint = (id: number | null | undefined): id is number =>
      id !== undefined && id !== null && (id === bond.atomId1 || id === bond.atomId2);
    const centre =
      (isEndpoint(selected) ? selected : undefined) ??
      (isEndpoint(this.pending) ? this.pending : undefined) ??
      this.stereoCentres.get(key) ??
      bond.atomId1;

    bond.chirality = chirality;
    this.stereoCentres.set(key, centre);
  }

  /**
   * Vertices of a ring placed by a click at p, and which vertices are existing atoms.
   * - Clicking an atom attaches the ring at that atom (one shared vertex), growing away from its neighbours.
   * - Clicking a bond fuses the ring onto that bond (two shared vertices, ortho-fused).
   * - Clicking empty space places a free ring centred on the click.
   */
  /** Unit vector pointing away from an atom's existing neighbours (up when it has none). */
  private outwardUnit(atomId: number): { x: number; y: number } {
    const pos = this.positions.get(atomId);
    let ox = 0;
    let oy = 0;
    if (pos) {
      for (const bond of this.molecule.getBondsForAtom(atomId)) {
        const other = this.positions.get(bond.getOtherAtom(atomId));
        if (!other) continue;
        ox += pos.x - other.x;
        oy += pos.y - other.y;
      }
    }
    const len = Math.hypot(ox, oy);
    return len < 1e-9 ? { x: 0, y: -1 } : { x: ox / len, y: oy / len };
  }

  /** Point one bond length from an atom, away from its neighbours. */
  /**
   * Best direction (from the atom to the ring centre) for a ring of `size` that shares atom `atomId`.
   * Every direction around the atom is tried, and the one kept:
   * - keeps the atom's existing bonds out of the ring and spreads all its bonds as evenly as possible;
   * - keeps the new ring atoms clear of the atoms already drawn and its bonds from crossing existing ones.
   * With no other bonds the ring sits above the atom.
   */
  private bestRingAngle(atomId: number, size: number, stem = false): number {
    const pos = this.positions.get(atomId)!;
    const existing = this.molecule
      .getConnectedAtoms(atomId)
      .map((a) => this.positions.get(a.id))
      .filter((q): q is Point2D => q !== undefined)
      .map((q) => Math.atan2(q.y - pos.y, q.x - pos.x));
    if (existing.length === 0) return -Math.PI / 2;
    const L = this.bondLength;

    const outward = this.outwardUnit(atomId);
    const preferred = Math.atan2(outward.y, outward.x);
    const half = (Math.PI * (size - 2)) / size / 2; // half the ring's inner angle at the atom
    const separation = (a: number, b: number) => {
      const d = Math.abs(a - b) % (2 * Math.PI);
      return Math.min(d, 2 * Math.PI - d);
    };

    // Atoms and bonds already drawn near enough to matter.
    const reach = 3 * this.bondLength + ringRadius(size, this.bondLength) * 2;
    const nearAtoms: Point2D[] = [];
    for (const [id, q] of this.positions) {
      if (id !== atomId && this.molecule.hasAtom(id) && q.distanceTo(pos) < reach) nearAtoms.push(q);
    }
    const nearBonds = this.molecule
      .getBonds()
      .filter((b) => b.atomId1 !== atomId && b.atomId2 !== atomId)
      .map((b) => [this.positions.get(b.atomId1)!, this.positions.get(b.atomId2)!] as [Point2D, Point2D])
      .filter(([a, b]) => a && b && Math.min(a.distanceTo(pos), b.distanceTo(pos)) < reach);

    let best = preferred;
    let bestScore = Infinity;
    for (let k = 0; k < 180; k++) {
      const theta = preferred + (k * 2 * Math.PI) / 180;
      // The new bonds at the atom: the ring's two bonds, or the one bond to a hanging ring.
      const edges = stem ? [theta] : [theta - half, theta + half];
      let score = 0;
      // An existing bond inside the ring is never right.
      if (!stem) for (const phi of existing) if (separation(phi, theta) < half) score += 1000;
      // Spread: the smallest angle between any two bonds at the atom should be as large as possible.
      const all = [...existing, ...edges];
      let minGap = Infinity;
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) minGap = Math.min(minGap, separation(all[i], all[j]));
      score -= 20 * minGap;
      // Clashes with the drawing: ring atoms too close to existing atoms, ring bonds crossing existing bonds.
      const u = new Point2D(Math.cos(theta), Math.sin(theta));
      const first = stem ? new Point2D(pos.x + L * u.x, pos.y + L * u.y) : pos;
      const centre = ringCentreFromAnchor(size, first, new Point2D(first.x + u.x, first.y + u.y), L);
      const ring = regularPolygon(size, centre, L, Math.atan2(first.y - centre.y, first.x - centre.x));
      if (stem) for (const [c, d] of nearBonds) if (segmentsCross(pos, ring[0], c, d)) score += 300;
      for (let i = stem ? 0 : 1; i < ring.length; i++) {
        for (const q of nearAtoms) {
          const d = ring[i].distanceTo(q) / this.bondLength;
          if (d < 1) score += 200 * (1 - d);
        }
      }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        for (const [c, d] of nearBonds) if (segmentsCross(a, b, c, d)) score += 300;
      }
      // Ties: stay close to the plain "away from the other bonds" direction.
      score += 0.5 * separation(theta, preferred);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = theta;
      }
    }
    return best;
  }

  /**
   * Whether a ring clicked on this atom should hang from it by a new bond rather than share it:
   * when sharing would give the atom more bonds than it can have (or it shows a text label).
   */
  private ringNeedsStem(atomId: number, ringKind: RingKind): boolean {
    const atom = this.molecule.getAtom(atomId);
    if (!atom) return false;
    if (this.labels.has(atomId)) return true;
    const bonds = this.molecule.getBondsForAtom(atomId);
    if (bonds.length === 0) return false;
    let used = 0;
    for (const b of bonds) {
      used += b.type === BondType.DOUBLE ? 2 : b.type === BondType.TRIPLE ? 3 : b.type === BondType.AROMATIC ? 1.5 : 1;
    }
    // A ring adds two bonds at the shared atom; in an aromatic or Kekulé ring one of them is double.
    const added = ringKind === 'single' ? 2 : 3;
    const max = maxValence(atom.element.symbol, atom.charge) ?? Infinity;
    return Math.round(used) + added > max;
  }

  private outwardPoint(atomId: number): Point2D {
    const pos = this.positions.get(atomId)!;
    const dir = this.outwardUnit(atomId);
    return new Point2D(pos.x + this.bondLength * dir.x, pos.y + this.bondLength * dir.y);
  }

  /**
   * Where a ring would go for a click at p.
   * - On an atom: the ring shares that atom, turned to its best orientation (see bestRingAngle). When
   *   sharing would give the atom too many bonds (benzene on a CH2 in a chain, on an aromatic carbon,
   *   on the O of an OH...), the ring hangs from the atom by a new single bond instead (`stem`):
   *   phenyl, biphenyl, phenyl ether.
   * - On a bond: fused onto it. Elsewhere: a free ring centred on p.
   */
  private ringLayout(
    p: Point2D,
    size: number,
    ringKind: RingKind = 'single'
  ): { vertices: Point2D[]; shared: Map<number, number>; stem?: number } {
    const atomHit = this.hitAtom(p);
    const atomPos = atomHit !== undefined ? this.positions.get(atomHit) : undefined;
    if (atomHit !== undefined && atomPos) return this.ringAtAtom(atomHit, size, ringKind);

    const bond = this.hitBond(p);
    const fused = bond ? this.fusedRingLayout(bond, size) : undefined;
    if (fused) return fused;

    return { vertices: regularPolygon(size, p, this.bondLength), shared: new Map() };
  }

  /**
   * Ring that shares the bond with the molecule, placed on the side away from the atoms
   * already attached to either end of the bond.
   */
  private fusedRingLayout(
    bond: Bond,
    size: number
  ): { vertices: Point2D[]; shared: Map<number, number> } | undefined {
    const a = this.positions.get(bond.atomId1);
    const b = this.positions.get(bond.atomId2);
    if (!a || !b) return undefined;
    const L = this.bondLength;
    const mid = new Point2D((a.x + b.x) / 2, (a.y + b.y) / 2);

    let ox = 0;
    let oy = 0;
    for (const end of [bond.atomId1, bond.atomId2]) {
      for (const other of this.molecule.getBondsForAtom(end)) {
        const otherId = other.getOtherAtom(end);
        if (otherId === bond.atomId1 || otherId === bond.atomId2) continue;
        const pos = this.positions.get(otherId);
        if (!pos) continue;
        ox += mid.x - pos.x;
        oy += mid.y - pos.y;
      }
    }

    const length = Math.max(a.distanceTo(b), 1e-9);
    let px = -(b.y - a.y) / length;
    let py = (b.x - a.x) / length;
    if (px * ox + py * oy < 0) {
      px = -px;
      py = -py;
    }
    const apothem = Math.sqrt(Math.max(0, ringRadius(size, L) ** 2 - (length / 2) ** 2));
    const centre = new Point2D(mid.x + px * apothem, mid.y + py * apothem);
    const vertices = regularPolygon(size, centre, L, Math.atan2(a.y - centre.y, a.x - centre.x));

    // Vertex 0 sits on atom a; the vertex nearest b is the other shared vertex.
    let nearest = 1;
    for (let i = 2; i < vertices.length; i++) {
      if (vertices[i].distanceTo(b) < vertices[nearest].distanceTo(b)) nearest = i;
    }
    return { vertices, shared: new Map([[0, bond.atomId1], [nearest, bond.atomId2]]) };
  }

  /**
   * A ring attached to atom `atomId` (the anchor): sharing it, or hanging from it by a new bond when
   * sharing would overload it. `angle` is the direction from the anchor toward the ring (radians,
   * canvas convention); by default the best one (see bestRingAngle).
   */
  private ringAtAtom(
    atomId: number,
    size: number,
    ringKind: RingKind,
    angle?: number
  ): { vertices: Point2D[]; shared: Map<number, number>; stem?: number } {
    const atomPos = this.positions.get(atomId)!;
    const stem = this.ringNeedsStem(atomId, ringKind);
    const theta = angle ?? this.bestRingAngle(atomId, size, stem);
    const u = new Point2D(Math.cos(theta), Math.sin(theta));
    const first = stem ? new Point2D(atomPos.x + this.bondLength * u.x, atomPos.y + this.bondLength * u.y) : atomPos;
    const centre = ringCentreFromAnchor(size, first, new Point2D(first.x + u.x, first.y + u.y), this.bondLength);
    const start = Math.atan2(first.y - centre.y, first.x - centre.x);
    const vertices = regularPolygon(size, centre, this.bondLength, start);
    return stem ? { vertices, shared: new Map(), stem: atomId } : { vertices, shared: new Map([[0, atomId]]) };
  }

  /** Draw a ring attached to atom `atomId` at `angle` (default: the best direction). One undo step. */
  placeRingAtAtom(atomId: number, size: number, ringKind: RingKind, angle?: number): void {
    if (!this.molecule.hasAtom(atomId)) return;
    this.checkpoint();
    this.buildRing(this.ringAtAtom(atomId, size, ringKind, angle), ringKind);
  }

  private ringClick(p: Point2D, size: number, ringKind: RingKind): void {
    const layout = this.ringLayout(p, size, ringKind);
    this.checkpoint();
    this.buildRing(layout, ringKind);
  }

  /** Create a laid-out ring: new atoms, or existing atoms where it lands on them, and its bonds. */
  private buildRing(
    { vertices, shared, stem }: { vertices: Point2D[]; shared: Map<number, number>; stem?: number },
    ringKind: RingKind
  ): void {
    const ids = vertices.map(
      (v, i) => shared.get(i) ?? this.findAtomNear(v, this.bondLength * MERGE_FRACTION) ?? this.newAtom('C', v)
    );
    if (stem !== undefined && !this.molecule.getBond(stem, ids[0])) {
      this.molecule.addBondBetween(stem, ids[0], BondType.SINGLE);
    }

    ids.forEach((id, i) => {
      const next = ids[(i + 1) % ids.length];
      if (id === next || this.molecule.getBond(id, next)) return;
      let type: BondType = BondType.SINGLE;
      if (ringKind === 'aromatic') type = BondType.AROMATIC;
      else if (ringKind === 'kekule') type = i % 2 === 0 ? BondType.DOUBLE : BondType.SINGLE;
      this.molecule.addBondBetween(id, next, type);
    });

    this.selection = null;
    this.pending = null;
  }
}

/** Order cycle used when a single bond is drawn over an existing bond. */
function nextBondOrder(type: BondType): BondOrder {
  switch (type) {
    case BondType.SINGLE:
      return BondType.DOUBLE;
    case BondType.DOUBLE:
      return BondType.TRIPLE;
    default:
      return BondType.SINGLE;
  }
}

/** Default valences used to count implicit hydrogens (N and O use their formal charge too). */
const DEFAULT_VALENCE: Record<string, number> = {
  B: 3, C: 4, N: 3, O: 2, Si: 4, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1,
};

/** Bond order used when counting valence; aromatic bonds count 1.5. */
function bondOrderValue(type: BondType): number {
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

/** Formula in Hill order (C, then H, then the rest alphabetically), counting implicit hydrogens. */
export function hillFormula(molecule: Molecule, labels: Map<number, string> = new Map()): string {
  const counts = new Map<string, number>();
  let implicitHydrogens = 0;
  for (const atom of molecule.getAtoms()) {
    const label = labels.get(atom.id);
    if (label !== undefined) {
      // A label is the whole group, already including its hydrogens (NO2, COOH, OMe).
      // Free text that is not a formula is left out of the count.
      for (const [symbol, n] of labelAtomCounts(label) ?? []) counts.set(symbol, (counts.get(symbol) ?? 0) + n);
      continue;
    }
    const symbol = atom.element.symbol;
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    if (symbol === 'H') continue; // explicit hydrogen atoms are already counted
    const base = DEFAULT_VALENCE[symbol];
    if (base === undefined) continue;
    const valence = base + (symbol === 'N' || symbol === 'O' ? atom.charge : 0);
    let bondOrders = 0;
    for (const bond of molecule.getBondsForAtom(atom.id)) bondOrders += bondOrderValue(bond.type);
    implicitHydrogens += Math.max(0, valence - Math.round(bondOrders));
  }
  if (implicitHydrogens > 0) counts.set('H', (counts.get('H') ?? 0) + implicitHydrogens);

  const hasCarbon = counts.has('C');
  const rank = (symbol: string): number => (hasCarbon && symbol === 'C' ? 0 : hasCarbon && symbol === 'H' ? 1 : 2);
  return [...counts.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((symbol) => {
      const count = counts.get(symbol)!;
      return count === 1 ? symbol : `${symbol}${count}`;
    })
    .join('');
}

/** Human-readable name of a tool for the status bar. */
export function describeTool(tool: Tool): string {
  switch (tool.kind) {
    case 'select':
      return tool.mode === 'rect' ? 'Rectangle select' : tool.mode === 'circle' ? 'Circle select' : 'Lasso select';
    case 'atom':
      return `Atom ${tool.symbol}`;
    case 'text':
      return 'Text';
    case 'bond':
      if (tool.style === BondChirality.WEDGE) return 'Wedge bond (up)';
      if (tool.style === BondChirality.HASH) return 'Hash bond (down)';
      if (tool.style === BondChirality.EITHER) return 'Wavy bond (both)';
      return tool.type === BondType.DOUBLE ? 'Double bond' : tool.type === BondType.TRIPLE ? 'Triple bond' : 'Single bond';
    case 'stereo':
      if (tool.chirality === BondChirality.WEDGE) return 'Wedge (up)';
      if (tool.chirality === BondChirality.HASH) return 'Hash (down)';
      return 'Wavy (either)';
    case 'ring': {
      const kind = tool.ringKind === 'kekule' ? 'Kekulé' : tool.ringKind === 'aromatic' ? 'aromatic' : 'saturated';
      return `${tool.size}-ring (${kind})`;
    }
    case 'arrow':
      return arrowName(tool.arrow);
  }
}

/**
 * Fit `layout` onto `current` (same atoms, same order): centre it on the current centre and
 * turn it to the rotation that best matches the current positions (least squares), then square it
 * to the page (see squareToPage).
 * Returns both the plain fit and the fit of the mirror image, each with its squared error;
 * the caller picks one (mirroring keeps Z/E but inverts R/S stereocentres).
 */
function alignPiece(
  current: Point2D[],
  layout: Point2D[],
  bonds: Array<[number, number]>
): { plain: { points: Point2D[]; error: number }; mirrored: { points: Point2D[]; error: number } } {
  const n = current.length;
  const mean = (pts: Point2D[]) =>
    new Point2D(pts.reduce((s, p) => s + p.x, 0) / n, pts.reduce((s, p) => s + p.y, 0) / n);
  const cc = mean(current);
  const cl = mean(layout);
  const a = current.map((p) => new Point2D(p.x - cc.x, p.y - cc.y));

  const fit = (mirror: boolean): { points: Point2D[]; error: number } => {
    const b = layout.map((p) => new Point2D((mirror ? -1 : 1) * (p.x - cl.x), p.y - cl.y));
    // Best rotation of b onto a: angle = atan2(sum(b x a), sum(b . a)).
    let cross = 0;
    let dot = 0;
    for (let i = 0; i < n; i++) {
      cross += b[i].x * a[i].y - b[i].y * a[i].x;
      dot += b[i].x * a[i].x + b[i].y * a[i].y;
    }
    const t = squareToPage(Math.atan2(cross, dot), b, bonds);
    const c = Math.cos(t);
    const s = Math.sin(t);
    let error = 0;
    const points = b.map((p, i) => {
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      error += (x - a[i].x) ** 2 + (y - a[i].y) ** 2;
      return new Point2D(x + cc.x, y + cc.y);
    });
    return { points, error };
  };

  return { plain: fit(false), mirrored: fit(true) };
}

/**
 * Adjust a rotation angle (by at most CLEAN_SNAP / 2) so that the piece's bonds run as close as
 * possible to multiples of 30 degrees: hexagons come out flat-sided or point-up and zigzag chains
 * horizontal, instead of slightly tilted.
 */
function squareToPage(angle: number, points: Point2D[], bonds: Array<[number, number]>): number {
  if (bonds.length === 0) return angle;
  const directions = bonds.map(([i, j]) => Math.atan2(points[j].y - points[i].y, points[j].x - points[i].x));
  // 1 - cos(12 x) is zero exactly when x is a multiple of 30 degrees.
  const cost = (t: number) => directions.reduce((sum, d) => sum + 1 - Math.cos((2 * Math.PI / CLEAN_SNAP) * (d + t)), 0);
  let best = angle;
  let bestCost = Infinity;
  const steps = 60;
  for (let k = -steps; k <= steps; k++) {
    const t = angle + (k / steps) * (CLEAN_SNAP / 2);
    const c = cost(t) + 1e-3 * Math.abs(t - angle); // ties go to the smallest change
    if (c < bestCost) {
      bestCost = c;
      best = t;
    }
  }
  return best;
}

/** Whether segments a-b and c-d cross (touching at an end does not count). */
function segmentsCross(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const side = (p: Point2D, q: Point2D, r: Point2D) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(a, b, c);
  const d2 = side(a, b, d);
  const d3 = side(c, d, a);
  const d4 = side(c, d, b);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
}

function midpoint(a: Arrow): Point2D {
  return new Point2D((a.from.x + a.to.x) / 2, (a.from.y + a.to.y) / 2);
}
