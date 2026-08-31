/**
 * Tónina z předznamenání.
 *
 * Guitar Pro neukládá název tóniny, jen počet křížků (kladně) nebo béček
 * (záporně) a jestli je to dur nebo moll. Zbytek je kvintový kruh, takže
 * se dá spočítat — na rozdíl od hádání tóniny z not, které u kytarových
 * tabulatur s riffy bez terciií stejně vychází nespolehlivě.
 *
 * Bez závislostí, ať jde ověřit samostatně.
 */

const DUR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const DUR_BECKA = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const MOLL = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
const MOLL_BECKA = ['Am', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];

export function tonikaZPredznamenani(predznamenani: number, moll: boolean): string {
  const pocet = Math.max(-7, Math.min(7, Math.round(Number(predznamenani) || 0)));
  if (pocet >= 0) return (moll ? MOLL : DUR)[pocet];
  return (moll ? MOLL_BECKA : DUR_BECKA)[-pocet];
}

/** Samotná tónika bez „m" — kontext aplikace pracuje s ní. */
export function tonika(nazevToniny: string): string {
  return nazevToniny.replace(/m$/, '');
}
