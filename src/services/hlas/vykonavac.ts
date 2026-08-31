import { HlasovyPrikaz, Krok, akcePodleId } from './katalog';

/**
 * Provedení hlasového příkazu.
 *
 * Akce z katalogu jsou jen jména; co se pod nimi doopravdy stane, ví ta
 * část aplikace, která na to má prostředky — metronom horní lišta,
 * přepínání sekcí obal aplikace. Registr je proto obrácený: komponenty
 * se hlásí samy, co obsluhují.
 *
 * Vedlejší užitek je ten, o který šlo od začátku: `dostupneAkce()` řekne
 * pravdu o tom, co appka umí teď a hned. Katalog tak nemusí slibovat
 * věci, které nikdo neobsluhuje.
 */

export type Obsluha = (hodnoty: Record<string, string | number>) => void | Promise<void>;

const obsluhy = new Map<string, Obsluha>();

/** Zaregistruje obsluhu akce. Vrací funkci, která ji zase odebere. */
export function zaregistruj(akceId: string, obsluha: Obsluha): () => void {
  obsluhy.set(akceId, obsluha);
  return () => {
    // Odebírá se jen vlastní obsluha: při přemontování komponenty se
    // nová zaregistruje dřív, než stará zmizí, a slepé mazání by
    // odstranilo tu novou.
    if (obsluhy.get(akceId) === obsluha) obsluhy.delete(akceId);
  };
}

export function jeAkceDostupna(akceId: string): boolean {
  return obsluhy.has(akceId);
}

export function dostupneAkce(): string[] {
  return [...obsluhy.keys()];
}

export interface VysledekPrikazu {
  provedeno: number;
  /** Kroky, které nikdo neobsluhuje — v katalogu se hlásí jako nezapojené. */
  nezapojene: string[];
  chyba: string | null;
}

/**
 * Doplní do kroku číslo, které padlo ve větě.
 *
 * „Nastav tempo sto padesát" je jedna fráze pro libovolné tempo —
 * ukládat zvlášť příkaz pro každou hodnotu by nedávalo smysl. Číslo se
 * proto dosadí do prvního číselného parametru, který krok má.
 */
export function dosadCislo(krok: Krok, cislo: number | null): Krok {
  if (cislo === null) return krok;
  const akce = akcePodleId(krok.akce);
  const parametr = akce?.parametry.find((p) => p.typ === 'cislo');
  if (!parametr) return krok;
  if (parametr.od !== undefined && cislo < parametr.od) return krok;
  if (parametr.do !== undefined && cislo > parametr.do) return krok;
  return { ...krok, hodnoty: { ...krok.hodnoty, [parametr.klic]: cislo } };
}

/**
 * Provede kroky příkazu po sobě.
 *
 * Nezapojený krok sled nezastaví — u vícekrokového příkazu je lepší
 * udělat, co jde, a nakonec říct, co se nepovedlo, než neudělat nic.
 * Chyba uvnitř obsluhy naopak zastaví: další krok už může počítat s tím,
 * že ten předchozí prošel.
 */
export async function spustPrikaz(
  prikaz: HlasovyPrikaz,
  cislo: number | null = null,
): Promise<VysledekPrikazu> {
  const vysledek: VysledekPrikazu = { provedeno: 0, nezapojene: [], chyba: null };

  for (const surovy of prikaz.kroky) {
    const krok = dosadCislo(surovy, cislo);
    const obsluha = obsluhy.get(krok.akce);
    if (!obsluha) {
      vysledek.nezapojene.push(krok.akce);
      continue;
    }
    try {
      await obsluha({ ...(akcePodleId(krok.akce)?.parametry ?? []).reduce(
        (acc, p) => (p.vychozi !== undefined ? { ...acc, [p.klic]: p.vychozi } : acc),
        {} as Record<string, string | number>,
      ), ...krok.hodnoty });
      vysledek.provedeno += 1;
    } catch (e: any) {
      vysledek.chyba = e?.message || `Krok ${krok.akce} selhal.`;
      break;
    }
  }

  return vysledek;
}
