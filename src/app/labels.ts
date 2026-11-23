import { periodicTable } from '../core/Element';

/**
 * Text labels for atoms (functional groups such as NO2, COOH, CF3, OMe).
 *
 * A label is split into tokens: an element symbol or a common abbreviation, each with an
 * optional count. Parenthesised groups with a count, e.g. C(CH3)3, are also understood.
 */

/** Abbreviations expanded when counting atoms. Checked before element symbols. */
const ABBREVIATIONS: Record<string, Record<string, number>> = {
  Me: { C: 1, H: 3 },
  Et: { C: 2, H: 5 },
  Pr: { C: 3, H: 7 },
  iPr: { C: 3, H: 7 },
  Bu: { C: 4, H: 9 },
  tBu: { C: 4, H: 9 },
  Ph: { C: 6, H: 5 },
  Bn: { C: 7, H: 7 },
  Ac: { C: 2, H: 3, O: 1 },
  Boc: { C: 5, H: 9, O: 2 },
  Cbz: { C: 8, H: 7, O: 2 },
  Ts: { C: 7, H: 7, O: 2, S: 1 },
  Ms: { C: 1, H: 3, O: 2, S: 1 },
  Tf: { C: 1, F: 3, O: 2, S: 1 },
};

const ABBREVIATION_KEYS = Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length);

interface Token {
  /** Element symbol or abbreviation. */
  name: string;
  count: number;
  /** Text as written, e.g. "O2". */
  text: string;
}

/** Split a label into element/abbreviation tokens; null if it contains anything else. */
function tokenize(label: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < label.length) {
    let name: string | undefined = ABBREVIATION_KEYS.find((k) => label.startsWith(k, i));
    if (!name) {
      const two = label.slice(i, i + 2);
      const one = label.slice(i, i + 1);
      if (two.length === 2 && /^[A-Z][a-z]$/.test(two) && periodicTable.getBySymbol(two)) name = two;
      else if (/^[A-Z]$/.test(one) && periodicTable.getBySymbol(one)) name = one;
    }
    if (!name) return null;
    let j = i + name.length;
    while (j < label.length && /[0-9]/.test(label[j])) j++;
    const digits = label.slice(i + name.length, j);
    tokens.push({ name, count: digits ? Number(digits) : 1, text: label.slice(i, j) });
    i = j;
  }
  return tokens;
}

function addCounts(into: Map<string, number>, from: Map<string, number>, times: number): void {
  for (const [k, v] of from) into.set(k, (into.get(k) ?? 0) + v * times);
}

/** Recursive count over a label that may contain (...)n groups. */
function countGroup(label: string): Map<string, number> | null {
  const counts = new Map<string, number>();
  let i = 0;
  let plain = '';
  const flush = (): boolean => {
    if (!plain) return true;
    const tokens = tokenize(plain);
    plain = '';
    if (!tokens) return false;
    for (const t of tokens) {
      const abbr = ABBREVIATIONS[t.name];
      if (abbr) addCounts(counts, new Map(Object.entries(abbr)), t.count);
      else counts.set(t.name, (counts.get(t.name) ?? 0) + t.count);
    }
    return true;
  };
  while (i < label.length) {
    const ch = label[i];
    if (ch === '(') {
      if (!flush()) return null;
      let depth = 1;
      let j = i + 1;
      while (j < label.length && depth > 0) {
        if (label[j] === '(') depth++;
        else if (label[j] === ')') depth--;
        j++;
      }
      if (depth !== 0) return null;
      const inner = countGroup(label.slice(i + 1, j - 1));
      if (!inner) return null;
      let k = j;
      while (k < label.length && /[0-9]/.test(label[k])) k++;
      addCounts(counts, inner, k > j ? Number(label.slice(j, k)) : 1);
      i = k;
    } else if (ch === ')') {
      return null;
    } else {
      plain += ch;
      i++;
    }
  }
  if (!flush()) return null;
  return counts;
}

/**
 * Atom counts for a label, e.g. NO2 -> {N:1, O:2}, COOH -> {C:1, O:2, H:1}, OMe -> {O:1, C:1, H:3}.
 * Returns null when the label is not a recognisable formula (free text).
 */
export function labelAtomCounts(label: string): Map<string, number> | null {
  const text = label.trim();
  if (!text) return null;
  return countGroup(text);
}

/**
 * Element used for the atom underneath a label: the first element written (N for NO2, C for COOH,
 * O for OMe). Abbreviations at the start count as carbon. Falls back to carbon.
 */
export function labelAnchorElement(label: string): string {
  const text = label.trim().replace(/^\(/, '');
  const tokens = tokenize(text.match(/^[A-Za-z0-9]+/)?.[0] ?? '');
  const first = tokens?.[0];
  if (!first) {
    const m = text.match(/^[A-Z][a-z]?/);
    return m && periodicTable.getBySymbol(m[0]) ? m[0] : 'C';
  }
  return ABBREVIATIONS[first.name] ? 'C' : first.name;
}

/**
 * The label written the other way round, for a group whose bond comes from the right:
 * NO2 -> O2N, COOH -> HOOC, CF3 -> F3C, OMe -> MeO. Labels that cannot be split into tokens
 * (free text, parentheses) are returned unchanged.
 */
export function reverseLabel(label: string): string {
  const tokens = tokenize(label);
  if (!tokens || tokens.length < 2) return label;
  return tokens.map((t) => t.text).reverse().join('');
}

/** Length of the first token's text (the part drawn centred on the atom). */
export function leadingTokenLength(label: string): number {
  const tokens = tokenize(label);
  if (tokens?.length) return tokens[0].name.length;
  const m = label.match(/^[A-Z][a-z]?/);
  return m ? m[0].length : 1;
}

/** Length of the last token's element/abbreviation (the part drawn on the atom when flipped). */
export function trailingTokenLength(label: string): number {
  const tokens = tokenize(label);
  if (tokens?.length) {
    const last = tokens[tokens.length - 1];
    return last.text.length; // the count digits of the last token are part of it, e.g. none for O2N
  }
  return 1;
}
