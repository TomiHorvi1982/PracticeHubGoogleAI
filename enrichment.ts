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
