/**
 * Names for a drawn structure, from PubChem, Wikidata and Wikipedia:
 *   PubChem   — common name (title), IUPAC name, CAS number, synonyms, research codes.
 *   Wikidata  — the WHO INN (generic drug name) and the matching Wikipedia article (matched by InChIKey).
 *   Wikipedia — trade (brand) names, other names and the IUPAC name from the Chembox/Drugbox infobox,
 *               plus the article's short description.
 * Structures PubChem does not know get no names here (the caller can offer the AI assistant instead).
 */
import { isCasNumber } from './pasteResolve';

/** What naming needs from the database client (Databases provides it; tests fake it). */
export interface NameSources {
  compoundBySmiles(smiles: string): Promise<{
    cid: number;
    title?: string;
    iupac?: string;
    inchikey?: string;
    formula?: string;
    mw?: number;
    smiles: string;
  } | null>;
  synonyms(cid: number, max?: number): Promise<string[]>;
  wikidataByInchiKey(inchikey: string): Promise<{ label?: string; inn?: string; article?: string } | null>;
  wikipediaLead(title: string): Promise<{
    title: string;
    url: string;
    description?: string;
    extract?: string;
    wikitext: string;
  } | null>;
}

export interface StructureNames {
  smiles: string;
  /** Whether PubChem has the structure. */
  found: boolean;
  /** Common or generic name (PubChem title / Wikidata label). */
  common?: string;
  iupac?: string;
  /** WHO International Nonproprietary Name, for drugs. */
  inn?: string;
  /** Trade names from the Wikipedia infobox. */
  brands: string[];
  /** Other names and synonyms (no codes, registry numbers or long systematic names). */
  others: string[];
  /** Research / development codes (STI-571, CGP-57148). */
  codes: string[];
  cas?: string;
  cid?: number;
  inchikey?: string;
  formula?: string;
  mw?: number;
  wikipedia?: { title: string; url: string; description?: string; extract?: string };
  /** Lookups that failed (e.g. "Wikipedia: cannot reach"), shown as a note. */
  problems: string[];
}

// =====================================================================================
// Pure helpers (exported for tests)
// =====================================================================================

/** Plain text from a piece of wikitext: links, templates, refs and HTML removed. */
export function wikiPlain(text: string): string {
  let t = text
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n');
  // Templates: {{nowrap|x}}, {{ubl|a|b}}, {{lang|..}} keep their text arguments; others go.
  for (let i = 0; i < 10 && /\{\{[^{}]*\}\}/.test(t); i++) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
      const parts = inner.split('|').map((p) => p.trim());
      const name = parts[0].toLowerCase();
      if (/^(nowrap|ubl|unbulleted list|plainlist|flatlist|hlist|small|chem name|nobr)$/.test(name))
        return parts.slice(1).filter((p) => !p.includes('=')).join('\n');
      if (name === 'lang' && parts.length >= 3) return parts[2];
      return '';
    });
  }
  return t
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** The value of an infobox field (`| tradename = ...`), as plain text, or ''. */
export function infoboxField(wikitext: string, ...names: string[]): string {
  // Comments can sit on the same line as the next field ("<!-- Data -->| IUPAC_name = ...").
  wikitext = wikitext.replace(/<!--[\s\S]*?-->/g, '\n');
  for (const name of names) {
    const re = new RegExp(`^\\s*\\|\\s*${name}\\s*=([\\s\\S]*?)(?=^\\s*\\||^\\s*\\}\\})`, 'im');
    const m = wikitext.match(re);
    if (m) {
      const value = wikiPlain(m[1]);
      if (value) return value;
    }
  }
  return '';
}

/** Split a list of names written with commas, semicolons or line breaks. Keeps commas inside IUPAC locants (1,2-). */
export function splitNames(text: string): string[] {
  return text
    .split(/\n|;|,(?!\d)(?=\s*\D)/)
    .map((s) => s.replace(/^[\s*•·-]+|[\s.]+$/g, '').trim())
    .filter((s) => s.length > 1 && s.length < 80 && !/^(others?|and others|etc)$/i.test(s));
}

const REGISTRY = /^(CHEMBL|SCHEMBL|DTXSID|DTXCID|NSC[\s-]?\d|MFCD|CHEBI|BDBM|AKOS|ZINC|HMS\d|UNII|SR-|KS-|AC-|BRD-|CCG-|DB\d|D\d{5}|C\d{5}|Q\d|EINECS|EC\s|HSDB|BSPBio|SPBio|Prestwick|NCGC|SMR\d|MLS\d|CAS-|Tox21|cid_|s\d{4}|BCCRIS|CCRIS|WLN|NCI\d|Spectrum\d|Pharmakon|Lopac|IDI1_|Opera_ID|EU-\d|HY-\d|CS-\d|SW\d|AB\d{5}|FT-\d|MolPort|STK\d|STL\d)/i;

