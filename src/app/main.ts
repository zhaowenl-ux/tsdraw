import { BondChirality, BondType } from '../core/Bond';
import { periodicTable } from '../core/Element';
import { BondDrawer } from '../draw/BondDrawer';
import { CanvasRenderer } from '../draw/CanvasRenderer';
import { CoordinateGenerator } from '../draw/CoordinateGenerator';
import { DrawingConfig } from '../draw/DrawingConfig';
import { DrawingStyle } from '../draw/DrawingStyle';
import { Point2D } from '../draw/Point2D';
import { ArrowGrip, Editor, EditorDocument, Tool, describeTool } from './editor';
import { periodicCell } from './periodicLayout';
import { describeProblem } from './valence';
import { toMolfile, toSmiles } from './export';
import { ParsedDocument, parseMolecule } from './import';
import { ChatEvent, ChemistryChat, PROVIDERS, ProviderId, getProvider } from './claude';
import { DEFAULT_BRIDGE_PORT, connectDesktopBridge } from './desktopBridge';
import { drawScene } from './view';
import { APP_VERSION } from './version';
import { applyDrawingStyle, loadSettings } from './settings';
import { initSettingsPanel } from './settingsPanel';
import { initHelpDialog } from './help';
import { ArrowKind, arrowEnd, isArrowKind } from './arrows';

// Version: set from the code (not the HTML), so it always shows which code the page is running.
byIdOrNull('appVersion')?.replaceChildren(`v${APP_VERSION}`);
document.title = `TSDraw v${APP_VERSION} - Molecular Drawing Interface`;
console.info(`tsdraw v${APP_VERSION}`);

function byIdOrNull(id: string): HTMLElement | null {
  return document.getElementById(id);
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

// ---------- setup ----------

// File › Settings: saved drawing settings and API keys (this browser).
const settings = loadSettings();

const config = new DrawingConfig({
  bondLength: settings.drawing.bondLength,
  atomRadius: 6,
  style: DrawingStyle.lightTheme(),
  layoutStrategy: 'organic',
});
applyDrawingStyle(config.style, settings.drawing);

const canvas = byId<HTMLCanvasElement>('drawingCanvas');
const renderer = new CanvasRenderer(canvas, CANVAS_WIDTH, CANVAS_HEIGHT, config);
const bondDrawer = new BondDrawer(config);
const layout = new CoordinateGenerator(config);
const editor = new Editor(config.bondLength);

let tool: Tool = { kind: 'select', mode: 'lasso' };
let cursor: Point2D | null = null;

// ---------- rendering & status ----------

function redraw(): void {
  // While a new piece is being swung, previews and hover marks would only get in the way.
  const marks = swinging ? [...editor.pieceContacts(swinging.ids, swinging.pivot).values()] : [];
  drawScene({
    editor,
    renderer,
    bondDrawer,
    tool,
    cursor: swinging || region || moving?.started || arrowDraw || arrowDrag?.started ? null : cursor,
    marks,
    selectionShape: region,
    // A ring still held by the mouse button is drawn grey: it is in the molecule but not settled yet.
    unsettled: swinging?.ring ? { ids: swinging.ids, pivot: swinging.pivot } : null,
    arrowDraft: arrowDraw?.moved ? { kind: arrowDraw.kind, from: arrowDraw.from, to: arrowDraw.to } : null,
  });
  updateStatus();
}

function hintText(): string {
  if (editor.pending !== null) return 'Click to continue the chain · Esc to stop';
  switch (tool.kind) {
    case 'select':
      return `${tool.mode === 'rect' ? 'Drag a rectangle' : 'Draw a loop'} around atoms to select them · drag the selection to move it · Delete removes it`;
    case 'atom':
      return 'Click empty space to add an atom, or an atom to change it';
    case 'bond':
      return 'Click to draw a bond · click again to extend the chain · Esc to stop';
    case 'stereo':
      return 'Click an atom to pick the stereocentre, then click a single bond';
    case 'ring':
      return 'Click empty space to place a ring · press on or next to an atom to attach one (grey until settled): drag to turn it around the atom, release to settle it (Shift: 30° steps, Esc: cancel)';
    case 'text':
      return 'Click an atom to write a group on it (NO2, COOH, CF3, OMe…) · Enter to apply · Esc to cancel';
    case 'arrow':
      return 'Drag to draw the arrow (Shift: 15° steps) · click for a standard one · with the select tool, drag an arrow to move it or its ends to stretch it';
  }
}

function updateStatus(): void {
  byId('atomCount').textContent = `Atoms: ${editor.atomCount()}`;
  byId('bondCount').textContent = `Bonds: ${editor.bondCount()}`;
  byId('formula').textContent = `Formula: ${editor.formula() || '—'}`;
  byId('mode').textContent = `Mode: ${describeTool(tool)}`;
  byId('hint').textContent = hintText();

  // Chemistry check: count of atoms over their valence; hovering one explains it.
  const problems = editor.valenceProblems();
  const check = byId('valenceCheck');
  check.textContent = problems.size === 0 ? '' : `⚠ ${problems.size} valence error${problems.size === 1 ? '' : 's'}`;
  const hovered = cursor ? editor.hitAtom(cursor) : undefined;
  const problem = hovered !== undefined ? problems.get(hovered) : undefined;
  if (problem) {
    const name = editor.getMolecule().getAtom(hovered!)?.element.name ?? problem.symbol;
    byId('hint').textContent = describeProblem(problem, name);
  }
}

function showNotice(message: string): void {
  byId('notice').textContent = message;
  window.setTimeout(() => {
    if (byId('notice').textContent === message) byId('notice').textContent = '';
  }, 4000);
}

function setTool(next: Tool): void {
  tool = next;
  editor.cancelChain();
  redraw();
}

// ---------- toolbar: groups, menus and buttons ----------

function closeMenus(except?: Element): void {
  document.querySelectorAll('.expanded-menu.active').forEach((m) => {
    if (m !== except) m.classList.remove('active');
  });
  document.querySelectorAll('.template-btn.expanded').forEach((b) => b.classList.remove('expanded'));
}

/**
 * Buttons with a dropdown. A click selects the button's default tool;
 * pressing and holding opens the menu of related tools.
 */
const groups: Array<{ button: string; menu: string; tool: Tool }> = [
  { button: 'selectBtn', menu: 'selectMenu', tool: { kind: 'select', mode: 'lasso' } },
  { button: 'bondBtn', menu: 'bondMenu', tool: { kind: 'bond', type: BondType.SINGLE } },
  { button: 'ringBtn', menu: 'ringMenu', tool: { kind: 'ring', size: 6, ringKind: 'single' } },
  { button: 'aromaticBtn', menu: 'aromaticMenu', tool: { kind: 'ring', size: 6, ringKind: 'aromatic' } },
  { button: 'halogenBtn', menu: 'halogenMenu', tool: { kind: 'atom', symbol: 'Cl' } },
  { button: 'arrowBtn', menu: 'arrowMenu', tool: { kind: 'arrow', arrow: 'forward' } },
];

/** How long a press must last to open a menu instead of selecting the default tool. */
const HOLD_MS = 400;
/** The press in progress on a group button, and whether it has already opened the menu. */
let hold: { timer: number; opened: boolean } | null = null;

function openMenu(button: HTMLElement, menu: HTMLElement): void {
  closeMenus();
  menu.classList.add('active');
  button.classList.add('expanded');
}

for (const group of groups) {
  const button = byId(group.button);
  const menu = byId(group.menu);

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (hold) window.clearTimeout(hold.timer);
    const current = { timer: 0, opened: false };
    current.timer = window.setTimeout(() => {
      current.opened = true;
      openMenu(button, menu);
    }, HOLD_MS);
    hold = current;
  });

  button.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !hold) return;
    window.clearTimeout(hold.timer);
    const opened = hold.opened;
    hold = null;
    if (!opened) {
      // A short click: pick the default tool.
      closeMenus();
      setTool(group.tool);
    }
  });

  button.addEventListener('pointerleave', () => {
    // Dragging off the button before the hold completes cancels it.
    if (hold && !hold.opened) {
      window.clearTimeout(hold.timer);
      hold = null;
    }
  });

  // Long presses on touch screens would otherwise open the browser's context menu.
  button.addEventListener('contextmenu', (e) => e.preventDefault());

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    // Keyboard activation (Enter/Space) has no pointer press: treat it as a click.
    if (e.detail === 0) {
      closeMenus();
      setTool(group.tool);
    }
  });
}

