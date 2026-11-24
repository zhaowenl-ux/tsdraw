import { Bond, BondChirality, BondType } from '../core/Bond';
import { bondKey, kekulize } from '../core/Kekule';
import { Molecule } from '../core/Molecule';
import { BondDrawer } from '../draw/BondDrawer';
import { CanvasRenderer } from '../draw/CanvasRenderer';
import { DrawingStyle } from '../draw/DrawingStyle';
import { Point2D } from '../draw/Point2D';
import { Editor, Tool } from './editor';
import { circlePolygon, moveToward } from './geometry';
import { leadingTokenLength, reverseLabel, trailingTokenLength } from './labels';
import { Arrow, arrowShape } from './arrows';

/** Radius of the white disc behind an element label, for the 14 px default font (scales with the font size). */
const LABEL_DISC_RADIUS = 9;
/** Distance a bond is shortened where it meets a label, so it does not run into the letter (14 px font). */
const LABEL_TRIM = 10;
const DEFAULT_FONT_SIZE = 14;

/** Label disc radius and bond trim for the style's font size (Settings › Drawing › Label font size). */
function labelMetrics(style: DrawingStyle): { disc: number; trim: number } {
  const k = style.atomFontSize / DEFAULT_FONT_SIZE;
  return { disc: LABEL_DISC_RADIUS * k, trim: LABEL_TRIM * k };
}
/** Highlight ring radius for atoms (selection, chain start, hover). */
const HIGHLIGHT_RADIUS = 6;
const PREVIEW_COLOR = '#8a8fa3';
/** A ring held by the mouse button: in the molecule but not settled yet. */
const UNSETTLED_COLOR = '#a8acb8';
/** Chemistry check: atoms over their valence get a zigzag ring, and their label, in this colour. */
export const VALENCE_ERROR_COLOR = '#FF0000';
/** Number of points on the zigzag ring, and how far they stick in/out from its radius (px). */
const ZIGZAG_TEETH = 14;
const ZIGZAG_DEPTH = 1.8;

export interface SceneState {
  editor: Editor;
  renderer: CanvasRenderer;
  bondDrawer: BondDrawer;
  tool: Tool;
  cursor: Point2D | null;
  /** Extra atoms to mark as attach points (e.g. where a piece being swung will join). */
  marks?: number[];
  /** Lasso path or rectangle corners being dragged out by the select tool. */
  selectionShape?: { kind: 'lasso' | 'rect' | 'circle'; points: Point2D[] } | null;
  /** Atoms of a ring still held by the mouse button (and the atom it hangs on): their bonds are drawn grey. */
  unsettled?: { ids: number[]; pivot: number } | null;
  /** An arrow being dragged out with the arrow tool (drawn grey until released). */
  arrowDraft?: Arrow | null;
}

/**
 * Carbon atoms are drawn as bare vertices (skeletal convention).
 * Any other element, and any isolated carbon, shows its label.
 */
function isLabelled(symbol: string, bondCount: number): boolean {
  return symbol !== 'C' || bondCount === 0;
}

