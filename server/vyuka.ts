import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Přihlášení žáka přezdívkou a PINem.
 *
 * Děti e-mail většinou nemají a heslo zapomenou do týdne. Účet proto
 * zakládá učitel a dítě se hlásí tím, co si pamatuje.
 *
 * Uvnitř to pořád běží na běžném účtu Supabase — jen adresa je odvozená
 * a nikdo ji nevidí. PIN skutečné heslo účtu není: heslo je dlouhé
 * náhodné tajemství, které leží v tabulce `zaci_pristup`, kam se přes
 * pravidla přístupu nedostane nikdo kromě serveru. Kdyby se otisk PINu
 * prozradil, přihlásit se s ním pořád nedá.
 *
 * Tenhle modul je schválně bez databáze i bez Expressu, aby šel celý
 * ověřit testem.
 */

/** Doména odvozených adres. Nikdy se na ni nic neposílá. */
const DOMENA = 'zaci.neverlast.local';

/**
 * Přezdívka na adresu.
 *
 * Otisk učitele v adrese je tam proto, že přezdívka je jedinečná jen
 * u jednoho učitele — dvě Aničky u dvou učitelů jsou v pořádku a musí
 * skončit na různých adresách.
 */
export function adresaZaka(prezdivka: string, ucitelUid: string): string {
  const slug = prezdivka
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diakritika pryč, ať je adresa platná
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'zak';
  const ucitel = createHash('sha256').update(ucitelUid).digest('hex').slice(0, 8);
  return `zak.${slug}.${ucitel}@${DOMENA}`;
}

/** Čtyři číslice, nic jiného. */
export function platnyPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Přezdívka, kterou dítě zvládne napsat.
 *
 * Bez mezer a diakritiky schválně: první, co se stane, je překlep
 * v „Anička" versus „Anicka", a dítě pak neví, proč se nedostane dovnitř.
 */
export function platnaPrezdivka(p: string): boolean {
  return /^[A-Za-z0-9._-]{2,24}$/.test(p);
}

/** Heslo účtu. Není odvozené z PINu a nikdy se nikam neukazuje. */
export function noveTajemstvi(): string {
  return randomBytes(24).toString('base64url');
}

/** Kratší klíč než tohle není otisk, ale poškozený řádek. */
const DELKA_KLICE = 32;

/**
 * Otisk PINu.
 *
 * `scrypt` je v Node vestavěný, takže kvůli čtyřem číslicím nepřibývá
 * závislost. Sůl je u každého žáka jiná — bez ní by se deset tisíc
 * možných PINů daly předpočítat jednou pro všechny.
 */
export function otiskPinu(pin: string): string {
  const sul = randomBytes(16);
  const klic = scryptSync(pin, sul, DELKA_KLICE);
  return `scrypt$${sul.toString('hex')}$${klic.toString('hex')}`;
}

export function sediPin(pin: string, otisk: string): boolean {
  const [druh, sulHex, klicHex] = String(otisk).split('$');
  if (druh !== 'scrypt' || !sulHex || !klicHex) return false;
  try {
    const sul = Buffer.from(sulHex, 'hex');
    const ocekavany = Buffer.from(klicHex, 'hex');
    // Délka se kontroluje, ne přebírá z uloženého řádku. Otisk
    // s prázdným klíčem by jinak porovnal dvě prázdná pole — a to vyjde
    // jako shoda, takže by prošel libovolný PIN.
    if (sul.length === 0 || ocekavany.length !== DELKA_KLICE) return false;
    const spocitany = scryptSync(pin, sul, DELKA_KLICE);
    // Porovnání odolné vůči měření času: `===` by prozradilo, kolik
    // znaků sedí, podle toho, jak dlouho trvalo.
    return timingSafeEqual(ocekavany, spocitany);
  } catch {
    return false;
  }
}

/** Kolik chyb za sebou a jak dlouho pak zavřeno. */
export const POKUSU_DO_ZAMKU = 5;
export const ZAMEK_MINUT = 10;

export interface StavPristupu {
  pokusu: number;
  blokovano_do: string | null;
}

/**
 * Je účet právě zavřený?
 *
 * PIN má deset tisíc kombinací — bez omezení pokusů se uhodne za chvíli.
 * Musí to hlídat server; v prohlížeči by to byla jen ozdoba.
 */
export function jeBlokovano(stav: StavPristupu, ted = Date.now()): boolean {
  if (!stav.blokovano_do) return false;
  return new Date(stav.blokovano_do).getTime() > ted;
}

/**
 * Jak vypadá stav po dalším pokusu.
 *
 * Po úspěchu se počitadlo nuluje — jinak by se dítě, které se jednou
 * spletlo za celý měsíc, postupně dopočítalo k zámku.
 */
export function poPokusu(stav: StavPristupu, uspech: boolean, ted = Date.now()): StavPristupu {
  if (uspech) return { pokusu: 0, blokovano_do: null };
  const pokusu = stav.pokusu + 1;
  if (pokusu < POKUSU_DO_ZAMKU) return { pokusu, blokovano_do: null };
  return {
    pokusu: 0,
    blokovano_do: new Date(ted + ZAMEK_MINUT * 60_000).toISOString(),
  };
}

/** Kolik minut ještě zbývá, než se účet otevře. */
export function zbyvaMinut(stav: StavPristupu, ted = Date.now()): number {
  if (!stav.blokovano_do) return 0;
  const zbyva = new Date(stav.blokovano_do).getTime() - ted;
  return zbyva > 0 ? Math.ceil(zbyva / 60_000) : 0;
}

/**
 * Sekce, které smí učitel žákovi povolit.
 *
 * Vypsané schválně, ne odvozené z navigace: kdyby se seznam bral
 * automaticky, každá nová sekce studia by se žákům otevřela sama.
 * Přidání sem má být vědomé rozhodnutí.
 */
export const POVOLITELNE_SEKCE = [
  'songbook',
  'alphatab',
  'texty',
  'practise',
  'instruments',
  'practice',
  'tuner',
  'stemmixer',
  'zalozky',
] as const;

export function ocistiSekce(vstup: unknown): string[] {
  if (!Array.isArray(vstup)) return [];
  const povolene = new Set<string>(POVOLITELNE_SEKCE);
  return [...new Set(vstup.filter((s): s is string => typeof s === 'string' && povolene.has(s)))];
}