// Holding a button and releasing over a menu item picks that item.
window.addEventListener('pointerup', (e) => {
  if (!hold?.opened) return;
  hold = null;
  const item = (e.target as HTMLElement).closest<HTMLElement>('.expanded-menu-item');
  if (!item) return;
  const next = toolFromDataset(item.dataset);
  if (next) setTool(next);
  closeMenus();
});

function toolFromDataset(ds: DOMStringMap): Tool | null {
  if (ds.select) return { kind: 'select', mode: ds.select === 'rect' ? 'rect' : 'lasso' };
  if (ds.bond) {
    const type = ds.bond === 'double' ? BondType.DOUBLE : ds.bond === 'triple' ? BondType.TRIPLE : BondType.SINGLE;
    return { kind: 'bond', type };
  }
  if (ds.chiral) {
    // Up, down and both are single bonds drawn in a wedge, hash or wavy style.
    const style =
      ds.chiral === 'wedge' ? BondChirality.WEDGE : ds.chiral === 'hash' ? BondChirality.HASH : BondChirality.EITHER;
    return { kind: 'bond', type: BondType.SINGLE, style };
  }
  if (ds.aromatic) return { kind: 'ring', size: Number(ds.aromatic), ringKind: 'aromatic' };
  if (ds.ring) return { kind: 'ring', size: Number(ds.ring), ringKind: 'single' };
  if (ds.halogen) return { kind: 'atom', symbol: ds.halogen };
  if (isArrowKind(ds.arrow)) return { kind: 'arrow', arrow: ds.arrow };
  return null;
}

document.querySelectorAll<HTMLElement>('.expanded-menu-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = toolFromDataset(item.dataset);
    if (next) setTool(next);
    closeMenus();
  });
});

byId('oxygenBtn').addEventListener('click', () => setTool({ kind: 'atom', symbol: 'O' }));
byId('nitrogenBtn').addEventListener('click', () => setTool({ kind: 'atom', symbol: 'N' }));
byId('periodicBtn').addEventListener('click', () => openPeriodicTable());
byId('textBtn').addEventListener('click', () => {
  const selected = editor.selection?.kind === 'atom' ? editor.selection.id : undefined;
  setTool({ kind: 'text' });
  // With an atom already selected, start typing on it straight away.
  if (selected !== undefined) openTextEditor(selected);
});

// ---------- text on atoms (T tool) ----------

const textInput = byId<HTMLInputElement>('atomTextInput');
/** The atom being written on (or the empty-space point for a new labelled atom). */
let textEdit: { atomId?: number; at: Point2D } | null = null;

function openTextEditor(atomId: number | undefined, at?: Point2D): void {
  if (textEdit) commitText();
  const pos = atomId !== undefined ? editor.getPosition(atomId) : at;
  if (!pos) return;
  textEdit = { atomId, at: pos };

  const rect = canvas.getBoundingClientRect();
  const { width, height } = renderer.getDimensions();
  textInput.style.left = `${rect.left + (pos.x * rect.width) / width}px`;
  textInput.style.top = `${rect.top + (pos.y * rect.height) / height}px`;

  let value = '';
  if (atomId !== undefined) {
    const symbol = editor.getMolecule().getAtom(atomId)?.element.symbol ?? '';
    value = editor.getLabel(atomId) ?? (symbol === 'C' ? '' : symbol);
  }
  textInput.value = value;
  textInput.style.display = 'block';
  textInput.focus();
  textInput.select();
}

