import { Chord, Note, Key } from 'tonal';
import { spessaEngine } from './spessaEngine';
import { audioBus } from './audioBus';

/**
 * Virtuální kapela.
 *
 * Hraje podle akordů, ne podle nahrávky: dostane postup, tempo a styl
 * a z toho si každý člen odvodí svůj part. Proto se dá hrát do čehokoli,
 * co si člověk zrovna vymyslí, a ne jen k připraveným podkladům.
 *
 * Zní to přes tutéž zvukovou banku jako MIDI přehrávač a přehrávač
 * tabulatur — jeden zvuk pro celou aplikaci.
 *
 * Časování drží zvukové hodiny, ne časovač prohlížeče: noty se plánují
 * dopředu na přesný okamžik. Časovač jen doplňuje, co se do okna vejde,
 * takže jeho zpoždění není slyšet.
 */

/** Kanály. Bicí musí být na desítce, tak to má General MIDI. */
const KANAL = { bicí: 9, basa: 1, klavesy: 2, kytara: 3 } as const;

export type Clen = keyof typeof KANAL;

/** Bicí noty podle General MIDI. */
const BICI = { kopak: 36, virbl: 38, hihat: 42, otevrena: 46, crash: 49, ride: 51 };

export interface Styl {
  id: string;
  nazev: string;
  popis: string;
  /** Bicí: kde v šestnácti krocích co zní. */
  bici: { nota: number; kroky: number[]; sila?: number }[];
  /** Basa: na kterých krocích a kolikátý tón akordu (0 = základ). */
  basa: { krok: number; stupen: number; delka: number }[];
  /** Doprovod: na kterých krocích zazní akord a jak dlouho. */
  doprovod: { krok: number; delka: number; sila?: number }[];
  /** Výchozí nástroje. */
  nastroje: { basa: number; klavesy: number; kytara: number };
}

