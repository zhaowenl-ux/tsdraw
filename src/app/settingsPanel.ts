/**
 * The Settings dialog (File › Settings, Ctrl+,): a tabbed panel.
 *   Drawing — bond length, line width, label font, double-bond spacing, wedge width, bond colour, grid.
 *   AI      — API keys for Claude, ChatGPT and Grok.
 * Changes apply at once and are saved in this browser.
 */
import { STANDALONE } from './runtime';
import { PROVIDERS, ProviderId, testApiKey } from './claude';
import {
  AppSettings,
  DEFAULT_DRAWING,
  DrawingSettings,
  FONT_FAMILIES,
  NUMERIC_SETTINGS,
  saveSettings,
} from './settings';

export interface SettingsPanelOptions {
  settings: AppSettings;
  /** Called after any drawing setting changes (already stored in `settings.drawing`). */
  onDrawingChange: (drawing: DrawingSettings) => void;
  /** Called after an API key changes (already stored in `settings.apiKeys`). */
  onKeysChange: (keys: AppSettings['apiKeys']) => void;
}

export interface SettingsPanel {
  open(tab?: 'drawing' | 'ai'): void;
  close(): void;
  isOpen(): boolean;
}

const KEY_PLACEHOLDER: Record<ProviderId, string> = { claude: 'sk-ant-…', openai: 'sk-…', grok: 'xai-…' };
const KEY_LINK: Record<ProviderId, string> = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  grok: 'https://console.x.ai',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(label: string, hint: string, control: HTMLElement): HTMLElement {
  const r = el('div', { class: 'settings-row' });
  const text = el('div', { class: 'settings-row-text' });
  text.append(el('div', { class: 'settings-row-label' }, label));
  if (hint) text.append(el('div', { class: 'settings-row-hint' }, hint));
  r.append(text, control);
  return r;
}