function closeTextEditor(): void {
  textEdit = null;
  textInput.style.display = 'none';
}

function commitText(): void {
  const edit = textEdit;
  if (!edit) return;
  const value = textInput.value;
  closeTextEditor();
  editor.setAtomText(edit.atomId, value, edit.at);
  redraw();
}

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitText();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeTextEditor();
    redraw();
  }
});
textInput.addEventListener('blur', () => commitText());

document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.template-group')) closeMenus();
});

// ---------- periodic table modal ----------

const periodicModal = byId('periodicModal');
const periodicGrid = byId('periodicTable');
let periodicBuilt = false;

/** Lay out every element in the standard 18-column table, with the f-block in two rows below. */
function buildPeriodicTable(): void {
  for (const element of periodicTable.getAllElements()) {
    const cell = periodicCell(element.atomicNumber);
    const button = document.createElement('button');
    button.className = `pt-cell pt-${cell.block}`;
    button.style.gridRow = String(cell.row);
    button.style.gridColumn = String(cell.column);
    button.title = `${element.name} (${element.atomicNumber})`;
    button.setAttribute('aria-label', element.name);

    const number = document.createElement('span');
    number.className = 'pt-number';
    number.textContent = String(element.atomicNumber);
    const symbol = document.createElement('span');
    symbol.className = 'pt-symbol';
    symbol.textContent = element.symbol;
    button.append(number, symbol);

    button.addEventListener('click', () => {
      setTool({ kind: 'atom', symbol: element.symbol });
      closePeriodicTable();
    });
    periodicGrid.appendChild(button);
  }

  // Group 3 markers for the lanthanides and actinides shown below the table.
  for (const [row, label] of [[6, '57–71'], [7, '89–103']] as const) {
    const marker = document.createElement('div');
    marker.className = 'pt-marker';
    marker.style.gridRow = String(row);
    marker.style.gridColumn = '3';
    marker.textContent = label;
    periodicGrid.appendChild(marker);
  }
  periodicBuilt = true;
}

function openPeriodicTable(): void {
  if (!periodicBuilt) buildPeriodicTable();
  periodicModal.style.display = 'block';
}

function closePeriodicTable(): void {
  periodicModal.style.display = 'none';
}

window.addEventListener('click', (e) => {
  if (e.target === periodicModal) closePeriodicTable();
});

// ---------- ribbon actions ----------

function undo(): void {
  if (editor.undo()) redraw();
}

function redo(): void {
  if (editor.redo()) redraw();
}

function deleteSelection(): void {
  if (editor.deleteSelection()) redraw();
}

function newDrawing(): void {
  editor.clear();
  redraw();
}

/** Clear: remove everything from the drawing area (one undo step, so Ctrl+Z brings it back). */
function clearDrawing(): void {
  if (editor.isEmpty()) return;
  editor.cancelChain();
  editor.clear();
  redraw();
}

/** Expand text labels (NO2, COOH...) into atoms and bonds: the selected ones, or all. */
function expandLabels(): void {
  const { expanded, failed } = editor.expandLabels();
  redraw();
  if (expanded === 0 && failed.length === 0) showNotice('No text labels to expand');
  else if (failed.length > 0) showNotice(`Could not expand: ${[...new Set(failed)].join(', ')}`);
}

function cleanUp(): void {
  editor.relayout(layout);
  redraw();
}

/** Offer `text` to the user as a file download. */
function download(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveJson(): void {
  download(JSON.stringify(editor.getDocument(), null, 2), 'tsdraw-molecule.json', 'application/json');
}

// ---------- Save as: SMILES and MOL file ----------

// Top-bar dropdowns (Save as, Copy): a button with data-menu opens the menu it names.
function closeRibbonMenus(): void {
  document.querySelectorAll('.ribbon-menu.active').forEach((m) => m.classList.remove('active'));
}
const closeSaveAs = closeRibbonMenus;
document.querySelectorAll<HTMLElement>('[data-menu]').forEach((button) => {
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = byId(button.dataset.menu!);
    const open = menu.classList.contains('active');
    closeRibbonMenus();
    if (!open) menu.classList.add('active');
  });
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.ribbon-dropdown')) closeRibbonMenus();
});

/** Note in the status bar any labels that had to be written as "*". */
function unknownNote(unknown: string[]): string {
  return unknown.length ? ` · unknown labels written as *: ${unknown.join(', ')}` : '';
}

function saveSmiles(): void {
  closeSaveAs();
  if (editor.atomCount() === 0) return showNotice('Nothing to save');
  const { text, unknown } = toSmiles(editor);
  download(text + '\n', 'tsdraw-molecule.smi', 'chemical/x-daylight-smiles');
  showNotice(`Saved SMILES: ${text.length > 80 ? text.slice(0, 77) + '…' : text}${unknownNote(unknown)}`);
}

function saveMolfile(): void {
  closeSaveAs();
  if (editor.atomCount() === 0) return showNotice('Nothing to save');
  const { text, unknown } = toMolfile(editor);
  download(text, 'tsdraw-molecule.mol', 'chemical/x-mdl-molfile');
  showNotice(`Saved MOL file${unknownNote(unknown)}`);
}

// ---------- copy and paste (MOL file / SMILES) ----------

/** Atoms to copy: the selected ones, or the whole drawing when nothing (or only a bond) is selected. */
function copySource(): Editor {
  const selected = [...editor.selectedAtomIds()];
  if (selected.length === 0) return editor;
  const part = new Editor(editor.bondLength);
  part.loadDocument(editor.getDocument(selected));
  return part;
}