/** Draw the whole editor state. Clears the canvas first. */
export function drawScene(state: SceneState): void {
  const { editor, renderer, bondDrawer, tool, cursor } = state;
  const style = renderer.getStyle();
  const molecule = editor.getMolecule();
  const { disc: labelDisc, trim: labelTrim } = labelMetrics(style);

  renderer.clear();

  const labelled = new Set<number>();
  for (const atom of molecule.getAtoms()) {
    if (editor.getLabel(atom.id) !== undefined || isLabelled(atom.element.symbol, molecule.getBondsForAtom(atom.id).length)) {
      labelled.add(atom.id);
    }
  }

  // The mark follows the cursor: an atom under it, otherwise a bond under it (away from its atoms).
  const hoveredAtom = cursor ? editor.hitAtom(cursor) : undefined;
  // Existing atoms the new bond or ring would join (where it starts, and any atom it lands on).
  const attachAtoms = new Set([...(cursor ? editor.attachPoints(tool, cursor) : []), ...(state.marks ?? [])]);
  const hoveredBond = cursor && hoveredAtom === undefined ? editor.hitBond(cursor) : undefined;

  const problems = editor.valenceProblems();
  const unsettled = state.unsettled ? { ids: new Set(state.unsettled.ids), pivot: state.unsettled.pivot } : null;

  // Aromatic bonds are displayed in a Kekulé form (alternating single/double).
  const kekule = kekulize(molecule);

  // Bonds first, so atom discs sit on top of them.
  for (const modelBond of molecule.getBonds()) {
    const bond = displayBond(modelBond, kekule);
    const endpoints = bondEndpoints(editor, bond, labelled, labelTrim);
    if (!endpoints) continue;
    const [start, end] = endpoints;
    // Double bonds: in a ring the short second line goes inside the ring; in a chain it goes on the
    // side of the substituents. Undefined means both lines centred on the bond (C=O, C=C with no substituents).
    const centre = bond.isDouble()
      ? ringCentre(editor, molecule, bond) ?? substituentSide(editor, molecule, bond, labelled)
      : undefined;

    const isSelected = editor.isSelected(bond.atomId1, bond.atomId2);

    if (unsettled && isUnsettledBond(bond, unsettled)) {
      bondDrawer.drawWithColor(bond, start, end, UNSETTLED_COLOR, renderer, undefined, centre);
    } else if (isSelected) {
      bondDrawer.drawSelected(bond, start, end, renderer, undefined, centre);
    } else if (hoveredBond === modelBond) {
      bondDrawer.drawHovered(bond, start, end, renderer, undefined, centre);
    } else {
      bondDrawer.draw(bond, start, end, renderer, undefined, centre);
    }
  }

  // Atoms.
  for (const atom of molecule.getAtoms()) {
    const pos = editor.getPosition(atom.id);
    if (!pos) continue;

    // Text labels (NO2, COOH, ...) go down first so their selection/hover ring stays visible on top.
    const text = editor.getLabel(atom.id);
    if (text !== undefined) drawTextLabel(renderer, editor, molecule, atom.id, pos, text);

    // A labelled atom's white disc would hide a small ring, so its ring sits just outside the label.
    const ringRadius = labelled.has(atom.id) ? Math.max(HIGHLIGHT_RADIUS, labelDisc + 1) : HIGHLIGHT_RADIUS;
    if (editor.isSelected(atom.id)) {
      renderer.drawAtomSelection(pos, ringRadius);
    }
    if (hoveredAtom === atom.id || attachAtoms.has(atom.id)) {
      renderer.drawAtomHover(pos, ringRadius);
    }
    const overValence = problems.has(atom.id);
    if (overValence && !labelled.has(atom.id)) {
      drawValenceMark(renderer, pos, ringRadius + 3);
    }
    if (!labelled.has(atom.id) || text !== undefined) continue;

    renderer.drawCircle(pos, labelDisc, style.backgroundColor, style.backgroundColor, 0);
    renderer.drawAtom(
      pos,
      atom.element.symbol,
      atom.charge,
      labelDisc,
      overValence ? VALENCE_ERROR_COLOR : DrawingStyle.getElementColor(atom.element.symbol)
    );
    if (overValence) drawValenceMark(renderer, pos, ringRadius + 3);
  }

  // Reaction arrows.
  const hoveredArrow =
    cursor && hoveredAtom === undefined && hoveredBond === undefined && tool.kind === 'select' ? editor.hitArrow(cursor) : undefined;
  for (const arrow of editor.getArrows()) {
    const selected = editor.isArrowSelected(arrow.id);
    if (selected || hoveredArrow === arrow.id) {
      drawArrow(renderer, arrow, selected ? style.selectionColor : style.hoverColor, style.bondWidth + 4, 0.35, style.bondWidth);
    }
    drawArrow(renderer, arrow, style.bondColor, style.bondWidth);
    if (selected) {
      // Grips at both ends: drag one to stretch or turn the arrow.
      for (const end of [arrow.from, arrow.to]) renderer.drawCircle(end, 3.5, style.selectionColor, '#FFFFFF', 1.5);
    }
  }
  if (state.arrowDraft) drawArrow(renderer, state.arrowDraft, PREVIEW_COLOR, style.bondWidth);

  if (state.selectionShape) drawSelectionShape(renderer, state.selectionShape);
  if (cursor) drawPreview(state, cursor);
}