export function initSettingsPanel(opts: SettingsPanelOptions): SettingsPanel {
  const { settings } = opts;
  const modal = document.getElementById('settingsModal')!;
  const drawingRows = document.getElementById('settingsDrawingRows')!;
  const aiRows = document.getElementById('settingsAiRows')!;
  const tabs = [...modal.querySelectorAll<HTMLButtonElement>('.settings-tab')];
  const panes = [...modal.querySelectorAll<HTMLElement>('.settings-pane')];
  let lastFocus: HTMLElement | null = null;

  // ---------- Drawing tab ----------

  const refreshers: (() => void)[] = [];
  const changed = (): void => {
    saveSettings(settings);
    opts.onDrawingChange(settings.drawing);
  };

  for (const spec of NUMERIC_SETTINGS) {
    const box = el('div', { class: 'settings-control' });
    const range = el('input', { type: 'range', min: String(spec.min), max: String(spec.max), step: String(spec.step), 'aria-label': spec.label });
    const num = el('input', { type: 'number', min: String(spec.min), max: String(spec.max), step: String(spec.step), class: 'settings-number', 'aria-label': spec.label });
    const unit = el('span', { class: 'settings-unit' }, spec.unit);
    const set = (raw: string, fromNumber: boolean): void => {
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      const clamped = Math.min(spec.max, Math.max(spec.min, v));
      settings.drawing[spec.key] = clamped;
      if (fromNumber) range.value = String(clamped);
      else num.value = String(clamped);
      changed();
    };
    range.addEventListener('input', () => set(range.value, false));
    num.addEventListener('change', () => {
      set(num.value, true);
      num.value = String(settings.drawing[spec.key]);
    });
    refreshers.push(() => {
      range.value = String(settings.drawing[spec.key]);
      num.value = String(settings.drawing[spec.key]);
    });
    box.append(range, num, unit);
    drawingRows.append(row(spec.label, spec.hint, box));
  }

  const font = el('select', { class: 'settings-select', 'aria-label': 'Label font' });
  for (const f of FONT_FAMILIES) font.append(el('option', { value: f.value }, f.label));
  font.addEventListener('change', () => {
    settings.drawing.fontFamily = font.value;
    changed();
  });
  refreshers.push(() => (font.value = settings.drawing.fontFamily));
  drawingRows.append(row('Label font', '', font));

  const bold = el('input', { type: 'checkbox', class: 'settings-switch', 'aria-label': 'Bold labels' });
  bold.addEventListener('change', () => {
    settings.drawing.fontWeight = bold.checked ? 'bold' : 'normal';
    changed();
  });
  refreshers.push(() => (bold.checked = settings.drawing.fontWeight === 'bold'));
  drawingRows.append(row('Bold labels', '', bold));

  const color = el('input', { type: 'color', class: 'settings-color', 'aria-label': 'Bond colour' });
  color.addEventListener('input', () => {
    settings.drawing.bondColor = color.value;
    changed();
  });
  refreshers.push(() => (color.value = settings.drawing.bondColor));
  drawingRows.append(row('Bond colour', '', color));

  const grid = el('input', { type: 'checkbox', class: 'settings-switch', 'aria-label': 'Show grid' });
  grid.addEventListener('change', () => {
    settings.drawing.showGrid = grid.checked;
    changed();
  });
  refreshers.push(() => (grid.checked = settings.drawing.showGrid));
  drawingRows.append(row('Show grid', 'Light grid behind the drawing', grid));

  const circles = el('input', { type: 'checkbox', class: 'settings-switch', 'aria-label': 'Aromatic circles' });
  circles.addEventListener('change', () => {
    settings.drawing.aromaticCircles = circles.checked;
    changed();
  });
  refreshers.push(() => (circles.checked = settings.drawing.aromaticCircles));
  drawingRows.append(row('Aromatic circles', 'Draw aromatic rings with a circle instead of Kekulé double bonds', circles));

  const reset = el('button', { type: 'button', class: 'settings-btn' }, 'Reset to defaults');
  reset.addEventListener('click', () => {
    Object.assign(settings.drawing, DEFAULT_DRAWING);
    refreshers.forEach((r) => r());
    changed();
  });
  const footer = el('div', { class: 'settings-footer' });
  footer.append(reset);
  drawingRows.append(footer);

  // ---------- AI tab ----------

  const statusFor = new Map<ProviderId, HTMLElement>();
  let envKeys: Partial<Record<ProviderId, boolean>> = {};

  const describe = (id: ProviderId): string => {
    if (settings.apiKeys[id]) return 'Using the key entered here';
    if (envKeys[id]) return 'Using the key from .env.local';
    return 'No key yet';
  };
  const showStatus = (id: ProviderId, text = describe(id), kind: '' | 'ok' | 'error' = ''): void => {
    const s = statusFor.get(id)!;
    s.textContent = text;
    s.className = `settings-key-status ${kind}`;
  };

  for (const provider of PROVIDERS) {
    const id = provider.id;
    const box = el('div', { class: 'settings-key' });
    const line = el('div', { class: 'settings-key-line' });
    const input = el('input', {
      type: 'password',
      class: 'settings-input',
      placeholder: KEY_PLACEHOLDER[id],
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': `${provider.name} API key`,
    });
    input.value = settings.apiKeys[id];
    const show = el('button', { type: 'button', class: 'settings-btn small', title: 'Show or hide the key' }, 'Show');
    show.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      show.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
    const test = el('button', { type: 'button', class: 'settings-btn small' }, 'Test');
    test.addEventListener('click', async () => {
      if (!input.value.trim() && !envKeys[id]) {
        showStatus(id, 'Enter a key first', 'error');
        input.focus();
        return;
      }
      test.disabled = true;
      showStatus(id, 'Testing…');
      const error = await testApiKey(id, input.value.trim());
      test.disabled = false;
      showStatus(id, error ?? `${provider.name} accepted the key`, error ? 'error' : 'ok');
    });
    input.addEventListener('change', () => {
      settings.apiKeys[id] = input.value.trim();
      input.value = settings.apiKeys[id];
      saveSettings(settings);
      opts.onKeysChange(settings.apiKeys);
      showStatus(id);
    });
    line.append(input, show, test);

    const meta = el('div', { class: 'settings-key-meta' });
    const status = el('span', { class: 'settings-key-status' });
    statusFor.set(id, status);
    const link = el('a', { href: KEY_LINK[id], target: '_blank', rel: 'noopener' }, 'Get a key');
    meta.append(status, link);
    box.append(line, meta);
    aiRows.append(row(provider.name, provider.keyVar, box));
    showStatus(id);
  }

  // Which providers have a key in .env.local (the dev server answers yes/no, never the key).
  if (!STANDALONE) fetch('/api/tsdraw/key-status')
    .then((r) => (r.ok ? r.json() : {}))
    .then((s: Partial<Record<ProviderId, boolean>>) => {
      envKeys = s ?? {};
      PROVIDERS.forEach((p) => showStatus(p.id));
    })
    .catch(() => undefined);

  // ---------- tabs, open / close ----------

  const selectTab = (name: string): void => {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panes.forEach((p) => (p.hidden = p.dataset.pane !== name));
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab!));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.dataset.tab!);
      next.focus();
    });
  });

  const panel: SettingsPanel = {
    open(tab = 'drawing') {
      lastFocus = document.activeElement as HTMLElement | null;
      refreshers.forEach((r) => r());
      selectTab(tab);
      modal.hidden = false;
      tabs.find((t) => t.dataset.tab === tab)?.focus();
    },
    close() {
      if (modal.hidden) return;
      if (modal.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      modal.hidden = true;
      if (lastFocus && lastFocus !== document.body && document.contains(lastFocus)) lastFocus.focus();
    },
    isOpen: () => !modal.hidden,
  };

  document.getElementById('settingsClose')!.addEventListener('click', () => panel.close());
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) panel.close();
  });
  modal.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    e.stopPropagation(); // keep editor shortcuts (Delete, Ctrl+Z…) out of the dialog
    if (e.key === 'Escape') panel.close();
  });
  // Esc also closes when focus has left the dialog (e.g. a button that was disabled while testing).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.isOpen()) panel.close();
  });
  return panel;
}