/** Text for the clipboard in the given format, or null (with a notice) when there is nothing to copy. */
function clipboardText(format: 'mol' | 'smiles'): string | null {
  if (editor.atomCount() === 0) {
    showNotice('Nothing to copy');
    return null;
  }
  const source = copySource();
  const { text, unknown } = format === 'mol' ? toMolfile(source) : toSmiles(source);
  const what = source === editor ? 'drawing' : `${source.atomCount()} selected atom${source.atomCount() === 1 ? '' : 's'}`;
  const shown = format === 'smiles' ? `: ${text.length > 70 ? text.slice(0, 67) + '…' : text}` : '';
  showNotice(`Copied ${what} as ${format === 'mol' ? 'MOL file' : 'SMILES'}${shown}${unknownNote(unknown)}`);
  return text;
}

async function copyAs(format: 'mol' | 'smiles'): Promise<void> {
  closeRibbonMenus();
  const text = clipboardText(format);
  if (text === null) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    showNotice('The browser blocked the clipboard: use Ctrl+C instead');
  }
}

/** Put a MOL file or SMILES from the clipboard into the drawing, next to what is already there. */
function pasteText(text: string): void {
  let doc;
  try {
    doc = parseMolecule(text, editor.bondLength);
  } catch (err) {
    showNotice(`Could not paste: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const ids = placeDocument(doc);
  showNotice(`Pasted ${ids.length} atom${ids.length === 1 ? '' : 's'} · drag to move them`);
}

/** Add a structure to the drawing: centred on an empty canvas, otherwise beside what is there. Returns the new atom ids. */
function placeDocument(doc: ParsedDocument): number[] {
  // Empty canvas: centre it. Otherwise beside the drawing (to the right, or below if there is no room).
  let centre = new Point2D(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  if (editor.atomCount() > 0) {
    const pts = [...editor.atomIds()].map((id) => editor.getPosition(id)!);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const width = Math.max(...doc.atoms.map((a) => a.x)) - Math.min(...doc.atoms.map((a) => a.x));
    const height = Math.max(...doc.atoms.map((a) => a.y)) - Math.min(...doc.atoms.map((a) => a.y));
    const right = Math.max(...xs) + 2 * editor.bondLength + width / 2;
    if (right + width / 2 < CANVAS_WIDTH) centre = new Point2D(right, (Math.min(...ys) + Math.max(...ys)) / 2);
    else centre = new Point2D((Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys) + 2 * editor.bondLength + height / 2);
  }
  const ids = editor.insertDocument(doc, centre);
  redraw();
  return ids;
}

// ---------- Claude desktop app (through the tsdraw MCP server) ----------

/** PNG (base64, no data: prefix) of the drawn structures, cropped to them with a margin. */
function drawingPng(): string {
  const ids = [...editor.atomIds()];
  const source = renderer.getCanvas();
  const ratio = source.width / CANVAS_WIDTH;
  let [x0, y0, x1, y1] = [0, 0, CANVAS_WIDTH, CANVAS_HEIGHT];
  if (ids.length) {
    const pts = ids.map((id) => editor.getPosition(id)!);
    const margin = 2 * editor.bondLength;
    x0 = Math.max(0, Math.min(...pts.map((p) => p.x)) - margin);
    y0 = Math.max(0, Math.min(...pts.map((p) => p.y)) - margin);
    x1 = Math.min(CANVAS_WIDTH, Math.max(...pts.map((p) => p.x)) + margin);
    y1 = Math.min(CANVAS_HEIGHT, Math.max(...pts.map((p) => p.y)) + margin);
  }
  // Redraw without hover marks first, so the picture shows just the structures.
  const savedCursor = cursor;
  cursor = null;
  redraw();
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0) * ratio);
  out.height = Math.round((y1 - y0) * ratio);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, x0 * ratio, y0 * ratio, out.width, out.height, 0, 0, out.width, out.height);
  cursor = savedCursor;
  redraw();
  return out.toDataURL('image/png').split(',')[1];
}

function runDesktopCommand(tool: string, args: Record<string, unknown>): unknown {
  switch (tool) {
    case 'draw_molecule': {
      const text = typeof args.molfile === 'string' && args.molfile.trim() ? args.molfile : String(args.smiles ?? '');
      if (!text.trim()) throw new Error('Give a SMILES or a MOL file');
      const doc = parseMolecule(text, editor.bondLength); // throws with the reason if it cannot be read
      if (args.replace === true) editor.clear();
      const ids = placeDocument(doc);
      editor.clearSelection();
      redraw();
      const name = typeof args.name === 'string' && args.name ? args.name : 'the molecule';
      showNotice(`Claude drew ${name}`);
      const problems = editor.valenceProblems().size;
      return `Drew ${name} (${ids.length} atoms). The drawing's formula is now ${editor.formula()}.` +
        (problems ? ` Warning: ${problems} atom(s) exceed their valence.` : '');
    }
    case 'get_drawing': {
      if (editor.atomCount() === 0) return 'The canvas is empty.';
      const source = args.selection_only === true ? copySource() : editor;
      const format = args.format === 'molfile' || args.format === 'both' ? args.format : 'smiles';
      const smiles = toSmiles(source);
      const result: Record<string, unknown> = {
        atoms: source.atomCount(),
        formula: source.formula(),
        selection_only: source !== editor,
      };
      if (format !== 'molfile') result.smiles = smiles.text;
      if (format !== 'smiles') result.molfile = toMolfile(source).text;
      if (smiles.unknown.length) result.unknown_labels = smiles.unknown;
      return result;
    }
    case 'get_drawing_image':
      return { png: drawingPng() };
    case 'clear_drawing':
      newDrawing();
      return 'Cleared the canvas (the user can undo with Ctrl+Z).';
    default:
      throw new Error(`Unknown command ${tool}`);
  }
}