/** Draw a reaction arrow. With `alpha` < 1 it is a soft halo (selection / hover). */
function drawArrow(renderer: CanvasRenderer, arrow: Arrow, color: string, width: number, alpha = 1, shapeWidth = width): void {
  const ctx = renderer.getContext();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const shape = arrowShape(arrow, shapeWidth);
  for (const [a, b] of shape.lines) renderer.drawLine(a, b, color, width);
  for (const head of shape.heads) renderer.drawPolygon(head, color, alpha < 1 ? color : undefined, alpha < 1 ? width : 1);
  for (const path of shape.open) renderer.drawPath(path, color, width, false);
  ctx.restore();
}

/** A bond of the held ring: both ends in the ring (or one end on the atom it hangs from). */
function isUnsettledBond(bond: Bond, u: { ids: Set<number>; pivot: number }): boolean {
  const in1 = u.ids.has(bond.atomId1);
  const in2 = u.ids.has(bond.atomId2);
  return (in1 && in2) || (in1 && bond.atomId2 === u.pivot) || (in2 && bond.atomId1 === u.pivot);
}

/**
 * Valence-error mark: a closed zigzag ring in pure red, so it cannot be mistaken for the
 * smooth blue selection ring or the orange hover ring.
 */
function drawValenceMark(renderer: CanvasRenderer, centre: Point2D, radius: number): void {
  const points: Point2D[] = [];
  const n = ZIGZAG_TEETH * 2;
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    const r = radius + (i % 2 === 0 ? ZIGZAG_DEPTH : -ZIGZAG_DEPTH);
    points.push(new Point2D(centre.x + r * Math.cos(angle), centre.y + r * Math.sin(angle)));
  }
  renderer.drawPath(points, VALENCE_ERROR_COLOR, 1.3, true);
}

const SELECTION_OUTLINE = '#0066FF';

/** Dashed outline of the lasso or rectangle being dragged. */
function drawSelectionShape(renderer: CanvasRenderer, shape: { kind: 'lasso' | 'rect' | 'circle'; points: Point2D[] }): void {
  let outline = shape.points;
  if (shape.kind === 'circle') {
    if (outline.length < 2) return;
    const centre = outline[0];
    outline = circlePolygon(centre, outline[outline.length - 1], 72);
    // A small cross marks the centre the circle is dragged from.
    const d = 4;
    renderer.drawDashedLine(new Point2D(centre.x - d, centre.y), new Point2D(centre.x + d, centre.y), SELECTION_OUTLINE, 1, 8, 0);
    renderer.drawDashedLine(new Point2D(centre.x, centre.y - d), new Point2D(centre.x, centre.y + d), SELECTION_OUTLINE, 1, 8, 0);
  }
  if (shape.kind === 'rect') {
    if (outline.length < 2) return;
    const [a, b] = [outline[0], outline[outline.length - 1]];
    outline = [a, new Point2D(b.x, a.y), b, new Point2D(a.x, b.y)];
  }
  if (outline.length < 2) return;
  for (let i = 0; i < outline.length; i++) {
    const next = outline[(i + 1) % outline.length];
    // The lasso's closing edge is drawn too, so the user sees the region that will be taken.
    renderer.drawDashedLine(outline[i], next, SELECTION_OUTLINE, 1, 4, 3);
  }
}

