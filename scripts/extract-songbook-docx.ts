// scripts/extract-songbook-docx.ts — obnoví texty písní a akordy
// z originálních .docx souborů.
//
// Proč to existuje: dřívější převod přes `textutil -convert txt` zahazoval
// zalomení uvnitř odstavce (`<w:br/>`), takže se píseň o 43 řádcích uložila
// jako jeden řádek. Akordy v ní zůstaly nalepené na slova („DJeden",
// „Emimandarinky") a nešly od textu oddělit.
//
// Originál je ale odlišuje formátováním — akordy jsou vlastní runy s jiným
// řezem než text. Styl se mezi soubory liší, takže se nezadává napevno;
// hledá se ten, jehož runy z většiny vypadají jako akord.
//
// Ručně zadané hodnoty nikdy nepřepisuje. Skript si vede seznam polí, která
// vyplnil sám (`metadata.derived`), a sahá jen na ně.
//
// Použití:
//   bun run scripts/extract-songbook-docx.ts <složka>            # jen ukáže
//   bun run scripts/extract-songbook-docx.ts <složka> --apply    # zapíše

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { odhadniToninu, jedinecneAkordy, jeAkord } from '../src/services/songEnrichment';

dotenv.config();

const DIR = path.resolve(process.argv[2] || '');
const APPLY = process.argv.includes('--apply');

if (!DIR || !fs.existsSync(DIR)) {
  console.error('BLOCKED: zadejte složku s .docx soubory.');
  process.exit(1);
}

interface Run {
  text: string;
  styl: string;
}