/** Sort PubChem synonyms into CAS number, research codes and other names. */
export function classifySynonyms(
  synonyms: string[],
  exclude: string[] = []
): { cas?: string; codes: string[]; others: string[]; brands: string[] } {
  const seen = new Set(exclude.filter(Boolean).map((s) => s.toLowerCase()));
  let cas: string | undefined;
  const codes: string[] = [];
  const others: string[] = [];
  const brands: string[] = [];
  for (const raw of synonyms) {
    let s = raw.trim();
    if (!s) continue;
    if (isCasNumber(s)) {
      cas ??= s;
      continue;
    }
    // KEGG marks trade names "(TN)"; "(INN)", "(USAN)"... mark a name already given.
    // "Gleevec(TM)", "Gleevec®" are trade names too.
    const tn = s.match(/^(.+?)\s*(?:\((?:TN|TM)\)|™|®)$/i);
    if (tn) {
      const b = tn[1];
      if (!brands.some((x) => x.toLowerCase() === b.toLowerCase()) && brands.length < 8) brands.push(b);
      continue;
    }
    // "Imatinib (INN)", "IMATINIB [USAN]": the name with a pharmacopoeia mark.
    s = s.replace(/\s*[([](INN|USAN|JAN|BAN|USP|NF|DCF|DCIT|INN-?\w*|VAN|MI|WHO-DD|II|EMA EPAR|ORANGE BOOK|MART\.?|HSDB|EP MONOGRAPH)[)\]]$/i, '');
    if (s.length <= 3 || /^\d[a-z0-9]{3}$/i.test(s) || /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(s)) continue; // short, PDB ids, ATC codes
    // Ids with prefixes (RefChem:...), CAS with notes, isotope-labelled forms, parenthesised codes.
    if (/:/.test(s) || /^\d{2,7}-\d{2}-\d\b/.test(s) || /-(d\d+|CD3|13C\d*|15N\d*)$/i.test(s) || /\([A-Z]{1,6}[\s-]?\d{2,}\w*\)$/.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (REGISTRY.test(s) || /^\d{3}-\d{3}-\d$/.test(s) || s.includes('_')) continue;
    // UNII-like (10 characters, letters and digits), InChIKeys, hashes.
    if (/^[A-Z0-9]{8,12}$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s) && !/^[A-Z]{1,5}-?\d+[A-Z]?$/.test(s)) continue;
    if (/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(s)) continue;
    // Development codes are capitals and digits (STI571, CGP-57148B); "Midol 200" is a brand and dose.
    if (/^[A-Z]{1,6}[\s-]?\d{2,7}[A-Z]?$/.test(s)) {
      if (codes.length < 6) codes.push(s);
      continue;
    }
    // Long systematic names (the IUPAC name is shown on its own).
    if (s.length > 45 && /[\d\]()]/.test(s)) continue;
    if (others.length < 12) others.push(s);
  }
  // Variants of a name already shown: "Imatinib, 21", "Imatinib (Standard)", "Imatinib - Gleevec".
  const main = exclude.filter(Boolean).map((e) => e.toLowerCase());
  const variant = (x: string) => {
    const l = x.toLowerCase();
    return main.some((m) => m.length > 2 && l.startsWith(m) && /^\s*[,([-]/.test(l.slice(m.length)));
  };
  const isBrand = (x: string) => brands.some((b) => b.toLowerCase() === x.toLowerCase());
  return { cas, codes, others: others.filter((o) => !isBrand(o) && !variant(o)), brands };
}

const uniq = (list: string[], exclude: string[] = []): string[] => {
  const seen = new Set(exclude.filter(Boolean).map((s) => s.toLowerCase()));
  return list.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// =====================================================================================
// Looking it up
// =====================================================================================

export async function nameStructure(smiles: string, db: NameSources): Promise<StructureNames> {
  const names: StructureNames = { smiles, found: false, brands: [], others: [], codes: [], problems: [] };
  const compound = await db.compoundBySmiles(smiles);
  if (!compound) return names;
  names.found = true;
  names.cid = compound.cid;
  names.common = compound.title;
  names.iupac = compound.iupac;
  names.inchikey = compound.inchikey;
  names.formula = compound.formula;
  names.mw = compound.mw;

  const note = (source: string) => (err: unknown) => {
    names.problems.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  };
  const [synonyms, wikidata] = await Promise.all([
    db.synonyms(compound.cid, 80).catch(note('PubChem synonyms')),
    compound.inchikey ? db.wikidataByInchiKey(compound.inchikey).catch(note('Wikidata')) : Promise.resolve(null),
  ]);
  names.inn = wikidata?.inn;

  // Wikipedia: the article Wikidata links to; else an article titled like the PubChem name that has a chemical infobox.
  let lead = wikidata?.article ? await db.wikipediaLead(wikidata.article).catch(note('Wikipedia')) : null;
  if (!lead && !wikidata?.article && compound.title) {
    const guess = await db.wikipediaLead(compound.title).catch(note('Wikipedia'));
    if (guess && /\{\{\s*(chembox|drugbox|infobox drug)/i.test(guess.wikitext)) lead = guess;
  }
  if (lead) {
    names.wikipedia = { title: lead.title, url: lead.url, description: lead.description, extract: lead.extract };
    names.brands = splitNames(infoboxField(lead.wikitext, 'tradename', 'trade_name', 'TradeName'));
    const wikiIupac = infoboxField(lead.wikitext, 'IUPAC_name', 'IUPACName', 'PIN', 'SystematicName');
    if (!names.iupac && wikiIupac) names.iupac = wikiIupac;
    const wikiOthers = splitNames(infoboxField(lead.wikitext, 'OtherNames', 'synonyms', 'other_names'));
    names.others.push(...wikiOthers);
  }
  // PubChem titles can carry stereo or salt notes ("Ibuprofen, (+-)-"); the Wikipedia title is the everyday name.
  const pubchemTitle = names.common;
  if (lead?.title && (!pubchemTitle || /[,()[\]]/.test(pubchemTitle))) names.common = lead.title;
  if (!names.common) names.common = wikidata?.label;
  if (pubchemTitle && pubchemTitle !== names.common) names.others.unshift(pubchemTitle);

  const sorted = classifySynonyms(synonyms ?? [], [names.common ?? '', names.iupac ?? '', names.inn ?? '', ...names.brands]);
  names.cas = sorted.cas;
  names.brands = uniq([...names.brands, ...sorted.brands]);
  names.codes = sorted.codes;
  names.others = uniq([...names.others, ...sorted.others], [names.common ?? '', names.iupac ?? '', names.inn ?? '', ...names.brands]).slice(0, 12);
  return names;
}