const bridgePort = Number(new URLSearchParams(location.search).get('bridge')) || DEFAULT_BRIDGE_PORT;
connectDesktopBridge(runDesktopCommand, (connected) => {
  const el = byId('desktopStatus');
  el.textContent = connected ? '● Claude Desktop connected' : '';
  el.title = connected ? `Linked to the tsdraw MCP server on port ${bridgePort}` : '';
}, bridgePort);

// ---------- Ask AI panel (Claude, ChatGPT or Grok) ----------

const claudeMessages = byId('claudeMessages');
const claudeInput = byId<HTMLTextAreaElement>('claudeInput');
const claudeSend = byId<HTMLButtonElement>('claudeSend');
const claudeModel = byId<HTMLSelectElement>('claudeModel');
const chat = new ChemistryChat((smiles) => {
  // The assistant's draw_molecule tool: parse and add to the canvas (throws with the reason if the SMILES is bad).
  const doc = parseMolecule(smiles, editor.bondLength);
  const count = placeDocument(doc).length;
  editor.clearSelection(); // show it plainly, not as a selection
  redraw();
  return count;
});

const providerButtons = Array.from(byId('aiProvider').querySelectorAll<HTMLButtonElement>('button[data-provider]'));
const OTHER_MODEL = '__other__';
const PROVIDER_KEY = 'tsdraw.ai.provider';
const modelKey = (p: ProviderId) => `tsdraw.ai.model.${p}`;

/** Remembered per browser (local app, so this is only a convenience; failures are ignored). */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function fillModels(id: ProviderId, selected: string): void {
  claudeModel.innerHTML = '';
  const known = getProvider(id).models;
  for (const m of known) claudeModel.add(new Option(m.label, m.id));
  if (!known.some((m) => m.id === selected)) claudeModel.add(new Option(selected, selected));
  claudeModel.add(new Option('Other model…', OTHER_MODEL));
  claudeModel.value = selected;
}

/** Switch the panel to Claude, ChatGPT or Grok. The conversation is kept and continues with the new one. */
function selectProvider(id: ProviderId): void {
  const provider = getProvider(id);
  const model = recall(modelKey(provider.id)) || provider.models[0].id;
  chat.setProvider(provider.id, model);
  fillModels(provider.id, model);
  for (const b of providerButtons) b.setAttribute('aria-checked', String(b.dataset.provider === provider.id));
  claudeInput.placeholder = `Ask ${provider.name}…  (Enter to send, Shift+Enter for a new line)`;
  claudeModel.title = `${provider.name} model`;
  remember(PROVIDER_KEY, provider.id);
}

for (const b of providerButtons) b.addEventListener('click', () => selectProvider(b.dataset.provider as ProviderId));
claudeModel.addEventListener('change', () => {
  const provider = getProvider(chat.provider);
  if (claudeModel.value === OTHER_MODEL) {
    const id = window.prompt(`${provider.name} model id (as in the provider's API docs):`, chat.model)?.trim();
    if (!id) {
      claudeModel.value = chat.model;
      return;
    }
    chat.model = id;
    fillModels(provider.id, id);
  } else {
    chat.model = claudeModel.value;
  }
  remember(modelKey(provider.id), chat.model);
});
const savedProvider = recall(PROVIDER_KEY);
selectProvider(PROVIDERS.some((p) => p.id === savedProvider) ? (savedProvider as ProviderId) : 'claude');

/** Plain text with **bold**, `code` and line breaks, safely escaped. */
function formatReply(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function addMessage(kind: 'user' | 'claude' | 'tool' | 'error', html: string): HTMLElement {
  claudeMessages.querySelector('.claude-hint')?.remove();
  const el = document.createElement('div');
  el.className = `claude-msg claude-${kind}`;
  el.innerHTML = html;
  claudeMessages.appendChild(el);
  claudeMessages.scrollTop = claudeMessages.scrollHeight;
  return el;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function showChatEvent(e: ChatEvent, from: string): void {
  if (e.kind === 'text') addMessage('claude', `<span class="ai-from">${escapeHtml(from)}</span>${formatReply(e.text)}`);
  else if (e.kind === 'drawn')
    addMessage('tool', `🧪 Drew ${e.name ? `<strong>${escapeHtml(e.name)}</strong> ` : ''}<code>${escapeHtml(e.smiles)}</code>`);
  else addMessage('error', `Could not draw <code>${escapeHtml(e.smiles)}</code>: ${escapeHtml(e.error)}`);
}

async function askClaude(): Promise<void> {
  const question = claudeInput.value.trim();
  if (!question || claudeSend.disabled) return;
  claudeInput.value = '';
  addMessage('user', escapeHtml(question).replace(/\n/g, '<br>'));
  const from = getProvider(chat.provider).name;
  const thinking = addMessage('claude', `<span class="claude-thinking">${escapeHtml(from)} is thinking…</span>`);
  claudeSend.disabled = true;
  try {
    const drawing = editor.atomCount() > 0 ? toSmiles(editor).text : '';
    let first = true;
    await chat.ask(question, drawing, (e) => {
      if (first) thinking.remove();
      first = false;
      showChatEvent(e, from);
    });
    if (first) thinking.remove();
  } catch (err) {
    thinking.remove();
    addMessage('error', escapeHtml(err instanceof Error ? err.message : String(err)));
  } finally {
    claudeSend.disabled = false;
    claudeInput.focus();
  }
}

byId('claudeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  void askClaude();
});
claudeInput.addEventListener('keydown', (e) => {
  // Enter sends; Shift+Enter starts a new line.
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void askClaude();
  }
});
byId('claudeClear').addEventListener('click', () => {
  chat.clear();
  claudeMessages.innerHTML = '<div class="claude-hint">New conversation. Try “Draw aspirin” or “What is the logP of this?”</div>';
});
byId('claudeToggle').addEventListener('click', () => {
  const panel = byId('claudePanel');
  panel.classList.toggle('collapsed');
  byId('claudeToggle').textContent = panel.classList.contains('collapsed') ? '▴' : '▾';
});

