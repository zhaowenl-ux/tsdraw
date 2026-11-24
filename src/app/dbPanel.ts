/**
 * The Databases panel, docked on the right of the canvas.
 *   Search       — name, CAS, CID, InChIKey or ChEMBL id → PubChem compounds to draw.
 *   Details      — the subject's PubChem record, synonyms and ChEMBL entry.
 *   Similar      — PubChem or ChEMBL similarity, PubChem substructure; hits can be drawn.
 *   Literature   — PubMed papers about the subject.
 *   Bioactivity  — ChEMBL mechanism, phase and most potent targets.
 * The subject is the drawing (or the selection), or a compound picked from the search results.
 * Everything shown from the databases is escaped before it goes into the page.
 */
import {
  Compound,
  Databases,
  Identification,
  StructureHit,
  links,
  shortAuthors,
} from './databases';

export type DbView = 'search' | 'details' | 'similar' | 'literature' | 'bioactivity';

export interface DbPanelOptions {
  db: Databases;
  /** SMILES of the selection, or of the whole drawing; '' when the canvas is empty. */
  drawingSmiles(): { smiles: string; selection: boolean; unknown: string[] };
  /** Add a structure to the canvas; throws with the reason if the SMILES cannot be read. */
  draw(smiles: string, name?: string): void;
}

export interface DbPanel {
  open(view?: DbView): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

type Subject = { kind: 'drawing' } | { kind: 'compound'; compound: Compound };

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number | undefined, d = 2) => (n === undefined ? '—' : String(Math.round(n * 10 ** d) / 10 ** d));
const ext = (href: string, label: string) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const PHASE: Record<string, string> = { '4': 'Approved drug', '3': 'Phase 3', '2': 'Phase 2', '1': 'Phase 1', '0.5': 'Early phase 1' };