/**
 * Draw a text label (NO2, COOH, ...) on an atom. Digits are drawn as subscripts.
 * The first group (N of NO2) sits on the atom; when the atom's bonds come from the right,
 * the label is written the other way round (O2N) so the group still reads into the bond.
 */
function drawTextLabel(
  renderer: CanvasRenderer,
  editor: Editor,
  molecule: Molecule,
  atomId: number,
  pos: Point2D,
  label: string
): void {
  const style = renderer.getStyle();
  const size = style.atomFontSize;
  const subSize = Math.round(size * 0.72);
  const font = style.atomFontFamily;
  const weight = style.atomFontWeight;

  // Which side the bonds come from.
  let dx = 0;
  for (const nb of molecule.getConnectedAtoms(atomId)) {
    const q = editor.getPosition(nb.id);
    if (q) dx += q.x - pos.x;
  }
  const flipped = dx > 1;
  const display = flipped ? reverseLabel(label) : label;

  // Runs of letters (normal) and digits (subscript).
  const runs = (display.match(/[0-9]+|[^0-9]+/g) ?? []).map((t) => {
    const sub = /^[0-9]/.test(t);
    const width = renderer.measureText(t, sub ? subSize : size, font, weight).width;
    return { t, sub, width };
  });
  const total = runs.reduce((w, r) => w + r.width, 0);

  // Centre the anchoring group (first group, or last one when flipped) on the atom.
  const widthOf = (s: string) => renderer.measureText(s, size, font, weight).width;
  let left: number;
  if (flipped) {
    const anchor = display.slice(display.length - trailingTokenLength(display));
    left = pos.x + widthOf(anchor) / 2 - total;
  } else {
    const anchor = display.slice(0, leadingTokenLength(display));
    left = pos.x - widthOf(anchor) / 2;
  }

  // White box behind the text so bonds do not run through it.
  const pad = 2;
  const top = pos.y - size * 0.6 - pad;
  const bottom = pos.y + size * 0.6 + pad;
  renderer.drawPolygon(
    [
      new Point2D(left - pad, top),
      new Point2D(left + total + pad, top),
      new Point2D(left + total + pad, bottom),
      new Point2D(left - pad, bottom),
    ],
    style.backgroundColor
  );

  let x = left;
  for (const run of runs) {
    const y = run.sub ? pos.y + size * 0.3 : pos.y;
    renderer.drawText(run.t, new Point2D(x, y), style.atomColor, run.sub ? subSize : size, font, 'left', weight);
    x += run.width;
  }
}

/** The bond as it should be drawn: aromatic bonds take their Kekulé single/double order. */
function displayBond(bond: Bond, kekule: Map<string, BondType>): Bond {
  if (bond.type !== BondType.AROMATIC) return bond;
  const type = kekule.get(bondKey(bond.atomId1, bond.atomId2)) ?? BondType.SINGLE;
  return new Bond(bond.atomId1, bond.atomId2, type, bond.chirality);
}

/**
 * For a double bond outside a ring, a point on the side where the second (shorter) line should go:
 * the side holding most of the substituents of its two atoms, so the bond reads into the chain.
 * Returns undefined to draw both lines centred: when neither atom has other bonds (ethylene),
 * or when one end is a labelled atom with no other bonds (C=O, C=N, C=S at the end of a chain).
 */
