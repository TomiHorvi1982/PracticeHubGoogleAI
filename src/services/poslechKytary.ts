import { YIN } from 'pitchfinder';
import { Note, Scale, Chord } from 'tonal';
import { audioSynth, InstrumentProfile } from './audioSynth';

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

type Poslucha = (s: StavPoslechu) => void;

/** Kolik tónů se drží v paměti pro rozpoznání stupnice. */
const PAMET = 24;
/** Pod touhle hlasitostí se nic nerozpoznává — jinak se „slyší" i ticho. */
const PRAH_HLASITOSTI = 0.008;

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
  private posluchaci = new Set<Poslucha>();

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(zmena: Partial<StavPoslechu>) {
    this.stav = { ...this.stav, ...zmena };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public async start(): Promise<void> {
    if (this.stav.poslouchá) return;
    try {
      this.proud = await navigator.mediaDevices.getUserMedia({
        // Úpravy pro řeč musí pryč: potlačení šumu a automatické hlasitosti
        // by kytaře ubíraly právě to, podle čeho se výška pozná.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e: any) {
      this.oznam({ chyba: `Mikrofon není k dispozici: ${e?.message || e}` });
      return;
    }

    this.ctx = new AudioContext();
    const zdroj = this.ctx.createMediaStreamSource(this.proud);
    this.analyzer = this.ctx.createAnalyser();
    // Delší okno pozná i nízké struny: E2 má 82 Hz, což je při 44,1 kHz
    // přes pět set vzorků na periodu.
    this.analyzer.fftSize = 4096;
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
      const hz = this.detektor(this.data);
      // Mimo rozsah nástroje jsou to skoro vždy harmonické nebo šum:
      // nejnižší struna E2 má 82 Hz, dvacátý pražec na E4 kolem 1,3 kHz.
      if (hz && hz > 70 && hz < 1400) {
        const jmeno = Note.fromFreq(hz);
        const presna = Note.freq(jmeno) || hz;
        const centy = Math.round(1200 * Math.log2(hz / presna));

        const zmeny: Partial<StavPoslechu> = { ton: jmeno, frekvence: hz, centy };

        // Ozvěna reaguje na změnu znějícího tónu, ne na každý snímek —
        // šedesátkrát za sekundu spuštěná nota by byla chrastítko.
        if (this.stav.ozvena && jmeno !== this.zniciTon) {
          this.utni();
          audioSynth.noteOn(jmeno, this.nastrojOzveny, 0.85);
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
      this.oznam({ ton: null, frekvence: 0, centy: 0 });
    }

    this.smycka = requestAnimationFrame(this.krok);
  };
}

export const poslechKytary = new PoslechKytary();
