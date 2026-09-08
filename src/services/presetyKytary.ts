/**
 * Presety kytarového kanálu.
 *
 * Jedna skladba potřebuje víc než jeden zvuk: rytmika, sólo v mezihře,
 * akustika ve sloce. Preset je celé nastavení kanálu pod jedním jménem —
 * model aparátu, bedna, ekvalizér, ozvěna, dozvuk a hlasitosti — takže
 * se mezi nimi dá přepnout jedním klikem nebo nožním přepínačem.
 *
 * Ukládají se ke skladbě vedle sekcí a mixu, protože zvuk patří k písni:
 * tentýž „Sólo" zní v jedné skladbě jinak než v druhé.
 *
 * Data můžou přijít z databáze, kde je zapsala starší verze appky, takže
 * se při načtení srovnávají. Rozhodovací část je schválně bez Web Audia,
 * aby šla ověřit samostatně.
 */

/** Pásmo parametrického ekvalizéru. */
export interface PasmoEq {
  /** Střední frekvence v Hz. */
  hz: number;
  /** Zesílení v dB, kladné i záporné. */
  db: number;
  /** Šířka zásahu. Nižší Q = širší pásmo. */
  q: number;
}

/**
 * Výchozí ekvalizér — pět pásem, všechna na nule.
 *
 * Krajní dvě jsou police, tři uprostřed zvony. Tři pásma, co tu byla
 * dřív, stačila na „přidat basy, ubrat výšky", ale ne na vyříznutí
 * jedné bručící frekvence, kvůli které se kytara pere s basou.
 */
export const VYCHOZI_EQ: PasmoEq[] = [
  { hz: 90, db: 0, q: 0.7 },
  { hz: 250, db: 0, q: 0.9 },
  { hz: 800, db: 0, q: 0.9 },
  { hz: 2500, db: 0, q: 0.9 },
  { hz: 6000, db: 0, q: 0.7 },
];

/** Které pásmo je police a které zvon. Krajní police, zbytek zvony. */
export function typPasma(i: number, pocet = VYCHOZI_EQ.length): BiquadFilterType {
  if (i === 0) return 'lowshelf';
  if (i === pocet - 1) return 'highshelf';
  return 'peaking';
}

export interface PresetKytary {
  id: string;
  nazev: string;
  /** Jméno načteného NAM modelu. Samotný soubor se sem nekopíruje. */
  model?: string;
  /** Jméno impulzu bedny. */
  bedna?: string;
  vstupDb: number;
  vystupDb: number;
  eq: PasmoEq[];
  delay: { zapnuto: boolean; cas: number; zpetna: number; mix: number };
  reverb: { zapnuto: boolean; delka: number; mix: number };
  bypassAparatu: boolean;
  bypassBedny: boolean;
  bypassEq: boolean;
  /**
   * Číslo programu MIDI, kterým se preset vyvolá.
   *
   * Nožní přepínač posílá Program Change; tohle je číslo, na které
   * preset slyší. Bez něj se přepíná jen myší.
   */
  midiProgram?: number;
}

const MEZE = {
  vstupDb: [-24, 24], vystupDb: [-24, 24],
  hz: [20, 20000], db: [-24, 24], q: [0.1, 18],
  cas: [0.01, 2], zpetna: [0, 0.9], mix: [0, 1], delka: [0.1, 10],
  midiProgram: [0, 127],
} as const;

function vMezich(v: any, [min, max]: readonly [number, number], vychozi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return vychozi;
  return Math.max(min, Math.min(max, n));
}

let citac = 0;
export function novePresetId(): string {
  citac += 1;
  return `pk_${Date.now().toString(36)}_${citac.toString(36)}`;
}

/** Preset s výchozím, neutrálním nastavením. */
export function prazdnyPreset(nazev = 'Nový preset'): PresetKytary {
  return {
    id: novePresetId(),
    nazev,
    vstupDb: 0,
    vystupDb: 0,
    eq: VYCHOZI_EQ.map((p) => ({ ...p })),
    delay: { zapnuto: false, cas: 0.35, zpetna: 0.35, mix: 0.25 },
    reverb: { zapnuto: false, delka: 2.2, mix: 0.25 },
    bypassAparatu: false,
    bypassBedny: false,
    bypassEq: true,
  };
}

