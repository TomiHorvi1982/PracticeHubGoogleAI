/**
 * Sekce skladby — sloka, refrén, sólo.
 *
 * Ukládají se k písni do databáze, takže se příště načtou i s ní. Kdo
 * si jednou rozkreslil, kde co začíná, nemusí to hledat znovu.
 *
 * Data přicházejí z databáze, kde mohla vzniknout i starší verzí appky,
 * takže se při načtení srovnávají: čas mimo skladbu, převrácený rozsah
 * nebo chybějící jméno nesmí shodit pult.
 */

export interface Sekce {
  id: string;
  nazev: string;
  od: number;
  do: number;
  /** Barva pruhu. Bez ní se přidělí podle pořadí. */
  barva?: string;
}

/**
 * Barvy pruhů.
 *
 * Vybrané tak, aby se sousední sekce daly rozeznat i koutkem oka a
 * žádná nesplývala s oranžovou přehrávací hlavou.
 */
export const BARVY_SEKCI = [
  '#5E9EFF', '#BF5AF2', '#30D158', '#FF9F0A', '#FF6482', '#40C8E0',
];

/** Jména, která se nabízejí — pokrývají skoro každou skladbu. */
export const NABIDKA_NAZVU = [
  'Intro', 'Sloka', 'Předrefrén', 'Refrén', 'Mezihra', 'Sólo', 'Bridge', 'Outro',
];

export function barvaProPoradi(i: number): string {
  return BARVY_SEKCI[((i % BARVY_SEKCI.length) + BARVY_SEKCI.length) % BARVY_SEKCI.length];
}

let citac = 0;
export function noveId(): string {
  citac += 1;
  return `sek_${Date.now().toString(36)}_${citac.toString(36)}`;
}

/**
 * Srovná jednu sekci do skladby.
 *
 * Vrací `null`, když z ní po srovnání nic nezbude — takovou nemá smysl
 * kreslit ani ukládat.
 */
export function srovnejSekci(s: Partial<Sekce>, delka: number): Sekce | null {
  if (!(delka > 0)) return null;
  const a = Number(s.od);
  const b = Number(s.do);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Sekce nakreslená zprava doleva je pořád tatáž sekce.
  const od = Math.max(0, Math.min(delka, Math.min(a, b)));
  const doKdy = Math.max(0, Math.min(delka, Math.max(a, b)));
  if (doKdy - od < 0.05) return null;
  return {
    id: String(s.id || noveId()),
    nazev: String(s.nazev || '').trim().slice(0, 40) || 'Sekce',
    od,
    do: doKdy,
    barva: typeof s.barva === 'string' && /^#[0-9a-f]{6}$/i.test(s.barva) ? s.barva : undefined,
  };
}

/**
 * Srovná celý seznam a seřadí ho podle začátku.
 *
 * Překryv se nechává být schválně: sólo uvnitř refrénu je legitimní a
 * rozhodovat za uživatele, co má ustoupit, by bylo horší než ho nakreslit.
 */
export function srovnejSekce(sekce: unknown, delka: number): Sekce[] {
  if (!Array.isArray(sekce)) return [];
  const ven: Sekce[] = [];
  const videnaId = new Set<string>();
  for (const s of sekce) {
    if (!s || typeof s !== 'object') continue;
    const v = srovnejSekci(s as Partial<Sekce>, delka);
    if (!v) continue;
    // Dvě sekce se stejným id by se v Reactu praly o tentýž klíč.
    if (videnaId.has(v.id)) v.id = noveId();
    videnaId.add(v.id);
    ven.push(v);
  }
  return ven.sort((a, b) => a.od - b.od || a.do - b.do);
}

/** Sekce, ve které daný čas leží. Při překryvu vyhrává ta kratší. */
export function sekceVCase(sekce: Sekce[], cas: number): Sekce | null {
  let nej: Sekce | null = null;
  for (const s of sekce) {
    if (cas < s.od || cas > s.do) continue;
    if (!nej || (s.do - s.od) < (nej.do - nej.od)) nej = s;
  }
  return nej;
}

/**
 * Jméno pro další sekci.
 *
 * Nabídne první nepoužité z obvyklých; když už jsou všechna, čísluje
 * (Sloka 2, Sloka 3), aby se dvě nejmenovaly stejně.
 */
export function navrhniNazev(sekce: Sekce[]): string {
  const pouzita = new Set(sekce.map((s) => s.nazev.toLowerCase()));
  for (const n of NABIDKA_NAZVU) {
    if (!pouzita.has(n.toLowerCase())) return n;
  }
  for (let i = 2; i < 99; i++) {
    const n = `Sloka ${i}`;
    if (!pouzita.has(n.toLowerCase())) return n;
  }
  return 'Sekce';
}

/** Vloží novou sekci a vrátí srovnaný seznam. */
export function pridejSekci(
  sekce: Sekce[], od: number, doKdy: number, delka: number, nazev?: string,
): Sekce[] {
  const nova = srovnejSekci(
    {
      id: noveId(),
      nazev: nazev || navrhniNazev(sekce),
      od,
      do: doKdy,
      barva: barvaProPoradi(sekce.length),
    },
    delka,
  );
  return nova ? srovnejSekce([...sekce, nova], delka) : sekce;
}

/**
 * Co se u skladby ukládá kromě sekcí.
 *
 * Mřížka se počítá z audia a chvíli to trvá; uložená se příště jen
 * načte. Mix je nastavení jezdců, aby píseň naskočila namíchaná.
 */
export interface UlozenyPult {
  sekce?: Sekce[];
  mrizka?: { bpm: number; faze: number; shoda: number };
  mix?: Record<string, {
    volume: number; pan: number; isMuted: boolean; isSolo: boolean; pitchSemi: number;
  }>;
}

/** Přečte uložený pult z písně. Cokoli nečekaného se zahodí, ne aby to spadlo. */
export function prectiPult(zdroj: any, delka: number): UlozenyPult {
  const p = (zdroj && typeof zdroj === 'object') ? zdroj : {};
  const ven: UlozenyPult = { sekce: srovnejSekce(p.sekce, delka) };

  const m = p.mrizka;
  if (m && Number.isFinite(Number(m.bpm)) && Number(m.bpm) > 0) {
    ven.mrizka = {
      bpm: Number(m.bpm),
      faze: Number.isFinite(Number(m.faze)) ? Number(m.faze) : 0,
      shoda: Number.isFinite(Number(m.shoda)) ? Number(m.shoda) : 0,
    };
  }

  if (p.mix && typeof p.mix === 'object') {
    const mix: NonNullable<UlozenyPult['mix']> = {};
    for (const [id, v] of Object.entries(p.mix as Record<string, any>)) {
      if (!v || typeof v !== 'object') continue;
      mix[id] = {
        volume: cislo(v.volume, -60, 6, 0),
        pan: cislo(v.pan, -1, 1, 0),
        isMuted: !!v.isMuted,
        isSolo: !!v.isSolo,
        pitchSemi: cislo(v.pitchSemi, -12, 12, 0),
      };
    }
    if (Object.keys(mix).length) ven.mix = mix;
  }

  return ven;
}

function cislo(v: any, min: number, max: number, vychozi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return vychozi;
  return Math.max(min, Math.min(max, n));
}

/** Je v uloženém pultu vůbec něco? Prázdný se k písni nezapisuje. */
export function maObsah(p: UlozenyPult): boolean {
  return !!(p.sekce?.length || p.mrizka || (p.mix && Object.keys(p.mix).length));
}
