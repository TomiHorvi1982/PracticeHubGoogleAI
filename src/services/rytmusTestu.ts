import { zvukovaKarta } from './zvukovaKarta';

/**
 * Zkoušení rytmu.
 *
 * Metronom v appce umí klepat, ale nic o hráči nezjistí. Tohle klepe a
 * zároveň měří: pár taktů se hraje s klepáním, pak metronom zmlkne a
 * hráč drží tempo sám, a nakonec se zase ozve — takže je slyšet i vidět,
 * o kolik se mezitím ujelo.
 *
 * Doby se plánují dopředu na hodinách zvukového kontextu, ne časovačem.
 * `setInterval` se v prohlížeči opozdí o desítky milisekund a měřit proti
 * němu odchylku pár milisekund nemá smysl.
 */

export type DruhRytmu = 'tempo' | 'udrzeni';

export interface NastaveniRytmu {
  bpm: number;
  dobVTaktu: number;
  /** Kolik taktů metronom klepe. */
  taktuSKlepanim: number;
  /** Kolik taktů pak mlčí. */
  taktuBezKlepani: number;
  /** Kolikrát se dvojice zopakuje. */
  kol: number;
}

export interface Doba {
  index: number;
  /** Čas v `performance.now()`, ať se dá srovnat s údery hráče. */
  cas: number;
  duraz: boolean;
  /** Doba, kterou metronom nezahraje. */
  ticho: boolean;
}

export interface StavRytmu {
  bezi: boolean;
  /** Index poslední doby, která proběhla; -1 před začátkem. */
  doba: number;
  celkem: number;
  /** Mlčí zrovna metronom? */
  ticho: boolean;
  chyba: string | null;
}

export interface Odchylka {
  doba: number;
  /** Kladné = pozdě, záporné = brzy. */
  ms: number;
  ticho: boolean;
}

export interface Hodnoceni {
  uderu: number;
  /**
   * Rozptyl kolem vlastního posunu — hlavní číslo.
   *
   * Syrová odchylka od doby se nehodí: mikrofon a zvuková karta přidají
   * svoje zpoždění a hráč, který hraje rovnoměrně o 80 ms později, je
   * pořád naprosto v rytmu. Rozhoduje, jak moc se od svého vlastního
   * posunu odchyluje.
   */
  rozptyl: number;
  /** Rozptyl v taktech s metronomem. */
  sMetronomem: number | null;
  /** Rozptyl v taktech bez metronomu. */
  bezMetronomu: number | null;
  /**
   * Systematický posun.
   *
   * Je v něm i zpoždění vstupu — mikrofon a zvuková karta přidají svoje.
   * Proto se posuzuje hlavně rozptyl kolem něj, ne jeho velikost.
   */
  posun: number;
  /** O kolik ms na takt se v tichu ujíždí. Záporné = zrychluje. */
  ujizdeni: number | null;
  /** Tempo, které hráč doopravdy držel. */
  vlastniBpm: number | null;
  odchylky: Odchylka[];
}

type Poslucha = (s: StavRytmu) => void;

/** Kolik úderů musí část mít, aby se z ní dal počítat rozptyl. */
export const MIN_UDERU = 6;

/** Jak daleko dopředu se plánuje a jak často se to kontroluje. */
const VYHLED = 0.25;
const KROK = 40;

export const VYCHOZI: NastaveniRytmu = {
  bpm: 90, dobVTaktu: 4, taktuSKlepanim: 2, taktuBezKlepani: 2, kol: 4,
};

class RytmusTestu {
  private ctx: AudioContext | null = null;
  private plan: Doba[] = [];
  private dalsi = 0;
  private hlidac: number | null = null;
  private posluchaci = new Set<Poslucha>();
  private stav: StavRytmu = { bezi: false, doba: -1, celkem: 0, ticho: false, chyba: null };

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  public getStav(): StavRytmu {
    return this.stav;
  }

