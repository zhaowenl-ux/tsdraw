import { Molecule } from '../core/Molecule';
import { Point2D } from './Point2D';
import { DrawingConfig } from './DrawingConfig';
import { layoutOrganic } from './OrganicLayout';

/**
 * Generates 2D drawing coordinates from 3D molecular structures
 * Uses DrawingConfig for consistent bond length across the session
 *
 * Strategies:
 * - ORGANIC: Standard organic chemistry layout (sp3 tetrahedral, sp2 planar)
 * - CIRCULAR: Arrange atoms in a circle around central atom
 * - TREE: Hierarchical tree layout
 * - SPRING: Physics-based spring layout (iterative)
 */
export class CoordinateGenerator {
  private layouts: Map<number, Point2D> = new Map(); // Atom ID -> 2D point
  private config: DrawingConfig;

  constructor(config: DrawingConfig) {
    this.config = config;
  }

  /**
   * Get bond length from config
   */
  getBondLength(): number {
    return this.config.bondLength;
  }

  /**
   * Set bond length (updates config)
   */
  setBondLength(length: number): CoordinateGenerator {
    this.config.setBondLength(length);
    return this;
  }

  /**
   * Generate 2D coordinates for a molecule using configured strategy
   */
  generateCoordinates(
    molecule: Molecule,
    strategy?: 'organic' | 'circular' | 'tree' | 'spring',
    reference?: Map<number, Point2D>
  ): Map<number, Point2D> {
    this.layouts.clear();

    if (molecule.getAtomCount() === 0) {
      return this.layouts;
    }

    const layoutStrategy = strategy || this.config.layoutStrategy;

    switch (layoutStrategy) {
      case 'circular':
        return this.generateCircularLayout(molecule);
      case 'tree':
        return this.generateTreeLayout(molecule);
      case 'spring':
        return this.generateSpringLayout(molecule);
      case 'organic':
      default:
        return this.generateOrganicLayout(molecule, reference);
    }
  }

  /**
   * Organic layout: rings as regular polygons (fused, spiro and linked), chains zigzagged
   * away from the rest of the molecule, then a short relaxation that fixes bond lengths,
   * angles and close contacts. Disconnected pieces are placed side by side.
   * See OrganicLayout.ts.
   */
  private generateOrganicLayout(molecule: Molecule, reference?: Map<number, Point2D>): Map<number, Point2D> {
    // `reference` (the drawn positions) keeps each double bond's cis/trans (Z/E) arrangement.
    for (const [id, p] of layoutOrganic(molecule, this.config.bondLength, reference)) this.layouts.set(id, p);
    this.centerLayout();
    return this.layouts;
  }

  /**
   * Circular layout: arrange atoms in a circle
   * Good for symmetric molecules
   */
  private generateCircularLayout(molecule: Molecule): Map<number, Point2D> {
    const atoms = molecule.getAtoms();
    if (atoms.length === 0) return this.layouts;

    const count = atoms.length;
    const radius = (count * this.config.bondLength) / (2 * Math.PI);
    const center = new Point2D(0, 0);

    atoms.forEach((atom, index) => {
      const angle = (2 * Math.PI * index) / count;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      this.layouts.set(atom.id, new Point2D(x, y));
    });

    return this.layouts;
  }

  /**
   * Tree layout: hierarchical arrangement
   * Good for acyclic molecules
   */
  private generateTreeLayout(molecule: Molecule): Map<number, Point2D> {
    const atoms = molecule.getAtoms();
    if (atoms.length === 0) return this.layouts;

    // Find atom with lowest degree (terminal atom) or use first
    let rootAtom = atoms[0];
    let minDegree = molecule.getConnectedAtoms(rootAtom.id).length;

    for (const atom of atoms) {
      const degree = molecule.getConnectedAtoms(atom.id).length;
      if (degree < minDegree) {
        rootAtom = atom;
        minDegree = degree;
      }
    }

    // BFS tree layout
    this.layouts.set(rootAtom.id, new Point2D(0, 0));
    const visited = new Set<number>();
    const queue: { atomId: number; level: number; index: number; parentCount: number }[] = [];

    visited.add(rootAtom.id);
    queue.push({ atomId: rootAtom.id, level: 0, index: 0, parentCount: 1 });

    const levelNodes: number[] = [];
    let currentLevel = 0;

    while (queue.length > 0) {
      const { atomId, level } = queue.shift()!;

      if (level > currentLevel) {
        levelNodes.length = 0;
        currentLevel = level;
      }
      levelNodes.push(atomId);

      const atomPos = this.layouts.get(atomId)!;
      const connectedAtoms = molecule.getConnectedAtoms(atomId);

      const childCount = connectedAtoms.filter(a => !visited.has(a.id)).length;
      const angleSpan = Math.PI * (childCount > 0 ? 0.8 : 0);
      const startAngle = -angleSpan / 2 + Math.PI / 2;

      connectedAtoms.forEach((connAtom, childIndex) => {
        if (visited.has(connAtom.id)) return;

        const angle = startAngle + (angleSpan * childIndex) / Math.max(childCount - 1, 1);
        const distance = this.config.bondLength * (1 + level * 0.3);  // ✅ Use config bond length
        const newPos = new Point2D(
          atomPos.x + distance * Math.cos(angle),
          atomPos.y + distance * Math.sin(angle)
        );

        this.layouts.set(connAtom.id, newPos);
        visited.add(connAtom.id);
        queue.push({
          atomId: connAtom.id,
          level: level + 1,
          index: childIndex,
          parentCount: childCount,
        });
      });
    }

    this.centerLayout();
    return this.layouts;
  }

