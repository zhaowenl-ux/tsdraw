import { describe, it, expect } from 'vitest';
import {
  classifyLine,
  classifyPaste,
  isCasNumber,
  needsLookup,
  resolvePaste,
  StructureLookup,
} from '../src/app/pasteResolve';
import { Databases } from '../src/app/databases';

const kinds = (line: string) => classifyLine(line).map((a) => a.kind);

describe('recognising pasted text', () => {
  it('checks CAS numbers', () => {
    expect(isCasNumber('50-78-2')).toBe(true); // aspirin
    expect(isCasNumber('7732-18-5')).toBe(true); // water
    expect(isCasNumber('50-78-3')).toBe(false); // wrong check digit
    expect(isCasNumber('2024-11-23')).toBe(false);
  });

  it('tells identifiers apart', () => {
    expect(kinds('InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3')).toEqual(['inchi']);
    expect(kinds('LFQSCWFLJHTTHZ-UHFFFAOYSA-N')).toEqual(['inchikey']);
    expect(kinds('50-78-2')).toEqual(['cas']);
    expect(kinds('CAS No. 50-78-2')).toEqual(['cas']);
    expect(kinds('CHEMBL25')).toEqual(['chembl']);
    expect(kinds('CID 2244')).toEqual(['cid']);
    expect(kinds('CCO')).toEqual(['smiles']);
    expect(kinds('c1ccccc1C(=O)O')).toEqual(['smiles']);
    expect(kinds('SMILES: CC(=O)O')).toEqual(['smiles']);
  });

  it('reads words as names', () => {
    expect(kinds('aspirin')).toEqual(['name']);
    expect(kinds('Tylenol')).toEqual(['name']);
    expect(kinds('acetic acid')).toEqual(['name']);
    expect(kinds('2-acetyloxybenzoic acid')).toEqual(['name']);
    expect(kinds('H2O')).toEqual(['name']);
    expect(kinds('Cas9')).toEqual(['name']);
    expect(kinds('name: CO')).toEqual(['name']);
  });

  it('keeps InChI intact and cleans typographic characters', () => {
    expect(classifyLine('InChI=1S/CH4/h1H4')[0].query).toBe('InChI=1S/CH4/h1H4');
    expect(classifyLine('N,N′‐dimethylurea')[0].query).toBe("N,N'-dimethylurea");
  });

  it('reads SMILES followed by a name (.smi) and word-like SMILES with a name', () => {
    expect(classifyLine('CC(=O)Oc1ccccc1C(=O)O aspirin')).toEqual([{ kind: 'smiles', query: 'CC(=O)Oc1ccccc1C(=O)O' }]);
    expect(kinds('BOC anhydride')).toEqual(['name', 'smiles']);
  });

  it('splits lines, spreadsheet rows and SD files', () => {
    expect(classifyPaste('aspirin\n\nCCO\r\n50-78-2\n').map((i) => i.attempts[0].kind)).toEqual(['name', 'smiles', 'cas']);
    expect(classifyPaste('\t ibuprofen\t15687-27-1').map((i) => i.text)).toEqual(['ibuprofen']);
    expect(classifyPaste('SMILES\tName\nCCO\tethanol').map((i) => i.text)).toEqual(['CCO']);
    const mol = '\n  tsdraw\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\nM  END\n';
    const items = classifyPaste(`${mol}$$$$\n${mol}$$$$\n`);
    expect(items.map((i) => i.attempts[0].kind)).toEqual(['molfile', 'molfile']);
    expect(needsLookup(items)).toBe(false);
    expect(needsLookup(classifyPaste('aspirin'))).toBe(true);
  });
});

