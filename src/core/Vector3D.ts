/**
 * Represents a 3D point or vector
 */
export class Vector3D {
  x: number;
  y: number;
  z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Create a copy of this vector
   */
  clone(): Vector3D {
    return new Vector3D(this.x, this.y, this.z);
  }

  /**
   * Add another vector to this one
   */
  add(other: Vector3D): Vector3D {
    return new Vector3D(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  /**
   * Subtract another vector from this one
   */
  subtract(other: Vector3D): Vector3D {
    return new Vector3D(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  /**
   * Scale this vector by a scalar
   */
  scale(scalar: number): Vector3D {
    return new Vector3D(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /**
   * Calculate the length (magnitude) of this vector
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Calculate the distance to another point
   */
  distanceTo(other: Vector3D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate the dot product with another vector
   */
  dot(other: Vector3D): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  /**
   * Calculate the cross product with another vector
   */
  cross(other: Vector3D): Vector3D {
    return new Vector3D(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  /**
   * Normalize this vector to unit length
   */
  normalize(): Vector3D {
    const len = this.length();
    if (len === 0) {
      return new Vector3D(0, 0, 0);
    }
    return new Vector3D(this.x / len, this.y / len, this.z / len);
  }

  /**
   * Check equality with another vector (within epsilon tolerance)
   */
  equals(other: Vector3D, epsilon: number = 1e-10): boolean {
    return (
      Math.abs(this.x - other.x) < epsilon &&
      Math.abs(this.y - other.y) < epsilon &&
      Math.abs(this.z - other.z) < epsilon
    );
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return `Vector3D(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }

  /**
   * Create a Vector3D from a JSON object
   */
  static fromJSON(obj: { x: number; y: number; z: number }): Vector3D {
    return new Vector3D(obj.x, obj.y, obj.z);
  }
}

/**
 * Type alias for 2D points (z = 0)
 */
export type Point2D = Vector3D;

/**
 * Type alias for 3D points
 */
export type Point3D = Vector3D;
