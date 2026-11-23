import { DrawingStyle } from './DrawingStyle';

/**
 * Central configuration for a drawing session
 * Ensures all components (generators, renderers, drawers) use consistent settings
 *
 * This is the single source of truth for:
 * - Bond length (used by CoordinateGenerator and BondDrawer)
 * - Atom radius (used by AtomDrawer)
 * - Style (colors, fonts, widths)
 * - Layout strategy (organic, circular, tree, spring)
 *
 * Usage:
 *   const config = new DrawingConfig({ bondLength: 35 });
 *   const coordGen = new CoordinateGenerator(config);
 *   const renderer = new CanvasRenderer(canvas, 800, 600, config);
 *   const bondDrawer = new BondDrawer(config);
 */
export class DrawingConfig {
  // Drawing space settings
  bondLength: number = 30;           // Pixels (used by CoordinateGenerator and spacing)
  atomRadius: number = 20;           // Pixels (selection/hit test radius)

  // Visual style
  style: DrawingStyle;

  // Layout algorithm
  layoutStrategy: 'organic' | 'circular' | 'tree' | 'spring' = 'organic';

  // Rendering options
  useAntiAlias: boolean = true;
  renderQuality: 'low' | 'medium' | 'high' = 'high';

  // Interactive features
  enableInteraction: boolean = false;
  selectionMode: 'none' | 'atoms' | 'bonds' | 'both' = 'both';
  hoverEnabled: boolean = true;

  constructor(defaults?: Partial<DrawingConfig>) {
    this.style = new DrawingStyle();

    if (defaults) {
      Object.assign(this, defaults);
      // Handle style specially if provided
      if (defaults.style instanceof DrawingStyle) {
        this.style = defaults.style;
      }
    }
  }

  /**
   * Create a config with publication quality settings
   */
  static publication(bondLength: number = 30): DrawingConfig {
    return new DrawingConfig({
      bondLength,
      atomRadius: 20,
      style: DrawingStyle.publicationTheme(),
      layoutStrategy: 'organic',
      useAntiAlias: true,
      renderQuality: 'high',
    });
  }

  /**
   * Create a config with colorful element-based rendering
   */
  static colorful(bondLength: number = 35): DrawingConfig {
    return new DrawingConfig({
      bondLength,
      atomRadius: 25,
      style: DrawingStyle.colorfulTheme(),
      layoutStrategy: 'organic',
      useAntiAlias: true,
      renderQuality: 'high',
    });
  }

  /**
   * Create a config for interactive editing
   */
  static interactive(bondLength: number = 40): DrawingConfig {
    return new DrawingConfig({
      bondLength,
      atomRadius: 25,
      style: DrawingStyle.lightTheme(),
      layoutStrategy: 'organic',
      enableInteraction: true,
      selectionMode: 'both',
      hoverEnabled: true,
      renderQuality: 'high',
    });
  }

  /**
   * Create a config for dark theme
   */
  static dark(bondLength: number = 30): DrawingConfig {
    return new DrawingConfig({
      bondLength,
      atomRadius: 20,
      style: DrawingStyle.darkTheme(),
      layoutStrategy: 'organic',
      useAntiAlias: true,
      renderQuality: 'high',
    });
  }

  /**
   * Create a minimal config for fast rendering
   */
  static minimal(bondLength: number = 30): DrawingConfig {
    return new DrawingConfig({
      bondLength,
      atomRadius: 15,
      style: DrawingStyle.lightTheme(),
      layoutStrategy: 'circular',
      useAntiAlias: false,
      renderQuality: 'low',
    });
  }

  /**
   * Clone this config with optional overrides
   */
  clone(overrides?: Partial<DrawingConfig>): DrawingConfig {
    const cloned = new DrawingConfig({
      bondLength: this.bondLength,
      atomRadius: this.atomRadius,
      style: this.style.clone(),
      layoutStrategy: this.layoutStrategy,
      useAntiAlias: this.useAntiAlias,
      renderQuality: this.renderQuality,
      enableInteraction: this.enableInteraction,
      selectionMode: this.selectionMode,
      hoverEnabled: this.hoverEnabled,
    });

    if (overrides) {
      Object.assign(cloned, overrides);
      if (overrides.style) {
        cloned.style = overrides.style;
      }
    }

    return cloned;
  }

  /**
   * Update this config with new values
   */
  update(updates: Partial<DrawingConfig>): DrawingConfig {
    Object.assign(this, updates);
    return this;
  }

  /**
   * Set bond length and update dependent calculations
   */
  setBondLength(length: number): DrawingConfig {
    this.bondLength = length;
    return this;
  }

  /**
   * Set atom radius
   */
  setAtomRadius(radius: number): DrawingConfig {
    this.atomRadius = radius;
    return this;
  }

  /**
   * Set layout strategy
   */
  setLayoutStrategy(strategy: 'organic' | 'circular' | 'tree' | 'spring'): DrawingConfig {
    this.layoutStrategy = strategy;
    return this;
  }

  /**
   * Set style theme
   */
  setStyle(style: DrawingStyle): DrawingConfig {
    this.style = style;
    return this;
  }

  /**
   * Enable/disable interaction
   */
  setInteraction(enabled: boolean, mode: 'atoms' | 'bonds' | 'both' = 'both'): DrawingConfig {
    this.enableInteraction = enabled;
    this.selectionMode = mode;
    return this;
  }

  /**
   * Get configuration as object (for serialization)
   */
  toJSON(): Record<string, any> {
    return {
      bondLength: this.bondLength,
      atomRadius: this.atomRadius,
      style: this.style.toJSON(),
      layoutStrategy: this.layoutStrategy,
      useAntiAlias: this.useAntiAlias,
      renderQuality: this.renderQuality,
      enableInteraction: this.enableInteraction,
      selectionMode: this.selectionMode,
      hoverEnabled: this.hoverEnabled,
    };
  }

  /**
   * Get configuration info string
   */
  toString(): string {
    return (
      `DrawingConfig {\n` +
      `  bondLength: ${this.bondLength}px\n` +
      `  atomRadius: ${this.atomRadius}px\n` +
      `  layoutStrategy: ${this.layoutStrategy}\n` +
      `  renderQuality: ${this.renderQuality}\n` +
      `  interaction: ${this.enableInteraction ? this.selectionMode : 'disabled'}\n` +
      `}`
    );
  }
}
