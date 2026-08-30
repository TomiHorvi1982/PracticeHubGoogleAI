import * as Tone from 'tone';
import { authService } from './authService';
import { audioBus } from './audioBus';

/**
 * Přehrávač na pilování riffů a sól.
 *
 * Umí to, co při cvičení potřebuješ a co běžný přehrávač nedělá: smyčku
 * na pár vteřinách, zpomalení bez změny výšky tónu, postupné zrychlování
 * po opakováních a klik metronomu navrch.
 *
 * Rychlost mění `playbackRate` na zdroji, což by samo o sobě posunulo i
 * výšku — na polovině by nahrávka zněla o oktávu níž a cvičil bys jiné
 * tóny, než jaké jsou napsané. Za zdrojem proto sedí posuv výšky, který
 * to dorovná zpátky, a tentýž posuv slouží i k přeladění nahrávky na
 * vlastní kytaru. Zrnitá úprava výšky zvuk trochu rozmaže; při velkém
 * zpomalení je to slyšet, ale je to lepší než hrát o tercii vedle.
 */

export interface StavCviceni {
  nacita: boolean;
  hraje: boolean;
  /** Kde jsme v souboru, v sekundách. */
  pozice: number;
  delka: number;
  od: number;
  do: number;
  rychlost: number;
  /** Kolik smyček uběhlo od spuštění. */
  kol: number;
  /** O kolik zrychlit po každém kole, v procentech. */
  pridavat: number;
  klik: boolean;
  /** Přeladění v půltónech — nahrávka na tvoje ladění. */
  posun: number;
  /** Držet původní výšku i při zpomalení. */
  drzetLadeni: boolean;
  chyba: string | null;
}

type Poslucha = (s: StavCviceni) => void;

class PrehravacCviceni {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private zdroj: AudioBufferSourceNode | null = null;
  private hlasitost: GainNode | null = null;
  /** Posuv výšky za hlasitostí — dorovnává zpomalení a ladí na kytaru. */
  private posuvVysky: Tone.PitchShift | null = null;
  /** Čas hodin, kdy začalo aktuální kolo. */
  private zacatekKola = 0;
  private tik: number | null = null;
  private klikTimer: number | null = null;

  private stav: StavCviceni = {
    nacita: false, hraje: false, pozice: 0, delka: 0,
    od: 0, do: 0, rychlost: 1, kol: 0, pridavat: 0, klik: false,
    posun: 0, drzetLadeni: true, chyba: null,
  };
  private posluchaci = new Set<Poslucha>();

  /** Výchozí stav pro první vykreslení komponenty. */
  public subscribeStav(): StavCviceni {
    return this.stav;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavCviceni> = {}) {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public get zvuk(): AudioBuffer | null {
    return this.buffer;
  }

  /** Načte zvuk z knihovny a připraví ho k cvičení. */
  public async nacti(assetId: string): Promise<void> {
    this.stop();
    this.oznam({ nacita: true, chyba: null });
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/assets/${assetId}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Tentýž kontext jako mixážní pult: dva by znamenaly dvoje hodiny,
      // dvojí latenci a posuv výšky z Tone by neměl kam sáhnout.
      if (!this.ctx) this.ctx = Tone.getContext().rawContext as AudioContext;
      this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.oznam({
        nacita: false,
        delka: this.buffer.duration,
        od: 0,
        do: this.buffer.duration,
        pozice: 0,
      });
    } catch (e: any) {
      this.oznam({ nacita: false, chyba: `Zvuk se nepodařilo načíst: ${e?.message || e}` });
    }
  }

