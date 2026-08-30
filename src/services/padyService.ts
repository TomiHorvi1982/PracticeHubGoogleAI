/**
 * Osm padů, smyčka a hodiny, které to drží v tempu.
 *
 * Vlastní krokovač, ne obecný přehrávač: rytmus se musí spouštět podle
 * zvukových hodin, ne podle překreslování stránky. `setTimeout` se v
 * prohlížeči opozdí o desítky milisekund pokaždé, když se něco vykresluje,
 * a to je u bicích slyšet. Plánuje se proto dopředu do zvukového kontextu
 * a časovač jen doplňuje, co se do okna vejde.
 *
 * Metronom si tiká sám tady, ne přes `metronomService`. Dvoje nezávislé
 * hodiny by se rozešly a člověk by nahrával proti klikání, které s jeho
 * smyčkou nesouvisí.
 */

export interface Pad {
  id: string;
  nazev: string;
  klavesa: string;
  /** Nota, na kterou pad reaguje z MIDI ovladače (General MIDI bicí). */
  midi: number;
  barva: string;
}

export const PADY: Pad[] = [
  { id: 'kick', nazev: 'Kopák', klavesa: 'Q', midi: 36, barva: '#FF453A' },
  { id: 'snare', nazev: 'Virbl', klavesa: 'W', midi: 38, barva: '#FF9F0A' },
  { id: 'hihat_closed', nazev: 'Hi-hat', klavesa: 'E', midi: 42, barva: '#FFD60A' },
  { id: 'hihat_open', nazev: 'Hi-hat otevř.', klavesa: 'R', midi: 46, barva: '#30D158' },
  { id: 'tom_low', nazev: 'Tom nízký', klavesa: 'A', midi: 45, barva: '#5AC8FA' },
  { id: 'tom_high', nazev: 'Tom vysoký', klavesa: 'S', midi: 48, barva: '#0A84FF' },
  { id: 'crash', nazev: 'Crash', klavesa: 'D', midi: 49, barva: '#BF5AF2' },
  { id: 'ride', nazev: 'Ride', klavesa: 'F', midi: 51, barva: '#FF375F' },
];

export const KROKU = 16;

export interface StavPadu {
  bezi: boolean;
  /** Krok, který zrovna zní — pro tečku běžící po mřížce. */
  krok: number;
  bpm: number;
  /** Zapnuté kroky: `mrizka[padId][krok]`. */
  mrizka: Record<string, boolean[]>;
  /** Co na kterém padu visí — název souboru, kvůli popisku. */
  vzorky: Record<string, string>;
  /**
   * Jak je zvuk na padu dlouhý, ve vteřinách.
   *
   * Na pad se dá pověsit jednorázová rána i celá smyčka a v seznamu
   * knihovny to od sebe nikdo nepozná. Podle délky je to vidět na první
   * pohled a řídí se podle ní i chování při opakovaném úderu.
   */
  delky: Record<string, number>;
  nahrava: boolean;
  klikani: boolean;
}

type Poslucha = (s: StavPadu) => void;

/**
 * Rytmus a osazení padů drží prohlížeč.
 *
 * Je to rozpracovaná věc jednoho člověka u jednoho stroje, ne data kapely —
 * ale přijít o ni při načtení stránky by mrzelo. Ukládá se odkaz na soubor
 * v knihovně, ne bajty; ty se po návratu dotáhnou znovu.
 */
const KLIC = 'neverlate_pady';

const prazdnaMrizka = (): Record<string, boolean[]> =>
  Object.fromEntries(PADY.map((p) => [p.id, new Array(KROKU).fill(false)]));

class PadyService {
  private ctx: AudioContext | null = null;
  private buffery: Record<string, AudioBuffer> = {};
  /** Co na padu právě hraje — kvůli utnutí smyčky při dalším úderu. */
  private zniciZdroje: Record<string, AudioBufferSourceNode> = {};
  private nazvy: Record<string, string> = {};
  private mrizka = prazdnaMrizka();

  private bezi = false;
  private bpm = 120;
  private nahrava = false;
  private klikani = true;

  /** Krok, který se bude plánovat jako další. */
  private dalsiKrok = 0;
  /** Čas toho kroku ve zvukových hodinách. */
  private casKroku = 0;
  private casovac: number | null = null;
  /** Krok, který právě zní — čte ho jen zobrazení. */
  private zniciKrok = -1;

  private posluchaci = new Set<Poslucha>();
  /** Odkud se zvuk na padu vzal, aby šel po návratu načíst znovu. */
  private assety: Record<string, string> = {};

