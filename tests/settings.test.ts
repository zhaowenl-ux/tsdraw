import { describe, expect, it } from 'vitest';
import { DrawingStyle } from '../src/draw/DrawingStyle';
import { Point2D } from '../src/draw/Point2D';
import { Editor } from '../src/app/editor';
import { applyDrawingStyle, defaultSettings, loadSettings, sanitize, saveSettings } from '../src/app/settings';

describe('settings', () => {
  it('falls back to defaults for missing or broken values and clamps numbers', () => {
    const s = sanitize({ drawing: { bondLength: 500, bondWidth: 'x', fontFamily: 'Comic Sans', bondColor: 'red' }, apiKeys: { claude: ' k ' } });
    expect(s.drawing.bondLength).toBe(80);
    expect(s.drawing.bondWidth).toBe(1.5);
    expect(s.drawing.fontFamily).toBe('Arial, sans-serif');
    expect(s.drawing.bondColor).toBe('#000000');
    expect(s.apiKeys).toEqual({ claude: 'k', openai: '', grok: '' });
  });

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const s = defaultSettings();
    s.drawing.fontSize = 18;
    s.apiKeys.openai = 'sk-test';
    saveSettings(s, storage);
    expect(loadSettings(storage)).toEqual(s);
    expect(loadSettings({ getItem: () => '{not json' })).toEqual(defaultSettings());
  });

  it('applies to a style; the defaults leave the light theme unchanged', () => {
    const style = DrawingStyle.lightTheme();
    const before = JSON.stringify(style);
    applyDrawingStyle(style, defaultSettings().drawing);
    expect(JSON.stringify(style)).toBe(before);
    applyDrawingStyle(style, { ...defaultSettings().drawing, bondWidth: 2, doubleSpacing: 12 });
    expect(style.bondWidth).toBe(2);
    expect(style.doubleLineSpacing).toBeCloseTo(0.12);
  });
});

describe('Editor.setBondLength', () => {
  it('scales the drawing and the undo history', () => {
    const ed = new Editor(30);
    ed.applyTool({ kind: 'bond', type: 1 } as never, new Point2D(100, 100));
    const ids = [...ed.atomIds()];
    expect(ids.length).toBe(2);
    const dist = () => ed.getPosition(ids[0])!.distanceTo(ed.getPosition(ids[1])!);
    expect(dist()).toBeCloseTo(30);
    ed.setBondLength(45);
    expect(ed.bondLength).toBe(45);
    expect(dist()).toBeCloseTo(45);
  });
});
