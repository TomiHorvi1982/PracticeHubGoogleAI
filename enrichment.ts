// enrichment.ts — dohledání materiálů k písni.
//
// Běží na serveru, ne v prohlížeči: sahá na cizí služby, potřebuje klíče a
// nemá smysl kvůli tomu řešit povolené původy.
//
// Pořadí kroků není libovolné. Guitar Pro se hledá první, protože z hlavičky
// souboru vypadne tónina i tempo přesně — a teprve s tempem se dají vybírat
// bicí groovy. Kdyby se hledaly dřív, vybíraly by se naslepo.

import { createClient } from '@supabase/supabase-js';

/** Odkud výsledek přišel a jak jistá shoda byla. */
export interface Nalez {
  druh: 'guitar_pro' | 'text' | 'akordy' | 'midi' | 'groove' | 'noty';
  nazev: string;
  zdroj: string;
  /** 0 až 1. Nad prahem se připojí rovnou, pod ním se jen nabídne. */
  jistota: number;
  /** Kde to leží — asset v knihovně, záznam v tab_library, nebo adresa. */
  odkaz: { assetId?: string; tabLibraryId?: string; url?: string; obsah?: string };
  /** Co se z toho dá o písni zjistit. */
  tonina?: string | null;
  tempo?: number | null;
}

export interface VysledekDoplneni {
  interpret: string;
  nazev: string;
  jiste: Nalez[];
  navrhy: Nalez[];
  poznamky: string[];
}

/** Práh, nad kterým se nález připojí bez ptaní. */
export const PRAH_JISTOTY = 0.8;

/** Slug ve tvaru, jaký používá `tab_library` — bez diakritiky, spojovníky. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Vyloupne interpreta a název z toho, jak se píseň jmenuje na YouTube.
 *
 * Názvy bývají zaneřáděné („Kabát - Pohoda (Official Video) [4K] HD"), takže
 * se nejdřív oseká, co je zjevně balast. Teprve když ani potom nejde poznat
 * interpret, má smysl ptát se modelu — na většinu názvů stačí pravidla a
 * dotaz navíc by jen stál čas.
 */