function substituentSide(editor: Editor, molecule: Molecule, bond: Bond, labelled: Set<number>): Point2D | undefined {
  const a = bond.atomId1;
  const b = bond.atomId2;
  const pa = editor.getPosition(a);
  const pb = editor.getPosition(b);
  if (!pa || !pb) return undefined;
  const others = (id: number, partner: number) =>
    molecule.getConnectedAtoms(id).map((x) => x.id).filter((x) => x !== partner);
  const onA = others(a, b);
  const onB = others(b, a);
  if (onA.length + onB.length === 0) return undefined;
  if ((onA.length === 0 && labelled.has(a)) || (onB.length === 0 && labelled.has(b))) return undefined;

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const sideOf = (id: number) => {
    const q = editor.getPosition(id);
    return q ? Math.sign(dx * (q.y - pa.y) - dy * (q.x - pa.x)) : 0;
  };
  const sides = [...onA, ...onB].map(sideOf);
  let side = Math.sign(sides.reduce((sum, x) => sum + x, 0));
  if (side === 0) side = sides.find((x) => x !== 0) ?? 0; // e.g. trans: one each side, pick the first
  if (side === 0) return undefined; // substituents straight in line: keep it centred
  // A point one bond length off the middle of the bond, on that side.
  const len = Math.max(Math.hypot(dx, dy), 1e-9);
  return new Point2D((pa.x + pb.x) / 2 - (dy / len) * side * len, (pa.y + pb.y) / 2 + (dx / len) * side * len);
}

/**
 * Centre of the smallest ring containing the bond (centroid of its atoms),
 * or undefined if the bond is not in a ring.
 */
function ringCentre(editor: Editor, molecule: Molecule, bond: Bond): Point2D | undefined {
  const a = bond.atomId1;
  const b = bond.atomId2;
  // BFS from a to b without using the a-b bond.
  const prev = new Map<number, number>([[a, -1]]);
  const queue = [a];
  while (queue.length && !prev.has(b)) {
    const v = queue.shift()!;
    for (const nb of molecule.getBondsForAtom(v)) {
      const w = nb.atomId1 === v ? nb.atomId2 : nb.atomId1;
      if (prev.has(w) || (v === a && w === b)) continue;
      prev.set(w, v);
      queue.push(w);
    }
  }
  if (!prev.has(b)) return undefined;

  let x = 0;
  let y = 0;
  let n = 0;
  for (let v = b; v !== -1; v = prev.get(v)!) {
    const p = editor.getPosition(v);
    if (!p) return undefined;
    x += p.x;
    y += p.y;
    n++;
  }
  return new Point2D(x / n, y / n);
}

/** Bond end points, shortened at labelled atoms and ordered so a stereo bond starts at its centre. */
function bondEndpoints(editor: Editor, bond: Bond, labelled: Set<number>, trim: number = LABEL_TRIM): [Point2D, Point2D] | null {
  let aId = bond.atomId1;
  let bId = bond.atomId2;

  if (bond.chirality === BondChirality.WEDGE || bond.chirality === BondChirality.HASH) {
    const centre = editor.getStereoCentre(bond.atomId1, bond.atomId2) ?? bond.atomId1;
    if (centre === bond.atomId2) {
      aId = bond.atomId2;
      bId = bond.atomId1;
    }
  }

  const a = editor.getPosition(aId);
  const b = editor.getPosition(bId);
  if (!a || !b) return null;

  const start = labelled.has(aId) ? moveToward(a, b, trim) : a;
  const end = labelled.has(bId) ? moveToward(b, a, trim) : b;
  return [start, end];
}

/** Ghost lines/outlines showing what the next click would produce. */
function drawPreview(state: SceneState, cursor: Point2D): void {
  const { editor, renderer, tool } = state;

  if (tool.kind === 'bond') {
    const segment = editor.bondPreview(cursor, tool.type);
    if (segment) {
      renderer.drawDashedLine(segment[0], segment[1], PREVIEW_COLOR, 1.2, 4, 4);
    }
    return;
  }

  if (tool.kind === 'ring') {
    renderer.drawPath(editor.ringPreview(cursor, tool.size, tool.ringKind), PREVIEW_COLOR, 1.2, true);
    const stem = editor.ringPreviewStem(cursor, tool.size, tool.ringKind);
    if (stem) renderer.drawLine(stem[0], stem[1], PREVIEW_COLOR, 1.2);
    return;
  }

  if (tool.kind === 'atom' || tool.kind === 'text') {
    if (editor.hitAtom(cursor) === undefined) {
      renderer.drawAtomHover(cursor, HIGHLIGHT_RADIUS);
    }
  }
}
