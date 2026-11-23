/**
 * Represents a 2D point for drawing and rendering
 * Used internally for canvas coordinates, layout calculations, and rendering
 */
export class Point2D {
  x: number;
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Calculate distance to another point
   */
  distanceTo(other: Point2D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate angle (in radians) to another point
   * 0 radians = pointing right, π/2 = pointing down
   */
  angleTo(other: Point2D): number {
    return Math.atan2(other.y - this.y, other.x - this.x);
  }

  /**
   * Move point by offset
   */
  translate(dx: number, dy: number): Point2D {
    return new Point2D(this.x + dx, this.y + dy);
  }

  /**
   * Rotate around origin (0,0) by angle in radians
   */
  rotate(angleRad: number): Point2D {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return new Point2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  /**
   * Rotate around a center point by angle in radians
   */
  rotateAround(center: Point2D, angleRad: number): Point2D {
    const translated = new Point2D(this.x - center.x, this.y - center.y);
    const rotated = translated.rotate(angleRad);
    return new Point2D(rotated.x + center.x, rotated.y + center.y);
  }

  /**
   * Get midpoint between this and another point
   */
  midpoint(other: Point2D): Point2D {
    return new Point2D(
      (this.x + other.x) / 2,
      (this.y + other.y) / 2
    );
  }

  /**
   * Scale point from origin
   */
  scale(factor: number): Point2D {
    return new Point2D(this.x * factor, this.y * factor);
  }

  /**
   * Scale point from a center point
   */
  scaleFrom(center: Point2D, factor: number): Point2D {
    const translated = new Point2D(this.x - center.x, this.y - center.y);
    const scaled = translated.scale(factor);
    return new Point2D(scaled.x + center.x, scaled.y + center.y);
  }

  /**
   * Get unit vector pointing toward another point
   */
  vectorTo(other: Point2D): Point2D {
    const dist = this.distanceTo(other);
    if (dist === 0) {
      return new Point2D(0, 0);
    }
    return new Point2D(
      (other.x - this.x) / dist,
      (other.y - this.y) / dist
    );
  }

  /**
   * Get point along line toward another point at given distance
   */
  pointToward(other: Point2D, distance: number): Point2D {
    const unit = this.vectorTo(other);
    return new Point2D(
      this.x + unit.x * distance,
      this.y + unit.y * distance
    );
  }

  /**
   * Check if point is within bounds
   */
  isWithinBounds(x1: number, y1: number, x2: number, y2: number): boolean {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return this.x >= minX && this.x <= maxX && this.y >= minY && this.y <= maxY;
  }

  /**
   * Check if point is within distance of another point
   */
  isNear(other: Point2D, tolerance: number = 5): boolean {
    return this.distanceTo(other) <= tolerance;
  }

  /**
   * Clone this point
   */
  clone(): Point2D {
    return new Point2D(this.x, this.y);
  }

  /**
   * Convert to object (for serialization)
   */
  toObject(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * String representation
   */
  toString(): string {
    return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }
}
