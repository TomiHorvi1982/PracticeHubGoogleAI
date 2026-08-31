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

export interface VyslovenoNavic {
  cislo?: number | null;
  sekce?: string | null;
}

/**
 * Doplní do kroku, co padlo ve větě.
 *
 * „Nastav tempo sto padesát" a „otevři soubory" jsou jedna fráze pro
 * libovolnou hodnotu — ukládat zvlášť příkaz pro každé tempo a každou
 * sekci by nedávalo smysl. Vyslovená hodnota se proto dosadí do prvního
 * parametru odpovídajícího druhu.
 *
 * Číslo mimo meze akce se zahodí: přeslechnuté tempo je lepší nechat
 * být než jím přepsat rozumnou hodnotu.
 */
export function dosadHodnoty(krok: Krok, vysloveno: VyslovenoNavic): Krok {
  const akce = akcePodleId(krok.akce);
  if (!akce) return krok;
  let vysledek = krok;

  const { cislo, sekce } = vysloveno;
  if (cislo !== null && cislo !== undefined) {
    const p = akce.parametry.find((x) => x.typ === 'cislo');
    const vMezich = p
      && (p.od === undefined || cislo >= p.od)
      && (p.do === undefined || cislo <= p.do);
    if (p && vMezich) {
      vysledek = { ...vysledek, hodnoty: { ...vysledek.hodnoty, [p.klic]: cislo } };
    }
  }

  if (sekce) {
    const p = akce.parametry.find((x) => x.typ === 'sekce');
    if (p) vysledek = { ...vysledek, hodnoty: { ...vysledek.hodnoty, [p.klic]: sekce } };
  }

  return vysledek;
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
  vysloveno: VyslovenoNavic = {},
): Promise<VysledekPrikazu> {
  const vysledek: VysledekPrikazu = { provedeno: 0, nezapojene: [], chyba: null };

  for (const surovy of prikaz.kroky) {
    const krok = dosadHodnoty(surovy, vysloveno);
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
