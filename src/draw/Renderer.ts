import { Point2D } from './Point2D';
import { DrawingStyle } from './DrawingStyle';

/**
 * Abstract renderer interface for drawing molecules
 * Implementations: CanvasRenderer, SVGRenderer
 *
 * All coordinates are expected to be in drawing space (2D points)
 * Renderers handle transformations and rendering details
 */
export abstract class Renderer {
  protected style: DrawingStyle;
  protected width: number;
  protected height: number;

  constructor(width: number, height: number, style?: DrawingStyle) {
    this.width = width;
    this.height = height;
    this.style = style || new DrawingStyle();
  }

  /**
   * Clear the canvas/drawing surface
   */
  abstract clear(): void;

  /**
   * Get the current style
   */
  getStyle(): DrawingStyle {
    return this.style;
  }

  /**
   * Set the current style
   */
  setStyle(style: DrawingStyle): void {
    this.style = style;
  }

  /**
   * Get dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Resize the drawing surface
   */
  abstract resize(width: number, height: number): void;

  // ===== Basic Drawing Methods =====

  /**
   * Draw a circle (for atoms)
   */
  abstract drawCircle(
    center: Point2D,
    radius: number,
    color: string,
    fillColor?: string,
    lineWidth?: number
  ): void;

  /**
   * Draw a line (for bonds)
   */
  abstract drawLine(
    from: Point2D,
    to: Point2D,
    color: string,
    lineWidth: number
  ): void;

  /**
   * Draw multiple lines as a path
   */
  abstract drawPath(
    points: Point2D[],
    color: string,
    lineWidth: number,
    closed: boolean
  ): void;

  /**
   * Draw a dashed line
   */
  abstract drawDashedLine(
    from: Point2D,
    to: Point2D,
    color: string,
    lineWidth: number,
    dashLength: number,
    gapLength: number
  ): void;

  /**
   * Draw a filled polygon (for wedge bonds)
   */
  abstract drawPolygon(
    points: Point2D[],
    fillColor: string,
    strokeColor?: string,
    lineWidth?: number
  ): void;

  /**
   * Draw text (for atom labels, charges)
   */
  abstract drawText(
    text: string,
    position: Point2D,
    color: string,
    fontSize: number,
    fontFamily: string,
    align: 'left' | 'center' | 'right',
    fontWeight?: string
  ): void;

  /**
   * Measure text dimensions
   */
  abstract measureText(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight?: string
  ): { width: number; height: number };

  // ===== Bond Drawing Methods =====

