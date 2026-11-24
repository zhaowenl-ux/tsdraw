/**
 * Smart paste: turn whatever chemistry text is on the clipboard into structures.
 *
 * Read locally (no network): MOL/SDF files and bare CTABs, SMILES.
 * Looked up online: InChI and InChIKey, CAS numbers, PubChem CIDs and ChEMBL ids, and any
 * name – trivial, brand/drug ("Tylenol"), generic, abbreviation or systematic IUPAC – through
 * PubChem, with OPSIN as a fallback for systematic names PubChem does not know.
 *
 * Several lines (a column copied from a spreadsheet, a list of names, a .smi file) give one
 * structure per line.
 */
import { parseMolfile, parseSmiles, ParsedDocument } from './import';

export type PasteKind = 'molfile' | 'smiles' | 'inchi' | 'inchikey' | 'cas' | 'cid' | 'chembl' | 'name';

/** One way to read a piece of pasted text; a line can have several, tried in order. */
export interface PasteAttempt {
  kind: PasteKind;
  query: string;
}

/** One pasted structure-to-be: the text it came from and the ways to read it. */
export interface PasteItem {
  text: string;
  attempts: PasteAttempt[];
}

/** A structure found online. */
export interface LookupHit {
  smiles: string;
  /** Name to show ("Aspirin"). */
  title?: string;
  /** Where it came from ("PubChem CID 2244", "OPSIN"). */
  source: string;
}

/** The online lookups smart paste needs (Databases provides them; tests fake them). */
export interface StructureLookup {
  /** Name, CAS number, CID, InChIKey or ChEMBL id. */
  searchCompounds(query: string, max?: number): Promise<Array<{ cid: number; title?: string; smiles: string }>>;
  compoundByInchi(inchi: string): Promise<{ cid: number; title?: string; smiles: string } | null>;
  opsinSmiles(name: string): Promise<string | null>;
}

export interface PastedStructure {
  doc: ParsedDocument;
  /** The text it came from. */
  text: string;
  kind: PasteKind;
  title?: string;
  source?: string;
}

export interface PasteResult {
  structures: PastedStructure[];
  /** Lines that gave no structure, with the reason. */
  failed: Array<{ text: string; reason: string }>;
  /** Lines left out because there were more than MAX_PASTE_ITEMS. */
  skipped: number;
}

export const MAX_PASTE_ITEMS = 25;
const MAX_NAME_LENGTH = 300;

// =====================================================================================
// Recognising what was pasted (pure)
// =====================================================================================

const MOLFILE = /M {2}END|V2000|V3000|M {2}V30 /;
const INCHIKEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const CAS = /^(\d{2,7})-(\d{2})-(\d)$/;
/** Column headings of a copied table ("SMILES", "Name", "CAS No."), not structures. */
const HEADING = /^(smiles|canonical smiles|isomeric smiles|name|names|compound|compound name|cas|cas no\.?|cas number|cas rn|inchi|inchikey|id|cid|structure|title|iupac name|mw|formula)$/i;

