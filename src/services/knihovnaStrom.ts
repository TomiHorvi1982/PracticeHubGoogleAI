/**
 * Jak je knihovna roztříděná.
 *
 * Dvě úrovně, ne volné složky. `category` říká, co soubor je — PDF,
 * MIDI, tabulatura. Druhá úroveň říká, o čem je: tabulatura patří ke
 * kapele, PDF je teorie nebo text, MIDI je klavírní, bicí nebo celá
 * skladba. Hlubší strom by u sedmnácti tisíc souborů znamenal hlavně
 * víc míst, kam něco omylem spadne.
 *
 * Nabídka podkategorií je návrh, ne číselník: u tabulatur je to jméno
 * kapely a těch je tolik, kolik jich kdo nahraje.
 */

export interface Kategorie {
  /** Hodnota ve sloupci `category`. */
  id: string;
  nazev: string;
  ikona: string;
  /** Nabídka druhé úrovně. Psát jde i cokoli jiného. */
  podkategorie: string[];
  /**
   * Jak soubor pojmenovat, aby ho appka našla a zařadila sama.
   * Prázdné tam, kde na názvu nezáleží.
   */
  napoveda?: string;
}

export const KATEGORIE: Kategorie[] = [
  {
    id: 'guitar_pro',
    nazev: 'Tabulatury',
    ikona: '🎸',
    podkategorie: [],
    napoveda: 'Interpret - Název.gp5 — appka z toho pozná kapelu i skladbu.',
  },
  {
    id: 'pdf',
    nazev: 'PDF a noty',
    ikona: '📄',
    podkategorie: ['akordy', 'tabulatury', 'noty', 'teorie', 'knihy', 'texty písní', 'manuály'],
    napoveda: 'Interpret - Název.pdf u písní; u knih stačí název.',
  },
  {
    id: 'midi',
    nazev: 'MIDI',
    ikona: '🎹',
    podkategorie: ['klavírní', 'bicí', 'skladby', 'cvičení'],
    napoveda: 'Interpret - Název.mid',
  },
  {
    id: 'drum_kit_sample',
    nazev: 'Bicí samply',
    ikona: '🥁',
    podkategorie: ['kick', 'snare', 'hihat', 'tom', 'crash', 'ride', 'perkuse'],
    napoveda: 'nazev_120bpm_4-4.wav — tempo a takt appka čte z názvu.',
  },
  {
    id: 'drum_loop',
    nazev: 'Bicí smyčky',
    ikona: '🔁',
    podkategorie: ['rock', 'metal', 'funk', 'pop', 'jazz', 'latin', 'fill'],
    napoveda: 'nazev_120bpm_4-4.wav — bez tempa se smyčka nedá srovnat s ostatními.',
  },
  {
    id: 'bass_sample',
    nazev: 'Basové samply',
    ikona: '🎸',
    podkategorie: ['riffy', 'jednotlivé tóny', 'smyčky'],
    napoveda: 'nazev_120bpm_Am_4-4.wav — tempo, tónina a takt.',
  },
  {
    id: 'guitar_sample',
    nazev: 'Kytarové samply',
    ikona: '🎸',
    podkategorie: ['riffy', 'akordy', 'sóla', 'smyčky'],
    napoveda: 'nazev_120bpm_Am_4-4.wav — tempo, tónina a takt.',
  },
  {
    id: 'vocal_sample',
    nazev: 'Vokální samply',
    ikona: '🎤',
    podkategorie: ['sbory', 'ad-lib', 'fráze'],
    napoveda: 'nazev_120bpm_Am.wav',
  },
  {
    id: 'stem_mix',
    nazev: 'Rozdělené stopy',
    ikona: '🎚️',
    podkategorie: ['zpěv', 'kytara', 'basa', 'bicí', 'ostatní'],
    napoveda: 'Interpret - Název - nástroj.wav',
  },
  {
    id: 'recordings',
    nazev: 'Nahrávky',
    ikona: '🎙️',
    podkategorie: ['zkoušky', 'koncerty', 'dema'],
    napoveda: 'RRRR-MM-DD - popis.wav — podle data se to pak dobře hledá.',
  },
  {
    id: 'images',
    nazev: 'Obrázky',
    ikona: '🖼️',
    podkategorie: ['kapely', 'interpreti', 'teorie', 'nástroje', 'aparatura', 'plakáty'],
  },
  {
    id: 'soundfont',
    nazev: 'Zvukové banky',
    ikona: '🎛️',
    podkategorie: [],
  },
];

/**
 * Kategorie, které appka umí použít, i když v nich zatím nic neleží.
 *
 * Sekce Samples se ptá na `bass_sample`, `guitar_sample` a `vocal_sample`
 * a mixážní pult na `stem_mix`. Dokud v nich nic není, strom je z databáze
 * nedostane — a správce nemá kam soubory přetáhnout. Nabízejí se proto
 * jako prázdné složky.
 */
export const OCEKAVANE = [
  'drum_kit_sample',
  'drum_loop',
  'bass_sample',
  'guitar_sample',
  'vocal_sample',
  'stem_mix',
  'recordings',
  'images',
];

export const PODLE_ID: Record<string, Kategorie> = Object.fromEntries(
  KATEGORIE.map((k) => [k.id, k])
);

/** Uzel stromu, jak ho vrací server. */
export interface UzelStromu {
  kategorie: string;
  podkategorie: string | null;
  souboru: number;
  bajtu: number;
}

/** Lidský název kategorie. Neznámé se ukážou tak, jak jsou v databázi. */
export function nazevKategorie(id: string): string {
  return PODLE_ID[id]?.nazev || id;
}

export function ikonaKategorie(id: string): string {
  return PODLE_ID[id]?.ikona || '📁';
}

/**
 * Návrh podkategorie z názvu souboru.
 *
 * Jen nápověda pro správce, ne automatické zařazení: „snare" v názvu
 * bicího samplu je spolehlivé, ale u PDF by hádání podle slov zařadilo
 * půlku sbírky špatně a nikdo by si toho nevšiml.
 */
export function navrhniPodkategorii(kategorie: string, nazev: string): string | null {
  const n = nazev.toLowerCase();
  const nabidka = PODLE_ID[kategorie]?.podkategorie || [];

  // Bicí a stopy se poznají podle jména nástroje v souboru.
  if (kategorie === 'drum_kit_sample' || kategorie === 'stem_mix' || kategorie === 'drum_loop') {
    const anglicky: Record<string, string> = {
      kick: 'kick', snare: 'snare', hihat: 'hihat', hat: 'hihat', tom: 'tom',
      crash: 'crash', ride: 'ride', perc: 'perkuse',
      vocal: 'zpěv', vox: 'zpěv', guitar: 'kytara', bass: 'basa', drum: 'bicí',
    };
    for (const [klic, hodnota] of Object.entries(anglicky)) {
      if (n.includes(klic) && nabidka.includes(hodnota)) return hodnota;
    }
  }

  // Jinak jen shoda s nabídkou, bez vymýšlení.
  return nabidka.find((p) => n.includes(p.toLowerCase())) || null;
}
