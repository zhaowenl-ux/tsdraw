import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Databases,
  DatabaseError,
  classifyQuery,
  databaseTools,
  parsePubchemProperties,
  summarizeActivities,
} from '../src/app/databases';
import { ChemistryChat, ChatEvent } from '../src/app/claude';

/** Real responses saved from PubChem, PubMed and ChEMBL (tests/fixtures/db). */
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'db', name), 'utf-8'));

interface Call {
  url: string;
  method: string;
  body: string;
}

/** A fake fetch answering by URL pattern; records every call. */
function fakeFetch(routes: Array<[RegExp, unknown, number?]>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: String(init.body ?? '') });
    const route = routes.find(([re]) => re.test(url));
    if (!route) return new Response(JSON.stringify({ error: 'no route' }), { status: 500 });
    return new Response(JSON.stringify(route[1]), { status: route[2] ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls, db: new Databases(fetchFn, 0) };
}

describe('parsing', () => {
  it('reads PubChem properties, with the 2025 SMILES property names', () => {
    const [c] = parsePubchemProperties(fixture('pc_name.json'));
    expect(c.cid).toBe(5291);
    expect(c.title).toBe('Imatinib');
    expect(c.smiles).toContain('NC4=NC=CC(=N4)');
    expect(c.mw).toBeCloseTo(493.6);
    expect(c.xlogp).toBe(3.5);
    expect(c.inchikey).toBe('KTUFNOKKBVMGRW-UHFFFAOYSA-N');
  });

  it('keeps stereochemistry: SMILES is the isomeric one', () => {
    const [c] = parsePubchemProperties(fixture('pc_name_multi.json'));
    expect(c.smiles).toContain('@');
  });

  it('treats CID 0 (structure not in PubChem) as no result', () => {
    expect(parsePubchemProperties(fixture('pc_smiles_new.json'))).toEqual([]);
  });

  it('classifies search box entries', () => {
    expect(classifyQuery('2244')).toBe('cid');
    expect(classifyQuery('CID 2244')).toBe('cid');
    expect(classifyQuery('BSYNRYMUTXBXSQ-UHFFFAOYSA-N')).toBe('inchikey');
    expect(classifyQuery('chembl25')).toBe('chembl');
    expect(classifyQuery('50-78-2')).toBe('name'); // CAS numbers are PubChem names
    expect(classifyQuery('aspirin')).toBe('name');
  });

  it('keeps the best activity per target, most potent first', () => {
    const acts = [
      { target_chembl_id: 'T1', target_pref_name: 'ABL1', pchembl_value: '8.0', standard_type: 'IC50', standard_value: '10', standard_units: 'nM' },
      { target_chembl_id: 'T2', target_pref_name: 'KIT', pchembl_value: '7.5', standard_type: 'Ki' },
      { target_chembl_id: 'T1', target_pref_name: 'ABL1', pchembl_value: '6.0' },
      { target_chembl_id: 'T3', pchembl_value: null },
    ];
    const s = summarizeActivities(acts, 10);
    expect(s.map((t) => t.target)).toEqual(['ABL1', 'KIT']);
    expect(s[0]).toMatchObject({ pchembl: 8, count: 2, value: 10, units: 'nM' });
  });
});