export function initDbPanel(opts: DbPanelOptions): DbPanel {
  const { db } = opts;
  const panel = document.createElement('aside');
  panel.className = 'db-panel';
  panel.id = 'dbPanel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Databases');
  panel.innerHTML = `
<div class="db-head">
  <span class="db-title">Databases</span>
  <span class="db-sources">PubChem · ChEMBL · PubMed</span>
  <button class="db-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
</div>
<form class="db-search">
  <input type="search" class="db-input" placeholder="Name, CAS, CID, InChIKey or ChEMBL id" aria-label="Search compounds" />
  <button type="submit" class="db-btn db-primary">Search</button>
</form>
<div class="db-subject"></div>
<div class="db-tabs" role="tablist">
  <button role="tab" data-view="search">Results</button>
  <button role="tab" data-view="details">Details</button>
  <button role="tab" data-view="similar">Similar</button>
  <button role="tab" data-view="literature">Literature</button>
  <button role="tab" data-view="bioactivity">Bioactivity</button>
</div>
<div class="db-body" role="tabpanel"></div>`;
  document.querySelector('.content-wrapper')!.appendChild(panel);

  const input = panel.querySelector<HTMLInputElement>('.db-input')!;
  const subjectBar = panel.querySelector<HTMLElement>('.db-subject')!;
  const body = panel.querySelector<HTMLElement>('.db-body')!;
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('.db-tabs [data-view]')];

  let view: DbView = 'details';
  let subject: Subject = { kind: 'drawing' };
  let searchHits: Compound[] = [];
  let lastQuery = '';
  /** Identification of each SMILES already looked up (the drawing is identified once per change). */
  const identified = new Map<string, Identification>();
  /** Bumped by every new request: answers to older requests are dropped. */
  let ticket = 0;

  // ---------- subject ----------

  /** The SMILES the views work on, and a label for it. */
  function subjectSmiles(): { smiles: string; label: string; problem?: string } {
    if (subject.kind === 'compound') {
      const c = subject.compound;
      return { smiles: c.smiles, label: `${c.title ?? 'Compound'} (CID ${c.cid})` };
    }
    const d = opts.drawingSmiles();
    if (!d.smiles) return { smiles: '', label: 'the drawing', problem: 'The canvas is empty: draw a structure, or search by name above.' };
    if (d.unknown.length)
      return {
        smiles: d.smiles,
        label: 'the drawing',
        problem: `The drawing has labels that cannot be expanded (${d.unknown.join(', ')}): expand or remove them first.`,
      };
    return { smiles: d.smiles, label: d.selection ? 'the selection' : 'the drawing' };
  }

  function renderSubject(): void {
    if (subject.kind === 'compound') {
      const c = subject.compound;
      subjectBar.innerHTML = `Looking at <b>${esc(c.title ?? `CID ${c.cid}`)}</b> <button class="db-link" data-act="use-drawing">use the drawing instead</button>`;
    } else {
      const d = opts.drawingSmiles();
      subjectBar.innerHTML = d.smiles
        ? `Looking at <b>${d.selection ? 'the selection' : 'the drawing'}</b> <code title="${esc(d.smiles)}">${esc(d.smiles.length > 48 ? d.smiles.slice(0, 46) + '…' : d.smiles)}</code>`
        : 'Looking at <b>the drawing</b> (empty)';
    }
  }

  async function identifySubject(): Promise<Identification | null> {
    if (subject.kind === 'compound') {
      const c = subject.compound;
      const key = `cid:${c.cid}`;
      let r = identified.get(key);
      if (!r) {
        const [synonyms, chembl] = await Promise.all([
          db.synonyms(c.cid, 12).catch(() => []),
          c.inchikey ? db.chemblByInchiKey(c.inchikey).catch(() => null) : Promise.resolve(null),
        ]);
        r = { compound: c, synonyms, chembl };
        identified.set(key, r);
      }
      return r;
    }
    const { smiles } = subjectSmiles();
    if (!smiles) return null;
    let r = identified.get(smiles);
    if (!r) {
      r = await db.identify(smiles);
      identified.set(smiles, r);
    }
    return r;
  }

  // ---------- rendering helpers ----------

  const loading = (what: string) => {
    body.innerHTML = `<div class="db-status"><span class="db-spinner"></span>${esc(what)}…</div>`;
  };
  const message = (html: string) => {
    body.innerHTML = `<div class="db-status">${html}</div>`;
  };
  const failed = (err: unknown) => {
    body.innerHTML = `<div class="db-status db-error">${esc(err instanceof Error ? err.message : String(err))}</div>`;
  };

  /** Runs a request for the current view; drops its answer if another request started meanwhile. */
  async function guarded<T>(label: string, work: () => Promise<T>, show: (r: T) => void): Promise<void> {
    const mine = ++ticket;
    loading(label);
    try {
      const r = await work();
      if (mine === ticket) show(r);
    } catch (err) {
      if (mine === ticket) failed(err);
    }
  }

  function hitCard(h: { smiles: string; name?: string; img: string; idLink: string; meta: string }, index: number, extra = ''): string {
    return `<div class="db-card">
  <img class="db-thumb" src="${esc(h.img)}" alt="" loading="lazy" />
  <div class="db-card-text">
    <div class="db-card-name">${esc(h.name ?? '(no name)')}</div>
    <div class="db-card-meta">${h.meta}</div>
    <div class="db-card-meta">${h.idLink}</div>
  </div>
  <div class="db-card-actions">
    <button class="db-btn" data-act="draw" data-i="${index}">Draw</button>${extra}
  </div>
</div>`;
  }

  // ---------- views ----------

  function showSearch(): void {
    if (!lastQuery) return message('Search PubChem by name, CAS number, CID, InChIKey or ChEMBL id, then draw a result or look it up.');
    if (searchHits.length === 0) return message(`No PubChem compound matches “${esc(lastQuery)}”.`);
    body.innerHTML =
      `<div class="db-note">${searchHits.length} result${searchHits.length === 1 ? '' : 's'} for “${esc(lastQuery)}”</div>` +
      searchHits
        .map((c, i) =>
          hitCard(
            {
              smiles: c.smiles,
              name: c.title,
              img: links.pubchemImage(c.cid),
              meta: `${esc(c.formula ?? '')} · ${fmt(c.mw)} g/mol`,
              idLink: ext(links.pubchemCompound(c.cid), `CID ${c.cid}`),
            },
            i,
            `<button class="db-btn" data-act="details" data-i="${i}">Look up</button>`
          )
        )
        .join('');
    body.dataset.hits = 'search';
  }

  async function runSearch(q: string): Promise<void> {
    lastQuery = q.trim();
    if (!lastQuery) return;
    selectTab('search');
    await guarded(
      `Searching PubChem for “${lastQuery}”`,
      () => db.searchCompounds(lastQuery, 8),
      (hits) => {
        searchHits = hits;
        showSearch();
      }
    );
  }

  function detailsHtml(r: Identification): string {
    const c = r.compound!;
    const rows: Array<[string, string]> = [
      ['PubChem', ext(links.pubchemCompound(c.cid), `CID ${c.cid}`)],
      ['Formula', esc(c.formula)],
      ['MW', `${fmt(c.mw)} g/mol`],
      ['XLogP', fmt(c.xlogp, 1)],
      ['TPSA', c.tpsa === undefined ? '—' : `${fmt(c.tpsa, 1)} Å²`],
      ['H-bond donors / acceptors', `${c.hbd ?? '—'} / ${c.hba ?? '—'}`],
      ['Rotatable bonds', String(c.rotatable ?? '—')],
      ['InChIKey', `<code>${esc(c.inchikey)}</code>`],
    ];
    if (r.chembl) {
      const m = r.chembl;
      rows.push(['ChEMBL', ext(links.chemblCompound(m.chemblId), esc(m.chemblId))]);
      rows.push([
        'Development',
        esc(m.maxPhase !== undefined ? PHASE[String(m.maxPhase)] ?? `Phase ${m.maxPhase}` : 'Preclinical / research') +
          (m.firstApproval ? ` (first approved ${m.firstApproval})` : ''),
      ]);
      if (m.qed !== undefined) rows.push(['QED', fmt(m.qed)]);
    } else rows.push(['ChEMBL', 'not in ChEMBL']);
    const names = r.synonyms.filter((s) => s !== c.title).slice(0, 10);
    return `<div class="db-detail-head">
  <img class="db-thumb db-thumb-lg" src="${esc(links.pubchemImage(c.cid, 200))}" alt="" />
  <div>
    <div class="db-detail-title">${esc(c.title ?? `CID ${c.cid}`)}</div>
    ${c.iupac ? `<div class="db-iupac">${esc(c.iupac)}</div>` : ''}
    <div class="db-row-actions">
      <button class="db-btn" data-act="draw-subject">Draw</button>
      <button class="db-btn" data-act="goto" data-view="literature">Papers</button>
      ${r.chembl ? '<button class="db-btn" data-act="goto" data-view="bioactivity">Bioactivity</button>' : ''}
    </div>
  </div>
</div>
<table class="db-table">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
${names.length ? `<div class="db-section">Also known as</div><div class="db-synonyms">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}`;
  }

  async function showDetails(): Promise<void> {
    const s = subjectSmiles();
    if (s.problem) return message(esc(s.problem));
    await guarded(`Looking up ${s.label} in PubChem and ChEMBL`, identifySubject, (r) => {
      if (!r?.compound) {
        message(
          'This exact structure is not in PubChem — it may be new. <button class="db-link" data-act="goto" data-view="similar">Find similar compounds</button>'
        );
        return;
      }
      body.innerHTML = detailsHtml(r);
    });
  }

  let similarHits: StructureHit[] = [];
  let similarMethod = 'pubchem-sim';
  let similarThreshold = 90;

  function similarControls(): string {
    const thresholds = [95, 90, 85, 80, 70, 60];
    return `<form class="db-controls" data-form="similar">
  <select class="db-select" name="method" aria-label="Search method">
    <option value="pubchem-sim"${similarMethod === 'pubchem-sim' ? ' selected' : ''}>PubChem — similar</option>
    <option value="pubchem-sub"${similarMethod === 'pubchem-sub' ? ' selected' : ''}>PubChem — contains it (substructure)</option>
    <option value="chembl-sim"${similarMethod === 'chembl-sim' ? ' selected' : ''}>ChEMBL — similar</option>
  </select>
  <select class="db-select" name="threshold" aria-label="Similarity threshold"${similarMethod === 'pubchem-sub' ? ' disabled' : ''}>
    ${thresholds.map((t) => `<option value="${t}"${t === similarThreshold ? ' selected' : ''}>≥ ${t}%</option>`).join('')}
  </select>
  <button type="submit" class="db-btn db-primary">Search</button>