  /**
   * Draw a single bond (line)
   */
  drawSingleBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    this.drawLine(from, to, color, this.style.bondWidth);
  }

  /**
   * Draw a double bond (parallel lines)
   */
  drawDoubleBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    const spacing = this.style.doubleLineSpacing;
    const distance = from.distanceTo(to);
    const perpendicular = from.vectorTo(to).rotate(Math.PI / 2);
    const offset = distance * spacing;

    const offset1 = new Point2D(perpendicular.x * offset, perpendicular.y * offset);
    const offset2 = new Point2D(-perpendicular.x * offset, -perpendicular.y * offset);

    this.drawLine(
      new Point2D(from.x + offset1.x, from.y + offset1.y),
      new Point2D(to.x + offset1.x, to.y + offset1.y),
      color,
      this.style.bondWidth
    );
    this.drawLine(
      new Point2D(from.x + offset2.x, from.y + offset2.y),
      new Point2D(to.x + offset2.x, to.y + offset2.y),
      color,
      this.style.bondWidth
    );
  }

  /**
   * Draw an offset double bond: a full line on the bond axis plus a shorter
   * second line offset toward `ringCentre` (ChemDraw-style). Used for ring double bonds
   * (toward the ring centre) and chain double bonds (toward the substituents).
   */
  drawRingDoubleBond(
    from: Point2D,
    to: Point2D,
    ringCentre: Point2D,
    color: string = this.style.bondColor
  ): void {
    const distance = from.distanceTo(to);
    if (distance === 0) return;
    const dx = (to.x - from.x) / distance;
    const dy = (to.y - from.y) / distance;
    // Unit normal pointing toward the ring centre.
    let nx = -dy;
    let ny = dx;
    if ((ringCentre.x - from.x) * nx + (ringCentre.y - from.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Same gap between the two lines as an ordinary double bond (2 x doubleLineSpacing).
    const offset = distance * this.style.doubleLineSpacing * 2;
    // The second line is shorter than the bond, pulled in at both ends.
    const inset = distance * this.style.doubleInnerInset;

    this.drawLine(from, to, color, this.style.bondWidth);
    this.drawLine(
      new Point2D(from.x + nx * offset + dx * inset, from.y + ny * offset + dy * inset),
      new Point2D(to.x + nx * offset - dx * inset, to.y + ny * offset - dy * inset),
      color,
      this.style.bondWidth
    );
  }

  /**
   * Draw a triple bond (three parallel lines)
   */
  drawTripleBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    const spacing = this.style.tripleLineSpacing;
    const distance = from.distanceTo(to);
    const perpendicular = from.vectorTo(to).rotate(Math.PI / 2);
    const offset = distance * spacing;

    const offset1 = new Point2D(perpendicular.x * offset, perpendicular.y * offset);
    const offset2 = new Point2D(-perpendicular.x * offset, -perpendicular.y * offset);

    // Center line
    this.drawLine(from, to, color, this.style.bondWidth);

    // Two offset lines
    this.drawLine(
      new Point2D(from.x + offset1.x, from.y + offset1.y),
      new Point2D(to.x + offset1.x, to.y + offset1.y),
      color,
      this.style.bondWidth
    );
    this.drawLine(
      new Point2D(from.x + offset2.x, from.y + offset2.y),
      new Point2D(to.x + offset2.x, to.y + offset2.y),
      color,
      this.style.bondWidth
    );
  }

  /**
   * Draw an aromatic bond (dashed or alternating single/double)
   */
  drawAromaticBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    // Aromatic representation: dashed line
    this.drawDashedLine(
      from,
      to,
      color,
      this.style.bondWidth,
      this.style.aromaticDashLength,
      this.style.aromaticDashSpacing
    );
  }

  /**
   * Draw a wedge bond (3D stereochemistry - coming toward viewer)
   */
  drawWedgeBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    const perpendicular = from.vectorTo(to).rotate(Math.PI / 2);
    const half = this.style.wedgeWidth / 2;

    const tip1 = new Point2D(
      to.x + perpendicular.x * half,
      to.y + perpendicular.y * half
    );
    const tip2 = new Point2D(
      to.x - perpendicular.x * half,
      to.y - perpendicular.y * half
    );

    this.drawPolygon([from, tip1, tip2], color, color, 0);
  }

  /**
   * Draw a hash bond (3D stereochemistry - going away from viewer).
   * `from` is the stereocentre (narrow end); the marks widen linearly towards `to`,
   * reaching the same half-width as a wedge's far end.
   */
  drawHashBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    const distance = from.distanceTo(to);
    if (distance === 0) return;
    const unitPerp = new Point2D(-(to.y - from.y) / distance, (to.x - from.x) / distance);
    const lineCount = Math.max(1, Math.ceil(distance / (this.style.hashLineSpacing * 2)));
    const maxHalfWidth = this.style.wedgeWidth / 2;

    for (let i = 0; i < lineCount; i++) {
      const t = (i + 1) / (lineCount + 1);
      const along = new Point2D(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      const half = maxHalfWidth * t;
      const start = new Point2D(along.x - unitPerp.x * half, along.y - unitPerp.y * half);
      const end = new Point2D(along.x + unitPerp.x * half, along.y + unitPerp.y * half);
      this.drawLine(start, end, color, this.style.bondWidth);
    }
  }

  /**
   * Draw a wavy bond (either/unspecified stereochemistry)
   */
  drawWavyBond(from: Point2D, to: Point2D, color: string = this.style.bondColor): void {
    const perpendicular = from.vectorTo(to).rotate(Math.PI / 2);
    const distance = from.distanceTo(to);
    // At least 5 full waves along the bond, about one wave per 6 px, so the wave reads clearly at any length.
    const waveCount = Math.max(5, Math.round(distance / 6));
    const waveHeight = 2.5;
    const samplesPerWave = 16;
    const steps = waveCount * samplesPerWave;

    const points: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wave = Math.sin(t * 2 * Math.PI * waveCount) * waveHeight;

      const x = from.x + (to.x - from.x) * t + perpendicular.x * wave;
      const y = from.y + (to.y - from.y) * t + perpendicular.y * wave;
      points.push(new Point2D(x, y));
    }

    this.drawPath(points, color, this.style.bondWidth, false);
  }

  // ===== Atom Drawing Methods =====

  /**
   * Draw an atom with optional label and charge
   */
  drawAtom(
    position: Point2D,
    label: string,
    charge: number = 0,
    radius: number = this.style.atomRadius,
    color: string = this.style.atomColor
  ): void {
    // Draw selection circle (usually hidden, shown on hover/select)
    // this.drawCircle(position, radius, this.style.selectionColor, undefined, 1);

    // Draw atom label
    if (label) {
      this.drawText(
        label,
        position,
        color,
        this.style.atomFontSize,
        this.style.atomFontFamily,
        'center',
        this.style.atomFontWeight
      );
    }

    // Draw formal charge if non-zero
    if (charge !== 0) {
      // Chemistry convention: +, −, 2+, 3− (not +1 / -1).
      const magnitude = Math.abs(charge);
      const chargeText = `${magnitude === 1 ? '' : magnitude}${charge > 0 ? '+' : '\u2212'}`;
      // Tucked against the upper right of the symbol, clear of most bonds.
      const chargeX = position.x + radius - 1;
      const chargeY = position.y - radius + 1;
      this.drawText(
        chargeText,
        new Point2D(chargeX, chargeY),
        this.style.chargeColor,
        this.style.chargeFontSize,
        this.style.atomFontFamily,
        'left'
      );
    }
  }

  /**
   * Draw atom with element color
   */
  drawColoredAtom(
    position: Point2D,
    label: string,
    elementSymbol: string,
    charge: number = 0,
    radius: number = this.style.atomRadius
  ): void {
    const color = DrawingStyle.getElementColor(elementSymbol);
    this.drawAtom(position, label, charge, radius, color);
  }

  /**
   * Draw implicit hydrogen count next to atom
   */
  drawImplicitHydrogens(
    position: Point2D,
    hydrogenCount: number,
    _elementSymbol: string
  ): void {
    if (hydrogenCount <= 0) return;

    const hText = hydrogenCount === 1 ? 'H' : `H${hydrogenCount}`;
    const offsetX = position.x + this.style.atomRadius + 5;

    this.drawText(
      hText,
      new Point2D(offsetX, position.y),
      this.style.hydrogenColor,
      this.style.hydrogenFontSize,
      this.style.atomFontFamily,
      'left'
    );
  }

  /**
   * Draw a selection highlight around atom
   */
  drawAtomSelection(position: Point2D, radius: number = this.style.atomRadius): void {
    this.drawCircle(
      position,
      radius + 5,
      this.style.selectionColor,
      undefined,
      this.style.selectionWidth
    );
  }

  /**
   * Draw a hover highlight around atom
   */
  drawAtomHover(position: Point2D, radius: number = this.style.atomRadius): void {
    this.drawCircle(
      position,
      radius + 3,
      this.style.hoverColor,
      undefined,
      this.style.hoverWidth
    );
  }

  // ===== Rendering State =====

  /**
   * Begin a batch of drawing operations (for optimization)
   */
  beginBatch(): void {
    // Override in subclasses if needed
  }

  /**
   * End a batch of drawing operations
   */
  endBatch(): void {
    // Override in subclasses if needed
  }

  /**
   * Render/display the drawing
   */
  abstract render(): void;

  /**
   * Export as image data (PNG)
   */
  abstract exportPNG(): Promise<Blob>;

  /**
   * Export as SVG string
   */
  abstract exportSVG(): string;

  /**
   * Get a data URL for embedding
   */
  abstract getDataURL(): string;
}
