/**
 * Údaje vyčtené z názvu souboru.
 *
 * Tempo, tónina i takt bývají v názvu — tak je pojmenovávají všechny
 * sample packy. Do sloupců v databázi je nikdo nepřepisoval, takže se
 * čtou odsud; bez toho by šlo řadit jen podle abecedy, což u smyčky
 * neříká nic.
 *
 * Používá to server při výpisu samplů i prohlížeč v seznamu souborů,
 * proto to sedí tady a ne u jednoho z nich.
 */

/**
 * Konec údaje v názvu souboru.
 *
 * Buď oddělovač, nebo konec názvu. Bez té druhé možnosti se údaj na
 * konci nikdy nerozpozná — a přípona se ustřihává dřív, takže
 * `riff_100bpm_Em_4-4.wav` končí právě taktem.
 */
const KONEC = '(?=[_\\-\\s.]|$)';

/** Tempo z názvu: „120bpm", „_95_", „128 BPM". */
export function tempoZNazvu(nazev: string): number {
  const m =
    nazev.match(/(\d{2,3})\s*bpm/i) ||
    nazev.match(new RegExp(`[_\\-\\s](\\d{2,3})${KONEC}`));
  const t = m ? Number(m[1]) : 0;
  // Rozumné hranice: čtyřciferná čísla v názvech bývají roky nebo pořadí.
  return t >= 40 && t <= 260 ? t : 0;
}

/** Tónina z názvu: „Am", „F#m", „_C_", „Ebmaj". */
export function toninaZNazvu(nazev: string): string {
  const m = nazev.match(new RegExp(`[_\\-\\s]([A-G](?:#|b)?)(m|min|maj)?${KONEC}`));
  if (!m) return '';
  return m[1] + (m[2] && m[2].startsWith('m') && m[2] !== 'maj' ? 'm' : '');
}

/** Takt z názvu: „4-4", „3_4", „6/8". */
export function taktZNazvu(nazev: string): string {
  const m = nazev.match(new RegExp(`[_\\-\\s](\\d)[\\/\\-_](\\d)${KONEC}`));
  if (!m) return '';
  const spodek = Number(m[2]);
  return [2, 4, 8, 16].includes(spodek) ? `${m[1]}/${m[2]}` : '';
}

/**
 * Je to opravdu tónina?
 *
 * `metadata.key` není vyhrazené pro hudbu — sady bicích si do něj
 * ukládají označení vrstvy (`layer:crash_left:hard:rr1`). Bez téhle
 * kontroly se takový řetězec ukázal ve sloupci tóniny.
 */
export function jeTonina(v: string): boolean {
  return /^[A-Ha-h][#b]?(m|maj|min|dur|moll)?$/.test(String(v).trim());
}

/** Je to zápis taktu? */
export function jeTakt(v: string): boolean {
  return /^\d{1,2}[/\-]\d{1,2}$/.test(String(v).trim());
}

/**
 * Tempo a tónina k jednomu souboru.
 *
 * Metadata mají přednost — když je někdo vyplnil, ví to líp než hádání
 * z názvu.
 */
export function udajeSouboru(
  nazev: string,
  metadata?: Record<string, unknown> | null,
): { bpm: number; tonina: string; takt: string } {
  const cisty = String(nazev).replace(/\.(wav|mp3|aif|aiff|ogg|flac|m4a)$/i, '');
  const m = (metadata || {}) as Record<string, unknown>;
  const mKey = String(m.key ?? '');
  const mTakt = String(m.takt ?? m.meter ?? '');
  return {
    bpm: Number(m.bpm) || tempoZNazvu(cisty),
    tonina: jeTonina(mKey) ? mKey.trim() : toninaZNazvu(cisty),
    takt: jeTakt(mTakt) ? mTakt.trim() : taktZNazvu(cisty),
  };
}
