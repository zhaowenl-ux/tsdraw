/**
 * Structure › Name structure: a dialog with the names of the drawn (or selected) structure —
 * common/generic name, IUPAC name, INN, trade names, other names, codes, CAS — from PubChem,
 * Wikidata and Wikipedia, each with a copy button.
 */
import { nameStructure, NameSources, StructureNames } from './naming';

export interface NameDialogOptions {
  db: NameSources;
  /** Ask the AI assistant to name a structure no database knows. */
  askAi?: (smiles: string) => void;
}

export interface NameDialog {
  /** Look up and show the names of each SMILES (one per disconnected piece). */
  open(pieces: string[], what: string): void;
  close(): void;
  isOpen(): boolean;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

function row(label: string, value: string | undefined, note = ''): string {
  if (!value) return '';
  return `<tr><th>${esc(label)}${note ? `<div class="name-note">${esc(note)}</div>` : ''}</th>
<td class="name-value">${esc(value)}</td>
<td><button class="name-copy" data-copy="${esc(value)}" title="Copy">${COPY_ICON}</button></td></tr>`;
}

function listRow(label: string, values: string[], note = ''): string {
  if (values.length === 0) return '';
  return `<tr><th>${esc(label)}${note ? `<div class="name-note">${esc(note)}</div>` : ''}</th>
<td class="name-value">${values.map((v) => `<span class="name-chip" data-copy="${esc(v)}" title="Click to copy">${esc(v)}</span>`).join('')}</td>
<td><button class="name-copy" data-copy="${esc(values.join('; '))}" title="Copy all">${COPY_ICON}</button></td></tr>`;
}

export function namesHtml(n: StructureNames, canAskAi: boolean): string {
  if (!n.found) {
    return `<p class="settings-intro">This structure is not in PubChem, so it has no catalogued name.</p>
<table class="name-table">${row('SMILES', n.smiles)}</table>
${canAskAi ? `<button class="settings-btn name-ask-ai" data-smiles="${esc(n.smiles)}">Ask the AI assistant for an IUPAC name</button>
<p class="name-note">AI-generated names can be wrong: check them before use.</p>` : ''}`;
  }
  const links = [
    n.cid ? `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${n.cid}" target="_blank" rel="noopener">PubChem CID ${n.cid}</a>` : '',
    n.wikipedia ? `<a href="${esc(n.wikipedia.url)}" target="_blank" rel="noopener">Wikipedia: ${esc(n.wikipedia.title)}</a>` : '',
  ].filter(Boolean);
  return `
<div class="name-head">
  <div class="name-title">${esc(n.common ?? n.iupac ?? 'Unnamed')}</div>
  ${n.wikipedia?.description ? `<div class="name-desc">${esc(n.wikipedia.description)}</div>` : ''}
  <div class="name-links">${links.join(' · ')}</div>
</div>
<table class="name-table">
  ${row('Common name', n.common, n.wikipedia ? 'PubChem, Wikipedia' : 'PubChem')}
  ${row('Generic name (INN)', n.inn, 'WHO, via Wikidata')}
  ${row('IUPAC name', n.iupac, 'PubChem')}
  ${listRow('Trade names', n.brands, 'Wikipedia')}
  ${listRow('Other names', n.others, 'PubChem, Wikipedia')}
  ${listRow('Codes', n.codes, 'development codes')}
  ${row('CAS number', n.cas)}
  ${row('Formula', n.formula)}
  ${row('InChIKey', n.inchikey)}
  ${row('SMILES', n.smiles)}
</table>
${n.wikipedia?.extract ? `<details class="name-extract"><summary>From Wikipedia</summary><p>${esc(n.wikipedia.extract)}</p></details>` : ''}
${n.problems.length ? `<p class="name-note">Not all sources answered: ${esc(n.problems.join('; '))}</p>` : ''}`;
}

export function initNameDialog(opts: NameDialogOptions): NameDialog {
  const modal = document.createElement('div');
  modal.className = 'settings-backdrop';
  modal.id = 'nameModal';
  modal.hidden = true;
  modal.innerHTML = `
<div class="settings-dialog name-dialog" role="dialog" aria-modal="true" aria-labelledby="nameTitle">
  <div class="settings-main">
    <button class="settings-close" title="Close (Esc)" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <h3 class="settings-heading" id="nameTitle">Name structure</h3>
    <div class="name-body"></div>
  </div>
</div>`;
  document.body.appendChild(modal);
  const body = modal.querySelector<HTMLElement>('.name-body')!;
  let run = 0;

  const close = () => {
    modal.hidden = true;
    run++;
  };
  modal.querySelector('.settings-close')!.addEventListener('click', close);
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) close();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  body.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const copy = target.closest<HTMLElement>('[data-copy]');
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.dataset.copy ?? '');
        copy.classList.add('copied');
        window.setTimeout(() => copy.classList.remove('copied'), 900);
      } catch {
        /* clipboard blocked: the text can still be selected */
      }
      return;
    }
    const ask = target.closest<HTMLElement>('.name-ask-ai');
    if (ask && opts.askAi) {
      close();
      opts.askAi(ask.dataset.smiles ?? '');
    }
  });

  return {
    close,
    isOpen: () => !modal.hidden,
    open(pieces, what) {
      const mine = ++run;
      modal.hidden = false;
      modal.querySelector<HTMLElement>('.settings-close')!.focus();
      const title = pieces.length > 1 ? `${pieces.length} structures` : what;
      modal.querySelector('#nameTitle')!.textContent = `Name ${title}`;
      body.innerHTML = `<p class="settings-intro">⏳ Looking up names in PubChem, Wikidata and Wikipedia…</p>`;
      void (async () => {
        const parts: string[] = [];
        for (const [i, smiles] of pieces.entries()) {
          let html: string;
          try {
            html = namesHtml(await nameStructure(smiles, opts.db), !!opts.askAi);
          } catch (err) {
            html = `<p class="name-error">Could not look up names: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
          }
          parts.push(pieces.length > 1 ? `<section class="name-piece"><div class="name-piece-label">Structure ${i + 1}</div>${html}</section>` : html);
          if (mine !== run) return;
          body.innerHTML = parts.join('') + (i + 1 < pieces.length ? '<p class="settings-intro">⏳ …</p>' : '');
        }
      })();
    },
  };
}
