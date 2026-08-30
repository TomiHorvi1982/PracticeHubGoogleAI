import { YIN } from 'pitchfinder';
import { Note, Scale, Chord } from 'tonal';
import { audioSynth, InstrumentProfile } from './audioSynth';
import { zvukovaKarta } from './zvukovaKarta';

/**
 * Poslech nástroje z mikrofonu.
 *
 * Ladička v appce už tón pozná, ale zahodí ho — zajímá ji jen odchylka od
 * nejbližší struny. Tady se tóny sbírají: z toho, co člověk zahraje během
 * pár vteřin, se dá poznat stupnice i akord, a hmatník na to může rovnou
 * ukázat.
 *
 * Rozpoznávání výšky obstarává `pitchfinder` (algoritmus YIN); pojmenování
 * tónů, stupnic a akordů `tonal`. Obojí je zavedená knihovna — psát to
 * podruhé by znamenalo psát to hůř.
 */

export interface StavPoslechu {
  /** Hraje se zpět tím, co je vybrané jako nástroj? */
  ozvena: boolean;
  poslouchá: boolean;
  /** Co zrovna zní, třeba „E2". */
  ton: string | null;
  /** O kolik centů vedle je proti čisté výšce. */
  centy: number;
  frekvence: number;
  /** Tóny za poslední chvíli, od nejnovějšího. */
  historie: string[];
  /** Co z historie vychází za stupnici. */
  stupnice: string[];
  /** Co z posledních tónů vychází za akord. */
  akord: string[];
  chyba: string | null;
}

/**
 * Jeden úder — zahraný tón i s tím, kdy padl.
 *
 * Stav samotný na cvičení nestačí: říká, co zrovna zní, ale ne kolikrát
 * to zaznělo a kdy. Rytmus i trefování tónů potřebuje jednotlivé události.
 */
export interface UderZMikrofonu {
  ton: string;
  midi: number;
  /** Odchylka od čisté výšky. */
  centy: number;
  hlasitost: number;
  /** Čas v `performance.now()`, ať se dá srovnávat s MIDI i s metronomem. */
  cas: number;
}

type Poslucha = (s: StavPoslechu) => void;
type Uderova = (u: UderZMikrofonu) => void;

/** Kolik tónů se drží v paměti pro rozpoznání stupnice. */
const PAMET = 24;
/** Pod touhle hlasitostí se nic nerozpoznává — jinak se „slyší" i ticho. */
const PRAH_HLASITOSTI = 0.008;

/**
 * Dvě okna místo jednoho.
 *
 * Zpoždění je dané délkou okna: čím delší, tím později tón zazní. Krátké
 * okno ale nízké struny nepozná — měřeno na tónech s alikvotami vyšlo
 * z 2048 vzorků E2 o osmdesát centů vedle a podladěné struny vůbec.
 *
 * Hledá se proto nejdřív v posledních 1536 vzorcích (35 ms). Když z toho
 * vyjde tón nad 160 Hz, věří se mu — to je pásmo sól a melodií, kde je
 * rychlost znát. Cokoli nižšího se přepočítá z celých 4096 vzorků
 * (93 ms); basové struny se hrají pomaleji a přesnost je u nich
 * důležitější než pár desetin sekundy.
 *
 * Ověřeno na dvanácti výškách od B1 po A5: 12/12.
 */
const OKNO = 4096;
const OKNO_KRATKE = 1536;
/** Pod touhle výškou se krátkému oknu nevěří. */
const HRANICE_KRATKEHO = 160;

class PoslechKytary {
  private ctx: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private proud: MediaStream | null = null;
  private data: Float32Array | null = null;
  private smycka = 0;
  private detektor: ((b: Float32Array) => number | null) | null = null;

  private stav: StavPoslechu = {
    ozvena: false,
    poslouchá: false,
    ton: null,
    centy: 0,
    frekvence: 0,
    historie: [],
    stupnice: [],
    akord: [],
    chyba: null,
  };