  /**
   * Vrcholky vlny pro vykreslení.
   *
   * Sto tisíc vzorků na pixel se kreslit nedá; z každého úseku se vezme
   * největší výchylka, takže je v obrázku vidět, kde co bouchne.
   */
  public vrcholky(kolik: number, odS?: number, doS?: number): number[] {
    if (!this.buffer) return [];
    const data = this.buffer.getChannelData(0);
    const vzorku = this.buffer.sampleRate;
    // Bez rozsahu se bere celý soubor; s rozsahem jen výřez, jinak by
    // přiblížení jen roztáhlo tytéž vrcholky a nic nového by neukázalo.
    const zac = Math.max(0, Math.floor((odS ?? 0) * vzorku));
    const kon = Math.min(data.length, Math.ceil((doS ?? this.buffer.duration) * vzorku));
    const delka = Math.max(1, kon - zac);
    const naUsek = Math.max(1, Math.floor(delka / kolik));

    const out: number[] = [];
    for (let i = 0; i < kolik; i++) {
      let max = 0;
      const od = zac + i * naUsek;
      for (let j = od; j < od + naUsek && j < kon; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      out.push(max);
    }
    return out;
  }

  /**
   * Přeladí nahrávku o půltóny.
   *
   * Kdo má kytaru o půltón níž, nemusí ji kvůli jedné písni přelaďovat.
   */
  public nastavPosun(poltonu: number): void {
    const v = Math.max(-12, Math.min(12, poltonu));
    this.oznam({ posun: v });
    this.dolaďVysku();
  }

  public prepniDrzeniLadeni(): void {
    this.oznam({ drzetLadeni: !this.stav.drzetLadeni });
    this.dolaďVysku();
  }

  /**
   * Nastaví posuv tak, aby seděla výška.
   *
   * Zpomalení stáhne výšku o `12·log2(rychlost)` půltónů; když se má
   * ladění držet, přičte se to zpátky. K tomu se přidá vlastní přeladění.
   */
  private dolaďVysku(): void {
    if (!this.posuvVysky) return;
    const zRychlosti = this.stav.drzetLadeni ? -12 * Math.log2(this.stav.rychlost) : 0;
    this.posuvVysky.pitch = this.stav.posun + zRychlosti;
  }

  public nastavSmycku(od: number, doo: number): void {
    const d = this.stav.delka;
    const a = Math.max(0, Math.min(od, d));
    const b = Math.max(a + 0.2, Math.min(doo, d));
    this.oznam({ od: a, do: b });
    if (this.stav.hraje) this.rozjed();
  }

  public nastavRychlost(v: number): void {
    const nova = Math.max(0.25, Math.min(1.5, v));
    this.oznam({ rychlost: nova });
    if (this.zdroj) this.zdroj.playbackRate.value = nova;
    this.dolaďVysku();
  }

  public nastavPridavani(procent: number): void {
    this.oznam({ pridavat: Math.max(0, Math.min(20, procent)) });
  }

  public prepniKlik(): void {
    this.oznam({ klik: !this.stav.klik });
    if (!this.stav.klik && this.klikTimer !== null) {
      window.clearInterval(this.klikTimer);
      this.klikTimer = null;
    } else if (this.stav.hraje) {
      this.rozjedKlik();
    }
  }

  public prehraj(): void {
    if (this.stav.hraje || !this.buffer) return;
    // Tone svůj kontext do prvního kliknutí drží pozastavený; bez tohohle
    // by se tlačítko zmáčklo a nic by se neozvalo.
    void Tone.start();
    audioBus.claim('cviceni', 'Cvičení', 'Practise Hub');
    this.oznam({ hraje: true, kol: 0 });
    this.rozjed();
    this.sleduj();
    if (this.stav.klik) this.rozjedKlik();
  }

  /** Spustí jedno kolo smyčky. Konec kola se hlídá v `sleduj`. */
  private rozjed(): void {
    if (!this.ctx || !this.buffer) return;
    this.zdroj?.stop();
    if (!this.hlasitost) {
      this.hlasitost = this.ctx.createGain();
      this.posuvVysky = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 }).toDestination();
      Tone.connect(this.hlasitost, this.posuvVysky);
      this.dolaďVysku();
    }
    const z = this.ctx.createBufferSource();
    z.buffer = this.buffer;
    z.playbackRate.value = this.stav.rychlost;
    z.connect(this.hlasitost);
    z.start(0, this.stav.od, Math.max(0.1, this.stav.do - this.stav.od));
    this.zdroj = z;
    this.zacatekKola = this.ctx.currentTime;
  }

  private sleduj(): void {
    const krok = () => {
      if (!this.stav.hraje || !this.ctx) return;
      const ubehlo = (this.ctx.currentTime - this.zacatekKola) * this.stav.rychlost;
      const delkaSmycky = this.stav.do - this.stav.od;

      if (ubehlo >= delkaSmycky) {
        // Konec kola: přidá se rychlost a jede se znovu. Postupné
        // zrychlování je celý smysl téhle místnosti — cvičí se pomalu
        // a tempo se zvedá samo, aniž by se to muselo hlídat.
        const nova = this.stav.pridavat
          ? Math.min(1.5, this.stav.rychlost * (1 + this.stav.pridavat / 100))
          : this.stav.rychlost;
        this.oznam({ kol: this.stav.kol + 1, rychlost: nova, pozice: this.stav.od });
        this.rozjed();
      } else {
        this.oznam({ pozice: this.stav.od + ubehlo });
      }
      this.tik = window.setTimeout(krok, 60);
    };
    krok();
  }

  /** Klik metronomu podle tempa cvičení a nastavené rychlosti. */
  private rozjedKlik(): void {
    if (this.klikTimer !== null) window.clearInterval(this.klikTimer);
    const bpm = 120;
    const interval = (60 / bpm / this.stav.rychlost) * 1000;
    this.klikTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, this.ctx.currentTime + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    }, interval);
  }

  public stop(): void {
    if (this.tik !== null) window.clearTimeout(this.tik);
    this.tik = null;
    if (this.klikTimer !== null) window.clearInterval(this.klikTimer);
    this.klikTimer = null;
    try {
      this.zdroj?.stop();
    } catch {
      /* už zastavený zdroj vyhodí výjimku, na které nezáleží */
    }
    this.zdroj = null;
    audioBus.release('cviceni');
    this.oznam({ hraje: false });
  }
}

export const prehravacCviceni = new PrehravacCviceni();
