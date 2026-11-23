/**
 * App settings (File › Settings): how molecules are drawn, and API keys for the "Ask AI" panel.
 * Kept in this browser's localStorage, so they survive reloads. Pure functions, no DOM, so they can be tested.
 */
import { DrawingStyle } from '../draw/DrawingStyle';
import { ProviderId } from './claude';

export interface DrawingSettings {
  /** Bond length in pixels. */
  bondLength: number;
  /** Bond line width in pixels. */
  bondWidth: number;
  /** Atom label font size in pixels. */
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  /** Gap between the lines of a double bond, as % of the bond length (each line from the axis). */
  doubleSpacing: number;
  /** Width of the wide end of wedge and hash bonds, in pixels. */
  wedgeWidth: number;
  bondColor: string;
  showGrid: boolean;
}

export interface AppSettings {
  drawing: DrawingSettings;
  /** API keys entered in Settings › AI; '' means "use the dev server's key from .env.local". */
  apiKeys: Record<ProviderId, string>;
}

export const DEFAULT_DRAWING: DrawingSettings = {
  bondLength: 30,
  bondWidth: 1.5,
  fontSize: 14,
  fontFamily: 'Arial, sans-serif',
  fontWeight: 'normal',
  doubleSpacing: 9,
  wedgeWidth: 8,
  bondColor: '#000000',
  showGrid: false,
};

export const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: "'Segoe UI', system-ui, sans-serif", label: 'Segoe UI' },
  { value: 'Calibri, Carlito, sans-serif', label: 'Calibri' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "Consolas, 'Courier New', monospace", label: 'Consolas' },
];

/** Numeric drawing settings with their limits (used to build the panel and to clamp stored values). */
export const NUMERIC_SETTINGS: {
  key: 'bondLength' | 'bondWidth' | 'fontSize' | 'doubleSpacing' | 'wedgeWidth';
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: 'bondLength', label: 'Bond length', hint: 'Rescales the current drawing too', min: 15, max: 80, step: 1, unit: 'px' },
  { key: 'bondWidth', label: 'Line width', hint: 'Thickness of bond lines', min: 0.5, max: 5, step: 0.1, unit: 'px' },
  { key: 'fontSize', label: 'Label font size', hint: 'Atom symbols and text labels', min: 8, max: 32, step: 1, unit: 'px' },
  { key: 'doubleSpacing', label: 'Double bond spacing', hint: 'Distance of each line from the bond axis', min: 4, max: 20, step: 1, unit: '%' },
  { key: 'wedgeWidth', label: 'Wedge width', hint: 'Wide end of wedge and hash bonds', min: 3, max: 16, step: 0.5, unit: 'px' },
];

const STORAGE_KEY = 'tsdraw.settings.v1';

export function defaultSettings(): AppSettings {
  return { drawing: { ...DEFAULT_DRAWING }, apiKeys: { claude: '', openai: '', grok: '' } };
}

/** Bring untrusted (stored) values back into range; unknown or broken values fall back to the defaults. */
export function sanitize(raw: unknown): AppSettings {
  const out = defaultSettings();
  const src = (raw && typeof raw === 'object' ? raw : {}) as { drawing?: Record<string, unknown>; apiKeys?: Record<string, unknown> };
  const d = src.drawing ?? {};
  for (const spec of NUMERIC_SETTINGS) {
    const v = Number(d[spec.key]);
    if (Number.isFinite(v)) out.drawing[spec.key] = Math.min(spec.max, Math.max(spec.min, v));
  }
  if (typeof d.fontFamily === 'string' && FONT_FAMILIES.some((f) => f.value === d.fontFamily)) out.drawing.fontFamily = d.fontFamily;
  if (d.fontWeight === 'bold' || d.fontWeight === 'normal') out.drawing.fontWeight = d.fontWeight;
  if (typeof d.bondColor === 'string' && /^#[0-9a-f]{6}$/i.test(d.bondColor)) out.drawing.bondColor = d.bondColor;
  if (typeof d.showGrid === 'boolean') out.drawing.showGrid = d.showGrid;
  const keys = src.apiKeys ?? {};
  for (const id of Object.keys(out.apiKeys) as ProviderId[]) {
    if (typeof keys[id] === 'string') out.apiKeys[id] = (keys[id] as string).trim();
  }
  return out;
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AppSettings {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the settings still apply for this session.
  }
}

/** Copy the drawing settings onto a style (in place: the renderer and bond drawer share this object). */
export function applyDrawingStyle(style: DrawingStyle, d: DrawingSettings): void {
  style.bondWidth = d.bondWidth;
  style.atomFontSize = d.fontSize;
  style.hydrogenFontSize = Math.round(d.fontSize * 0.85);
  style.chargeFontSize = Math.round(d.fontSize * 0.7);
  style.atomFontFamily = d.fontFamily;
  style.atomFontWeight = d.fontWeight;
  style.doubleLineSpacing = d.doubleSpacing / 100;
  style.wedgeWidth = d.wedgeWidth;
  style.bondColor = d.bondColor;
  style.showGrid = d.showGrid;
  style.bondLength = d.bondLength;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
