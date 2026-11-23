import { Renderer } from './Renderer';
import { Point2D } from './Point2D';
import { DrawingConfig } from './DrawingConfig';

/**
 * HTML5 Canvas renderer for drawing molecules
 * Uses DrawingConfig for consistent settings across the session
 * Provides fast, hardware-accelerated rendering
 */
export class CanvasRenderer extends Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixelRatio: number;
  private config: DrawingConfig;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    config?: DrawingConfig
  ) {
    // Initialize with config's style
    const drawConfig = config || new DrawingConfig();
    super(width, height, drawConfig.style);

    this.config = drawConfig;
    this.canvas = canvas;
    this.pixelRatio = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    this.canvas.width = width * this.pixelRatio;
    this.canvas.height = height * this.pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }

    this.ctx = ctx;

    // Apply pixel ratio scaling
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    // Set default context properties
    this.applyStyle();
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get the drawing config
   */
  getConfig(): DrawingConfig {
    return this.config;
  }

  /**
   * Apply current style and config to canvas context
   */
  private applyStyle(): void {
    this.ctx.fillStyle = this.style.atomColor;
    this.ctx.strokeStyle = this.style.bondColor;
    this.ctx.lineWidth = this.style.bondWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.config.useAntiAlias) {
      this.ctx.filter = 'blur(0.1px)';
    } else {
      this.ctx.filter = 'none';
    }
  }

  clear(): void {
    this.ctx.fillStyle = this.style.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    if (this.style.showGrid) {
      this.drawGrid();
    }
  }

  /**
   * Draw background grid
   */
  private drawGrid(): void {
    const gridSize = 20;
    this.ctx.strokeStyle = this.style.gridLineColor;
    this.ctx.lineWidth = this.style.gridLineWidth;

    // Vertical lines
    for (let x = 0; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.canvas.width = width * this.pixelRatio;
    this.canvas.height = height * this.pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.scale(this.pixelRatio, this.pixelRatio);
    this.applyStyle();
  }

  drawCircle(
    center: Point2D,
    radius: number,
    color: string,
    fillColor?: string,
    lineWidth?: number
  ): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);

    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth ?? this.style.bondWidth;
    this.ctx.stroke();
  }

  drawLine(
    from: Point2D,
    to: Point2D,
    color: string,
    lineWidth: number
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([]);

    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
  }

  drawPath(
    points: Point2D[],
    color: string,
    lineWidth: number,
    closed: boolean
  ): void {
    if (points.length < 2) return;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([]);

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    if (closed) {
      this.ctx.closePath();
    }

    this.ctx.stroke();
  }

  drawDashedLine(
    from: Point2D,
    to: Point2D,
    color: string,
    lineWidth: number,
    dashLength: number,
    gapLength: number
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([dashLength, gapLength]);

    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();

    this.ctx.setLineDash([]);
  }

  drawPolygon(
    points: Point2D[],
    fillColor: string,
    strokeColor?: string,
    lineWidth: number = 1
  ): void {
    if (points.length < 2) return;

    this.ctx.fillStyle = fillColor;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    this.ctx.closePath();
    this.ctx.fill();

    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  drawText(
    text: string,
    position: Point2D,
    color: string,
    fontSize: number,
    fontFamily: string,
    align: 'left' | 'center' | 'right',
    fontWeight: string = 'normal'
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';

    this.ctx.fillText(text, position.x, position.y);
  }

  measureText(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: string = 'normal'
  ): { width: number; height: number } {
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = this.ctx.measureText(text);

    return {
      width: metrics.width,
      height: fontSize * 1.2, // Approximate height
    };
  }

  render(): void {
    // Canvas renders immediately, no additional render step needed
  }

  /**
   * Get image data from canvas
   */
  getImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  /**
   * Export canvas as PNG blob
   */
  async exportPNG(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to export canvas as PNG'));
          }
        },
        'image/png'
      );
    });
  }

  /**
   * Export as PNG data URL
   */
  getDataURL(): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Export as SVG - converts canvas drawing to SVG
   * Note: Canvas doesn't store drawing commands, so this is a limited export
   * For true SVG export, use SVGRenderer instead
   */
  exportSVG(): string {
    // Get canvas as image and embed in SVG
    const dataUrl = this.getDataURL();

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}">
  <defs>
    <style type="text/css">
      <![CDATA[
        image { image-rendering: optimizeQuality; }
      ]]>
    </style>
  </defs>
  <image width="${this.width}" height="${this.height}" href="${dataUrl}" />
</svg>`;
  }

  /**
   * Take a screenshot of the current drawing
   */
  screenshot(): Blob | null {
    const dataUrl = this.getDataURL();
    if (dataUrl.startsWith('data:image/png;')) {
      // Create a blob from the data URL
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(arr[1]);
      const n = bstr.length;
      const u8arr = new Uint8Array(n);

      for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }

      return new Blob([u8arr], { type: mime });
    }
    return null;
  }

  /**
   * Copy canvas to clipboard
   */
  async copyToClipboard(): Promise<void> {
    try {
      const blob = await this.exportPNG();
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
    } catch (error) {
      throw new Error(`Failed to copy to clipboard: ${error}`);
    }
  }

  /**
   * Save canvas as file
   */
  saveAsFile(filename: string = 'molecule.png'): void {
    const link = document.createElement('a');
    link.href = this.getDataURL();
    link.download = filename;
    link.click();
  }

  // ===== Canvas-Specific Methods =====

  /**
   * Get raw canvas context (for advanced users)
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Enable or disable antialiasing
   */
  setAntiAlias(enabled: boolean): void {
    this.config.useAntiAlias = enabled;
    if (enabled) {
      this.ctx.filter = 'blur(0.1px)';
    } else {
      this.ctx.filter = 'none';
    }
  }

  /**
   * Save canvas state
   */
  save(): void {
    this.ctx.save();
  }

  /**
   * Restore canvas state
   */
  restore(): void {
    this.ctx.restore();
  }

  /**
   * Apply a transformation matrix
   */
  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this.ctx.transform(a, b, c, d, e, f);
  }

  /**
   * Translate the canvas origin
   */
  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  /**
   * Rotate the canvas
   */
  rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  /**
   * Scale the canvas
   */
  scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }
}
