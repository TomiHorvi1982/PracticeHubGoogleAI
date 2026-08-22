/**
 * Odvození údajů o písni z toho, co už o ní víme.
 *
 * Knihovna má filtrovat podle tóniny a akordů, jenže vyplněné skoro nejsou.
 * Část se ale dá spočítat — a co spočítat nejde (tempo), se radši nechá
 * prázdné, než aby se hádalo.
 */

const TONY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** České značení: H je anglické B, B je Bb. */
const NA_PULTON: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, B: 10, Bb: 10, H: 11,
};

export interface RozborAkordu {
  puvodni: string;
  zaklad: number;
  mol: boolean;
}

/**
 * Rozebere akord na základní tón a to, jestli je mollový.
 *
 * Pozor na české značení: `Hmi` je h moll, `B` je béčko (Bb), ne anglické B.
 * Kdyby se to spletlo, odhad tóniny by u celé české sbírky sedl vedle.
 */
export function rozeberAkord(text: string): RozborAkordu | null {
  const m = text.trim().match(/^([A-H])(#|b)?(.*)$/);
  if (!m) return null;

  const klic = m[1] + (m[2] || '');
  const zaklad = NA_PULTON[klic];
  if (zaklad === undefined) return null;

  const zbytek = m[3] || '';
  // `maj` musí projít dřív než `m` — jinak by se Cmaj7 četlo jako moll.
  const mol = /^(mi|m(?!aj))/i.test(zbytek);
  return { puvodni: text.trim(), zaklad, mol };
}

export function jeAkord(text: string): boolean {
  return /^[A-H](#|b)?(mi|maj|m|dim|aug|sus|add)?\d*(\/[A-H](#|b)?)?$/.test(text.trim());
}

/** Stupně durové a mollové stupnice v půltónech. */
const DUR = [0, 2, 4, 5, 7, 9, 11];
const MOLL = [0, 2, 3, 5, 7, 8, 10];
/** Které stupně stupnice bývají mollové — podle toho se pozná souzvuk. */
const DUR_MOLOVE = new Set([2, 4, 9]);
const MOLL_MOLOVE = new Set([0, 5, 7]);

export interface OdhadToniny {
  tonina: string;
  jistota: number;
}

/**
 * Odhadne tóninu z posloupnosti akordů.
 *
 * Zkusí všech dvanáct durových a dvanáct mollových tónin a vybere tu, do
 * které padne nejvíc akordů i s jejich mollovostí. Při shodě rozhoduje,
 * jestli je tónika prvním nebo posledním akordem — písně na tónice
 * obvykle končí.
 */
export function odhadniToninu(akordy: string[]): OdhadToniny | null {
  const rozebrane = akordy.map(rozeberAkord).filter((a): a is RozborAkordu => a !== null);
  if (rozebrane.length < 3) return null;

  let nej: OdhadToniny | null = null;
  let nejSkore = 0;

  for (let tonika = 0; tonika < 12; tonika++) {
    for (const jeMoll of [false, true]) {
      const stupne = jeMoll ? MOLL : DUR;
      const molove = jeMoll ? MOLL_MOLOVE : DUR_MOLOVE;
      let skore = 0;

      for (const a of rozebrane) {
        const stupen = (a.zaklad - tonika + 12) % 12;
        const idx = stupne.indexOf(stupen);
        if (idx === -1) continue;
        skore += 1;
        // Souhlas v mollovosti je silnější signál než pouhá příslušnost
        // tónu — durová a mollová tónina sdílejí všech sedm tónů.
        if (molove.has(stupen) === a.mol) skore += 0.6;
      }

      // Písně obvykle začínají i končí na tónice.
      if (rozebrane[0].zaklad === tonika && rozebrane[0].mol === jeMoll) skore += 1.2;
      const posledni = rozebrane[rozebrane.length - 1];
      if (posledni.zaklad === tonika && posledni.mol === jeMoll) skore += 1.8;

      if (skore > nejSkore) {
        nejSkore = skore;
        nej = {
          tonina: TONY[tonika] + (jeMoll ? 'm' : ''),
          jistota: Math.min(1, skore / (rozebrane.length * 1.6 + 3)),
        };
      }
    }
  }

  // Slabý odhad je horší než žádný — filtr by pak sliboval jistotu, kterou nemá.
  return nej && nej.jistota >= 0.5 ? nej : null;
}

/** Akordy v pořadí výskytu, bez opakování. */
export function jedinecneAkordy(akordy: string[]): string[] {
  const videne = new Set<string>();
  const out: string[] = [];
  for (const a of akordy) {
    const t = a.trim();
    if (!t || videne.has(t)) continue;
    videne.add(t);
    out.push(t);
  }
  return out;
}