  /**
   * Spring layout: physics-based iterative layout
   * Treats bonds as springs, repels non-bonded atoms
   */
  private generateSpringLayout(molecule: Molecule, iterations: number = 50): Map<number, Point2D> {
    const atoms = molecule.getAtoms();
    if (atoms.length === 0) return this.layouts;

    // Initialize positions randomly or use organic layout
    atoms.forEach((atom, index) => {
      const angle = (2 * Math.PI * index) / atoms.length;
      const x = this.config.bondLength * Math.cos(angle);
      const y = this.config.bondLength * Math.sin(angle);
      this.layouts.set(atom.id, new Point2D(x, y));
    });

    // Spring physics parameters
    const springConstant = 0.1;
    const repulsionConstant = 100;
    const damping = 0.8;
    const velocities = new Map<number, { vx: number; vy: number }>();

    atoms.forEach(atom => {
      velocities.set(atom.id, { vx: 0, vy: 0 });
    });

    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      atoms.forEach(atom => {
        const pos = this.layouts.get(atom.id)!;
        let fx = 0;
        let fy = 0;

        // Spring forces from bonds
        molecule.getConnectedAtoms(atom.id).forEach(other => {
          const otherPos = this.layouts.get(other.id)!;
          const dx = otherPos.x - pos.x;
          const dy = otherPos.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const error = distance - this.config.bondLength;  // ✅ Use config bond length

          fx += springConstant * error * (dx / distance);
          fy += springConstant * error * (dy / distance);
        });

        // Repulsion forces
        atoms.forEach(other => {
          if (atom.id === other.id) return;
          const otherPos = this.layouts.get(other.id)!;
          const dx = pos.x - otherPos.x;
          const dy = pos.y - otherPos.y;
          const distSq = dx * dx + dy * dy + 1;

          fx += repulsionConstant * (dx / Math.pow(distSq, 1.5));
          fy += repulsionConstant * (dy / Math.pow(distSq, 1.5));
        });

        // Update velocity
        const vel = velocities.get(atom.id)!;
        vel.vx = (vel.vx + fx) * damping;
        vel.vy = (vel.vy + fy) * damping;

        // Update position
        const newPos = new Point2D(pos.x + vel.vx, pos.y + vel.vy);
        this.layouts.set(atom.id, newPos);
      });
    }

    this.centerLayout();
    return this.layouts;
  }

  /**
   * Center layout around origin
   */
  private centerLayout(): void {
    if (this.layouts.size === 0) return;

    // Find bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.layouts.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Translate to center
    const centered = new Map<number, Point2D>();
    this.layouts.forEach((pos, atomId) => {
      centered.set(atomId, new Point2D(pos.x - centerX, pos.y - centerY));
    });

    this.layouts = centered;
  }

  /**
   * Get 2D coordinates for an atom
   */
  getCoordinates(atomId: number): Point2D | undefined {
    return this.layouts.get(atomId);
  }

  /**
   * Get all coordinates
   */
  getAllCoordinates(): Map<number, Point2D> {
    return new Map(this.layouts);
  }

  /**
   * Get layout bounds
   */
  getBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.layouts.size === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.layouts.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Scale layout to fit in bounds
   */
  fitInBounds(width: number, height: number, padding: number = 20): void {
    const bounds = this.getBounds();
    if (!bounds) return;

    const currentWidth = bounds.maxX - bounds.minX;
    const currentHeight = bounds.maxY - bounds.minY;

    const targetWidth = width - 2 * padding;
    const targetHeight = height - 2 * padding;

    const scaleX = currentWidth > 0 ? targetWidth / currentWidth : 1;
    const scaleY = currentHeight > 0 ? targetHeight / currentHeight : 1;
    const scale = Math.min(scaleX, scaleY);

    // Center and scale
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const scaled = new Map<number, Point2D>();
    this.layouts.forEach((pos, atomId) => {
      const x = (pos.x - centerX) * scale + width / 2;
      const y = (pos.y - centerY) * scale + height / 2;
      scaled.set(atomId, new Point2D(x, y));
    });

    this.layouts = scaled;
  }
}