export const STYLY: Styl[] = [
  {
    id: 'rock',
    nazev: 'Rock',
    popis: 'Osminové hi-haty, kopák na jedničku a trojku, virbl na dvojku a čtyřku.',
    bici: [
      { nota: BICI.kopak, kroky: [0, 6, 8, 14] },
      { nota: BICI.virbl, kroky: [4, 12] },
      { nota: BICI.hihat, kroky: [0, 2, 4, 6, 8, 10, 12, 14], sila: 70 },
      { nota: BICI.crash, kroky: [0], sila: 60 },
    ],
    basa: [
      { krok: 0, stupen: 0, delka: 2 },
      { krok: 4, stupen: 0, delka: 2 },
      { krok: 8, stupen: 2, delka: 2 },
      { krok: 12, stupen: 0, delka: 2 },
    ],
    doprovod: [{ krok: 0, delka: 8 }, { krok: 8, delka: 8, sila: 70 }],
    nastroje: { basa: 33, klavesy: 4, kytara: 29 },
  },
  {
    id: 'balada',
    nazev: 'Balada',
    popis: 'Klidně, ride místo hi-hatu, akordy se drží celý takt.',
    bici: [
      { nota: BICI.kopak, kroky: [0, 8] },
      { nota: BICI.virbl, kroky: [8], sila: 80 },
      { nota: BICI.ride, kroky: [0, 4, 8, 12], sila: 60 },
    ],
    basa: [
      { krok: 0, stupen: 0, delka: 6 },
      { krok: 8, stupen: 1, delka: 6 },
    ],
    doprovod: [{ krok: 0, delka: 16, sila: 65 }],
    nastroje: { basa: 32, klavesy: 0, kytara: 24 },
  },
  {
    id: 'funk',
    nazev: 'Funk',
    popis: 'Šestnáctinové hi-haty, synkopovaná basa, krátké akordy.',
    bici: [
      { nota: BICI.kopak, kroky: [0, 3, 10] },
      { nota: BICI.virbl, kroky: [4, 12] },
      { nota: BICI.hihat, kroky: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], sila: 55 },
    ],
    basa: [
      { krok: 0, stupen: 0, delka: 1 },
      { krok: 3, stupen: 0, delka: 1 },
      { krok: 6, stupen: 4, delka: 1 },
      { krok: 8, stupen: 0, delka: 1 },
      { krok: 11, stupen: 2, delka: 1 },
      { krok: 14, stupen: 0, delka: 1 },
    ],
    doprovod: [
      { krok: 2, delka: 1, sila: 75 },
      { krok: 6, delka: 1, sila: 75 },
      { krok: 10, delka: 1, sila: 75 },
      { krok: 14, delka: 1, sila: 75 },
    ],
    nastroje: { basa: 36, klavesy: 4, kytara: 27 },
  },
  {
    id: 'metal',
    nazev: 'Metal',
    popis: 'Dvojšlapka na osminy, virbl na dvojku a čtyřku, basa drží kořen.',
    bici: [
      { nota: BICI.kopak, kroky: [0, 2, 4, 6, 8, 10, 12, 14] },
      { nota: BICI.virbl, kroky: [4, 12] },
      { nota: BICI.crash, kroky: [0], sila: 80 },
      { nota: BICI.ride, kroky: [2, 6, 10, 14], sila: 55 },
    ],
    basa: [
      { krok: 0, stupen: 0, delka: 1 },
      { krok: 2, stupen: 0, delka: 1 },
      { krok: 4, stupen: 0, delka: 1 },
      { krok: 6, stupen: 0, delka: 1 },
      { krok: 8, stupen: 0, delka: 1 },
      { krok: 10, stupen: 0, delka: 1 },
      { krok: 12, stupen: 0, delka: 1 },
      { krok: 14, stupen: 0, delka: 1 },
    ],
    doprovod: [{ krok: 0, delka: 4 }, { krok: 8, delka: 4 }],
    nastroje: { basa: 33, klavesy: 4, kytara: 30 },
  },
  {
    id: 'jazz',
    nazev: 'Jazz swing',
    popis: 'Ride s houpavým rytmem, chodící basa, akordy na druhou a čtvrtou.',
    bici: [
      { nota: BICI.ride, kroky: [0, 3, 4, 8, 11, 12], sila: 65 },
      { nota: BICI.hihat, kroky: [4, 12], sila: 60 },
      { nota: BICI.kopak, kroky: [0], sila: 50 },
    ],
    basa: [
      { krok: 0, stupen: 0, delka: 3 },
      { krok: 4, stupen: 1, delka: 3 },
      { krok: 8, stupen: 2, delka: 3 },
      { krok: 12, stupen: 3, delka: 3 },
    ],
    doprovod: [{ krok: 4, delka: 2, sila: 70 }, { krok: 12, delka: 2, sila: 70 }],
    nastroje: { basa: 32, klavesy: 4, kytara: 26 },
  },
];

export interface Akord {
  /** Název, jak ho zná `tonal` — třeba „Am7". */
  nazev: string;
  /** Kolik taktů se drží. */
  taktu: number;
}

export interface StavKapely {
  hraje: boolean;
  bpm: number;
  styl: string;
  postup: Akord[];
  /** Který akord v postupu zrovna zní. */
  akordIndex: number;
  krok: number;
  /** Kdo hraje a kdo mlčí. */
  clenove: Record<Clen, boolean>;
  hlasitosti: Record<Clen, number>;
  chyba: string | null;
}

type Poslucha = (s: StavKapely) => void;

const KROKU = 16;

class AiKapela {
  private stav: StavKapely = {
    hraje: false,
    bpm: 110,
    styl: 'rock',
    postup: [
      { nazev: 'Am', taktu: 1 },
      { nazev: 'F', taktu: 1 },
      { nazev: 'C', taktu: 1 },
      { nazev: 'G', taktu: 1 },
    ],
    akordIndex: 0,
    krok: 0,
    clenove: { bicí: true, basa: true, klavesy: true, kytara: true },
    hlasitosti: { bicí: 0.9, basa: 0.85, klavesy: 0.6, kytara: 0.5 },
    chyba: null,
  };

  private posluchaci = new Set<Poslucha>();
  private casovac: number | null = null;
  /** Krok, který se plánuje jako další, a jeho čas ve zvukových hodinách. */
  private dalsiKrok = 0;
  private casKroku = 0;
  /** Kolikátý takt od začátku — podle něj se posouvá postup. */
  private takt = 0;

  private static readonly OKNO = 0.25;
  private static readonly TIK_MS = 40;

