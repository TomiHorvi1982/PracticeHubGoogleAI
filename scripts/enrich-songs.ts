// scripts/enrich-songs.ts — dohledá materiály ke všem písním ve zpěvníku.
//
// Jde přes cizí služby, takže se mezi písněmi čeká. Ultimate Guitar ani
// lrclib nejsou naše a osmdesát dotazů za sebou by od nich vypadalo jako
// útok — pauza není opatrnost, ale slušnost.
//
// Ručně zadané hodnoty se nepřepisují; skript sahá jen na to, co sám dřív
// vyplnil (vede si o tom seznam v `metadata.derived`).
//
// Použití:
//   bun run scripts/enrich-songs.ts             # jen ukáže, co by udělal
//   bun run scripts/enrich-songs.ts --apply     # zapíše
//   bun run scripts/enrich-songs.ts --apply --limit 5

import dotenv from 'dotenv';
import { doplnPisen, pripojNalezy, rozeberNazev, supabaseAdmin } from '../enrichment';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;

/** Pauza mezi písněmi. Delší než mezi kroky uvnitř jedné písně. */
const PAUZA_MS = 2500;

async function main() {
  const admin = supabaseAdmin();
  const { data: pisne, error } = await admin
    .from('songs')
    .select('id, title, artist, metadata')
    .eq('status', 'active')
    .order('title');
  if (error) throw new Error(error.message);

  const kandidati = (pisne || []).filter((s) => {
    const md: any = s.metadata || {};
    // Přeskočí se písně, které už doplňování prošly — opakovat dotazy ven
    // kvůli nim by nic nepřineslo.
    return !md.doplneno;
  });

  console.log(`Písní ve zpěvníku: ${pisne?.length ?? 0}`);
  console.log(`K doplnění:        ${kandidati.length}`);
  console.log(`Režim:             ${APPLY ? 'ZÁPIS' : 'jen ukázka (--apply zapíše)'}\n`);

  let hotovo = 0;
  let bezInterpreta = 0;
  let nicNenaslo = 0;
  const zpracovat = kandidati.slice(0, LIMIT);

  for (const [i, s] of zpracovat.entries()) {
    const zNazvu = rozeberNazev(s.title);
    const interpret =
      s.artist && s.artist !== 'Neznámý interpret' ? s.artist : zNazvu.interpret;

    if (!interpret) {
      bezInterpreta++;
      console.log(`  ${String(i + 1).padStart(3)}. ${s.title.slice(0, 40).padEnd(42)} — bez interpreta, přeskakuji`);
      continue;
    }

    try {
      const v = await doplnPisen(interpret, zNazvu.nazev || s.title);
      const souhrn = v.jiste.length
        ? v.jiste.map((n) => n.druh).filter((d, j, a) => a.indexOf(d) === j).join(',')
        : '—';

      if (v.jiste.length === 0 && v.navrhy.length === 0) nicNenaslo++;

      let zapsano = '';
      if (APPLY && (v.jiste.length || v.navrhy.length)) {
        const r = await pripojNalezy(s.id, v);
        zapsano = r.pripojeno.length ? ` → ${r.pripojeno.join(', ')}` : ' → (nic nového)';
        hotovo++;
      }

      console.log(
        `  ${String(i + 1).padStart(3)}. ${s.title.slice(0, 34).padEnd(36)} ` +
          `jisté:${String(v.jiste.length).padStart(2)} návrhy:${String(v.navrhy.length).padStart(2)}  ${souhrn}${zapsano}`
      );
    } catch (e: any) {
      console.log(`  ${String(i + 1).padStart(3)}. ${s.title.slice(0, 34).padEnd(36)} ! ${e?.message?.slice(0, 44)}`);
    }

    if (i < zpracovat.length - 1) await new Promise((r) => setTimeout(r, PAUZA_MS));
  }

  console.log(`\nZpracováno: ${zpracovat.length}`);
  console.log(`Bez interpreta: ${bezInterpreta}`);
  console.log(`Nic nenalezeno: ${nicNenaslo}`);
  if (APPLY) console.log(`Zapsáno u ${hotovo} písní.`);
  else console.log('\nNic se nezapsalo. Spusťte s --apply.');
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