</form>`;
  }

  async function showSimilar(run = false): Promise<void> {
    const s = subjectSmiles();
    if (s.problem) return message(esc(s.problem));
    if (!run) {
      body.innerHTML = similarControls() + `<div class="db-status">Search for compounds like ${esc(s.label)}.</div>`;
      return;
    }
    const label =
      similarMethod === 'pubchem-sub' ? 'Substructure search in PubChem' : `Similarity search in ${similarMethod === 'chembl-sim' ? 'ChEMBL' : 'PubChem'}`;
    const mine = ++ticket;
    body.innerHTML = similarControls() + `<div class="db-status"><span class="db-spinner"></span>${label}…</div>`;
    try {
      const hits =
        similarMethod === 'pubchem-sub'
          ? await db.pubchemSubstructure(s.smiles, 24)
          : similarMethod === 'chembl-sim'
            ? await db.chemblSimilar(s.smiles, similarThreshold, 24)
            : await db.pubchemSimilar(s.smiles, similarThreshold, 24);
      if (mine !== ticket) return;
      similarHits = hits;
      body.innerHTML =
        similarControls() +
        (hits.length === 0
          ? '<div class="db-status">No hits. Try a lower threshold, or the other database.</div>'
          : `<div class="db-note">${hits.length} hit${hits.length === 1 ? '' : 's'}${similarMethod === 'pubchem-sim' ? ' (PubChem does not report the scores)' : ''}</div>` +
            hits
              .map((h, i) =>
                hitCard(
                  {
                    smiles: h.smiles,
                    name: h.name,
                    img: h.source === 'pubchem' ? links.pubchemImage(Number(h.id)) : links.chemblImage(h.id),
                    meta: [h.formula, h.mw !== undefined ? `${fmt(h.mw)} g/mol` : '', h.similarity !== undefined ? `${fmt(h.similarity, 0)}% similar` : '']
                      .filter(Boolean)
                      .map(esc)
                      .join(' · '),
                    idLink:
                      h.source === 'pubchem'
                        ? ext(links.pubchemCompound(Number(h.id)), `CID ${esc(h.id)}`)
                        : ext(links.chemblCompound(h.id), esc(h.id)),
                  },
                  i
                )
              )
              .join(''));
      body.dataset.hits = 'similar';
    } catch (err) {
      if (mine !== ticket) return;
      body.innerHTML = similarControls() + `<div class="db-status db-error">${esc(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }

  let literatureTerm = '';
  let literatureFor = '';
  let literatureSort: 'relevance' | 'date' = 'relevance';

  function literatureControls(): string {
    return `<form class="db-controls" data-form="literature">
  <input class="db-input" name="term" value="${esc(literatureTerm)}" placeholder="PubMed query" aria-label="PubMed query" />
  <select class="db-select" name="sort" aria-label="Order">
    <option value="relevance"${literatureSort === 'relevance' ? ' selected' : ''}>Best match</option>
    <option value="date"${literatureSort === 'date' ? ' selected' : ''}>Newest</option>
  </select>
  <button type="submit" class="db-btn db-primary">Search</button>
</form>`;
  }

  async function showLiterature(run = false): Promise<void> {
    if (!run) {
      // Default query: the subject's name, looked up when needed.
      const s = subjectSmiles();
      const key = subject.kind === 'compound' ? `cid:${subject.compound.cid}` : s.smiles;
      if (key !== literatureFor || !literatureTerm) {
        if (s.problem && subject.kind === 'drawing') return message(esc(s.problem));
        const mine = ++ticket;
        loading('Finding a name to search for');
        try {
          const r = await identifySubject();
          if (mine !== ticket) return;
          const name = r?.compound?.title ?? r?.synonyms[0];
          literatureFor = key;
          literatureTerm = name ? `"${name}"` : '';
          if (!name) {
            body.innerHTML = literatureControls() + '<div class="db-status">This structure has no name in PubChem: type a query.</div>';
            return;
          }
        } catch (err) {
          if (mine === ticket) failed(err);
          return;
        }
      }
    }
    if (!literatureTerm.trim()) {
      body.innerHTML = literatureControls() + '<div class="db-status">Type a PubMed query.</div>';
      return;
    }
    const mine = ++ticket;
    body.innerHTML = literatureControls() + '<div class="db-status"><span class="db-spinner"></span>Searching PubMed…</div>';
    try {
      const r = await db.pubmed(literatureTerm, 15, literatureSort);
      if (mine !== ticket) return;
      const list = r.papers
        .map(
          (p) => `<div class="db-paper">
  <div class="db-paper-title">${ext(links.pubmedArticle(p.pmid), esc(p.title))}</div>
  <div class="db-card-meta">${esc(shortAuthors(p.authors))}</div>
  <div class="db-card-meta">${esc(p.journal)} ${esc(p.year)} · PMID ${esc(p.pmid)}${p.doi ? ` · ${ext(`https://doi.org/${p.doi}`, 'DOI')}` : ''}</div>
</div>`
        )
        .join('');
      body.innerHTML =
        literatureControls() +
        `<div class="db-note">${r.count.toLocaleString()} paper${r.count === 1 ? '' : 's'} in PubMed · ${ext(links.pubmedSearch(literatureTerm), 'open in PubMed')}</div>` +
        (list || '<div class="db-status">No papers found.</div>');
    } catch (err) {
      if (mine === ticket) body.innerHTML = literatureControls() + `<div class="db-status db-error">${esc(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }

  async function showBioactivity(): Promise<void> {
    const s = subjectSmiles();
    if (s.problem && subject.kind === 'drawing') return message(esc(s.problem));
    await guarded(
      'Looking up ChEMBL bioactivity',
      async () => {
        const r = await identifySubject();
        if (!r?.compound) return { kind: 'not-pubchem' as const };
        if (!r.chembl) return { kind: 'not-chembl' as const, name: r.compound.title };
        const [mechanisms, targets] = await Promise.all([db.mechanisms(r.chembl.chemblId).catch(() => []), db.bioactivity(r.chembl.chemblId, 20)]);
        return { kind: 'ok' as const, chembl: r.chembl, mechanisms, targets };
      },
      (r) => {
        if (r.kind === 'not-pubchem') return message('This structure is not in PubChem, so it cannot be matched to ChEMBL.');
        if (r.kind === 'not-chembl') return message(`${esc(r.name ?? 'This compound')} is not in ChEMBL: no bioactivity data.`);
        const m = r.chembl;
        const phase = m.maxPhase !== undefined ? PHASE[String(m.maxPhase)] ?? `Phase ${m.maxPhase}` : 'Preclinical / research';
        const mech = r.mechanisms.length
          ? `<div class="db-section">Mechanism of action</div><ul class="db-list">${r.mechanisms
              .map((x) => `<li>${esc(x.moa)}${x.targetId ? ` · ${ext(links.chemblTarget(x.targetId), esc(x.targetId))}` : ''}</li>`)
              .join('')}</ul>`
          : '';
        const rows = r.targets
          .map(
            (t) => `<tr title="${esc((t.count === 1 ? 'Single measurement. ' : '') + (t.assay ?? ''))}"${t.count === 1 ? ' class="db-single"' : ''}>
  <td>${ext(links.chemblTarget(t.targetId), esc(t.target))}${t.organism && t.organism !== 'Homo sapiens' ? `<div class="db-card-meta">${esc(t.organism)}</div>` : ''}</td>
  <td class="db-num">${fmt(t.pchembl)}</td>
  <td>${esc(t.type)} ${esc(t.relation)} ${t.value !== undefined ? esc(fmt(t.value, 3)) : ''} ${esc(t.units ?? '')}</td>
  <td class="db-num">${t.count}</td>
</tr>`
          )
          .join('');
        body.innerHTML = `<div class="db-detail-title">${esc(m.name ?? m.chemblId)} ${ext(links.chemblCompound(m.chemblId), esc(m.chemblId))}</div>
<div class="db-card-meta">${esc(phase)}${m.firstApproval ? ` · first approved ${m.firstApproval}` : ''}</div>
${mech}
<div class="db-section">Most potent targets</div>
${
  rows
    ? `<table class="db-table db-acts"><thead><tr><th>Target</th><th title="−log10 of the molar IC50, Ki, Kd or EC50">pChEMBL</th><th>Best value</th><th title="Measurements with a pChEMBL value">n</th></tr></thead><tbody>${rows}</tbody></table>
<div class="db-note">Best measured value per target; hover a row for its assay. Grey rows rest on a single measurement.</div>`
    : '<div class="db-status">No potency measurements in ChEMBL.</div>'
}`;
      }
    );
  }

  // ---------- tabs and events ----------

  function selectTab(next: DbView): void {
    view = next;
    for (const t of tabs) {
      const on = t.dataset.view === next;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    }
    renderSubject();
  }

  function show(next: DbView): void {
    selectTab(next);
    if (next === 'search') showSearch();
    else if (next === 'details') void showDetails();
    else if (next === 'similar') void showSimilar(false);
    else if (next === 'literature') void showLiterature(false);
    else void showBioactivity();
  }

  function drawSmiles(smiles: string, name?: string): void {
    try {
      opts.draw(smiles, name);
    } catch (err) {
      body.insertAdjacentHTML(
        'afterbegin',
        `<div class="db-status db-error">Could not draw ${esc(name ?? 'it')}: ${esc(err instanceof Error ? err.message : String(err))}</div>`
      );
    }
  }

  for (const t of tabs) t.addEventListener('click', () => show(t.dataset.view as DbView));

  panel.querySelector('.db-search')!.addEventListener('submit', (e) => {
    e.preventDefault();
    void runSearch(input.value);
  });
  panel.querySelector('.db-close')!.addEventListener('click', () => api.close());

  panel.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const i = Number(el.dataset.i);
    if (act === 'draw') {
      if (body.dataset.hits === 'search' && searchHits[i]) drawSmiles(searchHits[i].smiles, searchHits[i].title);
      else if (body.dataset.hits === 'similar' && similarHits[i]) drawSmiles(similarHits[i].smiles, similarHits[i].name);
    } else if (act === 'details' && searchHits[i]) {
      subject = { kind: 'compound', compound: searchHits[i] };
      show('details');
    } else if (act === 'draw-subject') {
      if (subject.kind === 'compound') drawSmiles(subject.compound.smiles, subject.compound.title);
      else {
        const r = identified.get(subjectSmiles().smiles);
        if (r?.compound) drawSmiles(r.compound.smiles, r.compound.title);
      }
    } else if (act === 'goto') show(el.dataset.view as DbView);
    else if (act === 'use-drawing') {
      subject = { kind: 'drawing' };
      show(view === 'search' ? 'details' : view);
    }
  });

  panel.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.dataset.form) return;
    e.preventDefault();
    const data = new FormData(form);
    if (form.dataset.form === 'similar') {
      similarMethod = String(data.get('method') ?? 'pubchem-sim');
      similarThreshold = Number(data.get('threshold') ?? similarThreshold) || similarThreshold;
      void showSimilar(true);
    } else {
      literatureTerm = String(data.get('term') ?? '');
      literatureSort = data.get('sort') === 'date' ? 'date' : 'relevance';
      void showLiterature(true);
    }
  });
  panel.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.name === 'method') {
      similarMethod = sel.value;
      const threshold = panel.querySelector<HTMLSelectElement>('select[name="threshold"]');
      if (threshold) threshold.disabled = sel.value === 'pubchem-sub';
    }
  });

  const api: DbPanel = {
    open(next) {
      panel.hidden = false;
      document.body.classList.add('db-open');
      if (next === 'search') {
        selectTab('search');
        showSearch();
        input.focus();
        input.select();
        return;
      }
      // A menu command (Identify, Similar…) works on the drawing; reopening keeps what was shown.
      if (next) subject = { kind: 'drawing' };
      show(next ?? view);
    },
    close() {
      panel.hidden = true;
      document.body.classList.remove('db-open');
      ticket++;
    },
    toggle() {
      if (panel.hidden) api.open();
      else api.close();
    },
    isOpen: () => !panel.hidden,
  };
  return api;
}