  constructor() {
    // Když se zvuku chopí něco jiného, kapela přestane hrát — bez toho
    // by hrála dál pod tím, co se pustilo místo ní.
    audioBus.subscribe((co) => {
      if (this.stav.hraje && co?.id !== 'ai-kapela') this.stop();
    });
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  public getStav(): StavKapely {
    return this.stav;
  }

  private oznam(z: Partial<StavKapely> = {}) {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  private get styl(): Styl {
    return STYLY.find((s) => s.id === this.stav.styl) || STYLY[0];
  }

  private delkaKroku(): number {
    // Šestnáctina: čtyři na dobu.
    return 60 / this.stav.bpm / 4;
  }

  public nastavBpm(bpm: number) {
    this.oznam({ bpm: Math.max(40, Math.min(240, Math.round(bpm))) });
  }

  public nastavStyl(id: string) {
    this.oznam({ styl: id });
    if (this.stav.hraje) this.nastavNastroje();
  }

  public nastavPostup(postup: Akord[]) {
    this.oznam({ postup: postup.length ? postup : this.stav.postup });
  }

  /**
   * Postup z tóniny.
   *
   * Ne náhodné akordy: bere se první, čtvrtý, pátý a šestý stupeň, což je
   * kostra drtivé většiny písniček. Kdo chce něco jiného, přepíše si to.
   */
  public postupZToniny(ton: string, dur: boolean): void {
    try {
      const akordy = dur ? Key.majorKey(ton).chords : Key.minorKey(ton).natural.chords;
      const vyber = dur ? [0, 5, 3, 4] : [0, 5, 2, 6];
      this.nastavPostup(
        vyber
          .map((i) => akordy[i])
          .filter(Boolean)
          .map((n) => ({ nazev: String(n).replace(/M(?![a-z0-9])/, ''), taktu: 1 })),
      );
    } catch {
      this.oznam({ chyba: 'Z téhle tóniny se postup odvodit nepodařilo.' });
    }
  }

  public prepniClena(kdo: Clen) {
    this.oznam({ clenove: { ...this.stav.clenove, [kdo]: !this.stav.clenove[kdo] } });
  }

  public nastavHlasitost(kdo: Clen, v: number) {
    this.oznam({ hlasitosti: { ...this.stav.hlasitosti, [kdo]: Math.max(0, Math.min(1, v)) } });
  }

  private nastavNastroje() {
    const s = this.styl;
    spessaEngine.zmenNastroj(KANAL.basa, s.nastroje.basa);
    spessaEngine.zmenNastroj(KANAL.klavesy, s.nastroje.klavesy);
    spessaEngine.zmenNastroj(KANAL.kytara, s.nastroje.kytara);
  }

  public async start(): Promise<void> {
    if (this.stav.hraje) return;
    try {
      await spessaEngine.pripravit();
    } catch (e: any) {
      this.oznam({ chyba: e?.message || 'Zvuková banka se nenačetla.' });
      return;
    }
    this.nastavNastroje();
    this.dalsiKrok = 0;
    this.takt = 0;
    this.casKroku = spessaEngine.cas + 0.15;
    // Kapela je zvukový zdroj jako každý jiný: když se spustí, ostatní
    // mlčí. Jinak by hrála přes MIDI přehrávač nebo mixážní pult.
    audioBus.claim('ai-kapela', `AI Band — ${this.styl.nazev}`, 'Jam Room');
    this.oznam({ hraje: true, chyba: null, akordIndex: 0 });
    this.casovac = window.setInterval(() => this.doplnPlan(), AiKapela.TIK_MS);
  }

  public stop(): void {
    if (this.casovac !== null) window.clearInterval(this.casovac);
    this.casovac = null;
    // Naplánované noty by dohrály i po zastavení — každý kanál se umlčí.
    for (const kanal of Object.values(KANAL)) {
      for (let n = 24; n < 100; n++) spessaEngine.notaDo(kanal, n, spessaEngine.cas);
    }
    audioBus.release('ai-kapela');
    this.oznam({ hraje: false, krok: 0 });
  }

  public prepni(): void {
    this.stav.hraje ? this.stop() : void this.start();
  }

  /** Který akord platí v daném taktu. */
  private akordVTaktu(takt: number): Akord {
    const celkem = this.stav.postup.reduce((s, a) => s + Math.max(1, a.taktu), 0);
    let zbytek = takt % celkem;
    for (const a of this.stav.postup) {
      const d = Math.max(1, a.taktu);
      if (zbytek < d) return a;
      zbytek -= d;
    }
    return this.stav.postup[0];
  }

  /**
   * Tóny akordu jako čísla MIDI, seřazené od nejnižšího.
   *
   * Bez rozumné polohy by doprovod skákal přes celou klaviaturu; drží se
   * proto kolem malé oktávy a basa o dvě oktávy níž.
   */
  private tonyAkordu(nazev: string): number[] {
    const info = Chord.get(nazev);
    if (!info.notes.length) return [];
    return info.notes
      .map((n) => Note.midi(`${n}4`))
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b);
  }

  private doplnPlan(): void {
    const ted = spessaEngine.cas;
    while (this.casKroku < ted + AiKapela.OKNO) {
      const krok = this.dalsiKrok;
      const kdy = this.casKroku;
      const s = this.styl;
      const akord = this.akordVTaktu(this.takt);
      const tony = this.tonyAkordu(akord.nazev);
      const dk = this.delkaKroku();

      if (this.stav.clenove.bicí) {
        for (const linka of s.bici) {
          if (!linka.kroky.includes(krok)) continue;
          const sila = (linka.sila ?? 100) * this.stav.hlasitosti.bicí;
          spessaEngine.notaOd(KANAL.bicí, linka.nota, sila, kdy);
          spessaEngine.notaDo(KANAL.bicí, linka.nota, kdy + 0.1);
        }
      }

      if (this.stav.clenove.basa && tony.length) {
        for (const b of s.basa) {
          if (b.krok !== krok) continue;
          // Basa hraje o dvě oktávy níž, jinak by lezla doprovodu do cesty.
          const nota = tony[b.stupen % tony.length] - 24;
          const sila = 100 * this.stav.hlasitosti.basa;
          spessaEngine.notaOd(KANAL.basa, nota, sila, kdy);
          spessaEngine.notaDo(KANAL.basa, nota, kdy + b.delka * dk * 0.9);
        }
      }

      if (tony.length) {
        for (const d of s.doprovod) {
          if (d.krok !== krok) continue;
          const sila = (d.sila ?? 90);
          if (this.stav.clenove.klavesy) {
            for (const t of tony) {
              spessaEngine.notaOd(KANAL.klavesy, t, sila * this.stav.hlasitosti.klavesy, kdy);
              spessaEngine.notaDo(KANAL.klavesy, t, kdy + d.delka * dk * 0.95);
            }
          }
          if (this.stav.clenove.kytara) {
            // Kytara o oktávu výš a rozložená, ať se s klávesami nemíchá
            // do jedné hmoty.
            tony.forEach((t, i) => {
              const kdyRozklad = kdy + i * 0.012;
              spessaEngine.notaOd(KANAL.kytara, t + 12, sila * this.stav.hlasitosti.kytara, kdyRozklad);
              spessaEngine.notaDo(KANAL.kytara, t + 12, kdy + d.delka * dk * 0.9);
            });
          }
        }
      }

      // Zobrazení se přepne, až ten krok opravdu zazní.
      const zpozdeni = Math.max(0, (kdy - ted) * 1000);
      const indexAkordu = this.indexVPostupu(this.takt);
      window.setTimeout(() => {
        if (this.stav.hraje) this.oznam({ krok, akordIndex: indexAkordu });
      }, zpozdeni);

      this.casKroku += dk;
      this.dalsiKrok = (krok + 1) % KROKU;
      if (this.dalsiKrok === 0) this.takt++;
    }
  }

  private indexVPostupu(takt: number): number {
    const celkem = this.stav.postup.reduce((s, a) => s + Math.max(1, a.taktu), 0);
    let zbytek = takt % celkem;
    for (let i = 0; i < this.stav.postup.length; i++) {
      const d = Math.max(1, this.stav.postup[i].taktu);
      if (zbytek < d) return i;
      zbytek -= d;
    }
    return 0;
  }
}

export const aiKapela = new AiKapela();
