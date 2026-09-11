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

/**
 * Vytáhne z odkazu identifikátor skladby.
 *
 * Bere, co člověk zkopíruje: odkaz na příspěvek, hotový vkládaný odkaz
 * i holý identifikátor. Vrací `null`, když to není BandLab — tiše
 * uhodnout něco jiného by vyrobilo přehrávač, který nikdy nic nenajde.
 */
export function idSkladby(vstup: string): string | null {
  const text = (vstup || '').trim();
  if (!text) return null;

  // Holý identifikátor, bez adresy kolem.
  if (new RegExp(`^${UUID.source}$`, 'i').test(text)) return text.toLowerCase();

  let adresa: URL;
  try {
    adresa = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)bandlab\.com$/i.test(adresa.hostname)) return null;

  // `?id=` u vkládaného přehrávače má přednost před cestou: v odkazu na
  // revizi jsou identifikátory dva a tenhle je ten, co se má přehrát.
  const zDotazu = adresa.searchParams.get('id');
  if (zDotazu && UUID.test(zDotazu)) return zDotazu.toLowerCase();

  const zCesty = adresa.pathname.match(UUID);
  return zCesty ? zCesty[0].toLowerCase() : null;
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
}

export const KLIC_SKLADEB = 'neverlate_bandlab_skladby';

/** Je to záznam, se kterým se dá pracovat? Uložená data mohou být z jiné verze. */
export function jeSkladba(x: any): x is UlozenaSkladba {
  return !!x && typeof x.id === 'string' && UUID.test(x.id) && typeof x.nazev === 'string';
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
