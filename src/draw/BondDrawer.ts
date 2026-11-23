import { Bond, BondType, BondChirality, BondConformation } from '../core/Bond';
import { Renderer } from './Renderer';
import { Point2D } from './Point2D';
import { DrawingStyle } from './DrawingStyle';
import { DrawingConfig } from './DrawingConfig';

/**
 * High-level API for drawing chemical bonds
 * Uses DrawingConfig for consistent settings across the session
 * Handles all bond types, stereochemistry, and styling
 *
 * Separate from core/Bond which is the data model.
 * BondDrawer renders bonds using any Renderer (Canvas or SVG).
 *
 * Usage:
 *   const config = new DrawingConfig({ bondLength: 30 });
 *   const drawer = new BondDrawer(config);
 *   drawer.draw(bond, fromPos, toPos, renderer);
 */
export class BondDrawer {
  private config: DrawingConfig;

  constructor(config: DrawingConfig) {
    this.config = config;
  }

  /**
   * Get the drawing config
   */
  getConfig(): DrawingConfig {
    return this.config;
  }

  /**
   * Draw a bond with automatic type/stereo detection
   * Handles all cases: single/double/triple/aromatic with stereochemistry
   *
   * `ringCentre`, when given for a double bond, draws the second line inside
   * the ring instead of centring both lines on the bond axis.
   */
  draw(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    renderer: Renderer,
    style?: DrawingStyle,
    ringCentre?: Point2D
  ): void {
    const drawStyle = style || this.config.style;

    if (ringCentre && bond.isDouble() && bond.conformation === BondConformation.NONE) {
      renderer.drawRingDoubleBond(fromPos, toPos, ringCentre, drawStyle.bondColor);
      return;
    }

    // Handle different bond types
    if (bond.isAromatic()) {
      this.drawAromatic(fromPos, toPos, renderer, drawStyle);
    } else if (bond.isTriple()) {
      this.drawTriple(fromPos, toPos, renderer, drawStyle);
    } else if (bond.isDouble()) {
      this.drawDouble(fromPos, toPos, bond.conformation, renderer, drawStyle);
    } else {
      // Single bond
      this.drawSingle(fromPos, toPos, bond.chirality, renderer, drawStyle);
    }
  }

  /**
   * Draw a single bond with optional stereochemistry
   */
  private drawSingle(
    fromPos: Point2D,
    toPos: Point2D,
    chirality: number = BondChirality.NONE,
    renderer: Renderer,
    style: DrawingStyle
  ): void {
    const color = style.bondColor;

    switch (chirality) {
      case BondChirality.WEDGE:
        // Wedge: coming toward viewer (filled triangle)
        renderer.drawWedgeBond(fromPos, toPos, color);
        break;

      case BondChirality.HASH:
        // Hash: going away from viewer (dashed lines)
        renderer.drawHashBond(fromPos, toPos, color);
        break;

      case BondChirality.EITHER:
        // Either: unspecified stereochemistry (wavy line)
        renderer.drawWavyBond(fromPos, toPos, color);
        break;

      default:
        // Regular single bond (solid line)
        renderer.drawSingleBond(fromPos, toPos, color);
    }
  }

  /**
   * Draw a double bond
   * Handles E/Z conformation for directional display
   */
  private drawDouble(
    fromPos: Point2D,
    toPos: Point2D,
    conformation: number = BondConformation.NONE,
    renderer: Renderer,
    style: DrawingStyle
  ): void {
    const color = style.bondColor;

    // Standard double bond (two parallel lines)
    renderer.drawDoubleBond(fromPos, toPos, color);

    // Add conformation indicator if applicable (E/Z notation)
    if (conformation === BondConformation.E || conformation === BondConformation.Z) {
      this.drawConformationIndicator(fromPos, toPos, conformation, renderer, style);
    }
  }

  /**
   * Draw a triple bond (three parallel lines)
   */
  private drawTriple(
    fromPos: Point2D,
    toPos: Point2D,
    renderer: Renderer,
    style: DrawingStyle
  ): void {
    const color = style.bondColor;
    renderer.drawTripleBond(fromPos, toPos, color);
  }

  /**
   * Draw an aromatic bond (dashed or circle representation)
   * Currently uses dashed line; can be extended to ring highlighting
   */
  private drawAromatic(
    fromPos: Point2D,
    toPos: Point2D,
    renderer: Renderer,
    style: DrawingStyle
  ): void {
    const color = style.bondColor;
    renderer.drawAromaticBond(fromPos, toPos, color);
  }

  /**
   * Draw E/Z conformation indicator on double bond
   * E (trans): both substituents on opposite sides
   * Z (cis): both substituents on same side
   */
  private drawConformationIndicator(
    fromPos: Point2D,
    toPos: Point2D,
    conformation: number,
    renderer: Renderer,
    style: DrawingStyle
  ): void {
    // Add a small label or visual indicator
    const midpoint = fromPos.midpoint(toPos);
    const conformationLabel = conformation === BondConformation.E ? 'E' : 'Z';

    renderer.drawText(
      conformationLabel,
      midpoint.translate(0, -8),
      style.bondColor,
      10,
      style.atomFontFamily,
      'center',
      'bold'
    );
  }

  /**
   * Draw multiple bonds with consistent config and style
   * Useful for drawing entire molecule bonds at once
   */
  drawMultiple(
    bonds: Array<{ bond: Bond; fromPos: Point2D; toPos: Point2D }>,
    renderer: Renderer,
    style?: DrawingStyle
  ): void {
    for (const { bond, fromPos, toPos } of bonds) {
      this.draw(bond, fromPos, toPos, renderer, style);
    }
  }

