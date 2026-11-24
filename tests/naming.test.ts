import { describe, it, expect } from 'vitest';
import { classifySynonyms, infoboxField, nameStructure, NameSources, splitNames, wikiPlain } from '../src/app/naming';
import { parseWikidata } from '../src/app/databases';

const DRUGBOX = `{{Short description|Chemical compound}}
{{Drugbox
| Verifiedfields = changed
| image = Imatinib.svg
| tradename = Gleevec, Glivec, others<ref name="Drugs.com brands"/>
| Drugs.com = {{drugs.com|monograph|imatinib-mesylate}}
| IUPAC_name = 4-[(4-Methylpiperazin-1-yl)methyl]-''N''-(4-methyl-3-{[4-(pyridin-3-yl)pyrimidin-2-yl]amino}phenyl)benzamide
| synonyms = STI-571, {{nowrap|CGP 57148}}
| CAS_number = 152459-95-5
}}
'''Imatinib''', sold under the brand names '''Gleevec''' ...`;

describe('Wikipedia infobox', () => {
  it('reads trade names, the IUPAC name and synonyms', () => {
    expect(splitNames(infoboxField(DRUGBOX, 'tradename'))).toEqual(['Gleevec', 'Glivec']);
    expect(infoboxField(DRUGBOX, 'IUPAC_name')).toBe(
      '4-[(4-Methylpiperazin-1-yl)methyl]-N-(4-methyl-3-{[4-(pyridin-3-yl)pyrimidin-2-yl]amino}phenyl)benzamide'
    );
    expect(splitNames(infoboxField(DRUGBOX, 'OtherNames', 'synonyms'))).toEqual(['STI-571', 'CGP 57148']);
    expect(infoboxField(DRUGBOX, 'nothing_here')).toBe('');
    const box = '| synonyms = Isobutylphenylpropionic acid\n\n<!-- Chemical data -->| IUPAC_name = (RS)-2-x\n}}';
    expect(infoboxField(box, 'synonyms')).toBe('Isobutylphenylpropionic acid');
  });

  it('turns wikitext into plain text', () => {
    expect(wikiPlain("[[Acetic acid|ethanoic acid]]<br />''vinegar''<ref>x</ref>")).toBe('ethanoic acid\nvinegar');
    expect(splitNames('1,2-dichloroethane, ethylene dichloride')).toEqual(['1,2-dichloroethane', 'ethylene dichloride']);
  });
});

describe('PubChem synonyms', () => {
  it('separates CAS, codes and names, and drops registry ids', () => {
    const r = classifySynonyms(
      ['imatinib', '152459-95-5', 'STI571', 'Gleevec', 'CGP-57148', 'CHEMBL941', 'BKJ8M8G5HI', 'DTXSID1043715', 'Imatinib free base', 'KTUFNOKKBVMGRW-UHFFFAOYSA-N'],
      ['Imatinib']
    );
    expect(r.cas).toBe('152459-95-5');
    expect(r.codes).toEqual(['STI571', 'CGP-57148']);
    expect(r.others).toEqual(['Gleevec', 'Imatinib free base']);
  });

  it('takes KEGG trade names and drops noisy variants', () => {
    const r = classifySynonyms(
      ['Glamox', 'Glamox (TN)', 'Gleevec (TN)', 'L01XE01', '1iep', 'IMATINIB [USAN]', 'STI', 'Imatinib (INN)', 'RefChem:76L01XE01', 'imatinib-CD3', '152459-95-5 (free base)', 'Imatinib (STI571)', 'Imatinibum'],
      ['imatinib']
    );
    expect(r.brands).toEqual(['Glamox', 'Gleevec']);
    expect(r.others).toEqual(['Imatinibum']);
  });
});

describe('Wikidata', () => {
  it('reads label, INN and article', () => {
    const body = {
      results: {
        bindings: [
          {
            item: { value: 'http://www.wikidata.org/entity/Q177094' },
            itemLabel: { value: 'imatinib' },
            inn: { value: 'imatinib' },
            article: { value: 'https://en.wikipedia.org/wiki/Imatinib' },
          },
        ],
      },
    };
    expect(parseWikidata(body)).toEqual({ item: 'http://www.wikidata.org/entity/Q177094', label: 'imatinib', inn: 'imatinib', article: 'Imatinib' });
    expect(parseWikidata({ results: { bindings: [] } })).toBeNull();
  });
});

function fakeSources(found = true): NameSources {
  return {
    async compoundBySmiles(smiles) {
      return found
        ? { cid: 5291, title: 'Imatinib', iupac: '4-[(4-methylpiperazin-1-yl)methyl]-N-[...]benzamide', inchikey: 'KTUFNOKKBVMGRW-UHFFFAOYSA-N', formula: 'C29H31N7O', smiles }
        : null;
    },
    async synonyms() {
      return ['imatinib', '152459-95-5', 'STI571', 'Gleevec', 'Glivec', 'Imatinib free base'];
    },
    async wikidataByInchiKey() {
      return { label: 'imatinib', inn: 'imatinib', article: 'Imatinib' };
    },
    async wikipediaLead(title) {
      return { title, url: `https://en.wikipedia.org/wiki/${title}`, description: 'Chemical compound', extract: 'Imatinib is a drug.', wikitext: DRUGBOX };
    },
  };
}

describe('naming a structure', () => {
  it('combines PubChem, Wikidata and Wikipedia', async () => {
    const n = await nameStructure('CC1=...', fakeSources());
    expect(n.found).toBe(true);
    expect(n.common).toBe('Imatinib');
    expect(n.inn).toBe('imatinib');
    expect(n.brands).toEqual(['Gleevec', 'Glivec']);
    expect(n.cas).toBe('152459-95-5');
    expect(n.codes).toContain('STI571');
    expect(n.others).toEqual(['STI-571', 'CGP 57148', 'Imatinib free base']);
    expect(n.wikipedia?.url).toBe('https://en.wikipedia.org/wiki/Imatinib');
  });

  it('reports a structure PubChem does not know', async () => {
    const n = await nameStructure('C1CC1C1CC1CC1CC1', fakeSources(false));
    expect(n.found).toBe(false);
    expect(n.common).toBeUndefined();
  });
});