async function pasteFromClipboard(): Promise<void> {
  try {
    pasteText(await navigator.clipboard.readText());
  } catch {
    showNotice('The browser blocked the clipboard: press Ctrl+V to paste');
  }
}

// Ctrl+C copies as MOL file, Ctrl+V pastes, when not typing in a text box.
const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
};
document.addEventListener('copy', (e) => {
  if (typing()) return;
  const text = clipboardText('mol');
  if (text === null || !e.clipboardData) return;
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
});
document.addEventListener('paste', (e) => {
  if (typing() || !e.clipboardData) return;
  e.preventDefault();
  pasteText(e.clipboardData.getData('text/plain'));
});

const fileInput = byId<HTMLInputElement>('fileInput');

chat.apiKeys = settings.apiKeys;

const settingsPanel = initSettingsPanel({
  settings,
  onDrawingChange: (drawing) => {
    applyDrawingStyle(config.style, drawing);
    config.bondLength = drawing.bondLength;
    editor.setBondLength(drawing.bondLength);
    redraw();
  },
  onKeysChange: (keys) => {
    chat.apiKeys = keys;
  },
});

const helpDialog = initHelpDialog();

const actions: Record<string, () => void> = {
  settings: () => settingsPanel.open(),
  new: newDrawing,
  open: () => fileInput.click(),
  save: saveJson,
  'save-smiles': saveSmiles,
  'save-mol': saveMolfile,
  'copy-mol': () => void copyAs('mol'),
  'copy-smiles': () => void copyAs('smiles'),
  paste: () => void pasteFromClipboard(),
  png: () => renderer.saveAsFile('tsdraw-molecule.png'),
  undo,
  redo,
  delete: deleteSelection,
  clear: clearDrawing,
  clean: cleanUp,
  expand: expandLabels,
  'toggle-ai': () => byId('claudeToggle').click(),
  tutorial: () => helpDialog.open('tutorial'),
  help: () => helpDialog.open('help'),
  about: () => helpDialog.open('about'),
};

const hamburger = byId('hamburger');
const sidebarMenu = byId('sidebarMenu');

// Ribbon buttons and app-menu items both carry data-action.
document.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const run = actions[el.dataset.action ?? ''];
    closeAppMenu();
    closeRibbonMenus();
    if (run) run();
  });
});

// App menu (☰): File / Edit / ... with submenus that open on hover (or click, for touch).
function closeAppMenu(): void {
  hamburger.classList.remove('active');
  sidebarMenu.classList.remove('active');
  sidebarMenu.querySelectorAll('.menu-cat.open').forEach((c) => c.classList.remove('open'));
}
hamburger.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = sidebarMenu.classList.contains('active');
  closeRibbonMenus();
  if (open) closeAppMenu();
  else {
    hamburger.classList.add('active');
    sidebarMenu.classList.add('active');
  }
});
sidebarMenu.querySelectorAll<HTMLElement>('.menu-cat').forEach((cat) => {
  cat.addEventListener('mouseenter', () => {
    sidebarMenu.querySelectorAll('.menu-cat.open').forEach((c) => c !== cat && c.classList.remove('open'));
  });
  cat.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.submenu')) return;
    e.stopPropagation();
    cat.classList.toggle('open');
  });
});
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.hamburger') && !target.closest('.sidebar-menu')) closeAppMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAppMenu();
    closeRibbonMenus();
  }
});