export function rozeberNazev(surovy: string): { interpret: string | null; nazev: string } {
  let t = surovy
    .replace(/\((?:official|oficiální)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(official|oficiální)\s+(video|audio|music video|klip)\b/gi, '')
    .replace(/\b(HD|4K|8K|lyrics?|lyric video|videoklip|live|remaster(ed)?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // „Interpret - Název". Oddělovačem bývá pomlčka i dvojtečka; bez ní by
  // „Metallica: Nothing Else Matters" zůstalo celé jako název písně.
  const m = t.match(/^(.{2,60}?)\s*[-–—:|]\s*(.+)$/);
  if (m) {
    return { interpret: m[1].trim().replace(/[,;]+$/, ''), nazev: m[2].trim().replace(/[,;]+$/, '') };
  }
  return { interpret: null, nazev: t };
}

/**
 * Jak dobře si dva názvy odpovídají, 0 až 1.
 *
 * Porovnává se přes slugy, protože zdroje píší diakritiku, interpunkci i
 * velká písmena každý jinak. Shoda po slovech je odolnější než přesná —
 * „Roots Bloody Roots" a „roots-bloody-roots_2" jsou tatáž píseň.
 */
export function podobnost(a: string, b: string): number {
  const sa = new Set(slug(a).split('-').filter((x) => x.length > 1));
  const sb = new Set(slug(b).split('-').filter((x) => x.length > 1));
  if (sa.size === 0 || sb.size === 0) return 0;
  let spolecnych = 0;
  for (const x of sa) if (sb.has(x)) spolecnych++;
  // Podíl vůči menší množině: název v knihovně nese navíc jméno interpreta
  // a pořadové číslo, takže by ho průnik vůči sjednocení nespravedlivě srazil.
  return spolecnych / Math.min(sa.size, sb.size);
}

/** Kolik hlasů se považuje za dost, aby hodnocení mluvilo samo za sebe. */
const DOST_HLASU = 20;
/** Ke kterému hodnocení se stahuje tab s málo hlasy. */
const PRUMERNE_HODNOCENI = 4.0;

/**
 * Pořadí tabulatur z Ultimate Guitar.
 *
 * Samotné hodnocení nestačí — tab s jedinou pětkou nic neříká. Násobit ho
 * počtem hlasů je ale ještě horší: takový vzorec vynesl 3,9 od dvou tisíc
 * lidí nad 4,8 od tří set, což je nejvíc hlasovaný, ne nejlépe hodnocený.
 *
 * Hodnocení se proto přitahuje k průměru tím silněji, čím míň má hlasů.
 * Pětka od jednoho člověka spadne skoro na průměr, 4,8 od tří set si své
 * místo udrží a 3,9 zůstane 3,9, i kdyby hlasovalo město.
 */
export function skoreTabu(rating: number | null, votes: number | null): number {
  const r = rating ?? 0;
  const v = Math.max(0, votes ?? 0);
  return (v * r + DOST_HLASU * PRUMERNE_HODNOCENI) / (v + DOST_HLASU);
}

export function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Guitar Pro z lokální sbírky.
 *
 * Hledá se první, protože je zdarma a hned — a hlavně z něj vypadne tónina
 * i tempo. Sbírka je zahraniční, takže u českých písní obvykle nenajde nic
 * a přijde na řadu Ultimate Guitar.
 */
export async function najdiVLokalniSbirce(interpret: string, nazev: string): Promise<Nalez[]> {
  const admin = supabaseAdmin();
  const si = slug(interpret);
  if (!si) return [];

  // `status` je u téhle tabulky 'stored', ne 'active' — filtr na 'active'
  // by vrátil prázdno, přestože je v ní přes sedmdesát tisíc souborů.
  const { data, error } = await admin
    .from('tab_library')
    .select('id, artist, title, format, storage_bucket, storage_path')
    .eq('artist', si)
    .limit(60);
  if (error || !data) return [];

  return data
    .map((r) => ({
      r,
      // Z názvu se odřízne jméno interpreta, které je v něm zopakované.
      shoda: podobnost(nazev, String(r.title).replace(new RegExp('^' + si + '-?'), '')),
    }))
    .filter((x) => x.shoda >= 0.5)
    .sort((a, b) => b.shoda - a.shoda)
    .slice(0, 3)
    .map(({ r, shoda }) => ({
      druh: 'guitar_pro' as const,
      nazev: `${r.title}.${r.format}`,
      zdroj: 'lokální sbírka',
      jistota: shoda,
      odkaz: { tabLibraryId: r.id, url: r.storage_path },
    }));
}

const UG_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Pojmenované entity pro písmena s diakritikou.
 *
 * Ultimate Guitar je má i uvnitř hodnot, ne jen v obalujícím atributu —
 * „Klidn&aacute; Jako Voda". Bez převodu se název neshodne s tím naším a
 * česká píseň se kvůli jedinému písmenu jen nabídne místo připojení.
 */
const ENTITY: Record<string, string> = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý',
  ccaron: 'č', dcaron: 'ď', ecaron: 'ě', ncaron: 'ň', rcaron: 'ř', scaron: 'š',
  tcaron: 'ť', zcaron: 'ž', uring: 'ů', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý',
  Ccaron: 'Č', Dcaron: 'Ď', Ecaron: 'Ě', Ncaron: 'Ň', Rcaron: 'Ř', Scaron: 'Š',
  Tcaron: 'Ť', Zcaron: 'Ž', Uring: 'Ů', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
};

/** JSON v `data-content` je prošpikovaný HTML entitami. */
function dekoduj(s: string): string {
  return s
    .replace(/&([A-Za-z]+);/g, (cele, jmeno) => ENTITY[jmeno] ?? cele)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // až nakonec, jinak by rozbil entity výše
}

async function ugStore(url: string): Promise<any> {
  const r = await fetch(url, { headers: UG_HEADERS });
  if (!r.ok) throw new Error(`Ultimate Guitar odpověděl HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/class="js-store"\s+data-content="([\s\S]*?)"\s*>/);
  if (!m) throw new Error('Ultimate Guitar nevrátil data — pravděpodobně blokuje tento server.');
  return JSON.parse(dekoduj(m[1]));
}

/** Typy, které se dají v appce zobrazit. „Pro" a „Official" jsou placené. */
const UG_ZOBRAZITELNE = new Set(['Tabs', 'Chords', 'Bass Tabs', 'Ukulele Chords', 'Power']);

/**
 * Akordy a tabulatury z Ultimate Guitar.
 *
 * Vrací nejlepší z každého druhu, ne jen jeden celkově — akordy a tabulatura
 * jsou k písni obojí, ne alternativa.
 */
export async function najdiNaUG(interpret: string, nazev: string): Promise<Nalez[]> {
  const dotaz = `${interpret} ${nazev}`.trim();
  let data: any;
  try {
    data = await ugStore(
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(dotaz)}`
    );
  } catch {
    return [];
  }

  const vysledky: any[] = data?.store?.page?.data?.results || [];
  const hodnocene = vysledky
    .filter((r) => r?.tab_url && r?.song_name && r?.type && !String(r.tab_url).includes('/pro/?'))
    .filter((r) => UG_ZOBRAZITELNE.has(r.type))
    .map((r) => ({
      r,
      // Shoda se počítá zvlášť pro interpreta a název; vyhledávání UG vrací
      // i písně jiných kapel se stejným slovem v názvu.
      // Dekóduje se i tady: entity přežívají uvnitř hodnot JSONu, ne jen
      // v obalujícím atributu.
      shoda: Math.min(
        podobnost(interpret, dekoduj(r.artist_name || '')),
        podobnost(nazev, dekoduj(r.song_name || ''))
      ),
      skore: skoreTabu(typeof r.rating === 'number' ? r.rating : null, r.votes ?? null),
    }))
    .filter((x) => x.shoda >= 0.6);

  // Nejlepší kus od každého druhu.
  const nejlepsiVDruhu = new Map<string, (typeof hodnocene)[number]>();
  for (const x of hodnocene) {
    const stavajici = nejlepsiVDruhu.get(x.r.type);
    if (!stavajici || x.skore > stavajici.skore) nejlepsiVDruhu.set(x.r.type, x);
  }

  return [...nejlepsiVDruhu.values()].map(({ r, shoda, skore }) => ({
    druh: (r.type === 'Chords' ? 'akordy' : 'guitar_pro') as Nalez['druh'],
    nazev: `${dekoduj(r.song_name)} — ${r.type} (${r.rating?.toFixed?.(1) ?? '?'} / ${r.votes ?? 0} hlasů)`,
    zdroj: 'Ultimate Guitar',
    // Jistota stojí na shodě názvu; hodnocení jen mírně přidá, protože říká
    // něco o kvalitě přepisu, ne o tom, jestli je to ta správná píseň.
    // Zadání znělo „ty nejlépe hodnocené". Tab pod průměrem se proto sám
    // nepřipojí, i když je to nepochybně ta správná píseň — jen se nabídne.
    jistota: skore < PRUMERNE_HODNOCENI
      ? Math.min(shoda, PRAH_JISTOTY - 0.05)
      : Math.min(1, shoda * 0.85 + Math.min(skore / 5, 1) * 0.15),
    odkaz: { url: r.tab_url },
  }));
}

/** Text písně z lrclib. Veřejná databáze textů s časováním. */
export async function najdiText(interpret: string, nazev: string): Promise<Nalez[]> {
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(nazev)}&artist_name=${encodeURIComponent(interpret)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'NeverLateStudio/1.0' } });
    if (!r.ok) return [];
    const d: any = await r.json();
    const text = d?.plainLyrics || '';
    if (!text || text.length < 40) return [];
    return [
      {
        druh: 'text',
        nazev: `${d.trackName} — ${d.artistName}`,
        zdroj: 'lrclib.net',
        // lrclib dohledává podle přesného názvu, takže co vrátí, obvykle sedí;
        // ověří se ale i tak, protože „obvykle" není „vždy".
        jistota: Math.min(podobnost(nazev, d.trackName || ''), podobnost(interpret, d.artistName || '')),
        odkaz: { obsah: text },
      },
    ];
  } catch {
    return [];
  }
}