describe('PubChem', () => {
  it('searches by name', async () => {
    const { db, calls } = fakeFetch([[/name\/imatinib\/property/, fixture('pc_name.json')]]);
    const hits = await db.searchCompounds('imatinib');
    expect(hits[0].cid).toBe(5291);
    expect(calls[0].method).toBe('GET');
  });

  it('searches by CID and InChIKey through the right PubChem namespace', async () => {
    const { db, calls } = fakeFetch([[/pubchem/, fixture('pc_smiles.json')]]);
    await db.searchCompounds('CID 2244');
    await db.searchCompounds('BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    expect(calls[0].url).toContain('/compound/cid/2244/property/');
    expect(calls[1].url).toContain('/compound/inchikey/BSYNRYMUTXBXSQ-UHFFFAOYSA-N/property/');
  });

  it('returns nothing (not an error) when PubChem has no match', async () => {
    const { db } = fakeFetch([[/pubchem/, fixture('pc_name_missing.json'), 404]]);
    expect(await db.searchCompounds('zzqqxx')).toEqual([]);
  });

  it('sends SMILES in a POST body, so #, / and + survive', async () => {
    const { db, calls } = fakeFetch([[/compound\/smiles\/property/, fixture('pc_smiles.json')]]);
    const c = await db.compoundBySmiles('C#C/C=C/[NH3+]');
    expect(c?.title).toBe('Aspirin');
    expect(calls[0].method).toBe('POST');
    expect(new URLSearchParams(calls[0].body).get('smiles')).toBe('C#C/C=C/[NH3+]');
    expect(calls[0].url).not.toContain('C#C');
  });

  it('runs similarity and substructure searches', async () => {
    const { db, calls } = fakeFetch([
      [/fastsimilarity_2d/, fixture('pc_similar.json')],
      [/fastsubstructure/, fixture('pc_substructure.json')],
    ]);
    const sim = await db.pubchemSimilar('CC(=O)Oc1ccccc1C(=O)O', 85, 5);
    expect(sim.map((h) => h.name)).toContain('Salsalate');
    expect(sim[0]).toMatchObject({ source: 'pubchem', id: '2244' });
    expect(calls[0].url).toContain('Threshold=85');
    expect(calls[0].url).toContain('MaxRecords=5');
    const sub = await db.pubchemSubstructure('c1ccc2ncccc2c1', 5);
    expect(sub.length).toBeGreaterThan(0);
  });
});

describe('ChEMBL', () => {
  it('finds mechanisms filed under a salt form of the compound', async () => {
    const { db, calls } = fakeFetch([
      [/molecule_form\/CHEMBL941/, fixture('ch_forms.json')],
      [/mechanism\.json/, fixture('ch_mechanism_forms.json')],
    ]);
    const m = await db.mechanisms('CHEMBL941');
    expect(m.map((x) => x.moa)).toContain('Bcr/Abl fusion protein inhibitor');
    expect(m).toHaveLength(4);
    expect(calls[1].url).toContain('CHEMBL1642');
  });

  it('summarises bioactivity per target', async () => {
    const { db } = fakeFetch([[/activity\.json/, fixture('ch_activity.json')]]);
    const t = await db.bioactivity('CHEMBL941');
    expect(t[0]).toMatchObject({ targetId: 'CHEMBL1824', type: 'IC50', units: 'nM' });
    expect(t[0].pchembl).toBeCloseTo(10.22);
  });

  it('runs a similarity search, dropping the "/" that breaks the URL path', async () => {
    const { db, calls } = fakeFetch([[/similarity\//, fixture('ch_similar_smiles.json')]]);
    const hits = await db.chemblSimilar('C/C=C/c1ccccc1', 30);
    expect(calls[0].url).toContain('/similarity/CC%3DCc1ccccc1/40.json'); // threshold raised to ChEMBL's minimum
    expect(hits[0].source).toBe('chembl');
    expect(hits[0].similarity).toBeGreaterThan(0);
    expect(hits[0].smiles).toBeTruthy();
  });
});

describe('PubMed', () => {
  it('searches and returns papers in the search order', async () => {
    const { db, calls } = fakeFetch([
      [/esearch/, fixture('pm_search.json')],
      [/esummary/, fixture('pm_summary.json')],
    ]);
    const r = await db.pubmed('imatinib', 3);
    expect(r.count).toBe(19850);
    expect(r.papers.map((p) => p.pmid)).toEqual(['12122963', '28273011', '38772691']);
    expect(r.papers[0].title).toBe('Imatinib mesylate.');
    expect(r.papers[0].year).toBe('2002');
    expect(calls[1].url).toContain('id=12122963,28273011,38772691');
  });

  it('handles a search with no results without a second request', async () => {
    const { db, calls } = fakeFetch([[/esearch/, fixture('pm_empty.json')]]);
    const r = await db.pubmed('zzqqxxnotaword');
    expect(r).toMatchObject({ count: 0, papers: [] });
    expect(calls).toHaveLength(1);
  });

  it('sorts by date when asked', async () => {
    const { db, calls } = fakeFetch([[/esearch/, fixture('pm_empty.json')]]);
    await db.pubmed('x', 5, 'date');
    expect(calls[0].url).toContain('sort=pub_date');
  });
});

describe('identify', () => {
  it('combines PubChem, its synonyms and ChEMBL', async () => {
    const { db } = fakeFetch([
      [/compound\/smiles\/property/, fixture('pc_name.json')],
      [/synonyms/, fixture('pc_synonyms.json')],
      [/standard_inchi_key=KTUFNOKKBVMGRW/, fixture('ch_inchikey.json')],
    ]);
    const r = await db.identify('Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1');
    expect(r.compound?.title).toBe('Imatinib');
    expect(r.synonyms.length).toBeGreaterThan(0);
    expect(r.chembl).toMatchObject({ chemblId: 'CHEMBL941', maxPhase: 4, firstApproval: 2001 });
  });

  it('reports a structure PubChem does not have', async () => {
    const { db, calls } = fakeFetch([[/compound\/smiles\/property/, fixture('pc_smiles_new.json')]]);
    expect(await db.identify('CC1CCCC1C2CCCCC2CCCOCCN')).toEqual({ compound: null, synonyms: [], chembl: null });
    expect(calls).toHaveLength(1);
  });
});

describe('errors', () => {
  it('says the service is busy on 503', async () => {
    const { db } = fakeFetch([[/chembl/, { error_message: 'down' }, 503]]);
    await expect(db.bioactivity('CHEMBL1')).rejects.toThrow('ChEMBL is busy');
  });

  it('says when the service cannot be reached', async () => {
    const db = new Databases((async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch, 0);
    await expect(db.pubmed('aspirin')).rejects.toBeInstanceOf(DatabaseError);
    await expect(db.pubmed('aspirin')).rejects.toThrow('Cannot reach PubMed');
  });
});

describe('assistant tools', () => {
  it('identify_structure uses the drawing when no SMILES is given', async () => {
    const { db, calls } = fakeFetch([
      [/compound\/smiles\/property/, fixture('pc_smiles.json')],
      [/synonyms/, fixture('pc_synonyms.json')],
      [/molecule\.json/, { molecules: [] }],
    ]);
    const tool = databaseTools(db, () => 'CC(=O)Oc1ccccc1C(=O)O').find((t) => t.name === 'identify_structure')!;
    const out = JSON.parse(await tool.run({}));
    expect(out.title).toBe('Aspirin');
    expect(out.chembl).toBe('not in ChEMBL');
    expect(new URLSearchParams(calls[0].body).get('smiles')).toBe('CC(=O)Oc1ccccc1C(=O)O');
  });

  it('fails clearly when the canvas is empty', async () => {
    const { db } = fakeFetch([]);
    const tool = databaseTools(db, () => '').find((t) => t.name === 'find_similar')!;
    await expect(tool.run({})).rejects.toThrow('canvas is empty');
  });

  it('the chat offers the tools, runs one, and returns its result to the model', async () => {
    const { db } = fakeFetch([
      [/esearch/, fixture('pm_search.json')],
      [/esummary/, fixture('pm_summary.json')],
    ]);
    const requests: any[] = [];
    const replies = [
      { content: [{ type: 'tool_use', id: 't1', name: 'search_pubmed', input: { query: 'imatinib', max_results: 3 } }] },
      { content: [{ type: 'text', text: 'See PMID 12122963.' }] },
    ];
    const apiFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const chat = new ChemistryChat(() => 0, apiFetch);
    chat.tools = databaseTools(db, () => '');
    const events: ChatEvent[] = [];
    await chat.ask('Papers on imatinib?', '', (e) => events.push(e));

    expect(requests[0].tools.map((t: any) => t.name)).toEqual([
      'draw_molecule',
      'search_compound',
      'identify_structure',
      'find_similar',
      'search_pubmed',
      'get_bioactivity',
    ]);
    expect(requests[0].tools[4].input_schema.required).toEqual(['query']);
    const result = requests[1].messages.at(-1).content[0];
    expect(result.type).toBe('tool_result');
    expect(result.content).toContain('12122963');
    expect(events[0]).toEqual({ kind: 'lookup', text: 'Searched PubMed for “imatinib”' });
    expect(events[1]).toEqual({ kind: 'text', text: 'See PMID 12122963.' });
  });

  it('a failing lookup is reported to the model as an error, and the chat goes on', async () => {
    const { db } = fakeFetch([[/pubchem/, { Fault: { Message: 'x' } }, 500]]);
    const requests: any[] = [];
    const replies = [
      { content: [{ type: 'tool_use', id: 't1', name: 'search_compound', input: { query: 'aspirin' } }] },
      { content: [{ type: 'text', text: 'PubChem failed.' }] },
    ];
    const apiFetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const chat = new ChemistryChat(() => 0, apiFetch);
    chat.tools = databaseTools(db, () => '');
    const events: ChatEvent[] = [];
    await chat.ask('aspirin?', '', (e) => events.push(e));
    expect(requests[1].messages.at(-1).content[0].is_error).toBe(true);
    expect(events[0]).toMatchObject({ kind: 'lookup', error: expect.stringContaining('PubChem error 500') });
  });
});
