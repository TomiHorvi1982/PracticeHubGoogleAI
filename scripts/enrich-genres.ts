// scripts/enrich-genres.ts — doplní ke skladbám žánr z Last.fm.
//
// Žánr se ptá u interpreta, ne u skladby: kapela hraje obvykle jeden styl a
// štítky u konkrétní písně bývají řídké. Last.fm je staví na tom, jak si
// skladby označují posluchači, takže odpovídají tomu, jak se o hudbě mluví.
//
// Dotazuje se jednou na interpreta, ne na každou píseň — osmdesát dotazů
// tam, kde stačí třicet pět, je zbytečné zatížení cizí služby.
//
// Použití:
//   bun run scripts/enrich-genres.ts             # jen ukáže
//   bun run scripts/enrich-genres.ts --apply

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

/**
 * Štítky, které nic neříkají o hudbě.
 *
 * Last.fm mezi žánry míchá i osobní poznámky posluchačů („seen live",
 * „favorites"). Jako žánr by vypadaly směšně.
 */
const NENI_ZANR =
  /^(seen live|favorit|favourite|awesome|beautiful|love|my |best|great|cool|good|albums i own|check out|under 2000|00s|90s|80s|70s|\d{4}s?)$/i;

/**
 * Štítky, které popisují obsazení nebo postoj, ne hudbu.
 *
 * `female vocalists` je na Last.fm jeden z nejčastějších štítků vůbec a u
 * zpěvaček se dostane před skutečný žánr. `rac` je zase politická zkratka,
 * kterou by nikdo v seznamu skladeb nečekal.
 */
const NENI_HUDBA = /^(fe)?male vocalis(t|ts)$|^(female|male) vocals?$|^rac$|^oi$|^instrumental$/i;

/**
 * Národnost a region nejsou žánr.
 *
 * Last.fm je mezi štítky vede rovnocenně, takže se u českých kapel dostaly
 * na první místo — a Daniel Landa vyšel jako „Folk", protože se štítek
 * `czech` mapoval na žánr. Kapela zůstane bez žánru radši než se špatným.
 */
const NARODNOST =
  /^(czech|czechia|czech republic|slovak|slovakia|polish|poland|german|deutsch|french|francais|chanson francaise|british|american|swedish|finnish|norwegian|russian|spanish|italian|bohemia|moravia|bohemia and moravia|ceska|česká|slovenska)$/i;

/** Sjednocení psaní, ať v knihovně nestojí „Rock" vedle „rock" a „Hard Rock". */
function upravZanr(t: string): string {
  const s = t.trim().toLowerCase();
  const zname: Record<string, string> = {
    'heavy metal': 'Metal', 'thrash metal': 'Metal', 'death metal': 'Metal',
    'nu metal': 'Metal', 'groove metal': 'Metal', metal: 'Metal',
    'hard rock': 'Rock', 'classic rock': 'Rock', 'alternative rock': 'Rock',
    'indie rock': 'Rock', 'rock and roll': 'Rock', rock: 'Rock',
    'czech rock': 'Rock', pop: 'Pop', folk: 'Folk',
    punk: 'Punk', 'punk rock': 'Punk', grunge: 'Grunge', blues: 'Blues',
    jazz: 'Jazz', country: 'Country', reggae: 'Reggae', ska: 'Ska',
  };
  if (zname[s]) return zname[s];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function lastfm(metoda: string, params: Record<string, string>): Promise<any> {
  const klic = process.env.LASTFM_API_KEY;
  if (!klic) throw new Error('Chybí LASTFM_API_KEY v .env.');
  const q = new URLSearchParams({ method: metoda, api_key: klic, format: 'json', ...params });
  const r = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`, {
    headers: { 'User-Agent': 'NeverLateStudio/1.0' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d?.error) throw new Error(d.message || `chyba ${d.error}`);
  return d;
}

async function main() {
  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pisne, error } = await admin
    .from('songs')
    .select('id, title, artist, metadata')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const interpreti = [...new Set(
    (pisne || [])
      .map((s) => s.artist)
      .filter((a): a is string => Boolean(a) && a !== 'Neznámý interpret')
  )];

  console.log(`Skladeb:    ${pisne?.length ?? 0}`);
  console.log(`Interpretů: ${interpreti.length}`);
  console.log(`Režim:      ${APPLY ? 'ZÁPIS' : 'jen ukázka (--apply zapíše)'}\n`);

  const zanrProInterpreta = new Map<string, string>();

  for (const [i, interpret] of interpreti.entries()) {
    try {
      const d = await lastfm('artist.getTopTags', { artist: interpret });
      const stitky: any[] = d?.toptags?.tag || [];
      const zanr = stitky
        .map((t) => String(t.name || ''))
        // Vlastní jméno kapely mezi štítky bývá nejčastější ze všech —
        // jako žánr by u Metallicy stálo „Metallica".
        .filter((t) => t.trim().toLowerCase() !== interpret.trim().toLowerCase())
        .filter(
          (t) =>
            t &&
            !NENI_ZANR.test(t.trim()) &&
            !NARODNOST.test(t.trim()) &&
            !NENI_HUDBA.test(t.trim())
        )
        .map(upravZanr)[0];

      if (zanr) {
        zanrProInterpreta.set(interpret, zanr);
        console.log(`  ${interpret.slice(0, 30).padEnd(32)} ${zanr}`);
      } else {
        console.log(`  ${interpret.slice(0, 30).padEnd(32)} — (jen štítky, které nejsou žánr)`);
      }
    } catch (e: any) {
      console.log(`  ${interpret.slice(0, 30).padEnd(32)} ! ${e.message.slice(0, 34)}`);
    }
    // Pauza mezi dotazy — Last.fm není naše služba.
    if (i < interpreti.length - 1) await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nŽánr nalezen u ${zanrProInterpreta.size} z ${interpreti.length} interpretů.`);
  if (!APPLY) {
    console.log('Nic se nezapsalo. Spusťte s --apply.');
    return;
  }

  let zapsano = 0;
  for (const s of pisne || []) {
    const zanr = s.artist ? zanrProInterpreta.get(s.artist) : undefined;
    if (!zanr) continue;
    const md: any = s.metadata || {};
    const odvozene: string[] = Array.isArray(md.derived) ? md.derived : [];
    // Ručně zadaný žánr se nepřepisuje — stejné pravidlo jako u zbytku
    // doplňování.
    if (md.genre && !odvozene.includes('genre')) continue;

    const { error: chyba } = await admin
      .from('songs')
      .update({
        metadata: { ...md, genre: zanr, derived: [...new Set([...odvozene, 'genre'])] },
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (!chyba) zapsano++;
  }
  console.log(`Zapsáno u ${zapsano} skladeb.`);
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