  /** Jak daleko dopředu se plánuje a jak často se to doplňuje. */
  private static readonly OKNO = 0.12;
  private static readonly TIK_MS = 25;

  private kontext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav());
    return () => this.posluchaci.delete(f);
  }

  public stav(): StavPadu {
    return {
      bezi: this.bezi,
      krok: this.zniciKrok,
      bpm: this.bpm,
      mrizka: this.mrizka,
      vzorky: { ...this.nazvy },
      delky: Object.fromEntries(
        Object.entries(this.buffery).map(([pad, buf]) => [pad, buf.duration])
      ),
      nahrava: this.nahrava,
      klikani: this.klikani,
    };
  }

  private oznam() {
    const s = this.stav();
    this.posluchaci.forEach((f) => f(s));
  }

  /** Naváže na pad zvuk. Bajty se dekódují hned, ať pad nemlčí při prvním úderu. */
  public async nastavVzorek(
    padId: string,
    data: ArrayBuffer,
    nazev: string,
    assetId?: string,
  ): Promise<void> {
    const buf = await this.kontext().decodeAudioData(data.slice(0));
    this.buffery[padId] = buf;
    this.nazvy[padId] = nazev;
    if (assetId) this.assety[padId] = assetId;
    else delete this.assety[padId];
    this.uloz();
    this.oznam();
  }

  /** Co bylo na padech naposled — komponenta si zvuky dotáhne sama. */
  public ulozeneAssety(): Record<string, { assetId: string; nazev: string }> {
    const out: Record<string, { assetId: string; nazev: string }> = {};
    for (const [pad, assetId] of Object.entries(this.assety)) {
      if (!this.buffery[pad]) out[pad] = { assetId, nazev: this.nazvy[pad] || '' };
    }
    return out;
  }

  private uloz(): void {
    try {
      localStorage.setItem(
        KLIC,
        JSON.stringify({ mrizka: this.mrizka, assety: this.assety, nazvy: this.nazvy, bpm: this.bpm }),
      );
    } catch {
      /* plné nebo zakázané úložiště není důvod přestat hrát */
    }
  }

  private nacti(): void {
    try {
      const d = JSON.parse(localStorage.getItem(KLIC) || 'null');
      if (!d) return;
      if (d.mrizka) {
        for (const p of PADY) {
          if (Array.isArray(d.mrizka[p.id])) this.mrizka[p.id] = d.mrizka[p.id].slice(0, KROKU);
        }
      }
      if (d.assety) this.assety = d.assety;
      if (d.nazvy) this.nazvy = d.nazvy;
      if (d.bpm) this.bpm = d.bpm;
    } catch {
      /* co se nepřečte, prostě začne prázdné */
    }
  }

  public sundejVzorek(padId: string): void {
    delete this.buffery[padId];
    delete this.zniciZdroje[padId];
    delete this.nazvy[padId];
    delete this.assety[padId];
    this.uloz();
    this.oznam();
  }

  public maVzorek(padId: string): boolean {
    return Boolean(this.buffery[padId]);
  }

  /**
   * Kde končí rána a začíná smyčka.
   *
   * Delší zvuk se při dalším úderu utne, kratší se nechá dohrát. Dvě
   * smyčky přes sebe je kaše; useknutý dozvuk činelu při rychlé dvojhmatu
   * je slyšet stejně špatně, a ten se proto neutíná.
   */
  private static readonly SMYCKA_OD = 1.5;

  public jeSmycka(padId: string): boolean {
    const buf = this.buffery[padId];
    return !!buf && buf.duration >= PadyService.SMYCKA_OD;
  }

  /** Přehraje pad v daný čas; bez času hned. */
  private zahraj(padId: string, kdy?: number): void {
    const buf = this.buffery[padId];
    if (!buf) return;
    const ctx = this.kontext();

    if (buf.duration >= PadyService.SMYCKA_OD) {
      const bezici = this.zniciZdroje[padId];
      if (bezici) {
        try {
          bezici.stop(kdy ?? ctx.currentTime);
        } catch {
          /* mohla doběhnout sama */
        }
      }
    }

    const zdroj = ctx.createBufferSource();
    zdroj.buffer = buf;
    zdroj.connect(ctx.destination);
    zdroj.start(kdy ?? ctx.currentTime);
    this.zniciZdroje[padId] = zdroj;
    zdroj.onended = () => {
      if (this.zniciZdroje[padId] === zdroj) delete this.zniciZdroje[padId];
    };
  }

  /**
   * Úder rukou — z klávesnice, myši nebo MIDI.
   *
   * Zní hned, protože čekat na nejbližší krok by bylo cítit jako zpoždění
   * nástroje. Do smyčky se ale zapíše zaokrouhleně na nejbližší krok,
   * takže co se zahraje trochu vedle, sedne do tempa.
   */
  public uhod(padId: string): void {
    void this.kontext().resume();
    this.zahraj(padId);

    if (this.nahrava && this.bezi) {
      const delka = this.delkaKroku();
      // Vzdálenost od času dalšího naplánovaného kroku, přepočtená na kroky.
      const odchylka = (this.kontext().currentTime - this.casKroku) / delka;
      const krok = (this.dalsiKrok + Math.round(odchylka) + KROKU * 2) % KROKU;
      this.mrizka[padId][krok] = true;
      this.uloz();
      this.oznam();
    }
  }

  private delkaKroku(): number {
    // Šestnáctina: čtyři na dobu.
    return 60 / this.bpm / 4;
  }

  public prepniKrok(padId: string, krok: number): void {
    this.mrizka[padId][krok] = !this.mrizka[padId][krok];
    this.uloz();
    this.oznam();
  }

  public vymaz(padId?: string): void {
    if (padId) this.mrizka[padId] = new Array(KROKU).fill(false);
    else this.mrizka = prazdnaMrizka();
    this.uloz();
    this.oznam();
  }

  /** Nahradí celou mřížku — používá se při vyčtení rytmu z nahrávky. */
  public nastavMrizku(nova: Record<string, boolean[]>): void {
    for (const p of PADY) {
      if (nova[p.id]) this.mrizka[p.id] = nova[p.id].slice(0, KROKU);
    }
    this.oznam();
  }

  public nastavBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, Math.round(bpm)));
    this.uloz();
    this.oznam();
  }

  public nahravani(zap: boolean): void {
    this.nahrava = zap;
    this.oznam();
  }

  public klik(zap: boolean): void {
    this.klikani = zap;
    this.oznam();
  }

  public prepni(): void {
    this.bezi ? this.stop() : this.start();
  }

  public start(): void {
    if (this.bezi) return;
    const ctx = this.kontext();
    void ctx.resume();
    this.bezi = true;
    this.dalsiKrok = 0;
    this.casKroku = ctx.currentTime + 0.1;
    this.casovac = window.setInterval(() => this.doplnPlan(), PadyService.TIK_MS);
    this.oznam();
  }

  public stop(): void {
    this.bezi = false;
    if (this.casovac !== null) window.clearInterval(this.casovac);
    this.casovac = null;
    this.zniciKrok = -1;
    this.oznam();
  }

  /** Doplní do zvukových hodin všechno, co se vejde do okna dopředu. */
  private doplnPlan(): void {
    const ctx = this.kontext();
    while (this.casKroku < ctx.currentTime + PadyService.OKNO) {
      const krok = this.dalsiKrok;
      const kdy = this.casKroku;

      for (const p of PADY) {
        if (this.mrizka[p.id][krok]) this.zahraj(p.id, kdy);
      }
      if (this.klikani && krok % 4 === 0) this.klikni(kdy, krok === 0);

      // Zobrazení se přepne, až ten krok opravdu zazní.
      const zpozdeni = Math.max(0, (kdy - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        this.zniciKrok = krok;
        this.oznam();
      }, zpozdeni);

      this.casKroku += this.delkaKroku();
      this.dalsiKrok = (krok + 1) % KROKU;
    }
  }

  /** Klik metronomu. První doba v taktu je výš, ať je poznat začátek. */
  private klikni(kdy: number, prvni: boolean): void {
    const ctx = this.kontext();
    const osc = ctx.createOscillator();
    const zisk = ctx.createGain();
    osc.frequency.value = prvni ? 1600 : 1000;
    zisk.gain.setValueAtTime(0.0001, kdy);
    zisk.gain.exponentialRampToValueAtTime(prvni ? 0.5 : 0.28, kdy + 0.001);
    zisk.gain.exponentialRampToValueAtTime(0.0001, kdy + 0.04);
    osc.connect(zisk);
    zisk.connect(ctx.destination);
    osc.start(kdy);
    osc.stop(kdy + 0.05);
  }
}

export const padyService = new PadyService();
// Rytmus z minula je k dispozici hned; zvuky si dotáhne komponenta.
(padyService as any).nacti();
