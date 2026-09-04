/**
 * Jméno souboru staženého z TONE3000.
 *
 * Katalog i stahování jezdí přes oficiální API rovnou z prohlížeče
 * (`src/services/tone3000Api.ts`); serveru zbývá jediná role — uložit
 * hotové bajty na disk pod jménem, které jde bezpečně použít.
 *
 * A právě to jméno je cizí text: přišlo v odpovědi služby. Může nést
 * lomítka a přepsat soubor mimo složku, nebo začínat tečkou. Čistí se
 * proto tady, na jednom místě, a je na to zvlášť testováno.
 */
export function bezpecneJmeno(nazev: string, id: number, typ: 'nam' | 'ir'): string {
  const pripona = typ === 'nam' ? '.nam' : '.wav';
  const ocistene = String(nazev || '')
    .replace(/[\\/]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[^\p{L}\p{N} _.()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/^[.\s]+/, '');
  return ocistene ? `${ocistene} [${id}]${pripona}` : `tone3000-${id}${pripona}`;
}