byId('periodicCloseBtn').addEventListener('click', closePeriodicTable);

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const doc = JSON.parse(String(reader.result)) as EditorDocument;
      editor.loadDocument(doc);
      redraw();
      showNotice(`Opened ${file.name}`);
    } catch (err) {
      showNotice(`Could not open ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  reader.readAsText(file);
});

// ---------- canvas input ----------

function canvasPoint(e: MouseEvent): Point2D {
  const rect = canvas.getBoundingClientRect();
  const { width, height } = renderer.getDimensions();
  return new Point2D(
    ((e.clientX - rect.left) * width) / rect.width,
    ((e.clientY - rect.top) * height) / rect.height
  );
}

canvas.addEventListener('pointermove', (e) => {
  cursor = canvasPoint(e);
  byId('coordinates').textContent = `Cursor: (${Math.round(cursor.x)}, ${Math.round(cursor.y)})`;
  redraw();
});

canvas.addEventListener('pointerleave', () => {
  cursor = null;
  redraw();
});

// Bond tool: pressing an atom draws the new bond at once; dragging before release swings it around
// that atom. Ring tool: pressing an atom adds the ring to the molecule at once, drawn grey while the
// button is held; dragging turns it around the atom, and releasing settles it where it is.
// Otherwise, pressing an atom or bond and dragging rotates the whole connected piece about its centre,
// and a press without a drag performs the current tool's action on release.
const DRAG_THRESHOLD = 4;
let press: { start: Point2D; anchor: number } | null = null;
let rotating: { ids: number[]; pivot: Point2D; angle: number } | null = null;
/**
 * A new bond or ring being swung about the atom it was attached to, following the mouse.
 * `ring`: a ring held by the mouse button (drawn grey, Shift snaps, Esc removes it).
 */
let swinging: { ids: number[]; pivot: number; start: Point2D; moved: boolean; ring?: boolean } | null = null;

let textPress: Point2D | null = null;
/** Lasso path or rectangle (first and last point are the corners) being dragged by the select tool. */
let region: { kind: 'lasso' | 'rect'; points: Point2D[] } | null = null;
/** A press on a multi-atom selection: dragging moves it, a plain click selects what was clicked. */
let moving: { ids: number[]; arrows: number[]; start: Point2D; last: Point2D; started: boolean } | null = null;
/** Arrow tool: an arrow being dragged out from where the button went down. */
let arrowDraw: { kind: ArrowKind; from: Point2D; to: Point2D; moved: boolean } | null = null;
/** Select tool: an arrow (or one of its ends) being dragged. */
let arrowDrag: { grip: ArrowGrip; start: Point2D; last: Point2D; started: boolean } | null = null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = canvasPoint(e);
  if (tool.kind === 'text') {
    // Open the text box on release, after the press has moved focus (and committed any open box).
    textPress = p;
    return;
  }
  if (tool.kind === 'arrow') {
    // Arrows don't interact with atoms: drag from here to where the button is released.
    arrowDraw = { kind: tool.arrow, from: p, to: p, moved: false };
    redraw();
    return;
  }
  const atomId = editor.hitAtom(p);
  const bond = atomId === undefined ? editor.hitBond(p) : undefined;
  if (tool.kind === 'select') {
    // The ends of a selected arrow are grips, even over an atom; otherwise atoms and bonds come first.
    const grip = editor.arrowGripAt(p);
    const onSelectedEnd = grip && grip.end !== 'body' && editor.isArrowSelected(grip.id);
    if (grip && (onSelectedEnd || (atomId === undefined && bond === undefined))) {
      if (grip.end === 'body' && editor.selection?.kind === 'atoms' && editor.isArrowSelected(grip.id)) {
        // An arrow that is part of a lasso selection moves the whole selection.
        moving = { ids: [...editor.selectedAtomIds()], arrows: [...editor.selectedArrowIds()], start: p, last: p, started: false };
        return;
      }
      editor.selection = { kind: 'arrow', id: grip.id };
      arrowDrag = { grip, start: p, last: p, started: false };
      redraw();
      return;
    }
    if (atomId === undefined && bond === undefined) {
      // Empty space: start a lasso or rectangle.
      region = { kind: tool.mode ?? 'lasso', points: [p] };
      redraw();
      return;
    }
    const onSelection =
      editor.selection?.kind === 'atoms' &&
      (atomId !== undefined ? editor.isSelected(atomId) : editor.isSelected(bond!.atomId1, bond!.atomId2));
    if (onSelection) {
      moving = { ids: [...editor.selectedAtomIds()], arrows: [...editor.selectedArrowIds()], start: p, last: p, started: false };
      return;
    }
  }
  if (atomId === undefined && bond === undefined && tool.kind === 'ring') {
    // Ring tool near an atom: the preview already hangs the ring on that one atom (by a stem bond or
    // sharing it). Pressing places exactly that ring, grey and held, and dragging turns it around the
    // atom, just as when pressing the atom itself. A ring fused onto a bond, or in free space, is placed as is.
    const touched = editor.attachPoints(tool, p);
    const before = editor.atomIds();
    editor.applyTool(tool, p);
    const ids = touched.length === 1 ? editor.attachedPiece(before, touched[0]) : null;
    if (ids) swinging = { ids, pivot: touched[0], start: p, moved: false, ring: true };
    redraw();
    return;
  }
  if (atomId === undefined && bond === undefined) {
    editor.applyTool(tool, p);
    redraw();
    return;
  }
  if (atomId !== undefined && tool.kind === 'ring') {
    // The ring joins the molecule at once (in its best direction) but stays grey and follows the
    // mouse around this atom until the button is released.
    const before = editor.atomIds();
    editor.placeRingAtAtom(atomId, tool.size, tool.ringKind);
    const ids = editor.attachedPiece(before, atomId);
    if (ids) swinging = { ids, pivot: atomId, start: p, moved: false, ring: true };
    redraw();
    return;
  }
  if (atomId !== undefined && tool.kind === 'bond') {
    const before = editor.atomIds();
    editor.applyTool(tool, p);
    const ids = editor.attachedPiece(before, atomId);
    if (ids) swinging = { ids, pivot: atomId, start: p, moved: false };
    redraw();
    return;
  }
  press = { start: p, anchor: atomId ?? bond!.atomId1 };
});

window.addEventListener('pointermove', (e) => {
  if (!press && !rotating && !swinging && !region && !moving && !arrowDraw && !arrowDrag) return;
  const p = canvasPoint(e);
  if (arrowDraw) {
    arrowDraw.to = arrowEnd(arrowDraw.from, p, e.shiftKey ? 15 : 0);
    if (arrowDraw.from.distanceTo(p) >= DRAG_THRESHOLD) arrowDraw.moved = true;
    redraw();
    return;
  }
  if (arrowDrag) {
    if (!arrowDrag.started) {
      if (arrowDrag.start.distanceTo(p) < DRAG_THRESHOLD) return;
      arrowDrag.started = true;
      editor.beginMove();
    }
    const { id, end } = arrowDrag.grip;
    if (end === 'body') {
      editor.moveArrows([id], p.x - arrowDrag.last.x, p.y - arrowDrag.last.y);
    } else {
      // Stretch or turn the arrow about its other end (Shift: 15° steps).
      const arrow = editor.getArrows().find((a) => a.id === id);
      if (arrow) editor.setArrowEnd(id, end, arrowEnd(end === 'to' ? arrow.from : arrow.to, p, e.shiftKey ? 15 : 0));
    }
    arrowDrag.last = p;
    redraw();
    return;
  }
  if (region) {
    if (region.kind === 'rect') region.points = [region.points[0], p];
    else if (region.points[region.points.length - 1].distanceTo(p) >= 2) region.points.push(p);
    redraw();
    return;
  }
  if (moving) {
    if (!moving.started) {
      if (moving.start.distanceTo(p) < DRAG_THRESHOLD) return;
      moving.started = true;
      editor.beginMove();
    }
    editor.moveAtoms(moving.ids, p.x - moving.last.x, p.y - moving.last.y);
    editor.moveArrows(moving.arrows, p.x - moving.last.x, p.y - moving.last.y);
    moving.last = p;
    redraw();
    return;
  }
  if (swinging) {
    if (!swinging.moved && swinging.start.distanceTo(p) < DRAG_THRESHOLD) return;
    swinging.moved = true;
    // A held ring turns in 30-degree steps with Shift.
    editor.swingAtoms(swinging.ids, swinging.pivot, p, swinging.ring && e.shiftKey ? 30 : 0);
    redraw();
    return;
  }
  if (!rotating && press) {
    if (press.start.distanceTo(p) < DRAG_THRESHOLD) return;
    const ids = editor.connectedPiece(press.anchor);
    const pivot = editor.pieceCentre(ids);
    editor.beginRotation();
    rotating = { ids, pivot, angle: Math.atan2(p.y - pivot.y, p.x - pivot.x) };
    press = null;
  }
  if (rotating) {
    const angle = Math.atan2(p.y - rotating.pivot.y, p.x - rotating.pivot.x);
    editor.rotateAtoms(rotating.ids, rotating.pivot, angle - rotating.angle);
    rotating.angle = angle;
    redraw();
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !textPress || tool.kind !== 'text') return;
  const p = textPress;
  textPress = null;
  const atomId = editor.hitAtom(p);
  if (atomId !== undefined) editor.selection = { kind: 'atom', id: atomId };
  redraw();
  openTextEditor(atomId, p);
});

window.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  textPress = null;
  if (arrowDraw) {
    // A click (no drag) places a standard-length arrow pointing right.
    const d = arrowDraw;
    arrowDraw = null;
    editor.addArrow(d.kind, d.from, d.moved ? d.to : undefined);
    redraw();
  }
  if (arrowDrag) {
    arrowDrag = null;
    redraw();
  }
  if (region) {
    const r = region;
    region = null;
    const pts = r.points;
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const dragged = Math.max(...xs) - Math.min(...xs) >= DRAG_THRESHOLD || Math.max(...ys) - Math.min(...ys) >= DRAG_THRESHOLD;
    if (!dragged) editor.clearSelection(); // a plain click on empty space
    else if (r.kind === 'rect') {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      editor.selectAtoms(editor.atomsInRect(a, b), editor.arrowsInRect(a, b));
    } else editor.selectAtoms(editor.atomsInPolygon(pts), editor.arrowsInPolygon(pts));
    redraw();
  }
  if (moving) {
    // No drag: an ordinary click, which selects just the atom or bond under the pointer.
    if (!moving.started) editor.applyTool(tool, moving.start);
    moving = null;
    redraw();
  }
  if (press) {
    editor.applyTool(tool, press.start);
    press = null;
    redraw();
  }
  rotating = null;
  if (swinging) {
    // Releasing settles the piece (a held ring turns from grey to normal); atoms swung onto existing atoms join them.
    if (swinging.moved) editor.mergeContacts(editor.pieceContacts(swinging.ids, swinging.pivot));
    swinging = null;
    redraw();
  }
});

// ---------- keyboard ----------

/**
 * One-key tool shortcuts:
 * 1–3 single/double/triple bond, 4–8 four- to eight-membered ring,
 * 9 wedge (up) bond, 0 hashed (down) bond, a aromatic 5-ring, b benzene.
 */
const TOOL_SHORTCUTS: Record<string, Tool> = {
  '1': { kind: 'bond', type: BondType.SINGLE },
  '2': { kind: 'bond', type: BondType.DOUBLE },
  '3': { kind: 'bond', type: BondType.TRIPLE },
  '4': { kind: 'ring', size: 4, ringKind: 'single' },
  '5': { kind: 'ring', size: 5, ringKind: 'single' },
  '6': { kind: 'ring', size: 6, ringKind: 'single' },
  '7': { kind: 'ring', size: 7, ringKind: 'single' },
  '8': { kind: 'ring', size: 8, ringKind: 'single' },
  '9': { kind: 'bond', type: BondType.SINGLE, style: BondChirality.WEDGE },
  '0': { kind: 'bond', type: BondType.SINGLE, style: BondChirality.HASH },
  a: { kind: 'ring', size: 5, ringKind: 'aromatic' },
  b: { kind: 'ring', size: 6, ringKind: 'aromatic' },
};

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  // While a dialog is open, its own keys apply, not the editor's.
  if (settingsPanel.isOpen() || helpDialog.isOpen()) return;

  if (e.key === 'F1') {
    e.preventDefault();
    closeAppMenu();
    helpDialog.open('help');
    return;
  }

  if (mod && key === ',') {
    e.preventDefault();
    closeAppMenu();
    settingsPanel.open();
    return;
  }

  // Single-key tool shortcuts (no Ctrl/Cmd/Alt): see TOOL_SHORTCUTS.
  if (!mod && !e.altKey && !e.repeat) {
    const shortcut = TOOL_SHORTCUTS[key];
    if (shortcut) {
      e.preventDefault();
      closeMenus();
      setTool(shortcut);
      return;
    }
  }

  if (e.key === 'Escape') {
    editor.cancelChain();
    editor.clearSelection();
    region = null;
    arrowDraw = null;
    if (swinging?.ring) {
      // Esc while the ring is still held: take it back out of the molecule.
      swinging = null;
      editor.undo();
    }
    closePeriodicTable();
    closeMenus();
    redraw();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selection) {
    e.preventDefault();
    deleteSelection();
  } else if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});

// ---------- start ----------

setTool({ kind: 'bond', type: BondType.SINGLE }); // default: draw single bonds