  private oznam(z: Partial<StavRytmu>): void {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  /** Doby celého cvičení. Hodí se i pro nákres, než se začne hrát. */
  public sestavPlan(n: NastaveniRytmu, odKdy: number): Doba[] {
    const doba = 60 / n.bpm;
    const doby: Doba[] = [];
    let i = 0;
    for (let kolo = 0; kolo < n.kol; kolo++) {
      const taktu = n.taktuSKlepanim + n.taktuBezKlepani;
      for (let takt = 0; takt < taktu; takt++) {
        for (let d = 0; d < n.dobVTaktu; d++) {
          doby.push({
            index: i,
            cas: odKdy + i * doba,
            duraz: d === 0,
            ticho: takt >= n.taktuSKlepanim,
          });
          i++;
        }
      }
    }
    // Poslední takt se vždycky ozve, aby bylo slyšet, kde tempo skončilo.
    for (let d = 0; d < n.dobVTaktu; d++) {
      doby.push({ index: i, cas: odKdy + i * doba, duraz: d === 0, ticho: false });
      i++;
    }
    return doby;
  }

  public async start(n: NastaveniRytmu): Promise<Doba[]> {
    this.stop();
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      void zvukovaKarta.pouzijVystup(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      // Bez kliknutí prohlížeč zvuk nepustí a `resume()` se nemusí nikdy
      // vrátit. Čekat na něj donekonečna by znamenalo, že tlačítko po
      // stisku jen mlčí a nikdo neví proč.
      await Promise.race([
        this.ctx.resume(),
        new Promise((r) => window.setTimeout(r, 1500)),
      ]);
    }
    if (this.ctx.state !== 'running') {
      this.oznam({ bezi: false, chyba: 'Prohlížeč nepustil zvuk. Klikni do stránky a spusť cvičení znovu.' });
      return [];
    }

    // Vteřina náběhu, ať se stihne nadechnout a chytit nástroj.
    const zacatek = this.ctx.currentTime + 1;
    const vAudio = this.sestavPlan(n, zacatek);
    this.plan = vAudio.map((d) => ({ ...d, cas: this.naPerf(d.cas) }));
    this.planAudio = vAudio;
    this.dalsi = 0;

    this.oznam({ bezi: true, doba: -1, celkem: this.plan.length, ticho: false, chyba: null });
    this.hlidac = window.setInterval(this.tik, KROK);
    return this.plan;
  }

  public stop(): void {
    if (this.hlidac !== null) {
      window.clearInterval(this.hlidac);
      this.hlidac = null;
    }
    if (this.stav.bezi) this.oznam({ bezi: false });
  }

  private planAudio: Doba[] = [];

  /** Převede čas zvukových hodin na `performance.now()`. */
  private naPerf(casAudio: number): number {
    const ctx = this.ctx!;
    const t = ctx.getOutputTimestamp?.();
    if (t && typeof t.contextTime === 'number' && typeof t.performanceTime === 'number' && t.contextTime > 0) {
      return (casAudio - t.contextTime) * 1000 + t.performanceTime;
    }
    return (casAudio - ctx.currentTime) * 1000 + performance.now();
  }

  private tik = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;

    while (this.dalsi < this.planAudio.length && this.planAudio[this.dalsi].cas < ctx.currentTime + VYHLED) {
      const d = this.planAudio[this.dalsi];
      if (!d.ticho) this.klepni(d.cas, d.duraz);
      this.dalsi++;
    }

    // Ukazatel běží zvlášť: naplánované je pár dob dopředu, ale svítit má
    // ta, která zrovna zní.
    const ted = ctx.currentTime;
    let posledni = -1;
    for (let i = 0; i < this.planAudio.length; i++) {
      if (this.planAudio[i].cas <= ted) posledni = i;
      else break;
    }
    if (posledni !== this.stav.doba) {
      this.oznam({ doba: posledni, ticho: posledni >= 0 ? this.planAudio[posledni].ticho : false });
    }

    const konec = this.planAudio[this.planAudio.length - 1];
    if (konec && ted > konec.cas + 0.5) this.stop();
  };