/** A CAS registry number with a correct check digit ("50-78-2"). */
export function isCasNumber(text: string): boolean {
  const m = text.trim().match(CAS);
  if (!m) return false;
  const digits = (m[1] + m[2]).split('').reverse();
  const sum = digits.reduce((s, d, i) => s + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}

/** Whether `text` is a SMILES the reader accepts. */
export function isSmiles(text: string): boolean {
  if (!text || /\s/.test(text)) return false;
  try {
    parseSmiles(text, 1);
    return true;
  } catch {
    return false;
  }
}

/**
 * A SMILES that could also be a word or abbreviation ("CO", "BOC", "NO"): only letters, no bonds,
 * branches, rings or brackets. All-carbon chains ("CCCC") count as SMILES.
 */
function wordLikeSmiles(text: string): boolean {
  return /^[A-Z][A-Za-z]*$/.test(text) && !/^C+$/.test(text) && text.length <= 6;
}

/** Typographic characters that names copied from papers and web pages carry. */
function normalise(text: string): string {
  return text
    .replace(/[‐-―−]/g, '-') // hyphens, dashes, minus
    .replace(/[′’‘]/g, "'") // primes and curly quotes
    .replace(/″/g, "''")
    .replace(/[   ]/g, ' ')
    .replace(/[​﻿]/g, '')
    .trim();
}

/** "SMILES: CCO", "CAS No. 50-78-2", "CID 2244" ... → the identifier, with the kind the label names. */
function stripLabel(line: string): { text: string; hint?: PasteKind } {
  const m = line.match(
    /^(smiles|canonical smiles|isomeric smiles|cas(?:\s*(?:no\.?|number|rn|reg\.?\s*no\.?))?|inchikey|inchi key|inchi|name|iupac name|compound)(?:\s*[:=#]\s*|\s+)(.+)$/i
  );
  if (!m) return { text: line };
  const label = m[1].toLowerCase();
  const text = m[2].trim();
  if (label.includes('smiles')) return { text, hint: 'smiles' };
  if (label.startsWith('cas')) return { text, hint: 'cas' };
  if (label.startsWith('inchi')) return { text };
  return { text, hint: 'name' };
}

/** Ways to read one line of pasted text, most likely first. */
export function classifyLine(raw: string): PasteAttempt[] {
  const line = normalise(raw);
  if (HEADING.test(line)) return [];
  // InChI first: "InChI=1S/..." would otherwise read as a label.
  const { text, hint } = /^InChI=/i.test(line) ? { text: line, hint: undefined } : stripLabel(line);
  if (!text) return [];
  if (/^InChI=/i.test(text)) return [{ kind: 'inchi', query: 'InChI=' + text.slice(6).split(/\s+/)[0] }];
  if (INCHIKEY.test(text)) return [{ kind: 'inchikey', query: text }];
  if (isCasNumber(text)) return [{ kind: 'cas', query: text }];
  if (/^CHEMBL\d+$/i.test(text)) return [{ kind: 'chembl', query: text.toUpperCase() }];
  if (/^(?:pubchem\s*)?cid[:\s#]*\d+$/i.test(text)) return [{ kind: 'cid', query: text.replace(/\D/g, '') }];
  if (hint === 'cas' && CAS.test(text)) return [{ kind: 'cas', query: text }];

  const name: PasteAttempt = { kind: 'name', query: text };
  const tokens = text.split(/\s+/);
  const first = tokens[0];
  if (hint === 'smiles') return [{ kind: 'smiles', query: first }];
  if (hint === 'name') return [name];

  if (tokens.length === 1) {
    // A single word that reads as SMILES is SMILES ("CCO", "CO" = methanol); "name: CO" forces a name.
    return isSmiles(first) ? [{ kind: 'smiles', query: first }] : [name];
  }
  // Several words: a SMILES followed by a name or id (as in .smi files), or a name with spaces.
  if (isSmiles(first) && !wordLikeSmiles(first) && !/^[a-z]+$/.test(first)) return [{ kind: 'smiles', query: first }];
  if (text.length > MAX_NAME_LENGTH) return [];
  return isSmiles(first) ? [name, { kind: 'smiles', query: first }] : [name];
}

/** Split clipboard text into the structures it holds. */
export function classifyPaste(text: string): PasteItem[] {
  const clean = text.replace(/\r/g, '');
  if (!clean.trim()) return [];
  if (MOLFILE.test(clean)) {
    // An SD file: one MOL record per $$$$.
    const records = clean.split(/^\$\$\$\$\s*$/m).filter((r) => MOLFILE.test(r));
    return records.map((r) => ({ text: r, attempts: [{ kind: 'molfile' as const, query: r }] }));
  }
  const items: PasteItem[] = [];
  for (const raw of clean.split('\n')) {
    // A row copied from a spreadsheet: the first cell that reads as something.
    const cells = raw.split('\t').map((c) => c.trim()).filter(Boolean);
    for (const cell of cells) {
      const attempts = classifyLine(cell);
      if (attempts.length) {
        items.push({ text: cell, attempts });
        break;
      }
    }
  }
  return items;
}

/** Whether pasting this text needs the internet (some line is not a MOL file or SMILES). */
export function needsLookup(items: PasteItem[]): boolean {
  return items.some((i) => i.attempts[0].kind !== 'molfile' && i.attempts[0].kind !== 'smiles');
}

// =====================================================================================
// Resolving (async)
// =====================================================================================

async function lookup(attempt: PasteAttempt, db: StructureLookup): Promise<LookupHit | null> {
  const fromPubchem = (c: { cid: number; title?: string; smiles: string } | null | undefined): LookupHit | null =>
    c && c.smiles ? { smiles: c.smiles, title: c.title, source: `PubChem CID ${c.cid}` } : null;
  switch (attempt.kind) {
    case 'inchi':
      return fromPubchem(await db.compoundByInchi(attempt.query));
    case 'inchikey':
    case 'cas':
    case 'cid':
    case 'chembl':
      return fromPubchem((await db.searchCompounds(attempt.query, 1))[0]);
    case 'name': {
      const hit = fromPubchem((await db.searchCompounds(attempt.query, 1))[0]);
      if (hit) return hit;
      const smiles = await db.opsinSmiles(attempt.query);
      return smiles ? { smiles, source: 'OPSIN' } : null;
    }
    default:
      return null;
  }
}

/** Read one item: try each way in order; the first that gives a structure wins. */
export async function resolveItem(item: PasteItem, bondLength: number, db: StructureLookup | null): Promise<PastedStructure> {
  let reason = 'not recognised as a structure, name or identifier';
  for (const attempt of item.attempts) {
    try {
      if (attempt.kind === 'molfile') return { doc: parseMolfile(attempt.query, bondLength), text: item.text, kind: 'molfile' };
      if (attempt.kind === 'smiles') return { doc: parseSmiles(attempt.query, bondLength), text: item.text, kind: 'smiles' };
      if (!db) {
        reason = 'needs an online lookup';
        continue;
      }
      const hit = await lookup(attempt, db);
      if (!hit) {
        reason = `not found (${describeKind(attempt.kind)})`;
        continue;
      }
      return { doc: parseSmiles(hit.smiles, bondLength), text: item.text, kind: attempt.kind, title: hit.title, source: hit.source };
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(reason);
}

/** Read all pasted text. Lookups run one after another (NCBI allows ~3 requests a second). */
export async function resolvePaste(
  text: string,
  bondLength: number,
  db: StructureLookup | null,
  onProgress?: (done: number, total: number, item: PasteItem) => void
): Promise<PasteResult> {
  const all = classifyPaste(text);
  const items = all.slice(0, MAX_PASTE_ITEMS);
  const result: PasteResult = { structures: [], failed: [], skipped: all.length - items.length };
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length, items[i]);
    try {
      result.structures.push(await resolveItem(items[i], bondLength, db));
    } catch (err) {
      result.failed.push({ text: items[i].text, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

export function describeKind(kind: PasteKind): string {
  return {
    molfile: 'MOL file',
    smiles: 'SMILES',
    inchi: 'InChI',
    inchikey: 'InChIKey',
    cas: 'CAS number',
    cid: 'PubChem CID',
    chembl: 'ChEMBL id',
    name: 'name',
  }[kind];
}
