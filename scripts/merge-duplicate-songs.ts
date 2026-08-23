// scripts/merge-duplicate-songs.ts — sloučí písně, které jsou ve zpěvníku víckrát.
//
// Duplicity vznikly tím, že se stejná píseň přidala z několika stran —
// z importu, z YouTube, ze synchronizace složky — a nic je nespojilo.
//
// Slučuje se do té nejbohatší kopie a zbytek se do ní přilije: přílohy,
// odkazy, videa i obrázky se sjednotí, z textů zůstane ten nejdelší. Nic se
// nezahazuje kvůli tomu, že leželo v „té špatné" kopii.
//
// Použití:
//   bun run scripts/merge-duplicate-songs.ts            # jen ukáže
//   bun run scripts/merge-duplicate-songs.ts --apply

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

/** Porovnání odolné vůči diakritice, velkým písmenům a interpunkci. */
export function klicPisne(artist: string | null, title: string): string {
  const n = (s: string) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return `${n(artist || '')}|${n(title)}`;
}

/** Kolik toho u písně je — podle toho se vybírá, do které se slévá. */
function bohatost(md: any): number {
  return (
    String(md?.content || '').length +
    (md?.attachments?.length || 0) * 500 +
    (md?.youtubeVideos?.length || 0) * 300 +
    (md?.links?.length || 0) * 50
  );
}

/** Sjednocení polí bez duplicit. Rozlišuje se podle toho, co je v položce jedinečné. */
function spoj<T extends Record<string, any>>(a: T[] | undefined, b: T[] | undefined, klic: (x: T) => string): T[] {
  const out: T[] = [];
  const videne = new Set<string>();
  for (const x of [...(a || []), ...(b || [])]) {
    const k = klic(x);
    if (videne.has(k)) continue;
    videne.add(k);
    out.push(x);
  }
  return out;
}

async function main() {
  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pisne, error } = await admin
    .from('songs')
    .select('id, title, artist, metadata, created_at')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const skupiny = new Map<string, typeof pisne>();
  for (const s of pisne || []) {
    const k = klicPisne(s.artist, s.title);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k)!.push(s);
  }

  const duplicity = [...skupiny.values()].filter((v) => v.length > 1);
  console.log(`Písní: ${pisne?.length ?? 0}`);
  console.log(`Skupin duplicit: ${duplicity.length}`);
  console.log(`Nadbytečných řádků: ${duplicity.reduce((n, v) => n + v.length - 1, 0)}`);
  console.log(`Režim: ${APPLY ? 'SLUČOVÁNÍ' : 'jen ukázka (--apply provede)'}\n`);

  let slouceno = 0;
  let smazano = 0;

  for (const skupina of duplicity) {
    const serazene = [...skupina].sort((a, b) => bohatost(b.metadata) - bohatost(a.metadata));
    const hlavni = serazene[0];
    const ostatni = serazene.slice(1);

    let md: any = { ...(hlavni.metadata || {}) };
    for (const s of ostatni) {
      const o: any = s.metadata || {};
      // Z textů vítězí delší — kratší bývá zbytek po nepovedeném importu.
      if (String(o.content || '').length > String(md.content || '').length) md.content = o.content;
      md.attachments = spoj(md.attachments, o.attachments, (x) => x.storagePath || x.name);
      md.youtubeVideos = spoj(md.youtubeVideos, o.youtubeVideos, (x) => x.id || x.url);
      md.links = spoj(md.links, o.links, (x) => x.url);
      md.images = spoj(md.images, o.images, (x) => x.id || x.name);
      md.navrhy = spoj(md.navrhy, o.navrhy, (x) => `${x.druh}|${x.nazev}`);
      // Údaje se doplňují jen tam, kde v hlavní kopii chybí.
      for (const pole of ['key', 'bpm', 'tuning', 'capo', 'notes']) {
        if (!md[pole] && o[pole]) md[pole] = o[pole];
      }
      md.chordsUsed = spoj(
        (md.chordsUsed || []).map((c: string) => ({ c })),
        (o.chordsUsed || []).map((c: string) => ({ c })),
        (x) => x.c
      ).map((x: any) => x.c);
    }

    console.log(
      `  ${(hlavni.artist + ' – ' + hlavni.title).slice(0, 44).padEnd(46)} ` +
        `${skupina.length} kopií → 1  (text ${String(md.content || '').length} zn., ` +
        `${(md.attachments || []).length} příloh, ${(md.links || []).length} odkazů)`
    );

    if (!APPLY) continue;

    const { error: e1 } = await admin
      .from('songs')
      .update({ metadata: md, updated_at: new Date().toISOString() })
      .eq('id', hlavni.id);
    if (e1) {
      console.log(`      ! sloučení selhalo: ${e1.message}`);
      continue;
    }
    // Mazat se smí až po úspěšném zápisu sloučené kopie — jinak by při
    // chybě zmizely přílohy, které se do hlavní ještě nedostaly.
    const { error: e2 } = await admin
      .from('songs')
      .delete()
      .in('id', ostatni.map((s) => s.id));
    if (e2) {
      console.log(`      ! mazání selhalo: ${e2.message}`);
      continue;
    }
    slouceno++;
    smazano += ostatni.length;
  }

  console.log(`\n${APPLY ? `Sloučeno ${slouceno} skupin, smazáno ${smazano} řádků.` : 'Nic se nezměnilo. Spusťte s --apply.'}`);
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