/** Srovná jeden preset. Vrací `null`, když z něj nezbude nic použitelného. */
export function srovnejPreset(p: any): PresetKytary | null {
  if (!p || typeof p !== 'object') return null;
  const z = prazdnyPreset();
  const nazev = String(p.nazev ?? '').trim().slice(0, 40);

  const eqZdroj = Array.isArray(p.eq) ? p.eq : [];
  const eq = VYCHOZI_EQ.map((vych, i) => {
    const b = eqZdroj[i];
    if (!b || typeof b !== 'object') return { ...vych };
    return {
      hz: vMezich(b.hz, MEZE.hz, vych.hz),
      db: vMezich(b.db, MEZE.db, 0),
      q: vMezich(b.q, MEZE.q, vych.q),
    };
  });

  const program = p.midiProgram === undefined || p.midiProgram === null
    ? undefined
    : Math.round(vMezich(p.midiProgram, MEZE.midiProgram, 0));

  return {
    id: String(p.id || novePresetId()),
    nazev: nazev || 'Preset',
    model: typeof p.model === 'string' && p.model ? p.model.slice(0, 120) : undefined,
    bedna: typeof p.bedna === 'string' && p.bedna ? p.bedna.slice(0, 120) : undefined,
    vstupDb: vMezich(p.vstupDb, MEZE.vstupDb, 0),
    vystupDb: vMezich(p.vystupDb, MEZE.vystupDb, 0),
    eq,
    delay: {
      zapnuto: !!p.delay?.zapnuto,
      cas: vMezich(p.delay?.cas, MEZE.cas, z.delay.cas),
      zpetna: vMezich(p.delay?.zpetna, MEZE.zpetna, z.delay.zpetna),
      mix: vMezich(p.delay?.mix, MEZE.mix, z.delay.mix),
    },
    reverb: {
      zapnuto: !!p.reverb?.zapnuto,
      delka: vMezich(p.reverb?.delka, MEZE.delka, z.reverb.delka),
      mix: vMezich(p.reverb?.mix, MEZE.mix, z.reverb.mix),
    },
    bypassAparatu: !!p.bypassAparatu,
    bypassBedny: !!p.bypassBedny,
    // Chybějící hodnota znamená „EQ vypnutý", jak to má nová kytara.
    bypassEq: p.bypassEq === undefined ? true : !!p.bypassEq,
    midiProgram: program,
  };
}

/**
 * Srovná celý seznam.
 *
 * Duplicitní `id` by se v Reactu praly o klíč a přepínání by skákalo;
 * dvě čísla programu MIDI na stejné hodnotě zase znamenají, že by
 * nožní přepínač vyvolal nepředvídatelný preset — druhému se proto
 * číslo odebere.
 */
export function srovnejPresety(zdroj: unknown): PresetKytary[] {
  if (!Array.isArray(zdroj)) return [];
  const ven: PresetKytary[] = [];
  const idVidena = new Set<string>();
  const programVideny = new Set<number>();
  for (const p of zdroj) {
    const v = srovnejPreset(p);
    if (!v) continue;
    if (idVidena.has(v.id)) v.id = novePresetId();
    idVidena.add(v.id);
    if (v.midiProgram !== undefined) {
      if (programVideny.has(v.midiProgram)) v.midiProgram = undefined;
      else programVideny.add(v.midiProgram);
    }
    ven.push(v);
  }
  return ven.slice(0, 32);
}

/** Preset, na který slyší dané číslo programu MIDI. */
export function presetProProgram(presety: PresetKytary[], program: number): PresetKytary | null {
  return presety.find((p) => p.midiProgram === program) || null;
}

/**
 * První volné číslo programu.
 *
 * Nabízí se při zakládání presetu, ať se nemusí hledat ručně, které
 * ještě nikdo nemá.
 */
export function volnyProgram(presety: PresetKytary[]): number | undefined {
  const obsazena = new Set(presety.map((p) => p.midiProgram).filter((x) => x !== undefined));
  for (let i = 0; i <= 127; i++) if (!obsazena.has(i)) return i;
  return undefined;
}

/** Jméno pro další preset — nabídne obvyklé, pak čísluje. */
const NABIDKA = ['Rytmika', 'Sólo', 'Akustika', 'Čistá', 'Nakopnutá', 'Mezihra'];
export function navrhniNazevPresetu(presety: PresetKytary[]): string {
  const pouzita = new Set(presety.map((p) => p.nazev.toLowerCase()));
  for (const n of NABIDKA) if (!pouzita.has(n.toLowerCase())) return n;
  for (let i = 2; i < 99; i++) {
    const n = `Preset ${i}`;
    if (!pouzita.has(n.toLowerCase())) return n;
  }
  return 'Preset';
}