/** MIDI z naší knihovny — 21 709 souborů, párováno podle názvu. */
export async function najdiMidi(interpret: string, nazev: string): Promise<Nalez[]> {
  const admin = supabaseAdmin();
  // Hledá se podle názvu písně; interpret v názvech souborů většinou není.
  const vzor = `%${nazev.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await admin
    .from('assets')
    .select('id, name')
    .eq('status', 'active')
    .eq('category', 'midi')
    .ilike('name', vzor)
    .limit(20);

  return (data || [])
    .map((a) => ({ a, shoda: podobnost(nazev, a.name.replace(/\.midi?$/i, '')) }))
    .filter((x) => x.shoda >= 0.6)
    .sort((a, b) => b.shoda - a.shoda)
    .slice(0, 3)
    .map(({ a, shoda }) => ({
      druh: 'midi' as const,
      nazev: a.name,
      zdroj: 'knihovna MIDI',
      // Bez interpreta v názvu je shoda ze své podstaty méně jistá — stejně
      // pojmenovaných písní je spousta, takže se strop drží pod prahem
      // a MIDI se vždycky jen nabídne.
      jistota: shoda * 0.75,
      odkaz: { assetId: a.id },
    }));
}

/**
 * Tónina a tempo přečtené přímo ze souboru.
 *
 * Tohle je celý důvod, proč se Guitar Pro a MIDI hledají první. Hodnoty
 * v hlavičce jsou přesné — žádný odhad ze zvuku se jim nevyrovná — a teprve
 * s tempem se dají vybírat bicí groovy.
 */
export async function zjistiZSouboru(
  bajty: Uint8Array,
  pripona: string
): Promise<{ tonina: string | null; tempo: number | null }> {
  if (/midi?$/i.test(pripona)) {
    try {
      const { Midi } = await import('@tonejs/midi');
      const midi = new Midi(bajty);
      const tempo = midi.header.tempos[0]?.bpm ? Math.round(midi.header.tempos[0].bpm) : null;
      // MIDI nese předznamenání, ne tóninu; durové a mollové se u stejného
      // počtu křížků liší jen příznakem.
      const ks: any = (midi.header as any).keySignatures?.[0];
      const tonina = ks?.key ? `${ks.key}${ks.scale === 'minor' ? 'm' : ''}` : null;
      return { tonina, tempo };
    } catch {
      return { tonina: null, tempo: null };
    }
  }

  // Guitar Pro rozebere alphaTab. Formát se mezi verzemi liší natolik, že
  // číst hlavičku po bajtech by znamenalo napsat vlastní parser pro každou;
  // knihovna to umí i mimo prohlížeč, takže si tu práci můžeme ušetřit.
  try {
    const at: any = await import('@coderline/alphatab');
    const score = at.importer.ScoreLoader.loadScoreFromBytes(bajty);
    const predznamenani = score.masterBars?.[0]?.keySignature ?? 0;
    return {
      tempo: score.tempo > 0 ? Math.round(score.tempo) : null,
      // Nula křížků znamená C dur — nebo že to autor nevyplnil. Ověřeno na
      // vzorku sbírky: nevyplněno má 25 z 25 souborů, takže nula je zpráva
      // o autorovi, ne o písni. Brát ji vážně by označilo celý zpěvník za
      // C dur; tónina se proto odvodí z akordů, kde k tomu jsou data.
      tonina: predznamenani === 0
        ? null
        : toninaZPredznamenani(predznamenani, score.masterBars?.[0]?.keySignatureType ?? 0),
    };
  } catch {
    return { tonina: null, tempo: null };
  }
}

/** Kvintový kruh: durové tóniny podle počtu křížků (kladné) a béček (záporné). */
const DUROVE = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const DUROVE_B = ['C', 'F', 'A#', 'D#', 'G#', 'C#', 'F#', 'B'];
const MOLLOVE = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
const MOLLOVE_B = ['Am', 'Dm', 'Gm', 'Cm', 'Fm', 'A#m', 'D#m', 'G#m'];

/**
 * Předznamenání na název tóniny.
 *
 * `pocet` je počet křížků (kladně) nebo béček (záporně), `typ` rozlišuje dur
 * od moll — bez něj by dur a její paralelní moll nešly rozeznat, mají totiž
 * předznamenání stejné.
 */
export function toninaZPredznamenani(pocet: number, typ: number): string | null {
  const i = Math.abs(pocet);
  if (i > 7) return null;
  const mol = typ === 1;
  const tabulka = pocet >= 0 ? (mol ? MOLLOVE : DUROVE) : mol ? MOLLOVE_B : DUROVE_B;
  return tabulka[i] ?? null;
}

/**
 * Bicí groovy, které sedí k tempu písně.
 *
 * Vybírá se až nakonec, protože bez tempa by šlo o náhodný výběr z 1 681
 * možností. Okno je poměrné, ne pevné: deset úderů rozdílu je u pomalé
 * balady znát mnohem víc než u rychlé písně.
 */
export async function najdiGroovy(tempo: number | null, kolik = 5): Promise<Nalez[]> {
  if (!tempo) return [];
  const admin = supabaseAdmin();

  const { data } = await admin
    .from('assets')
    .select('id, name, metadata')
    .eq('status', 'active')
    .eq('category', 'midi')
    .like('metadata->>legacy_id', 'sync:MDL Tone Ultimate Heavy MIDI Grooves%')
    .limit(1000);

  const okno = Math.max(6, tempo * 0.08);
  return (data || [])
    .map((a) => {
      const cesta = String((a.metadata as any)?.legacy_id || '');
      const bpm = parseInt(cesta.match(/(\d{2,3})\s*bpm/i)?.[1] || '0', 10);
      return { a, bpm, rozdil: Math.abs(bpm - tempo) };
    })
    .filter((x) => x.bpm > 0 && x.rozdil <= okno)
    .sort((a, b) => a.rozdil - b.rozdil)
    .slice(0, kolik)
    .map(({ a, bpm, rozdil }) => ({
      druh: 'groove' as const,
      nazev: `${a.name.replace(/\.midi?$/i, '')} — ${bpm} BPM`,
      zdroj: 'bicí groovy',
      // Groove se nikdy nepřipojí sám. Který beat k písni sedne, je věc
      // vkusu, ne shody údajů — appka může nabídnout, vybrat musí člověk.
      jistota: Math.max(0.3, 0.7 - rozdil / okno / 4),
      odkaz: { assetId: a.id },
      tempo: bpm,
    }));
}

/**
 * Dohledá k písni všechno, co jde.
 *
 * Kroky jdou po sobě schválně: nejdřív soubory, ze kterých se dá vyčíst
 * tónina a tempo, a teprve pak to, co na nich stojí. Mezi dotazy ven se
 * čeká — Ultimate Guitar ani lrclib nejsou naše služby.
 */
export async function doplnPisen(
  interpret: string,
  nazev: string,
  opts: { prodleva?: number } = {}
): Promise<VysledekDoplneni> {
  const prodleva = opts.prodleva ?? 800;
  const pauza = () => new Promise((r) => setTimeout(r, prodleva));
  const vse: Nalez[] = [];
  const poznamky: string[] = [];

  const krok = async (popis: string, fn: () => Promise<Nalez[]>) => {
    try {
      vse.push(...(await fn()));
    } catch (e: any) {
      poznamky.push(`${popis}: ${e?.message || 'nepodařilo se'}`);
    }
  };

  await krok('lokální sbírka', () => najdiVLokalniSbirce(interpret, nazev));
  await krok('text', () => najdiText(interpret, nazev));
  await pauza();
  await krok('Ultimate Guitar', () => najdiNaUG(interpret, nazev));
  await pauza();
  await krok('MIDI', () => najdiMidi(interpret, nazev));

  // Z nejjistějšího nalezeného Guitar Pro se přečte tempo a tónina. Tenhle
  // krok je důvod, proč se soubory hledaly první — bez tempa by výběr
  // bicích grooves byl náhodný.
  const gp = vse
    .filter((n) => n.druh === 'guitar_pro' && n.odkaz.url && !n.odkaz.url.startsWith('http'))
    .sort((a, b) => b.jistota - a.jistota)[0];

  if (gp?.odkaz.url) {
    try {
      const r2: any = await import('./r2');
      const obsah = await r2.getObjectBytes(gp.odkaz.url);
      if (obsah) {
        const z = await zjistiZSouboru(obsah.body, gp.nazev.split('.').pop() || 'gp5');
        gp.tempo = z.tempo;
        gp.tonina = z.tonina;
      }
    } catch (e: any) {
      poznamky.push(`Tempo z tabulatury: ${e?.message || 'nepodařilo se přečíst'}`);
    }
  }

  const tempo = vse.find((n) => n.tempo)?.tempo ?? null;
  if (tempo) {
    await krok('bicí groovy', () => najdiGroovy(tempo));
  } else {
    poznamky.push('Tempo se nepodařilo zjistit, takže se nehledaly bicí groovy.');
  }

  return {
    interpret,
    nazev,
    jiste: vse.filter((n) => n.jistota >= PRAH_JISTOTY),
    navrhy: vse.filter((n) => n.jistota < PRAH_JISTOTY),
    poznamky,
  };
}
