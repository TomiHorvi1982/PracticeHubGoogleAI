/**
 * Odkazy na BandLab.
 *
 * Jejich studio se vložit nedá — na `bandlab.com` i na `/studio` sedí
 * `X-Frame-Options: SAMEORIGIN`, tedy „na cizím webu se nezobrazuju".
 * Je to vědomý zákaz majitele a obcházet ho není v pořádku ani technicky
 * možné bez toho, abychom jejich stránku přeposílali přes vlastní server.
 *
 * Co ale jde, je jejich **vlastní** vkládaný přehrávač na `/embed/`.
 * Ten zákaz nemá, protože je na vkládání přímo určený. Hotové skladby
 * z účtu tedy v aplikaci poslouchat můžeme, jen se v ní nedají nahrávat.
 *
 * Tenhle modul je čistý: z odkazu, který člověk zkopíruje z BandLabu,
 * vytáhne identifikátor. Podob je několik a zkopírovaný odkaz s sebou
 * nese sledovací parametry, takže to chce rozebrat pořádně — a to se dá
 * ověřit testem.
 */

/** Identifikátor skladby na BandLabu — UUID. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Co se z odkazu dá vyčíst. */
export interface RozborOdkazu {
  /** Identifikátor pro vkládaný přehrávač — to, co se skutečně hraje. */
  id: string;
  /** Adresa stránky na BandLabu, pokud ji odkaz nesl. */
  stranka?: string;
}

/**
 * Rozebere odkaz zkopírovaný z BandLabu.
 *
 * Dnešní odkaz na skladbu vypadá takhle:
 *
 *     https://www.bandlab.com/track/<skladba>?revId=<verze>
 *
 * Jsou v něm identifikátory dva a **každý je na něco jiného**; ověřeno
 * zkouškou obou:
 *
 * - vkládaný přehrávač hraje podle `revId`. S identifikátorem z cesty
 *   odpoví „We can't find that track";
 * - stránku skladby naopak `revId` neotevře, `/track/<verze>`
 *   i `/post/<verze>` končí na 404.
 *
 * Proto se do přehrávače bere `revId` a adresa stránky se nechává celá
 * tak, jak přišla — jen bez sledovacích parametrů.
 *
 * Vrací `null`, když to není BandLab. Tiše uhodnout něco jiného by
 * vyrobilo přehrávač, který nikdy nic nenajde.
 */
export function rozborOdkazu(vstup: string): RozborOdkazu | null {
  const text = (vstup || '').trim();
  if (!text) return null;

  // Holý identifikátor, bez adresy kolem.
  if (new RegExp(`^${UUID.source}$`, 'i').test(text)) return { id: text.toLowerCase() };

  let adresa: URL;
  try {
    adresa = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)bandlab\.com$/i.test(adresa.hostname)) return null;

  const revId = adresa.searchParams.get('revId');
  const zDotazu = adresa.searchParams.get('id');
  const zCesty = adresa.pathname.match(UUID);

  // `?id=` je hotová adresa přehrávače, tam už nikdo nic hledat nemusí.
  // Pak teprve `revId`, protože ten hraje. Cesta je až poslední — u dnešních
  // odkazů je v ní skladba, ne verze.
  const id = (zDotazu && UUID.test(zDotazu) && zDotazu)
    || (revId && UUID.test(revId) && revId)
    || (zCesty && zCesty[0]);
  if (!id) return null;

  // Stránka jen u odkazů, které na nějakou vedou — adresa přehrávače sama
  // o sobě není stránka, kam by se dalo „odejít na BandLab".
  const jePrehravac = adresa.pathname.replace(/\/+$/, '').endsWith('/embed');
  const stranka = jePrehravac || !zCesty
    ? undefined
    : `${adresa.origin}${adresa.pathname}${revId ? `?revId=${encodeURIComponent(revId)}` : ''}`;

  return stranka ? { id: id.toLowerCase(), stranka } : { id: id.toLowerCase() };
}

/** Identifikátor pro vkládaný přehrávač. Zkratka pro {@link rozborOdkazu}. */
export function idSkladby(vstup: string): string | null {
  return rozborOdkazu(vstup)?.id ?? null;
}

/**
 * Adresa vkládaného přehrávače.
 *
 * Bez parametrů navíc — cokoli jiného než `id` jejich přehrávač ignoruje
 * a v odkazu by to jen vypadalo, že to něco dělá.
 */
export function adresaPrehravace(id: string): string {
  return `https://www.bandlab.com/embed/?id=${encodeURIComponent(id)}`;
}

/** Uložená skladba, aby se po přepnutí sekce nemusela hledat znovu. */
export interface UlozenaSkladba {
  id: string;
  nazev: string;
  pridano: number;
  /** Kam vede „otevřít na BandLabu". Chybí u skladeb přidaných přehrávačovou adresou. */
  stranka?: string;
}

export const KLIC_SKLADEB = 'neverlate_bandlab_skladby';

/**
 * Je to záznam, se kterým se dá pracovat? Uložená data mohou být z jiné
 * verze — a taky z ruky někoho, kdo si hrál s úložištěm prohlížeče, takže
 * se adresa stránky kontroluje celá. Bez toho by se dal do odkazu
 * propašovat `javascript:`.
 */
export function jeSkladba(x: any): x is UlozenaSkladba {
  if (!x || typeof x.id !== 'string' || !UUID.test(x.id) || typeof x.nazev !== 'string') return false;
  if (x.stranka === undefined) return true;
  return typeof x.stranka === 'string' && jeAdresaBandLabu(x.stranka);
}

function jeAdresaBandLabu(odkaz: string): boolean {
  try {
    const a = new URL(odkaz);
    return a.protocol === 'https:' && /(^|\.)bandlab\.com$/i.test(a.hostname);
  } catch {
    return false;
  }
}

/**
 * Přidá skladbu na začátek seznamu.
 *
 * Stejný identifikátor se nezdvojí — jen se posune nahoru a převezme
 * nový název, protože ten si člověk nejspíš právě opravil.
 */
export function pridejSkladbu(
  seznam: readonly UlozenaSkladba[],
  nova: UlozenaSkladba,
): UlozenaSkladba[] {
  return [nova, ...seznam.filter((s) => s.id !== nova.id)];
}

export function odeberSkladbu(
  seznam: readonly UlozenaSkladba[],
  id: string,
): UlozenaSkladba[] {
  return seznam.filter((s) => s.id !== id);
}

/** Načte uložené skladby. Nesmysly se přeskočí místo pádu celé sekce. */
export function nactiSkladby(): UlozenaSkladba[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const d = JSON.parse(localStorage.getItem(KLIC_SKLADEB) || '[]');
    return Array.isArray(d) ? d.filter(jeSkladba) : [];
  } catch {
    return [];
  }
}

export function ulozSkladby(seznam: readonly UlozenaSkladba[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KLIC_SKLADEB, JSON.stringify(seznam));
  } catch {
    /* Plné úložiště nemá shodit sekci. */
  }
}
