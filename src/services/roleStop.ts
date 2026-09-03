/**
 * Poznávání stop podle názvu souboru.
 *
 * Separátory věší za název skladby štítek stopy: `Netáhlo-bass.wav`.
 * Používá to server, když čte složku na disku, i prohlížeč, když
 * uživatel nahraje soubory rovnou z počítače — proto to sedí tady
 * a ne u jednoho z nich. Není v tom nic ze souborového systému,
 * takže to jde importovat na obě strany.
 */

/**
 * Jak se jmenují stopy u jednotlivých separátorů.
 *
 * Neural Mix Pro dělí na acappella / drums / bass / harmonic, Demucs
 * na vocals / drums / bass / other. Obojí míří na stejné fadery, tak
 * se sem vejdou vedle sebe i s českými názvy pro ručně pojmenované.
 */
const ROLE_PODLE_SLOV: { role: string; slova: string[] }[] = [
  { role: 'vocals', slova: ['acappella', 'acapella', 'vocals', 'vocal', 'voc', 'zpev', 'zpěv'] },
  { role: 'drums', slova: ['drums', 'drum', 'beats', 'beat', 'bicí', 'bici'] },
  { role: 'bass', slova: ['bass', 'basa', 'bas'] },
  { role: 'lead', slova: ['lead', 'solo', 'sólo'] },
  { role: 'guitar', slova: ['guitar', 'gtr', 'kytara'] },
  { role: 'metronome', slova: ['metronome', 'metronom', 'click', 'klik'] },
  { role: 'other', slova: ['harmonic', 'harmonics', 'melody', 'instruments', 'instrumental', 'other', 'synth', 'ostatni', 'ostatní'] },
];

/** Bez diakritiky a malými písmeny, ať „sólo" najde i „solo". */
function zjednodus(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Odřízne příponu. */
function bezPripony(jmeno: string): string {
  const i = jmeno.lastIndexOf('.');
  return i > 0 ? jmeno.slice(0, i) : jmeno;
}

/**
 * Která stopa to je, podle konce názvu souboru.
 *
 * Čte se od konce: separátory věší svůj štítek za název skladby, a
 * kdyby se hledalo kdekoli v názvu, tak by se „Bass Communion — Drums"
 * chytlo na první slovo místo na to skutečné za pomlčkou.
 */
export function rolePodleNazvu(jmeno: string): string | null {
  const zaklad = zjednodus(bezPripony(jmeno));
  // Poslední úsek za pomlčkou, podtržítkem nebo mezerou.
  const useky = zaklad.split(/[-_ ]+/).filter(Boolean);
  for (let i = useky.length - 1; i >= 0 && i >= useky.length - 2; i--) {
    for (const { role, slova } of ROLE_PODLE_SLOV) {
      if (slova.includes(useky[i])) return role;
    }
  }
  return null;
}

/**
 * Název skladby bez štítku stopy.
 *
 * Prázdný název je platný výsledek: v exportu se najde i soubor jako
 * „-harmonic.wav", kde separátor název neuložil. Volající si ho pak
 * pojmenuje sám, místo aby ho zahodil.
 */
export function nazevBezRole(jmeno: string): string {
  const zaklad = bezPripony(jmeno);
  const role = rolePodleNazvu(jmeno);
  if (!role) return zaklad.trim();
  const useky = zaklad.split(/[-_ ]+/).filter(Boolean);
  // Uřízne se právě tolik úseků z konce, kolik jich patří ke štítku.
  let konec = useky.length;
  for (let i = useky.length - 1; i >= 0 && i >= useky.length - 2; i--) {
    if (rolePodleNazvu(useky[i]) === role) { konec = i; break; }
  }
  return useky.slice(0, konec).join(' ').trim();
}
