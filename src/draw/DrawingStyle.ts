/**
 * Defines visual style for molecular drawings
 * Controls colors, fonts, line widths, and rendering options
 */
export class DrawingStyle {
  // Atom styling
  atomColor: string = '#000000';           // Atom label color
  atomFontFamily: string = 'Arial, sans-serif';
  atomFontSize: number = 14;               // Points
  atomFontWeight: string = 'normal';
  atomRadius: number = 20;                 // Pixels (for selection, not drawing)

  // Bond styling
  bondColor: string = '#000000';
  bondWidth: number = 1.5;                 // Pixels
  doubleLineSpacing: number = 0.09;        // Ratio of bond length, each line from the axis (gap between lines = 2x, i.e. 18%)
  /** Offset double bonds: how far the shorter second line is pulled in at each end (ratio of bond length). */
  doubleInnerInset: number = 0.15;
  tripleLineSpacing: number = 0.20;        // Ratio of bond length
  aromaticDashLength: number = 4;          // Pixels
  aromaticDashSpacing: number = 4;         // Pixels

  // Bond stereochemistry
  wedgeWidth: number = 8;                  // Pixels at end
  hashLineSpacing: number = 3;             // Pixels between hash lines

  // Implicit hydrogens
  showImplicitHydrogens: boolean = false;
  hydrogenColor: string = '#333333';
  hydrogenFontSize: number = 12;

  // Formal charges
  chargeColor: string = '#CC0000';         // Red for charges
  chargeFontSize: number = 10;

  // Selection and highlighting
  selectionColor: string = '#0066FF';      // Blue
  selectionWidth: number = 2;
  hoverColor: string = '#FF9900';          // Orange
  hoverWidth: number = 2;

  // Background
  backgroundColor: string = '#FFFFFF';
  gridLineColor: string = '#EEEEEE';
  gridLineWidth: number = 0.5;
  showGrid: boolean = false;

  // Layout and spacing
  bondLength: number = 30;                 // Pixels (average C-C bond)
  atomSpacing: number = 1.5;               // Bond length multiplier for spacing

  // Rendering options
  antiAlias: boolean = true;
  quality: 'low' | 'medium' | 'high' = 'high';

  constructor(defaults?: Partial<DrawingStyle>) {
    if (defaults) {
      Object.assign(this, defaults);
    }
  }

  /**
   * Get a dark theme variant
   */
  static darkTheme(): DrawingStyle {
    return new DrawingStyle({
      atomColor: '#FFFFFF',
      bondColor: '#FFFFFF',
      backgroundColor: '#1a1a1a',
      gridLineColor: '#333333',
      chargeColor: '#FF6666',
      hydrogenColor: '#CCCCCC',
      selectionColor: '#00AAFF',
      hoverColor: '#FFAA00',
    });
  }

  /**
   * Get a light theme variant (default)
   */
  static lightTheme(): DrawingStyle {
    return new DrawingStyle();
  }

  /**
   * Get a publication theme (high quality, minimal colors)
   */
  static publicationTheme(): DrawingStyle {
    return new DrawingStyle({
      atomColor: '#000000',
      bondColor: '#000000',
      bondWidth: 1.2,
      atomFontSize: 12,
      hydrogenFontSize: 10,
      backgroundColor: '#FFFFFF',
      showImplicitHydrogens: true,
      quality: 'high',
    });
  }

  /**
   * Get a colorful theme (element colors)
   */
  static colorfulTheme(): DrawingStyle {
    return new DrawingStyle({
      atomFontSize: 14,
      atomRadius: 25,
      quality: 'high',
    });
  }

  /**
   * Get element-specific color (CPK color scheme)
   * https://en.wikipedia.org/wiki/CPK_coloring
   */
  static getElementColor(symbol: string): string {
    const elementColors: { [key: string]: string } = {
      'H': '#FFFFFF',  // White
      'C': '#909090',  // Gray
      'N': '#3050F8',  // Blue
      'O': '#FF0D0D',  // Red
      'F': '#90E050',  // Light green
      'P': '#FF7F00',  // Orange
      'S': '#FFFF30',  // Yellow
      'Cl': '#1FF01F', // Green
      'Br': '#A62929', // Brown
      'I': '#940094',  // Purple
      'B': '#FFB5B5',  // Light red
      'Na': '#AB5CF2', // Purple
      'Mg': '#61A6FF', // Light blue
      'Al': '#C8A1FF', // Lavender
      'Si': '#F0C8A0', // Light brown
      'K': '#66339F',  // Dark purple
      'Ca': '#3DFF00', // Green
      'Fe': '#FF6611', // Orange-red
      'Cu': '#C88033', // Copper
      'Zn': '#7D80B0', // Gray-blue
    };

    return elementColors[symbol] || '#C0C0C0'; // Silver default
  }

  /**
   * Clone this style with optional overrides
   */
  clone(overrides?: Partial<DrawingStyle>): DrawingStyle {
    const cloned = new DrawingStyle(this);
    if (overrides) {
      Object.assign(cloned, overrides);
    }
    return cloned;
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, any> {
    const obj: any = {};
    for (const key of Object.keys(this)) {
      obj[key] = (this as any)[key];
    }
    return obj;
  }
}
