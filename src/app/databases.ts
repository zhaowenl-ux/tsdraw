/**
 * Public chemistry databases: PubChem (compounds), PubMed (literature) and ChEMBL (bioactivity).
 * All three allow calls straight from the browser (CORS *), so no dev-server proxy is needed.
 * No UI here: the Databases panel (dbPanel.ts) and the AI assistant's tools both use this module.
 */

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const CHEMBL = 'https://www.ebi.ac.uk/chembl/api/data';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const WIKIPEDIA = 'https://en.wikipedia.org';
/** OPSIN (Cambridge) turns systematic (IUPAC) names into structures; CORS *. */
const OPSIN = 'https://opsin.ch.cam.ac.uk/opsin';
/** The same through the dev/preview server (vite.app.config.ts), for browsers that block the direct call. */
const OPSIN_PROXY = '/api/opsin';
const TIMEOUT_MS = 25000;
/** NCBI (PubChem and PubMed) allows 3 requests a second without an API key. */
const NCBI_GAP_MS = 350;

export const links = {
  pubchemCompound: (cid: number) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
  pubchemImage: (cid: number, size = 160) => `${PUG}/compound/cid/${cid}/PNG?image_size=${size}x${size}`,
  chemblCompound: (id: string) => `https://www.ebi.ac.uk/chembl/explore/compound/${encodeURIComponent(id)}`,
  chemblTarget: (id: string) => `https://www.ebi.ac.uk/chembl/explore/target/${encodeURIComponent(id)}`,
  chemblImage: (id: string) => `${CHEMBL}/image/${encodeURIComponent(id)}.svg`,
  pubmedArticle: (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  pubmedSearch: (term: string) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`,
};

// ---------- result types ----------

/** A PubChem compound. Numbers PubChem leaves out stay undefined. */
export interface Compound {
  cid: number;
  title?: string;
  /** Isomeric SMILES (with stereochemistry). */
  smiles: string;
  formula?: string;
  mw?: number;
  iupac?: string;
  inchikey?: string;
  xlogp?: number;
  tpsa?: number;
  hbd?: number;
  hba?: number;
  rotatable?: number;
}

/** A hit from a similarity or substructure search. */
export interface StructureHit {
  source: 'pubchem' | 'chembl';
  /** CID as text for PubChem, ChEMBL id for ChEMBL. */
  id: string;
  name?: string;
  smiles: string;
  formula?: string;
  mw?: number;
  /** Tanimoto similarity in % (ChEMBL reports it; PubChem does not). */
  similarity?: number;
}

export interface ChemblMolecule {
  chemblId: string;
  name?: string;
  /** 4 = approved drug, 1–3 = clinical phase, 0.5 = early phase, null = preclinical. */
  maxPhase?: number;
  firstApproval?: number;
  alogp?: number;
  qed?: number;
  ro5Violations?: number;
}

export interface Mechanism {
  moa: string;
  action?: string;
  targetId?: string;
}

/** Best measured potency of a compound on one target. */
export interface TargetActivity {
  targetId: string;
  target: string;
  organism?: string;
  /** pChEMBL: -log10 of the molar IC50/EC50/Ki/Kd. */
  pchembl: number;
  type: string;
  relation: string;
  value?: number;
  units?: string;
  /** Measurements with a pChEMBL value on this target among those fetched. */
  count: number;
  assay?: string;
}

export interface Paper {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi?: string;
}

export interface LiteratureResult {
  /** Total matches in PubMed. */
  count: number;
  papers: Paper[];
  /** The query as PubMed ran it. */
  term: string;
}

export interface Identification {
  /** Null when the structure is not in PubChem. */
  compound: Compound | null;
  synonyms: string[];
  /** Null when the structure is not in ChEMBL (or PubChem could not give its InChIKey). */
  chembl: ChemblMolecule | null;
}

export class DatabaseError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export interface WikidataCompound {
  item: string;
  label?: string;
  inn?: string;
  /** English Wikipedia article title. */
  article?: string;
}

export interface WikipediaLead {
  title: string;
  url: string;
  description?: string;
  extract?: string;
  wikitext: string;
}

// ---------- parsing (pure, exported for tests) ----------

export function parseWikidata(body: any): WikidataCompound | null {
  const rows: any[] = body?.results?.bindings ?? [];
  if (rows.length === 0) return null;
  const r = rows.find((x) => x.article) ?? rows[0];
  const article = str(r.article?.value);
  const label = str(r.itemLabel?.value);
  return {
    item: String(r.item?.value ?? ''),
    // An item with no English label gets its Q-number as the label.
    label: label && !/^Q\d+$/.test(label) ? label : undefined,
    inn: str(rows.find((x) => x.inn)?.inn?.value),
    article: article ? decodeURIComponent(article.split('/wiki/')[1] ?? '').replace(/_/g, ' ') || undefined : undefined,
  };
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** PubChem PropertyTable → compounds. Entries with CID 0 (structure not in PubChem) are dropped. */
export function parsePubchemProperties(body: any): Compound[] {
  const rows: any[] = body?.PropertyTable?.Properties ?? [];
  return rows
    .filter((r) => num(r?.CID))
    .map((r) => ({
      cid: num(r.CID)!,
      title: str(r.Title),
      smiles: str(r.SMILES) ?? str(r.IsomericSMILES) ?? str(r.ConnectivitySMILES) ?? str(r.CanonicalSMILES) ?? '',
      formula: str(r.MolecularFormula),
      mw: num(r.MolecularWeight),
      iupac: str(r.IUPACName),
      inchikey: str(r.InChIKey),
      xlogp: num(r.XLogP),
      tpsa: num(r.TPSA),
      hbd: num(r.HBondDonorCount),
      hba: num(r.HBondAcceptorCount),
      rotatable: num(r.RotatableBondCount),
    }));
}

export function parseChemblMolecule(m: any): ChemblMolecule {
  const p = m?.molecule_properties ?? {};
  return {
    chemblId: String(m.molecule_chembl_id),
    name: str(m.pref_name),
    maxPhase: num(m.max_phase),
    firstApproval: num(m.first_approval),
    alogp: num(p.alogp),
    qed: num(p.qed_weighted),
    ro5Violations: num(p.num_ro5_violations),
  };
}

/** Activities (sorted by pChEMBL, best first) → one row per target, best value first. */
export function summarizeActivities(activities: any[], maxTargets: number): TargetActivity[] {
  const byTarget = new Map<string, TargetActivity>();
  for (const a of activities) {
    const pchembl = num(a?.pchembl_value);
    const targetId = str(a?.target_chembl_id);
    if (pchembl === undefined || !targetId) continue;
    const seen = byTarget.get(targetId);
    if (seen) {
      seen.count++;
      continue;
    }
    byTarget.set(targetId, {
      targetId,
      target: str(a.target_pref_name) ?? targetId,
      organism: str(a.target_organism),
      pchembl,
      type: str(a.standard_type) ?? '',
      relation: str(a.standard_relation) ?? '=',
      value: num(a.standard_value),
      units: str(a.standard_units),
      count: 1,
      assay: str(a.assay_description),
    });
  }
  return [...byTarget.values()].sort((x, y) => y.pchembl - x.pchembl).slice(0, maxTargets);
}

export function parsePubmedSummary(body: any): Paper[] {
  const result = body?.result ?? {};
  const uids: string[] = result.uids ?? [];
  return uids
    .map((uid) => result[uid])
    .filter((r) => r && !r.error)
    .map((r) => ({
      pmid: String(r.uid),
      title: String(r.title ?? '').trim(),
      authors: (r.authors ?? []).map((a: any) => String(a.name)).filter(Boolean),
      journal: String(r.source ?? r.fulljournalname ?? ''),
      year: String(r.pubdate ?? '').slice(0, 4),
      doi: (r.articleids ?? []).find((x: any) => x.idtype === 'doi')?.value,
    }));
}

/** What kind of identifier a search box entry is. */
export function classifyQuery(q: string): 'cid' | 'inchikey' | 'chembl' | 'name' {
  const t = q.trim();
  if (/^(cid[:\s]*)?\d+$/i.test(t)) return 'cid';
  if (/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(t)) return 'inchikey';
  if (/^CHEMBL\d+$/i.test(t)) return 'chembl';
  return 'name';
}

// ---------- client ----------

const COMPOUND_PROPS =
  'Title,SMILES,ConnectivitySMILES,MolecularFormula,MolecularWeight,IUPACName,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount';
const HIT_PROPS = 'Title,SMILES,ConnectivitySMILES,MolecularFormula,MolecularWeight';

export class Databases {
  private ncbiQueue: Promise<unknown> = Promise.resolve();
  private lastNcbi = 0;

  constructor(
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    /** Pause between NCBI requests (tests set 0). */
    private readonly ncbiGapMs = NCBI_GAP_MS
  ) {}

  // ----- PubChem -----

  /** Compounds by name, CAS number, CID, InChIKey or ChEMBL id (looked up through ChEMBL). */
  async searchCompounds(query: string, max = 5): Promise<Compound[]> {
    const q = query.trim();
    if (!q) return [];
    const kind = classifyQuery(q);
    if (kind === 'chembl') {
      const smiles = await this.chemblSmiles(q.toUpperCase());
      return smiles ? (await this.pubchemBySmilesList(smiles)).slice(0, max) : [];
    }
    const path =
      kind === 'cid'
        ? `cid/${q.replace(/\D/g, '')}`
        : kind === 'inchikey'
          ? `inchikey/${q}`
          : `name/${encodeURIComponent(q)}`;
    const body = await this.pubchem(`${PUG}/compound/${path}/property/${COMPOUND_PROPS}/JSON`);
    return body ? parsePubchemProperties(body).slice(0, max) : [];
  }

  /** The PubChem record of a structure, or null when PubChem does not have it. */
  async compoundBySmiles(smiles: string): Promise<Compound | null> {
    return (await this.pubchemBySmilesList(smiles))[0] ?? null;
  }

  /** The PubChem record of a standard InChI ("InChI=1S/..."), or null when PubChem does not have it. */
  async compoundByInchi(inchi: string): Promise<Compound | null> {
    const body = await this.pubchem(`${PUG}/compound/inchi/property/${COMPOUND_PROPS}/JSON`, { inchi: inchi.trim() });
    return body ? (parsePubchemProperties(body)[0] ?? null) : null;
  }

  /** SMILES for a systematic (IUPAC) name from OPSIN, or null when OPSIN cannot read the name. */
  async opsinSmiles(name: string): Promise<string | null> {
    const path = `/${encodeURIComponent(name.trim())}.json`;
    const ask = async (base: string) => {
      try {
        return str((await this.request('OPSIN', base + path))?.smiles) ?? null;
      } catch (err) {
        if (err instanceof DatabaseError && err.status !== undefined && err.status >= 400 && err.status < 500) return null;
        throw err;
      }
    };
    try {
      return await ask(OPSIN);
    } catch (err) {
      // Some browsers block the direct call (CORS, blockers): go through the tsdraw server's proxy.
      if (err instanceof DatabaseError && err.status === undefined && typeof window !== 'undefined') {
        return ask(OPSIN_PROXY);
      }
      throw err;
    }
  }

  // ----- Wikidata / Wikipedia -----

  /** The Wikidata item with this InChIKey: its label, WHO INN and English Wikipedia article title. */
  async wikidataByInchiKey(inchikey: string): Promise<WikidataCompound | null> {
    if (!/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(inchikey)) return null;
    const query =
      'SELECT ?item ?itemLabel ?inn ?article WHERE { ' +
      `?item wdt:P235 "${inchikey}" . ` +
      'OPTIONAL { ?item wdt:P2275 ?inn . FILTER(LANG(?inn) = "en") } ' +
      'OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } ' +
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 5';
    const body = await this.request('Wikidata', `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`);
    return parseWikidata(body);
  }

  /**
   * The lead of an English Wikipedia article: short description, first paragraph, and the wikitext of
   * section 0 (where the Chembox/Drugbox infobox lives). Null when there is no such article.
   */
  async wikipediaLead(title: string): Promise<WikipediaLead | null> {
    const t = encodeURIComponent(title.replace(/ /g, '_'));
    let summary: any;
    try {
      summary = await this.request('Wikipedia', `${WIKIPEDIA}/api/rest_v1/page/summary/${t}`);
    } catch (err) {
      if (err instanceof DatabaseError && err.status === 404) return null;
      throw err;
    }
    if (!summary || summary.type === 'disambiguation') return null;
    const parsed = await this.request(
      'Wikipedia',
      `${WIKIPEDIA}/w/api.php?action=parse&page=${t}&prop=wikitext&section=0&redirects=1&format=json&origin=*`
    ).catch(() => null);
    return {
      title: String(summary.title ?? title),
      url: String(summary.content_urls?.desktop?.page ?? `${WIKIPEDIA}/wiki/${t}`),
      description: str(summary.description),
      extract: str(summary.extract),
      wikitext: String(parsed?.parse?.wikitext?.['*'] ?? ''),
    };
  }

  async synonyms(cid: number, max = 10): Promise<string[]> {
    const body = await this.pubchem(`${PUG}/compound/cid/${cid}/synonyms/JSON`);
    const list: unknown[] = body?.InformationList?.Information?.[0]?.Synonym ?? [];
    return list.filter((s): s is string => typeof s === 'string').slice(0, max);
  }

  /** PubChem 2D (Tanimoto) similarity search; threshold in % (PubChem accepts 70–100 in practice). */
  async pubchemSimilar(smiles: string, threshold = 90, max = 20): Promise<StructureHit[]> {
    const t = Math.round(Math.min(100, Math.max(50, threshold)));
    const body = await this.pubchem(
      `${PUG}/compound/fastsimilarity_2d/smiles/property/${HIT_PROPS}/JSON?Threshold=${t}&MaxRecords=${max}`,
      { smiles }
    );
    return pubchemHits(body);
  }

  /** PubChem substructure search: compounds that contain the drawn structure. */
  async pubchemSubstructure(smiles: string, max = 20): Promise<StructureHit[]> {
    const body = await this.pubchem(
      `${PUG}/compound/fastsubstructure/smiles/property/${HIT_PROPS}/JSON?MaxRecords=${max}`,
      { smiles }
    );
    return pubchemHits(body);
  }

  // ----- ChEMBL -----

  async chemblByInchiKey(inchikey: string): Promise<ChemblMolecule | null> {
    const body = await this.chembl(
      `/molecule.json?molecule_structures__standard_inchi_key=${encodeURIComponent(inchikey)}` +
        '&only=molecule_chembl_id,pref_name,max_phase,first_approval,molecule_properties'
    );
    const m = body?.molecules?.[0];
    return m ? parseChemblMolecule(m) : null;
  }

  async chemblById(id: string): Promise<ChemblMolecule | null> {
    const body = await this.chembl(
      `/molecule.json?molecule_chembl_id=${encodeURIComponent(id.toUpperCase())}` +
        '&only=molecule_chembl_id,pref_name,max_phase,first_approval,molecule_properties'
    );
    const m = body?.molecules?.[0];
    return m ? parseChemblMolecule(m) : null;
  }

  /** ChEMBL similarity search, from a ChEMBL id or a SMILES; threshold in % (ChEMBL needs ≥ 40). */
  async chemblSimilar(smilesOrId: string, threshold = 80, max = 20): Promise<StructureHit[]> {
    const t = Math.round(Math.min(100, Math.max(40, threshold)));
    // A "/" in the URL path breaks the ChEMBL route even when escaped: drop E/Z marks, which 2D
    // fingerprints ignore anyway.
    const query = smilesOrId.replace(/[/\\]/g, '');
    const body = await this.chembl(
      `/similarity/${encodeURIComponent(query)}/${t}.json?limit=${max}` +
        '&only=molecule_chembl_id,pref_name,similarity,molecule_structures,molecule_properties'
    );
    return (body?.molecules ?? [])
      .map(
        (m: any): StructureHit => ({
          source: 'chembl',
          id: String(m.molecule_chembl_id),
          name: str(m.pref_name),
          smiles: str(m.molecule_structures?.canonical_smiles) ?? '',
          formula: str(m.molecule_properties?.full_molformula),
          mw: num(m.molecule_properties?.full_mwt),
          similarity: num(m.similarity),
        })
      )
      .filter((h: StructureHit) => h.smiles);
  }

  /**
   * Mechanisms of action. ChEMBL often files them under a salt form (imatinib under imatinib
   * mesylate), so every form of the parent compound is asked.
   */
  async mechanisms(chemblId: string): Promise<Mechanism[]> {
    const forms = await this.chembl(`/molecule_form/${encodeURIComponent(chemblId)}.json`);
    const ids = new Set<string>([chemblId]);
    for (const f of forms?.molecule_forms ?? []) {
      if (f.molecule_chembl_id) ids.add(String(f.molecule_chembl_id));
      if (f.parent_chembl_id) ids.add(String(f.parent_chembl_id));
    }
    const body = await this.chembl(
      `/mechanism.json?molecule_chembl_id__in=${[...ids].join(',')}&only=mechanism_of_action,action_type,target_chembl_id`
    );
    const seen = new Set<string>();
    const out: Mechanism[] = [];
    for (const m of body?.mechanisms ?? []) {
      const moa = str(m.mechanism_of_action);
      if (!moa || seen.has(moa)) continue;
      seen.add(moa);
      out.push({ moa, action: str(m.action_type), targetId: str(m.target_chembl_id) });
    }
    return out;
  }

  /** Best measured potency per target (from up to 500 measurements that have a pChEMBL value). */
  async bioactivity(chemblId: string, maxTargets = 15): Promise<TargetActivity[]> {
    const body = await this.chembl(
      `/activity.json?molecule_chembl_id=${encodeURIComponent(chemblId)}&pchembl_value__isnull=false` +
        '&order_by=-pchembl_value&limit=500' +
        '&only=target_chembl_id,target_pref_name,target_organism,standard_type,standard_relation,standard_value,standard_units,pchembl_value,assay_description'
    );
    return summarizeActivities(body?.activities ?? [], maxTargets);
  }

  // ----- PubMed -----

  async pubmed(term: string, max = 10, sort: 'relevance' | 'date' = 'relevance'): Promise<LiteratureResult> {
    const t = term.trim();
    if (!t) return { count: 0, papers: [], term: '' };
    const order = sort === 'date' ? 'pub_date' : 'relevance';
    const search = await this.ncbi(
      `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=${max}&sort=${order}&term=${encodeURIComponent(t)}`
    );
    const ids: string[] = search?.esearchresult?.idlist ?? [];
    const count = Number(search?.esearchresult?.count ?? 0);
    const ran = String(search?.esearchresult?.querytranslation ?? t);
    if (ids.length === 0) return { count, papers: [], term: ran };
    const summary = await this.ncbi(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
    const papers = parsePubmedSummary(summary);
    // esummary does not keep the search order.
    papers.sort((a, b) => ids.indexOf(a.pmid) - ids.indexOf(b.pmid));
    return { count, papers, term: ran };
  }

  // ----- combined -----

  /** Everything known about a drawn structure: its PubChem record, a few names and its ChEMBL entry. */
  async identify(smiles: string): Promise<Identification> {
    const compound = await this.compoundBySmiles(smiles);
    if (!compound) return { compound: null, synonyms: [], chembl: null };
    const [synonyms, chembl] = await Promise.all([
      this.synonyms(compound.cid, 12).catch(() => []),
      compound.inchikey ? this.chemblByInchiKey(compound.inchikey).catch(() => null) : Promise.resolve(null),
    ]);
    return { compound, synonyms, chembl };
  }

  // ----- transport -----

  private async pubchemBySmilesList(smiles: string): Promise<Compound[]> {
    const body = await this.pubchem(`${PUG}/compound/smiles/property/${COMPOUND_PROPS}/JSON`, { smiles });
    return body ? parsePubchemProperties(body) : [];
  }

  private async chemblSmiles(id: string): Promise<string | null> {
    const body = await this.chembl(`/molecule.json?molecule_chembl_id=${id}&only=molecule_structures`);
    return str(body?.molecules?.[0]?.molecule_structures?.canonical_smiles) ?? null;
  }

  /** PubChem: a 404 "not found" is an empty answer (null), not an error. SMILES go in a POST body. */
  private async pubchem(url: string, form?: Record<string, string>): Promise<any | null> {
    try {
      return await this.ncbi(url, form);
    } catch (err) {
      if (err instanceof DatabaseError && err.status === 404) return null;
      throw err;
    }
  }

  private async chembl(path: string): Promise<any> {
    return this.request('ChEMBL', `${CHEMBL}${path}`);
  }

  /** NCBI requests go one at a time, at most ~3 a second. */
  private ncbi(url: string, form?: Record<string, string>): Promise<any> {
    const run = async () => {
      const wait = this.lastNcbi + this.ncbiGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastNcbi = Date.now();
      return this.request(url.startsWith(PUG) ? 'PubChem' : 'PubMed', url, form);
    };
    const next = this.ncbiQueue.then(run, run);
    this.ncbiQueue = next.catch(() => undefined);
    return next;
  }

  private async request(service: string, url: string, form?: Record<string, string>): Promise<any> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: form ? 'POST' : 'GET',
        headers: form ? { 'content-type': 'application/x-www-form-urlencoded' } : { accept: 'application/json' },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: controller?.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new DatabaseError(aborted ? `${service} did not answer in time` : `Cannot reach ${service} (check the internet connection)`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        body?.Fault?.Details?.[0] ?? body?.Fault?.Message ?? body?.error_message ?? body?.error ?? response.statusText;
      const busy = response.status === 503 || response.status === 429;
      throw new DatabaseError(
        busy ? `${service} is busy; try again in a moment` : `${service} error ${response.status}: ${detail}`,
        response.status
      );
    }
    return body;
  }
}

function pubchemHits(body: any): StructureHit[] {
  return body
    ? parsePubchemProperties(body).map((c) => ({
        source: 'pubchem' as const,
        id: String(c.cid),
        name: c.title,
        smiles: c.smiles,
        formula: c.formula,
        mw: c.mw,
      }))
    : [];
}

// =====================================================================================
// Tools for the AI assistant (Claude, ChatGPT, Grok)
// =====================================================================================

export interface AssistantTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Runs the tool; resolves to the text handed back to the model. */
  run(input: Record<string, unknown>): Promise<string>;
  /** One line for the chat panel describing the call. */
  describe(input: Record<string, unknown>): string;
}

const MAX_TOOL_TEXT = 8000;
const clip = (o: unknown) => {
  const s = JSON.stringify(o);
  return s.length > MAX_TOOL_TEXT ? s.slice(0, MAX_TOOL_TEXT) + '…(truncated)' : s;
};
const round = (n: number | undefined, d = 2) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const count = (v: unknown, def: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};

/** The database tools offered to the assistant. `drawing` gives the canvas SMILES ('' when empty). */
export function databaseTools(db: Databases, drawing: () => string): AssistantTool[] {
  const smilesOrDrawing = (input: Record<string, unknown>) => {
    const s = text(input.smiles) || drawing();
    if (!s) throw new Error('No SMILES given and the canvas is empty');
    return s;
  };
  /** A ChEMBL id from chembl_id, or found from a SMILES / the drawing through PubChem's InChIKey. */
  const chemblIdFor = async (input: Record<string, unknown>) => {
    const id = text(input.chembl_id);
    if (id) return id.toUpperCase();
    const name = text(input.name);
    const compound = name ? (await db.searchCompounds(name, 1))[0] : await db.compoundBySmiles(smilesOrDrawing(input));
    if (!compound?.inchikey) throw new Error('Compound not found in PubChem, so its ChEMBL entry cannot be looked up');
    const m = await db.chemblByInchiKey(compound.inchikey);
    if (!m) throw new Error(`${compound.title ?? 'This compound'} is not in ChEMBL`);
    return m.chemblId;
  };

  return [
    {
      name: 'search_compound',
      description:
        'Look up compounds in PubChem by name, synonym, CAS number, PubChem CID, InChIKey or ChEMBL id. Returns CID, name, isomeric SMILES, formula and key properties. Use it to get a reliable SMILES before drawing a named compound.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Name, CAS number, CID, InChIKey or ChEMBL id' } },
        required: ['query'],
      },
      describe: (i) => `Searched PubChem for “${text(i.query)}”`,
      run: async (i) => {
        const found = await db.searchCompounds(text(i.query), 5);
        return found.length ? clip(found.map(compact)) : 'No PubChem compound matches that query.';
      },
    },
    {
      name: 'identify_structure',
      description:
        'Identify a structure in PubChem and ChEMBL: CID, name, synonyms, IUPAC name, properties, ChEMBL id and clinical phase. Leave smiles empty to identify what is drawn on the canvas.',
      parameters: {
        type: 'object',
        properties: { smiles: { type: 'string', description: 'SMILES to identify; omit for the drawing' } },
      },
      describe: (i) => (text(i.smiles) ? `Identified ${text(i.smiles)} in PubChem/ChEMBL` : 'Identified the drawing in PubChem/ChEMBL'),
      run: async (i) => {
        const r = await db.identify(smilesOrDrawing(i));
        if (!r.compound) return 'This exact structure is not in PubChem (it may be new). Try find_similar.';
        return clip({ ...compact(r.compound), synonyms: r.synonyms, chembl: r.chembl ?? 'not in ChEMBL' });
      },
    },
    {
      name: 'find_similar',
      description:
        'Find compounds similar to a structure (2D Tanimoto) in PubChem or ChEMBL, or compounds containing it as a substructure (PubChem). Leave smiles empty to use the drawing.',
      parameters: {
        type: 'object',
        properties: {
          smiles: { type: 'string', description: 'Query SMILES; omit for the drawing' },
          mode: { type: 'string', enum: ['similarity', 'substructure'], description: 'Default similarity' },
          source: { type: 'string', enum: ['pubchem', 'chembl'], description: 'Default pubchem (substructure: pubchem only)' },
          threshold: { type: 'number', description: 'Similarity threshold in %, default 90 (PubChem) or 80 (ChEMBL)' },
          max_results: { type: 'number', description: 'Default 10, at most 30' },
        },
      },
      describe: (i) =>
        `${text(i.mode) === 'substructure' ? 'Substructure' : 'Similarity'} search in ${text(i.source) === 'chembl' ? 'ChEMBL' : 'PubChem'}`,
      run: async (i) => {
        const smiles = smilesOrDrawing(i);
        const max = count(i.max_results, 10, 1, 30);
        const hits =
          text(i.mode) === 'substructure'
            ? await db.pubchemSubstructure(smiles, max)
            : text(i.source) === 'chembl'
              ? await db.chemblSimilar(smiles, count(i.threshold, 80, 40, 100), max)
              : await db.pubchemSimilar(smiles, count(i.threshold, 90, 50, 100), max);
        return hits.length ? clip(hits.map((h) => ({ ...h, mw: round(h.mw) }))) : 'No hits.';
      },
    },
    {
      name: 'search_pubmed',
      description:
        'Search PubMed for papers. Use PubMed query syntax, e.g. "imatinib AND resistance", "osimertinib[tiab] AND 2023:2025[dp]". Returns PMID, title, authors, journal, year and DOI. Cite PMIDs in your answer.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'PubMed query' },
          max_results: { type: 'number', description: 'Default 8, at most 20' },
          sort: { type: 'string', enum: ['relevance', 'date'], description: 'Default relevance' },
        },
        required: ['query'],
      },
      describe: (i) => `Searched PubMed for “${text(i.query)}”`,
      run: async (i) => {
        const r = await db.pubmed(text(i.query), count(i.max_results, 8, 1, 20), text(i.sort) === 'date' ? 'date' : 'relevance');
        return clip({ total: r.count, papers: r.papers.map((p) => ({ ...p, authors: shortAuthors(p.authors) })) });
      },
    },
    {
      name: 'get_bioactivity',
      description:
        'ChEMBL bioactivity of a compound: mechanism of action, clinical phase, and its most potent measured targets (best pChEMBL per target, with IC50/Ki/etc.). Give chembl_id, or name, or smiles; with none, uses the drawing.',
      parameters: {
        type: 'object',
        properties: {
          chembl_id: { type: 'string' },
          name: { type: 'string' },
          smiles: { type: 'string' },
          max_targets: { type: 'number', description: 'Default 10, at most 25' },
        },
      },
      describe: (i) => `Looked up ChEMBL bioactivity${text(i.chembl_id) || text(i.name) ? ` for ${text(i.chembl_id) || text(i.name)}` : ''}`,
      run: async (i) => {
        const id = await chemblIdFor(i);
        const [molecule, mechanisms, targets] = await Promise.all([
          db.chemblById(id),
          db.mechanisms(id).catch(() => []),
          db.bioactivity(id, count(i.max_targets, 10, 1, 25)),
        ]);
        return clip({
          molecule,
          mechanisms,
          targets: targets.map(({ assay: _assay, ...t }) => t),
        });
      },
    },
  ];
}

function compact(c: Compound) {
  return { ...c, mw: round(c.mw), xlogp: round(c.xlogp, 1) };
}

export function shortAuthors(authors: string[]): string {
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')} et al.`;
}