  /**
   * Draw a bond with custom color (for highlighting, selection, etc.)
   */
  drawWithColor(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    color: string,
    renderer: Renderer,
    style?: DrawingStyle,
    ringCentre?: Point2D
  ): void {
    const drawStyle = (style || this.config.style).clone({ bondColor: color });
    this.draw(bond, fromPos, toPos, renderer, drawStyle, ringCentre);
  }

  /**
   * Draw a bond with custom width (for emphasis, selection, etc.)
   */
  drawWithWidth(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    lineWidth: number,
    renderer: Renderer,
    style?: DrawingStyle
  ): void {
    const drawStyle = (style || this.config.style).clone({ bondWidth: lineWidth });
    this.draw(bond, fromPos, toPos, renderer, drawStyle);
  }

  /**
   * Draw bond with selection highlight
   */
  drawSelected(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    renderer: Renderer,
    style?: DrawingStyle,
    ringCentre?: Point2D
  ): void {
    const drawStyle = style || this.config.style;

    // Draw original bond
    this.draw(bond, fromPos, toPos, renderer, style, ringCentre);

    // Draw selection highlight (thicker, different color)
    this.drawWithColor(
      bond,
      fromPos,
      toPos,
      drawStyle.selectionColor,
      renderer,
      style?.clone({ bondWidth: drawStyle.selectionWidth }),
      ringCentre
    );
  }

  /**
   * Draw bond with hover highlight
   */
  drawHovered(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    renderer: Renderer,
    style?: DrawingStyle,
    ringCentre?: Point2D
  ): void {
    const drawStyle = style || this.config.style;

    // Draw original bond
    this.draw(bond, fromPos, toPos, renderer, style, ringCentre);

    // Draw hover highlight
    this.drawWithColor(
      bond,
      fromPos,
      toPos,
      drawStyle.hoverColor,
      renderer,
      style?.clone({ bondWidth: drawStyle.hoverWidth }),
      ringCentre
    );
  }

  /**
   * Check if a point is near the bond line (for hit testing)
   * Useful for click detection in interactive mode
   */
  hitTest(
    _bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    clickPos: Point2D,
    tolerance: number = 5
  ): boolean {
    // Distance from point to line segment
    const distance = this.pointToLineDistance(clickPos, fromPos, toPos);
    return distance <= tolerance;
  }

  /**
   * Get the point on the bond closest to a given position
   * Useful for snapping and positioning
   */
  getClosestPoint(
    _bond: Bond,
    fromPos: Point2D,
    toPos: Point2D,
    point: Point2D
  ): Point2D {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return fromPos.clone();
    }

    let t = ((point.x - fromPos.x) * dx + (point.y - fromPos.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    return new Point2D(fromPos.x + t * dx, fromPos.y + t * dy);
  }

  /**
   * Calculate the length of the bond in drawing space
   */
  getLength(fromPos: Point2D, toPos: Point2D): number {
    return fromPos.distanceTo(toPos);
  }

  /**
   * Get the midpoint of the bond
   */
  getMidpoint(fromPos: Point2D, toPos: Point2D): Point2D {
    return fromPos.midpoint(toPos);
  }

  /**
   * Get the angle of the bond (in radians)
   * 0 = pointing right, π/2 = pointing down
   */
  getAngle(fromPos: Point2D, toPos: Point2D): number {
    return fromPos.angleTo(toPos);
  }

  /**
   * Get the angle in degrees (more readable)
   */
  getAngleDegrees(fromPos: Point2D, toPos: Point2D): number {
    return (this.getAngle(fromPos, toPos) * 180) / Math.PI;
  }

  /**
   * Get perpendicular vector to the bond
   * Useful for offsetting double/triple bonds
   */
  getPerpendicularVector(fromPos: Point2D, toPos: Point2D): Point2D {
    return fromPos.vectorTo(toPos).rotate(Math.PI / 2);
  }

  // ===== Helper Methods =====

  /**
   * Calculate perpendicular distance from point to line segment
   * Used for hit testing
   */
  private pointToLineDistance(
    point: Point2D,
    lineStart: Point2D,
    lineEnd: Point2D
  ): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Line is a point
      return point.distanceTo(lineStart);
    }

    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;

    const distX = point.x - closestX;
    const distY = point.y - closestY;

    return Math.sqrt(distX * distX + distY * distY);
  }

  /**
   * Get bond info for debugging
   */
  getInfo(
    bond: Bond,
    fromPos: Point2D,
    toPos: Point2D
  ): {
    type: string;
    chirality: string;
    conformation: string;
    length: number;
    angle: number;
  } {
    const typeMap: { [key: number]: string } = {
      [BondType.SINGLE]: 'Single',
      [BondType.DOUBLE]: 'Double',
      [BondType.TRIPLE]: 'Triple',
      [BondType.AROMATIC]: 'Aromatic',
    };

    const chiralityMap: { [key: number]: string } = {
      [BondChirality.WEDGE]: 'Wedge',
      [BondChirality.HASH]: 'Hash',
      [BondChirality.EITHER]: 'Either',
      0: 'None',
    };

    const conformationMap: { [key: number]: string } = {
      [BondConformation.E]: 'E (trans)',
      [BondConformation.Z]: 'Z (cis)',
      [BondConformation.EITHER]: 'Either',
      0: 'None',
    };

    return {
      type: typeMap[bond.type] || 'Unknown',
      chirality: chiralityMap[bond.chirality] || 'None',
      conformation: conformationMap[bond.conformation] || 'None',
      length: this.getLength(fromPos, toPos),
      angle: this.getAngleDegrees(fromPos, toPos),
    };
  }
}