/** Rozbalí jeden soubor z .docx. Vlastní ZIP kvůli tomu nemá smysl tahat. */
function documentXml(cesta: string): string {
  return execFileSync('unzip', ['-p', cesta, 'word/document.xml'], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function dekoduj(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/ /g, ' ');
}

/**
 * Rozebere dokument na runy. Zalomení a konce odstavců se vkládají jako
 * zvláštní run — díky tomu se dá text složit zpátky i s řádkováním.
 */
function nactiRuny(xml: string): Run[] {
  const telo = xml.slice(xml.indexOf('<w:body'));
  const runy: Run[] = [];

  // Prochází odstavce, aby konec odstavce taky zalomil řádek.
  for (const odstavec of telo.split(/<\/w:p>/)) {
    for (const kus of odstavec.split(/(?=<w:r[\s>])/)) {
      if (!/^<w:r[\s>]/.test(kus)) continue;

      // Zalomení uvnitř runu — právě tohle textutil zahazoval.
      const casti = kus.split(/<w:br\s*\/?>/);
      casti.forEach((cast, i) => {
        if (i > 0) runy.push({ text: '\n', styl: '\n' });

        // `<w:tab/>` je mezera, ne prázdno — bez toho by se slova slepila.
        const text = dekoduj(
          (cast.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
            .map((t) => t.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
            .join('')
        ) + (/<w:tab\s*\/>/.test(cast) ? ' ' : '');

        if (!text) return;
        const rpr = cast.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
        const znaky = [...new Set(
          [...(rpr?.[1] || '').matchAll(/<w:(b|i|u|color|highlight|sz|strike)\b/g)].map((m) => m[1])
        )].sort().join('+');
        runy.push({ text, styl: znaky });
      });
    }
    runy.push({ text: '\n', styl: '\n' });
  }
  return runy;
}

/**
 * Najde styl, kterým jsou psané akordy.
 *
 * Napevno zadaný styl by nestačil — sbírka jich používá několik
 * (`b+i+sz+u`, `b+color+i+sz`, `i+sz+u`). Hledá se proto ten, jehož runy
 * z většiny vypadají jako akord a je jich dost na to, aby to nebyla náhoda.
 */
function najdiStylAkordu(runy: Run[]): string | null {
  const podleStylu = new Map<string, string[]>();
  for (const r of runy) {
    const t = r.text.trim();
    if (!t || r.styl === '\n') continue;
    if (!podleStylu.has(r.styl)) podleStylu.set(r.styl, []);
    podleStylu.get(r.styl)!.push(t);
  }

  let nejlepsi: string | null = null;
  let nejvic = 0;
  for (const [styl, texty] of podleStylu) {
    if (texty.length < 3) continue;
    // Run může nést víc akordů oddělených čárkou („G, Gmaj7, Emi").
    const tokeny = texty.flatMap((t) => t.split(/[,\s]+/).filter(Boolean));
    const shoda = tokeny.filter(jeAkord).length;
    if (shoda / tokeny.length >= 0.75 && shoda > nejvic) {
      nejlepsi = styl;
      nejvic = shoda;
    }
  }
  return nejlepsi;
}

interface Vytezek {
  content: string;
  akordy: string[];
  tonina: string | null;
}

function zpracuj(cesta: string): Vytezek | null {
  const runy = nactiRuny(documentXml(cesta));
  const stylAkordu = najdiStylAkordu(runy);

  const akordy: string[] = [];
  let text = '';

  for (const r of runy) {
    if (r.styl === '\n') {
      text += '\n';
      continue;
    }
    if (stylAkordu && r.styl === stylAkordu) {
      for (const tok of r.text.split(/[,\s]+/).filter(Boolean)) {
        if (jeAkord(tok)) {
          akordy.push(tok);
          // Zápis, kterému rozumí modul Text a akordy.
          text += `[${tok}]`;
        } else {
          text += tok;
        }
      }
    } else {
      text += r.text;
    }
  }

  const content = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!content) return null;
  const jedinecne = jedinecneAkordy(akordy);
  return {
    content,
    akordy: jedinecne,
    tonina: odhadniToninu(akordy)?.tonina ?? null,
  };
}

/** Porovnání názvů odolné vůči diakritice, číslování a interpunkci. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+[.\s-]*/, '')
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: skladby, error } = await admin
    .from('songs')
    .select('id,title,artist,metadata')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const podleNazvu = new Map<string, any>();
  for (const s of skladby || []) podleNazvu.set(norm(s.title), s);

  const soubory: string[] = [];
  const projdi = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) projdi(abs);
      else if (e.name.toLowerCase().endsWith('.docx')) soubory.push(abs);
    }
  };
  projdi(DIR);

  console.log(`Složka:  ${DIR}`);
  console.log(`Souborů: ${soubory.length}`);
  console.log(`Režim:   ${APPLY ? 'ZÁPIS' : 'jen ukázka (--apply zapíše)'}\n`);

  let sparovano = 0, bezAkordu = 0, nenalezeno = 0, zapsano = 0;

  for (const cesta of soubory.sort()) {
    const zaklad = path.basename(cesta, '.docx');
    // Soubory se jmenují „Interpret - Název"; k porovnání je potřeba název.
    const nazev = zaklad.includes(' - ') ? zaklad.split(' - ').slice(1).join(' - ') : zaklad;
    const skladba = podleNazvu.get(norm(nazev));

    let v: Vytezek | null = null;
    try {
      v = zpracuj(cesta);
    } catch (e: any) {
      console.log(`  ! ${zaklad.slice(0, 44)}: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (!v) continue;

    if (!skladba) {
      nenalezeno++;
      continue;
    }
    sparovano++;
    if (v.akordy.length === 0) bezAkordu++;

    const md = skladba.metadata || {};
    const odvozene: string[] = Array.isArray(md.derived) ? md.derived : [];

    // Ručně zadané hodnoty se nepřepisují. Za vlastní se považuje jen to,
    // co skript sám dřív vyplnil.
    const smiPsat = (pole: string) => !md[pole] || odvozene.includes(pole);

    /**
     * Text je zvláštní případ. V databázi sice něco je, ale u většiny písní
     * je to výstup dřívějšího chybného převodu — celá píseň slepená do
     * jednoho řádku. Ten se za ruční práci považovat nesmí, jinak by skript
     * neopravil právě to, kvůli čemu vznikl.
     *
     * Poznávacím znamením je délka nejdelšího řádku. Počet řádků nestačí —
     * slepení proběhlo po odstavcích, takže píseň o šesti slokách zůstala
     * na šesti řádcích a vypadala nevinně. Verš písně ale nikdy nemá dvě
     * stě znaků; slepená sloka jich má klidně tisíc.
     */
    const stareRadky = String(md.content || '').split('\n').filter((r) => r.trim());
    const nejdelsiRadek = stareRadky.reduce((n, r) => Math.max(n, r.length), 0);
    const jeSlepeny = nejdelsiRadek > 200;
    const smiPsatText = smiPsat('content') || jeSlepeny;

    const nove: Record<string, any> = {};
    const nyni: string[] = [];
    if (smiPsatText && v.content.length > 40) { nove.content = v.content; nyni.push('content'); }
    if (v.akordy.length && smiPsat('chordsUsed')) { nove.chordsUsed = v.akordy; nyni.push('chordsUsed'); }
    if (v.tonina && smiPsat('key')) { nove.key = v.tonina; nyni.push('key'); }

    const radku = v.content.split('\n').length;
    const stary = String(md.content || '');
    console.log(
      `  ${zaklad.slice(0, 40).padEnd(42)} ${String(radku).padStart(3)} ř. ` +
      `(bylo ${String(stary ? stary.split('\n').length : 0).padStart(3)}) ` +
      `${String(v.akordy.length).padStart(3)} akordů  ${(v.tonina || '—').padEnd(4)} ` +
      `${nyni.length ? '→ ' + nyni.join(',') : '(beze změny — ruční data)'}`
    );

    if (APPLY && nyni.length) {
      const { error: chyba } = await admin
        .from('songs')
        .update({
          metadata: { ...md, ...nove, derived: [...new Set([...odvozene, ...nyni])] },
          updated_at: new Date().toISOString(),
        })
        .eq('id', skladba.id);
      if (chyba) console.log(`      ! zápis selhal: ${chyba.message}`);
      else zapsano++;
    }
  }

  console.log(`\nSpárováno se zpěvníkem: ${sparovano}`);
  console.log(`Bez rozpoznaných akordů: ${bezAkordu}`);
  console.log(`Soubor bez skladby v databázi: ${nenalezeno}`);
  if (APPLY) console.log(`Zapsáno: ${zapsano}`);
  else console.log('\nNic se nezapsalo. Spusťte s --apply.');
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
