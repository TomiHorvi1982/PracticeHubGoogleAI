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

/**
 * Tónina z vysloveného názvu.
 *
 * České názvosloví se s anglickým rozchází přesně u dvou tónů: české
 * „H" je anglické B, a české „B" je anglické Bb. Kdo řekne „tónina H",
 * myslí B — bez tohohle by se nastavila o půltón vedle a nikdo by
 * netušil proč.
 *
 * Rozumí i křížkům a béčkům řečeným slovem: „cis", „es", „fis".
 */
const ZAKLADNI: Record<string, string> = {
  c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A',
  h: 'B',   // české H = anglické B
  b: 'A#',  // české B = anglické Bb
};

export function toninaZReci(text: string): string | null {
  const slova = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const slovo of slova) {
    // Tvary „cis", „fis" — křížek řečený slovem.
    const sKrizkem = /^([cdefgah])is$/.exec(slovo);
    if (sKrizkem) {
      const zaklad = ZAKLADNI[sKrizkem[1]];
      if (zaklad) return posunOPultón(zaklad, 1);
    }
    // Tvary „es", „as" — béčko řečené slovem.
    const sBeckem = /^([cdefga])s$/.exec(slovo);
    if (sBeckem) {
      const zaklad = ZAKLADNI[sBeckem[1]];
      if (zaklad) return posunOPultón(zaklad, -1);
    }
    // Prostý název, případně s křížkem zapsaným znakem.
    // Třída musí obsahovat i „b": české B je samostatný název tónu,
    // ne béčko u jiného — bez něj se „tónina B" minula úplně.
    const prosty = /^([cdefgahb])(#)?$/.exec(slovo);
    if (prosty) {
      const zaklad = ZAKLADNI[prosty[1]];
      if (zaklad) return prosty[2] ? posunOPultón(zaklad, 1) : zaklad;
    }
  }
  return null;
}

const CHROMATICKY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function posunOPultón(ton: string, o: number): string {
  const i = CHROMATICKY.indexOf(ton);
  if (i < 0) return ton;
  return CHROMATICKY[(i + o + 12) % 12];
}
