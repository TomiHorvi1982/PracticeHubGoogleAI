/**
 * Plovoucí okna nad písní.
 *
 * Nahrazují mřížku modulů. Rozdíl není jen vzhledový: mřížka měla pevnou
 * sadu dlaždic, které se daly jen zapnout a vypnout, kdežto okno si otevřeš
 * z vrchní lišty, když ho potřebuješ, položíš kam chceš a zavřeš, až
 * dokoukáš. Rozložení se ukládá ke skladbě, takže příště najdeš plochu tak,
 * jak jsi ji nechal.
 */

export type TypOkna =
  | 'text_chords'
  | 'tabs'
  | 'midi'
  | 'youtube'
  | 'chord_diagrams'
  | 'images'
  | 'notes'
  | 'vzkazy'
  | 'samply'
  | 'stems_mixer'
  | 'tuner'
  | 'fretboard'
  | 'keyboard';

export interface Okno {
  /** Vlastní identita okna. Téhož typu může být otevřeno víc naráz —
   *  třeba dvě tabulatury vedle sebe. */
  id: string;
  typ: TypOkna;
  x: number;
  y: number;
  sirka: number;
  vyska: number;
  /** Které pořadí je navrchu. Kliknutím se okno vytáhne dopředu. */
  poradi: number;
  sbalene?: boolean;
  /**
   * Co má okno uvnitř načtené — kterou tabulaturu, které MIDI.
   * Bez toho by se sice plocha obnovila, ale okna by byla prázdná a
   * vybíralo by se pokaždé znovu.
   */
  obsah?: { prilohaId?: string; index?: number };
}

export const POPIS_OKEN: Record<TypOkna, { nazev: string; ikona: string; vychoziSirka: number; vychoziVyska: number }> = {
  text_chords: { nazev: 'Text a akordy', ikona: '📝', vychoziSirka: 560, vychoziVyska: 520 },
  tabs: { nazev: 'Tabulatura', ikona: '📑', vychoziSirka: 720, vychoziVyska: 560 },
  midi: { nazev: 'MIDI', ikona: '🎹', vychoziSirka: 420, vychoziVyska: 260 },
  youtube: { nazev: 'YouTube', ikona: '🎥', vychoziSirka: 480, vychoziVyska: 340 },
  chord_diagrams: { nazev: 'Diagramy akordů', ikona: '🎸', vychoziSirka: 380, vychoziVyska: 300 },
  images: { nazev: 'Obrázky', ikona: '🖼️', vychoziSirka: 420, vychoziVyska: 380 },
  notes: { nazev: 'Books', ikona: '📚', vychoziSirka: 560, vychoziVyska: 620 },
  samply: { nazev: 'Samples', ikona: '🎛️', vychoziSirka: 460, vychoziVyska: 300 },
  vzkazy: { nazev: 'Chat', ikona: '💬', vychoziSirka: 360, vychoziVyska: 420 },
  stems_mixer: { nazev: 'Mixážní pult', ikona: '🎚️', vychoziSirka: 620, vychoziVyska: 420 },
  tuner: { nazev: 'Ladička', ikona: '🎯', vychoziSirka: 420, vychoziVyska: 380 },
  fretboard: { nazev: 'Hmatník', ikona: '🎸', vychoziSirka: 700, vychoziVyska: 320 },
  keyboard: { nazev: 'Klavír', ikona: '🎹', vychoziSirka: 640, vychoziVyska: 300 },
};

/** Kde se otevře další okno. Nová okna se řadí schodovitě, aby se
 *  nepřekrývala přesně a nešlo je od sebe rozeznat. */
export function dalsiPozice(existujici: Okno[]): { x: number; y: number } {
  const krok = 28;
  const n = existujici.length % 8;
  return { x: 40 + n * krok, y: 40 + n * krok };
}

export function noveOkno(typ: TypOkna, existujici: Okno[]): Okno {
  const p = POPIS_OKEN[typ];
  const { x, y } = dalsiPozice(existujici);
  return {
    id: `okno_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    typ,
    x,
    y,
    sirka: p.vychoziSirka,
    vyska: p.vychoziVyska,
    poradi: Math.max(0, ...existujici.map((o) => o.poradi)) + 1,
  };
}

/** Udrží okno v ploše. Přetažení za okraj by ho jinak nechalo nedosažitelné. */
export function vRamci(o: Okno, sirkaPlochy: number, vyskaPlochy: number): Okno {
  const minViditelne = 120;
  return {
    ...o,
    x: Math.max(-o.sirka + minViditelne, Math.min(o.x, sirkaPlochy - minViditelne)),
    y: Math.max(0, Math.min(o.y, vyskaPlochy - 40)),
  };
}
