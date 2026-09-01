import { PRAH } from './shoda';

/**
 * Nastavení hlasového ovládání.
 *
 * Drží se v prohlížeči, ne v databázi: je to volba toho, kdo zrovna
 * sedí u mikrofonu, a v hlučné zkušebně se hodí jiná přísnost než
 * doma. Bubeníkovi za bicími nemá co diktovat správce.
 */

const KLIC = 'neverlate_hlas_nastaveni';

export interface NastaveniHlasu {
  /**
   * Jak přesně musí věta sedět, aby se příkaz spustil.
   *
   * Níž znamená ochotnější rozpoznávání za cenu občasného omylu, výš
   * naopak. Na pódiu bývá lepší nerozumět než udělat něco jiného.
   */
  prah: number;
  /** Přečíst nahlas, co se spustilo. */
  potvrzovatHlasem: boolean;
  /** Ukázat, co appka slyšela, i když příkaz nenašla. */
  ukazovatSlysene: boolean;
}

export const VYCHOZI: NastaveniHlasu = {
  prah: PRAH,
  potvrzovatHlasem: false,
  ukazovatSlysene: true,
};

export function nactiNastaveni(): NastaveniHlasu {
  try {
    const ulozene = localStorage.getItem(KLIC);
    if (!ulozene) return VYCHOZI;
    const n = JSON.parse(ulozene) as Partial<NastaveniHlasu>;
    return {
      // Práh se drží v rozumných mezích: nula by spouštěla cokoli,
      // jednička by nespustila nic.
      prah: Math.max(0.3, Math.min(0.95, Number(n.prah) || VYCHOZI.prah)),
      potvrzovatHlasem: Boolean(n.potvrzovatHlasem),
      ukazovatSlysene: n.ukazovatSlysene !== false,
    };
  } catch {
    return VYCHOZI;
  }
}

export function ulozNastaveni(n: NastaveniHlasu): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(n));
  } catch {
    /* zakázané úložiště nesmí shodit hlasové ovládání */
  }
}

/** Přečte krátkou větu česky — potvrzení toho, co se spustilo. */
export function rekni(text: string): void {
  if (typeof speechSynthesis === 'undefined' || !text.trim()) return;
  const veta = new SpeechSynthesisUtterance(text);
  veta.lang = 'cs-CZ';
  const cesky = speechSynthesis.getVoices().find((h) => /^cs/i.test(h.lang));
  if (cesky) veta.voice = cesky;
  speechSynthesis.cancel();
  speechSynthesis.speak(veta);
}