  /** Poslední tón, ať se stejný neopakuje v historii pořád dokola. */
  private posledniTon: string | null = null;
  /**
   * Ozvěna: co se slyší, to se zahraje vybraným nástrojem.
   *
   * Drží se konkrétní znějící tón, ne jen třída — jinak by se nedal
   * pustit ten správný, když se přejde o oktávu. Nový tón předchozí
   * ukončí; příchod ticha taky, jinak by tón zůstal viset.
   */
  private zniciTon: string | null = null;
  private nastrojOzveny: InstrumentProfile = 'acoustic_dreadnought';
  /** Hlasitost v předchozím kroku — podle jejího nárůstu se pozná úder. */
  private minulaHlasitost = 0;
  /** Kdy se naposledy spustil tón; brání zdvojení jednoho úderu. */
  private posledniUder = 0;
  private posluchaci = new Set<Poslucha>();
  private uderovi = new Set<Uderova>();
  /** Poslední znějící výška — podle její změny se pozná nový tón i bez ozvěny. */
  private posledniVyska: string | null = null;

  /** Výchozí stav pro první vykreslení komponenty. */
  public getStavVerejny(): StavPoslechu {
    return this.stav;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  /** Hlásí každý zachycený úder. Vrací funkci, kterou se odhlásíš. */
  public naUder(f: Uderova): () => void {
    this.uderovi.add(f);
    return () => this.uderovi.delete(f);
  }

  private oznam(zmena: Partial<StavPoslechu>) {
    this.stav = { ...this.stav, ...zmena };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public async start(): Promise<void> {
    if (this.stav.poslouchá) return;
    try {
      // Kartu i omezení drží nastavení — vestavěný mikrofon a externí
      // karta se liší v přesnosti i ve zpoždění.
      this.proud = await navigator.mediaDevices.getUserMedia(zvukovaKarta.omezeniVstupu());
    } catch (e: any) {
      this.oznam({ chyba: `Mikrofon není k dispozici: ${e?.message || e}` });
      return;
    }

    // `interactive` říká prohlížeči, že jde o hraní, ne o přehrávání —
    // zvolí kratší výstupní vyrovnávací paměť.
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    void zvukovaKarta.pouzijVystup(this.ctx);
    const zdroj = this.ctx.createMediaStreamSource(this.proud);
    this.analyzer = this.ctx.createAnalyser();
    this.analyzer.fftSize = OKNO;
    zdroj.connect(this.analyzer);

    this.data = new Float32Array(this.analyzer.fftSize);
    this.detektor = YIN({ sampleRate: this.ctx.sampleRate });
    this.oznam({ poslouchá: true, chyba: null });
    this.krok();
  }

  public stop(): void {
    if (this.smycka) cancelAnimationFrame(this.smycka);
    this.smycka = 0;
    this.utni();
    this.proud?.getTracks().forEach((t) => t.stop());
    this.proud = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyzer = null;
    this.oznam({ poslouchá: false, ton: null, frekvence: 0, centy: 0 });
  }

  /** Zapne nebo vypne hraní toho, co se slyší. */
  public nastavOzvenu(zap: boolean, nastroj?: InstrumentProfile): void {
    if (nastroj) this.nastrojOzveny = nastroj;
    if (!zap) this.utni();
    this.oznam({ ozvena: zap });
  }

  public nastavNastroj(nastroj: InstrumentProfile): void {
    if (nastroj === this.nastrojOzveny) return;
    // Nástroj se mění za znějícího tónu: starý se musí ukončit tím
    // nástrojem, kterým začal, jinak by zůstal viset.
    this.utni();
    this.nastrojOzveny = nastroj;
  }

  private utni(): void {
    if (this.zniciTon) {
      audioSynth.noteOff(this.zniciTon, this.nastrojOzveny);
      this.zniciTon = null;
    }
  }

  public vymazHistorii(): void {
    this.posledniTon = null;
    this.oznam({ historie: [], stupnice: [], akord: [] });
  }

  private krok = (): void => {
    if (!this.analyzer || !this.data || !this.detektor) return;
    this.analyzer.getFloatTimeDomainData(this.data);

    let soucet = 0;
    for (let i = 0; i < this.data.length; i++) soucet += this.data[i] * this.data[i];
    const hlasitost = Math.sqrt(soucet / this.data.length);

    if (hlasitost >= PRAH_HLASITOSTI) {
      // Nejnovější vzorky jsou na konci vyrovnávací paměti.
      const kratke = this.data.subarray(this.data.length - OKNO_KRATKE);
      let hz = this.detektor(kratke);
      if (!hz || hz < HRANICE_KRATKEHO) hz = this.detektor(this.data);
      // Mimo rozsah nástroje jsou to skoro vždy harmonické nebo šum:
      // nejnižší struna E2 má 82 Hz, dvacátý pražec na E4 kolem 1,3 kHz.
      if (hz && hz > 70 && hz < 1400) {
        const jmeno = Note.fromFreq(hz);
        const presna = Note.freq(jmeno) || hz;
        const centy = Math.round(1200 * Math.log2(hz / presna));

        const zmeny: Partial<StavPoslechu> = { ton: jmeno, frekvence: hz, centy };

        /**
         * Kdy ozvěna spustí tón.
         *
         * Jednak při změně výšky. Jednak při novém úderu do téže struny —
         * a tohle chybělo: kdo zahrál třikrát za sebou tentýž tón, slyšel
         * jednu dlouhou notu, protože se výška nezměnila. Úder se pozná
         * podle skoku hlasitosti a hlídá se nejkratší rozestup, aby se
         * jeden úder nezapočítal dvakrát.
         */
        const ted = performance.now();
        const znovuUder =
          hlasitost > this.minulaHlasitost * 1.8 &&
          hlasitost > PRAH_HLASITOSTI * 2.5 &&
          ted - this.posledniUder > 60;

        // Nový tón, nebo znovu ten samý. Rozestup se hlídá i u změny
        // výšky: YIN občas na okamžik skočí o oktávu a bez něj by z
        // jednoho brnknutí byly tři údery.
        const jinyTon = jmeno !== this.posledniVyska;
        if ((znovuUder || jinyTon) && ted - this.posledniUder > 60) {
          this.posledniUder = ted;
          this.posledniVyska = jmeno;
          if (this.uderovi.size) {
            const uder: UderZMikrofonu = {
              ton: jmeno,
              midi: Note.midi(jmeno) ?? 0,
              centy,
              hlasitost,
              cas: ted,
            };
            this.uderovi.forEach((f) => f(uder));
          }
        }

        if (this.stav.ozvena && (jmeno !== this.zniciTon || znovuUder)) {
          this.utni();
          audioSynth.noteOn(jmeno, this.nastrojOzveny, Math.min(1, 0.5 + hlasitost * 6));
          this.zniciTon = jmeno;
        }

        // Do historie jen změna tónu. Držená struna zní desetiny sekundy,
        // takže by jinak jeden tón zaplnil celou paměť.
        const trida = Note.pitchClass(jmeno);
        if (trida && trida !== this.posledniTon) {
          this.posledniTon = trida;
          const historie = [trida, ...this.stav.historie].slice(0, PAMET);
          zmeny.historie = historie;

          const unikatni = [...new Set(historie)];
          zmeny.stupnice = unikatni.length >= 5 ? Scale.detect(unikatni).slice(0, 3) : [];
          // Akord se hledá z posledních pár tónů — ne z celé paměti, kde
          // už bývá půl stupnice a vyjde z toho nesmysl.
          const posledni = [...new Set(historie.slice(0, 4))];
          zmeny.akord = posledni.length >= 3 ? Chord.detect(posledni).slice(0, 3) : [];
        }

        this.oznam(zmeny);
      }
    } else if (this.stav.ton) {
      this.utni();
      // Ticho ukončí tón, aby se po pauze týž tón počítal jako nový úder.
      this.posledniVyska = null;
      this.oznam({ ton: null, frekvence: 0, centy: 0 });
    }

    this.minulaHlasitost = hlasitost;
    this.smycka = requestAnimationFrame(this.krok);
  };
}

export const poslechKytary = new PoslechKytary();