/** A fake PubChem/OPSIN answering from a small table. */
function fakeLookup(): StructureLookup & { calls: string[] } {
  const calls: string[] = [];
  const pubchem: Record<string, { cid: number; title: string; smiles: string }> = {
    aspirin: { cid: 2244, title: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
    tylenol: { cid: 1983, title: 'Acetaminophen', smiles: 'CC(=O)NC1=CC=C(C=C1)O' },
    '50-78-2': { cid: 2244, title: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
  };
  return {
    calls,
    async searchCompounds(q) {
      calls.push(`pubchem:${q}`);
      const hit = pubchem[q.toLowerCase()];
      return hit ? [hit] : [];
    },
    async compoundByInchi(inchi) {
      calls.push(`inchi:${inchi}`);
      return inchi === 'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3' ? { cid: 702, title: 'Ethanol', smiles: 'CCO' } : null;
    },
    async opsinSmiles(name) {
      calls.push(`opsin:${name}`);
      return name === '2-methylpropan-2-ol' ? 'CC(C)(C)O' : null;
    },
  };
}

describe('resolving pasted text', () => {
  it('looks up names, brands, CAS numbers and InChI', async () => {
    const db = fakeLookup();
    const r = await resolvePaste('aspirin\nTylenol\n50-78-2\nInChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', 40, db);
    expect(r.failed).toEqual([]);
    expect(r.structures.map((s) => s.title)).toEqual(['Aspirin', 'Acetaminophen', 'Aspirin', 'Ethanol']);
    expect(r.structures[0].doc.atoms.length).toBe(13);
    expect(r.structures[3].source).toBe('PubChem CID 702');
  });

  it('falls back to OPSIN for systematic names and reports what is not found', async () => {
    const db = fakeLookup();
    const r = await resolvePaste('2-methylpropan-2-ol\nunobtainium', 40, db);
    expect(r.structures[0].source).toMatch(/OPSIN/);
    expect(r.structures[0].doc.atoms.length).toBe(5);
    expect(r.failed).toEqual([{ text: 'unobtainium', reason: 'not found (name)' }]);
    expect(db.calls).toEqual(['pubchem:2-methylpropan-2-ol', 'opsin:2-methylpropan-2-ol', 'pubchem:unobtainium', 'opsin:unobtainium']);
  });

  it('reads SMILES and MOL files without the network', async () => {
    const db = fakeLookup();
    const r = await resolvePaste('c1ccccc1\nCC(C)O isopropanol', 40, db);
    expect(r.structures.map((s) => s.doc.atoms.length)).toEqual([6, 4]);
    expect(db.calls).toEqual([]);
  });

  it('a word-like SMILES before a name: tries the name, then the SMILES', async () => {
    const db = fakeLookup();
    const r = await resolvePaste('CCO ethanol', 40, db);
    expect(r.structures[0].doc.atoms.length).toBe(3);
    expect(r.structures[0].kind).toBe('smiles');
  });

  it('reads a bare V3000 CTAB', async () => {
    const ctab = [
      'M  V30 BEGIN CTAB',
      'M  V30 COUNTS 2 1 0 0 0',
      'M  V30 BEGIN ATOM',
      'M  V30 1 C 0 0 0 0',
      'M  V30 2 O 1.5 0 0 0',
      'M  V30 END ATOM',
      'M  V30 BEGIN BOND',
      'M  V30 1 1 1 2',
      'M  V30 END BOND',
      'M  V30 END CTAB',
    ].join('\n');
    const r = await resolvePaste(ctab, 40, null);
    expect(r.structures[0].doc.atoms.map((a) => a.symbol)).toEqual(['C', 'O']);
  });

  it('works with the Databases client (PubChem InChI and OPSIN requests)', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: String(init.body ?? '') });
      if (url.includes('/compound/name/'))
        return new Response(JSON.stringify({ Fault: { Code: 'PUGREST.NotFound' } }), { status: 404 });
      if (url.includes('/compound/inchi/'))
        return new Response(JSON.stringify({ PropertyTable: { Properties: [{ CID: 702, Title: 'Ethanol', SMILES: 'CCO' }] } }));
      if (url.includes('opsin')) return new Response(JSON.stringify({ status: 'SUCCESS', smiles: 'CC(C)(C)O' }));
      return new Response('{}', { status: 500 });
    }) as unknown as typeof fetch;
    const db = new Databases(fetchFn, 0);
    const r = await resolvePaste('InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3\n2-methylpropan-2-ol', 40, db);
    expect(r.structures.map((s) => s.title ?? s.source)).toEqual(['Ethanol', 'OPSIN']);
    expect(calls[0].body).toContain('inchi=InChI%3D1S');
    expect(calls.some((c) => c.url === 'https://opsin.ch.cam.ac.uk/opsin/2-methylpropan-2-ol.json')).toBe(true);
  });
});