  private klepni(kdy: number, duraz: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(duraz ? 1200 : 800, kdy);
    g.gain.setValueAtTime(duraz ? 0.85 : 0.45, kdy);
    g.gain.exponentialRampToValueAtTime(0.001, kdy + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(kdy);
    osc.stop(kdy + 0.06);
  }
}

/**
 * Srovná údery s dobami.
 *
 * Každý úder se přiřadí k nejbližší době. Údery dál než půl doby od
 * kterékoli z nich se zahodí — to už není nepřesnost, ale jiná nota.
 */
export function vyhodnot(plan: Doba[], udery: number[], bpm: number): Hodnoceni {
  const prazdne: Hodnoceni = {
    uderu: 0, rozptyl: 0, sMetronomem: null, bezMetronomu: null,
    posun: 0, ujizdeni: null, vlastniBpm: null, odchylky: [],
  };
  if (!plan.length || !udery.length) return prazdne;

  const doba = 60000 / bpm;
  const odchylky: Odchylka[] = [];

  for (const u of udery) {
    let nejlepsi: Doba | null = null;
    let nejmensi = Infinity;
    for (const d of plan) {
      const r = Math.abs(u - d.cas);
      if (r < nejmensi) {
        nejmensi = r;
        nejlepsi = d;
      }
    }
    if (!nejlepsi || nejmensi > doba / 2) continue;
    odchylky.push({ doba: nejlepsi.index, ms: Math.round(u - nejlepsi.cas), ticho: nejlepsi.ticho });
  }
  if (!odchylky.length) return prazdne;

  const sKlepanim = odchylky.filter((o) => !o.ticho);
  const bezKlepani = odchylky.filter((o) => o.ticho);
  const posun = Math.round(odchylky.reduce((a, o) => a + o.ms, 0) / odchylky.length);

  /**
   * Průměrná odchylka od vlastního posunu, ne od doby.
   *
   * Každá část se počítá kolem svého vlastního průměru. Kdyby se braly
   * kolem společného, projevilo by se ujíždění v tiché části i na číslu
   * pro tu s metronomem — a hráč by četl, že se rozchází i tam, kde
   * hrál přesně.
   */
  const rozptylZ = (p: Odchylka[], minimum = 1) => {
    // Z pár úderů se rozptyl spočítat dá, ale nic neříká — jeden ujetý
    // nástup by z přesného hráče udělal packala. Radši nic než číslo,
    // kterému se nedá věřit. Celkové číslo se počítá vždycky, protože
    // vedle něj je vidět, z kolika úderů je.
    if (p.length < minimum) return null;
    const stred = p.reduce((a, o) => a + o.ms, 0) / p.length;
    return Math.round(p.reduce((a, o) => a + Math.abs(o.ms - stred), 0) / p.length);
  };

  // Ujíždění: jak odchylka roste s dobou v tiché části. Systematický
  // posun směrnici neovlivní, takže z ní jde zpoždění vstupu ven samo.
  let ujizdeni: number | null = null;
  if (bezKlepani.length >= 4) {
    const n = bezKlepani.length;
    const sx = bezKlepani.reduce((a, o) => a + o.doba, 0);
    const sy = bezKlepani.reduce((a, o) => a + o.ms, 0);
    const sxy = bezKlepani.reduce((a, o) => a + o.doba * o.ms, 0);
    const sxx = bezKlepani.reduce((a, o) => a + o.doba * o.doba, 0);
    const jmenovatel = n * sxx - sx * sx;
    if (jmenovatel !== 0) ujizdeni = Math.round(((n * sxy - sx * sy) / jmenovatel) * 4);
  }

  // Vlastní tempo z rozestupů. Medián, ne průměr: jeden vynechaný úder
  // udělá dvojnásobný rozestup a průměr by rozhodil.
  let vlastniBpm: number | null = null;
  const rozestupy = udery.slice(1).map((u, i) => u - udery[i]).filter((r) => r > 60 && r < 3000);
  if (rozestupy.length >= 3) {
    const s = [...rozestupy].sort((a, b) => a - b);
    const median = s[Math.floor(s.length / 2)];
    if (median > 0) vlastniBpm = Math.round(60000 / median);
  }

  return {
    uderu: odchylky.length,
    rozptyl: rozptylZ(odchylky) ?? 0,
    sMetronomem: rozptylZ(sKlepanim, MIN_UDERU),
    bezMetronomu: rozptylZ(bezKlepani, MIN_UDERU),
    posun,
    ujizdeni,
    vlastniBpm,
    odchylky,
  };
}

export const rytmusTestu = new RytmusTestu();
