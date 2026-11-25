/**
 * The Help menu's dialog: one window with three kinds of page.
 *   Quick tutorial — a few steps to draw a first molecule, and the handiest tips.
 *   Help           — the full guide, one topic per tab.
 *   Guidelines     — drawing standards (IUPAC 2008, FDA SD-file guide, ACS graphics guide) with links.
 *   About          — version, build and license.
 * Built here from data, so the help text lives next to the code it describes.
 */
import { APP_BUILD, APP_LICENSE, APP_VERSION } from './version';

export type HelpPage = 'tutorial' | 'help' | 'guidelines' | 'about';

export interface HelpDialog {
  open(page: HelpPage): void;
  close(): void;
  isOpen(): boolean;
}

/** A help topic: a title and its body (trusted, static HTML written below). */
interface Topic {
  id: string;
  title: string;
  html: string;
}

const kbd = (k: string) => `<kbd>${k}</kbd>`;
const ext = (href: string, label: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;

const TUTORIAL = `
<h3 class="settings-heading">Quick tutorial</h3>
<p class="settings-intro">Draw your first molecule in under a minute.</p>
<ol class="help-steps">
  <li><b>Draw a chain.</b> The single-bond tool is on at start. Click on the canvas, then keep clicking: each click adds the next bond. ${kbd('Esc')} ends the chain.</li>
  <li><b>Add a ring.</b> Press ${kbd('B')} for benzene (or ${kbd('4')}–${kbd('8')} for a 4- to 8-membered ring) and click an atom: the ring attaches to it. Keep the button held and drag to turn it; release to settle it.</li>
  <li><b>Change bonds.</b> Press ${kbd('2')} and click an existing bond to make it double, ${kbd('3')} for triple.</li>
  <li><b>Change atoms.</b> Pick <b>O</b>, <b>N</b> or a halogen from the toolbar (or any element from the periodic table) and click an atom.</li>
  <li><b>Tidy up.</b> <b>Clean up</b> in the top bar straightens the layout. ${kbd('Ctrl+Z')} undoes anything.</li>
  <li><b>Take it with you.</b> ${kbd('Ctrl+C')} copies the drawing as a MOL file; <b>Save as</b> writes SMILES or MOL; <b>PNG</b> exports an image.</li>
</ol>
<h3 class="settings-heading help-gap">Handy tips</h3>
<ul class="help-list">
  <li>Every tool has a one-key shortcut: ${kbd('1')}–${kbd('3')} bonds, ${kbd('4')}–${kbd('8')} rings, ${kbd('9')} / ${kbd('0')} wedge / hashed bond, ${kbd('A')} aromatic 5-ring, ${kbd('B')} benzene.</li>
  <li>Press and hold a toolbar button with a small ▾ to see more tools of that kind.</li>
  <li>Hold ${kbd('Shift')} while turning a ring or drawing an arrow to snap the angle.</li>
  <li>Use the <b>T</b> tool to type a group such as NO2, COOH or OMe on an atom; <b>Expand</b> turns it into real atoms.</li>
  <li>Paste a SMILES, MOL file, InChI, CAS number or compound/drug name with ${kbd('Ctrl+V')}.</li>
  <li>Ask the AI panel “Draw aspirin” to put a structure on the canvas.</li>
  <li><b>Aromatic</b> (top bar) shows aromatic rings with circles; press it again (<b>Kekulé</b>) for alternating double bonds.</li>
  <li><b>Databases</b> (top bar) looks up the drawing in PubChem, ChEMBL and PubMed.</li>
  <li><b>Structure › Name structure</b> (${kbd('Ctrl+Alt+N')}) gives the common, generic (INN), IUPAC and trade names from PubChem, Wikidata and Wikipedia.</li>
</ul>
<p class="settings-intro help-gap">Everything else is in <a href="#" data-help-goto="help">Help</a>. For drawing standards, see <a href="#" data-help-goto="guidelines">Drawing guidelines</a>.</p>
`;

/** Reference documents for good structure drawing (Help › Drawing guidelines). */
export const GUIDELINE_REFS = {
  iupac: 'https://publications.iupac.org/pac/pdf/2008/pdf/8002x0277.pdf',
  fda: 'https://www.fda.gov/media/151718/download',
  acs: 'https://pubsapp.acs.org/paragonplus/submission/general/graphics_prep.html',
};

const GUIDELINES = `
<h3 class="settings-heading">Drawing guidelines</h3>
<p class="settings-intro">Three published standards for clear, unambiguous structure diagrams. The points below are a short digest; open the documents for the full rules and examples.</p>

<h3 class="settings-heading help-gap">1. IUPAC graphical representation standards</h3>
<p class="help-ref">${ext(GUIDELINE_REFS.iupac, 'Graphical representation standards for chemical structure diagrams (IUPAC Recommendations 2008)')}<br>
J. Brecher, <i>Pure Appl. Chem.</i> <b>80</b>(2), 277–410 (2008). doi:10.1351/pac200880020277</p>
<ul class="help-list">
  <li><b>One bond length</b> throughout a structure, long enough that atoms are at least two label-heights apart (GR-1.1). Set it once in File › Settings › Drawing.</li>
  <li><b>Line width</b> about the stroke width of the label font (GR-1.2). Hashed and wavy bonds need at least three clearly separated hashes or half-waves (GR-1.3).</li>
  <li><b>No short terminal bonds</b>: a bare bond end means a methyl group and a short one can be read as a minus charge. Don't use an unlabeled bond for a variable attachment point (GR-1.4).</li>
  <li><b>Carbon labels</b>: leave carbons unlabeled where the bonds bend; label a carbon that has two collinear bonds, so they aren't read as one long bond (GR-2.1.2).</li>
  <li><b>120° angles and zig-zag chains</b>: draw chains trans-like, without arbitrary bends. Draw bonds collinear only when they really are (alkynes, allenes, nitriles) (GR-4.1).</li>
  <li><b>Keep double-bond geometry</b>: the drawn positions of the substituents must show the real cis/trans configuration (GR-4.1.1, GR-1.10).</li>
  <li><b>Orientation</b>: main axis horizontal, principal groups (acyclic heteroatoms) towards the right, rings towards the bottom-left (GR-3.1). <b>Clean up</b> straightens the layout.</li>
  <li><b>Rings</b> are regular polygons; fix overlapping substituents by rotating a chain bond, swapping neighbours or lengthening a bond rather than letting labels collide (GR-3.3, GR-4.3).</li>
  <li><b>Aromatic circles</b> only for real delocalization, centred in the ring and drawn solid (GR-6).</li>
  <li><b>Salts</b>: show counter-ions as separate charged components rather than a bond between them (GR-7).</li>
</ul>

<h3 class="settings-heading help-gap">2. FDA SD-file guide for regulatory submissions</h3>
<p class="help-ref">${ext(GUIDELINE_REFS.fda, 'Quick Guide to Creating a Structure-Data File (SD File) for Type II Drug Master File (DMF) Submissions')}<br>
U.S. Food and Drug Administration, updated February 2024.</p>
<p>Written for DMF submissions, but a good checklist for any structure that will be registered or exchanged as a MOL/SD file:</p>
<ul class="help-list">
  <li><b>V2000 MOL format</b>, one SD file holding all structures (drug substance, impurities, intermediates, degradants, starting materials; not reagents or solvents), with the columns Name, CAS, Role, ID, UNII, Application number and Notes. TSDraw writes V2000 MOL files.</li>
  <li><b>Expand abbreviations</b>: no super-atoms such as NO2, Ph or Me, and no one- or three-letter amino-acid shorthand. Use <b>Expand</b> before you save or copy.</li>
  <li><b>No query features</b>: no X or * atoms, no query bonds, no Sgroup brackets (except multiple-group brackets for salt or hydrate stoichiometry), no text annotations for stereo.</li>
  <li><b>Stereochemistry</b>: draw every known stereocentre with wedge or hashed bonds whose narrow end is on the stereocentre. Unknown or relative stereochemistry is stated in the Notes, not drawn.</li>
  <li><b>Double bonds</b>: known E/Z geometry comes from the drawn coordinates; if it is unknown, use an either (crossed) double bond or a collinear layout.</li>
  <li><b>Kekulé form</b> with alternating single and double bonds, not aromatic bond types; draw the prevalent tautomer; planar 2D drawings instead of Haworth, chair or Fischer projections, with explicit H for ring stereochemistry.</li>
  <li><b>Salts</b>: impurities as free acids or bases; amine salts (other than quaternary) uncharged as hydrochlorides etc.; metal salts charged and charge-balanced. One covalent entity per record, except salts, hydrates and complexes.</li>
  <li><b>Isotopes</b> only when the compound is actually labelled or enriched.</li>
</ul>
<h3 class="settings-heading help-gap">3. ACS Publications graphics guide</h3>
<p class="help-ref">${ext(GUIDELINE_REFS.acs, 'Paragon Plus: ACS Publications — Preparing graphics')}<br>
American Chemical Society, author guidelines for journal artwork.</p>
<p>The journal house style, known as the <b>ACS Document 1996</b> settings in ChemDraw:</p>
<table class="help-keys">
  <tr><td>Bond length (fixed)</td><td>14.4 pt (0.2 in)</td></tr>
  <tr><td>Chain angle</td><td>120°</td></tr>
  <tr><td>Line width</td><td>0.6 pt</td></tr>
  <tr><td>Bold (wedge) width</td><td>2.0 pt</td></tr>
  <tr><td>Double-bond spacing</td><td>18% of bond length</td></tr>
  <tr><td>Hash spacing</td><td>2.5 pt</td></tr>
  <tr><td>Margin around labels</td><td>1.6 pt</td></tr>
  <tr><td>Label font</td><td>Arial (Windows) or Helvetica (Mac), 10 pt</td></tr>
</table>
<ul class="help-list help-gap">
  <li><b>TSDraw uses these proportions by default</b>: what matters is the ratio to the bond length, so the 30 px default bond comes with a 21 px Arial label font, 1.25 px lines, 4 px wedges and an 18% double-bond gap. Change them in File › Settings › Drawing; <b>Reset to defaults</b> returns to ACS style.</li>
  <li><b>Size for the column</b>: single column 3.25 in (preferred), double column 7 in, at most 9.5 in long. Drawing at final size avoids reductions that make text and lines too small.</li>
  <li><b>Legibility after reduction</b>: lettering at least 5 pt; black on white, no shading or textures; raster images at 600 dpi or more.</li>
</ul>`;

const TOPICS: Topic[] = [
  {
    id: 'bonds',
    title: 'Bonds and chains',
    html: `
<p>Pick a bond tool from the bond button (hold it for single, double, triple, wedge, hashed and wavy bonds) or press its key.</p>
<ul class="help-list">
  <li><b>Click empty space</b> to start a chain; each further click adds a bond from the last atom. ${kbd('Esc')} stops the chain.</li>
  <li><b>Press an atom</b> to grow a new bond from it at once; drag before releasing to swing it around the atom.</li>
  <li><b>Click an existing bond</b> to change it to the current bond type.</li>
  <li><b>Stereo bonds:</b> wedge (${kbd('9')}) points toward the viewer, hashed (${kbd('0')}) away from it, wavy means unspecified. The narrow end sits on the stereocentre — the atom you start from.</li>
</ul>`,
  },
  {
    id: 'rings',
    title: 'Rings',
    html: `
<p>Saturated rings of 3 to 8 atoms are under the ring button; aromatic rings (benzene and the 5-membered ring) under the aromatic button.</p>
<ul class="help-list">
  <li><b>Click empty space</b> to place a free ring.</li>
  <li><b>Press on or next to an atom</b> to attach a ring there. It is drawn grey while the button is held: drag to turn it around the atom (${kbd('Shift')}: 30° steps), release to settle it, ${kbd('Esc')} to take it back.</li>
  <li><b>Click a bond</b> to fuse a ring onto it.</li>
  <li>Ring corners that land on existing atoms merge with them.</li>
  <li><b>Aromatic ⇄ Kekulé</b>: the <b>Aromatic</b> button in the top bar draws aromatic rings (benzene, pyridine, pyrrole, thiophene, fused systems such as naphthalene or indole) with an inner circle; pressed again it shows <b>Kekulé</b> alternating double bonds. Rings are recognised by the Hückel 4n + 2 rule, from Kekulé or aromatic bonds alike. Only the drawing changes: SMILES and MOL files are always written in Kekulé form, as the FDA guide asks. The choice is remembered (also in File › Settings › Drawing).</li>
</ul>`,
  },
  {
    id: 'atoms',
    title: 'Atoms and labels',
    html: `
<ul class="help-list">
  <li><b>O</b>, <b>N</b> and the halogen button (hold it for F, Cl, Br, I) set the atom tool. Click empty space to add the atom, or an atom to change its element.</li>
  <li>The <b>periodic table</b> button opens every element.</li>
  <li>The <b>T</b> (text) tool writes a group on an atom: NO2, COOH, CF3, OMe, … ${kbd('Enter')} applies, ${kbd('Esc')} cancels.</li>
  <li><b>Expand</b> (top bar, or Structure › Expand labels) turns those labels into atoms and bonds — the selected ones, or all.</li>
  <li>Atoms with an impossible valence are flagged; the status bar says what is wrong.</li>
</ul>`,
  },
  {
    id: 'select',
    title: 'Selecting and moving',
    html: `
<ul class="help-list">
  <li>The select button has a <b>lasso</b>, a <b>rectangle</b> and a <b>circle</b> (drag it out from its centre). Drag around atoms (and arrows) to select them.</li>
  <li>Drag a selection to move it; ${kbd('Delete')} or ${kbd('Backspace')} removes it.</li>
  <li>With any tool, press an atom or bond and drag to <b>rotate</b> the whole connected piece about its centre.</li>
  <li><b>Clean up</b> recomputes a tidy 2D layout and keeps the orientation as close to yours as it can.</li>
</ul>`,
  },
  {
    id: 'arrows',
    title: 'Reaction arrows',
    html: `
<ul class="help-list">
  <li>The arrow button holds reaction, equilibrium, two-way (resonance) and retrosynthesis arrows.</li>
  <li>Drag to draw an arrow (${kbd('Shift')}: 15° steps), or click for one of standard length.</li>
  <li>With the select tool, drag an arrow to move it, or drag one of its ends to stretch it.</li>
</ul>`,
  },
  {
    id: 'files',
    title: 'Files and clipboard',
    html: `
<ul class="help-list">
  <li><b>Save</b> writes a tsdraw JSON file, which <b>Open</b> reads back with everything intact.</li>
  <li><b>Save as</b> writes SMILES (.smi) or a MOL file (.mol).</li>
  <li>${kbd('Ctrl+C')} copies the selection — or the whole drawing — as a MOL file; the Copy menu also offers SMILES.</li>
  <li>${kbd('Ctrl+V')} pastes a structure from almost any chemistry text: MOL/SDF files and CTABs, SMILES, InChI, InChIKey, CAS numbers (50-78-2), PubChem CIDs, ChEMBL ids, and names — trivial, generic or brand drug names (Tylenol) and IUPAC names. Names and identifiers are looked up in PubChem (OPSIN for systematic names), so they need the internet. Several lines paste one structure per line.</li>
  <li><b>PNG</b> saves an image of the drawing.</li>
  <li><b>New</b> starts an empty drawing; <b>Clear</b> empties the canvas (${kbd('Ctrl+Z')} brings it back).</li>
</ul>`,
  },
  {
    id: 'databases',
    title: 'Databases',
    html: `
<p>The <b>Databases</b> button (top bar), or the <b>Database</b> menu, opens a panel on the right that looks things up in three public databases: <b>PubChem</b> (compounds), <b>ChEMBL</b> (bioactivity) and <b>PubMed</b> (literature). It needs an internet connection; nothing you draw is stored by them.</p>
<ul class="help-list">
  <li><b>Search</b> by name, CAS number, PubChem CID, InChIKey or ChEMBL id. <b>Draw</b> puts a result on the canvas; <b>Look up</b> makes it the subject of the other tabs.</li>
  <li>Otherwise the tabs work on <b>the drawing</b> — or only on the selected atoms, if you selected some.</li>
  <li><b>Details</b> identifies the structure: PubChem CID, names, IUPAC name, formula, MW, XLogP, TPSA, H-bond donors and acceptors, InChIKey, and its ChEMBL id and development phase. A structure PubChem does not know is probably new.</li>
  <li><b>Similar</b> finds similar compounds in PubChem or ChEMBL (choose the Tanimoto threshold), or PubChem compounds that <i>contain</i> the drawing (substructure). Each hit can be drawn.</li>
  <li><b>Literature</b> searches PubMed, starting from the compound's name; edit the query freely (PubMed syntax, e.g. <code>"imatinib" AND resistance</code>) and sort by best match or newest.</li>
  <li><b>Bioactivity</b> shows ChEMBL's mechanism of action, development phase and the most potent targets: the best pChEMBL value per target (−log<sub>10</sub> of the molar IC50, Ki, Kd or EC50), with how many measurements there are. Hover a row to see the assay.</li>
  <li>Text labels that cannot be expanded (shown as * in exports) must be expanded or removed before a lookup.</li>
</ul>
<p>The AI panel can use the same databases: ask, for example, “What is the ChEMBL bioactivity of this?” or “Find recent papers on resistance to this drug.”</p>`,
  },
  {
    id: 'ai',
    title: 'AI assistant',
    html: `
<ul class="help-list">
  <li>The panel under the canvas talks to Claude, ChatGPT or Grok. Pick one with the buttons and a model from the list.</li>
  <li>Ask chemistry questions about what you drew — the current drawing is sent along — or ask it to draw something: “Draw ibuprofen”.</li>
  <li>The assistant can look things up in PubChem, ChEMBL and PubMed (see <a href="#" data-help-goto="databases">Databases</a>); each lookup shows as a 🔎 line in the chat.</li>
  <li>${kbd('Enter')} sends, ${kbd('Shift+Enter')} starts a new line, <b>Clear</b> starts a new conversation. View › Show / hide AI panel folds it away.</li>
  <li>Each provider needs an API key: enter it in File › Settings › AI, or put it in <code>.env.local</code> for the dev server.</li>
</ul>`,
  },
  {
    id: 'settings',
    title: 'Settings',
    html: `
<p>File › Settings (${kbd('Ctrl+,')}) has two pages:</p>
<ul class="help-list">
  <li><b>Drawing</b> — bond length, line width, label font, double-bond spacing, wedge width, bond colour and grid. Changes apply at once. The defaults follow the ACS journal style (see <a href="#" data-help-goto="guidelines">Drawing guidelines</a>).</li>
  <li><b>AI</b> — API keys for Claude, ChatGPT and Grok, with a button to test each.</li>
</ul>
<p>Settings are kept in this browser.</p>`,
  },
  {
    id: 'keys',
    title: 'Keyboard shortcuts',
    html: `
<table class="help-keys">
  <tr><th colspan="2">Tools</th></tr>
  <tr><td>${kbd('1')} ${kbd('2')} ${kbd('3')}</td><td>Single, double, triple bond</td></tr>
  <tr><td>${kbd('4')} … ${kbd('8')}</td><td>4- to 8-membered ring</td></tr>
  <tr><td>${kbd('9')}</td><td>Wedge bond (up)</td></tr>
  <tr><td>${kbd('0')}</td><td>Hashed bond (down)</td></tr>
  <tr><td>${kbd('A')}</td><td>Aromatic 5-membered ring</td></tr>
  <tr><td>${kbd('B')}</td><td>Benzene</td></tr>
  <tr><th colspan="2">Editing</th></tr>
  <tr><td>${kbd('Ctrl+Z')}</td><td>Undo</td></tr>
  <tr><td>${kbd('Ctrl+Y')} / ${kbd('Ctrl+Shift+Z')}</td><td>Redo</td></tr>
  <tr><td>${kbd('Ctrl+C')}</td><td>Copy as MOL file</td></tr>
  <tr><td>${kbd('Ctrl+V')}</td><td>Paste a structure: MOL, SMILES, InChI, CAS or name</td></tr>
  <tr><td>${kbd('Delete')} / ${kbd('Backspace')}</td><td>Delete the selection</td></tr>
  <tr><td>${kbd('Esc')}</td><td>Stop the chain, clear the selection, cancel a held ring, close menus</td></tr>
  <tr><td>${kbd('Shift')} (while dragging)</td><td>Snap ring turns to 30°, arrows to 15°</td></tr>
  <tr><th colspan="2">App</th></tr>
  <tr><td>${kbd('Ctrl+,')}</td><td>Settings</td></tr>
  <tr><td>${kbd('F1')}</td><td>Help</td></tr>
</table>
<p class="settings-intro help-gap">On a Mac, use ${kbd('⌘')} instead of ${kbd('Ctrl')}. One-key shortcuts are ignored while you type in a text box.</p>`,
  },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function aboutHtml(): string {
  return `
<h3 class="settings-heading">About TSDraw</h3>
<p class="settings-intro">A chemical structure drawing application written in TypeScript.</p>
<table class="help-about">
  <tr><td>Version</td><td>${APP_VERSION}</td></tr>
  <tr><td>Build</td><td>${APP_BUILD}</td></tr>
  <tr><td>License</td><td>${APP_LICENSE.name}</td></tr>
  <tr><td>Copyright</td><td>${APP_LICENSE.copyright}</td></tr>
</table>
<p class="help-gap help-notice">${escapeHtml(APP_LICENSE.notice).replace(/\n\n/g, '</p><p class="help-notice">')}</p>
<details class="help-gap">
  <summary>Show the full license text</summary>
  <pre class="help-license">${escapeHtml(APP_LICENSE.text)}</pre>
</details>`;
}

export function initHelpDialog(): HelpDialog {
  const modal = document.createElement('div');
  modal.className = 'settings-backdrop';
  modal.id = 'helpModal';
  modal.hidden = true;
  modal.innerHTML = `
<div class="settings-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <nav class="settings-nav" role="tablist" aria-orientation="vertical">
    <h2 class="settings-title" id="helpTitle">Help</h2>
    <button class="settings-tab" role="tab" data-help-tab="tutorial">Quick tutorial</button>
    <div class="help-nav-label">Guide</div>
    ${TOPICS.map((t) => `<button class="settings-tab help-subtab" role="tab" data-help-tab="${t.id}">${t.title}</button>`).join('')}
    <div class="help-nav-label">Standards</div>
    <button class="settings-tab help-subtab" role="tab" data-help-tab="guidelines">Drawing guidelines</button>
    <div class="help-nav-spacer"></div>
    <button class="settings-tab" role="tab" data-help-tab="about">About</button>
  </nav>
  <div class="settings-main">
    <button class="settings-close" title="Close (Esc)" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <section class="settings-pane help-pane" role="tabpanel"></section>
  </div>
</div>`;
  document.body.appendChild(modal);

  const pane = modal.querySelector<HTMLElement>('.help-pane')!;
  const main = modal.querySelector<HTMLElement>('.settings-main')!;
  const tabs = [...modal.querySelectorAll<HTMLButtonElement>('[data-help-tab]')];
  let lastFocus: HTMLElement | null = null;

  function show(id: string): void {
    if (id === 'help') id = TOPICS[0].id;
    for (const tab of tabs) {
      const active = tab.dataset.helpTab === id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    if (id === 'tutorial') pane.innerHTML = TUTORIAL;
    else if (id === 'about') pane.innerHTML = aboutHtml();
    else if (id === 'guidelines') pane.innerHTML = GUIDELINES;
    else {
      const topic = TOPICS.find((t) => t.id === id) ?? TOPICS[0];
      pane.innerHTML = `<h3 class="settings-heading">${topic.title}</h3><div class="help-body">${topic.html}</div>`;
    }
    main.scrollTop = 0;
  }

  const dialog: HelpDialog = {
    open(page) {
      if (modal.hidden) lastFocus = document.activeElement as HTMLElement | null;
      show(page);
      modal.hidden = false;
      tabs.find((t) => t.classList.contains('active'))?.focus();
    },
    close() {
      if (modal.hidden) return;
      if (modal.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      modal.hidden = true;
      if (lastFocus && lastFocus !== document.body && document.contains(lastFocus)) lastFocus.focus();
    },
    isOpen: () => !modal.hidden,
  };

  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.helpTab!));
  pane.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-help-goto]');
    if (!link) return;
    e.preventDefault();
    show(link.dataset.helpGoto!);
  });
  modal.querySelector('.settings-close')!.addEventListener('click', () => dialog.close());
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) dialog.close();
  });
  modal.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep editor shortcuts out of the dialog
    if (e.key === 'Escape') dialog.close();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length];
      show(next.dataset.helpTab!);
      next.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.isOpen()) dialog.close();
  });
  return dialog;
}
