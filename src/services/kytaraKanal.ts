import { zvukovaKarta } from './zvukovaKarta';

/**
 * Kanál pro vstup z kytary — pult, ne jen mikrofon.
 *
 * Poslouchat kytaru už appka umí, ale naslepo: nebylo vidět, jestli
 * signál vůbec chodí, jak je silný a jestli neřeže. Kdo si zesílí
 * předzesilovač do červené, pozná to až podle toho, že detekce tónů
 * začne blbnout.
 *
 * Řetěz je stejný jako na pultu: vstup → gain → šířka → panorama →
 * hlasitost → měřák. Odposlech je schválně vypnutý; mikrofon puštěný do
 * beden je zpětná vazba a to se dělá jen se sluchátky.
 */

export interface StavKanalu {
  bezi: boolean;
  /** Zesílení vstupu, 0,1 až 8×. */
  gain: number;
  /** −1 vlevo, 0 uprostřed, 1 vpravo. */
  panorama: number;
  /** 0 = mono uprostřed, 1 = široké. */
  sirka: number;
  hlasitost: number;
  /** Poslouchat sám sebe z výstupu. Jen do sluchátek. */
  odposlech: boolean;
  /** Hlasitost signálu po zpracování, 0 až 1. */
  uroven: number;
  /** Nejvyšší špička za poslední chvíli — drží se, ať se dá přečíst. */
  spicka: number;
  /** Signál za posledních pár vteřin přesáhl plný rozsah. */
  preburacene: boolean;
  nahrava: boolean;
  /** Délka běžící nahrávky ve vteřinách. */
  nahranoS: number;
  chyba: string | null;
}

type Poslucha = (s: StavKanalu) => void;

/**
 * Šířka mono signálu se dělá zpožděním jednoho kanálu.
 *
 * Kytara jde do zvukovky jedním kabelem, takže obě strany jsou stejné a
 * klasické mid/side nemá co roztáhnout — rozdíl je nula. Pár milisekund
 * zpoždění vpravo ucho slyší jako šířku, ne jako ozvěnu.
 */
const MAX_ZPOZDENI = 0.018;

class KytaraKanal {
  private ctx: AudioContext | null = null;
  private proud: MediaStream | null = null;
  private zdroj: MediaStreamAudioSourceNode | null = null;
  private uzelGain: GainNode | null = null;
  private uzelPan: StereoPannerNode | null = null;
  private uzelHlasitost: GainNode | null = null;
  /** Suchá a zpožděná větev; jejich poměr dělá šířku. */
  private zpozdeni: DelayNode | null = null;
  private vpravo: GainNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private data: Float32Array | null = null;
  private smycka = 0;

  private nahravac: MediaRecorder | null = null;
  private kusy: Blob[] = [];
  private zacatekNahravky = 0;
  /** Poslední nahrávka, dokud si ji někdo nevyzvedne. */
  private posledniNahravka: Blob | null = null;

  private stav: StavKanalu = {
    bezi: false, gain: 1, panorama: 0, sirka: 0, hlasitost: 1,
    odposlech: false, uroven: 0, spicka: 0, preburacene: false,
    nahrava: false, nahranoS: 0, chyba: null,
  };
  private posluchaci = new Set<Poslucha>();

  public getStav(): StavKanalu {
    return this.stav;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavKanalu>): void {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public async start(): Promise<void> {
    if (this.stav.bezi) return;
    try {
      this.proud = await navigator.mediaDevices.getUserMedia(zvukovaKarta.omezeniVstupu());
    } catch (e: any) {
      this.oznam({ chyba: `Vstup není k dispozici: ${e?.message || e}` });
      return;
    }

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    void zvukovaKarta.pouzijVystup(ctx);

    this.zdroj = ctx.createMediaStreamSource(this.proud);
    this.uzelGain = ctx.createGain();
    this.uzelPan = ctx.createStereoPanner();
    this.uzelHlasitost = ctx.createGain();
    this.zpozdeni = ctx.createDelay(0.05);
    this.vpravo = ctx.createGain();
    this.analyzer = ctx.createAnalyser();
    this.analyzer.fftSize = 2048;
    this.data = new Float32Array(this.analyzer.fftSize);

    // Suchá větev jde rovnou, zpožděná se přimíchává podle šířky.
    this.zdroj.connect(this.uzelGain);
    this.uzelGain.connect(this.uzelPan);
    this.uzelGain.connect(this.zpozdeni);
    this.zpozdeni.connect(this.vpravo);
    this.vpravo.connect(this.uzelPan);
    this.uzelPan.connect(this.uzelHlasitost);
    this.uzelHlasitost.connect(this.analyzer);

    this.pouzijHodnoty();
    this.oznam({ bezi: true, chyba: null });
    this.mer();
  }

  public stop(): void {
    if (this.stav.nahrava) this.zastavNahravani();
    if (this.smycka) cancelAnimationFrame(this.smycka);
    this.smycka = 0;
    this.proud?.getTracks().forEach((t) => t.stop());
    this.proud = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyzer = null;
    this.oznam({ bezi: false, uroven: 0, spicka: 0, preburacene: false });
  }

  private pouzijHodnoty(): void {
    if (!this.ctx) return;
    const ted = this.ctx.currentTime;
    this.uzelGain?.gain.setTargetAtTime(this.stav.gain, ted, 0.01);
    this.uzelPan?.pan.setTargetAtTime(this.stav.panorama, ted, 0.01);
    this.uzelHlasitost?.gain.setTargetAtTime(this.stav.hlasitost, ted, 0.01);
    this.zpozdeni?.delayTime.setTargetAtTime(this.stav.sirka * MAX_ZPOZDENI, ted, 0.02);
    this.vpravo?.gain.setTargetAtTime(this.stav.sirka, ted, 0.02);

    // Odposlech se připojuje a odpojuje, ne ztlumuje — ztlumený, ale
    // připojený řetěz je pořád cesta zpětné vazby.
    if (this.uzelHlasitost && this.ctx) {
      try {
        this.uzelHlasitost.disconnect(this.ctx.destination);
      } catch {
        /* nebyl připojený */
      }
      if (this.stav.odposlech) this.uzelHlasitost.connect(this.ctx.destination);
    }
  }

  public nastav(z: Partial<Pick<StavKanalu, 'gain' | 'panorama' | 'sirka' | 'hlasitost' | 'odposlech'>>): void {
    this.oznam(z);
    this.pouzijHodnoty();
  }

  /**
   * Měření hladiny.
   *
   * Efektivní hodnota pro sloupec, špička zvlášť: kytara má ostré náběhy
   * a podle průměru by pult vypadal v pohodě i ve chvíli, kdy vstup
   * ořezává.
   */
  private mer = (): void => {
    if (!this.analyzer || !this.data) return;
    this.analyzer.getFloatTimeDomainData(this.data);

    let soucet = 0;
    let max = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      soucet += v * v;
      const a = Math.abs(v);
      if (a > max) max = a;
    }
    const rms = Math.sqrt(soucet / this.data.length);

    // Špička padá pomalu, aby se stihla přečíst; nahoru skáče hned.
    const spicka = Math.max(max, this.stav.spicka * 0.94);
    const preburacene = max >= 0.99 ? true : this.stav.spicka > 0.99;

    if (Math.abs(rms - this.stav.uroven) > 0.004 || Math.abs(spicka - this.stav.spicka) > 0.004) {
      this.oznam({ uroven: Math.min(1, rms * 3), spicka: Math.min(1, spicka), preburacene });
    }
    if (this.stav.nahrava) {
      const s = Math.round((performance.now() - this.zacatekNahravky) / 100) / 10;
      if (s !== this.stav.nahranoS) this.oznam({ nahranoS: s });
    }

    this.smycka = requestAnimationFrame(this.mer);
  };

  /**
   * Nahrává to, co jde z kanálu — po gainu, panoramatu i hlasitosti.
   *
   * Nahrávat surový vstup by znamenalo, že nahrávka zní jinak než to, co
   * si člověk před chvílí nastavil.
   */
  public zacniNahravat(): void {
    if (!this.ctx || !this.uzelHlasitost || this.stav.nahrava) return;
    const cil = this.ctx.createMediaStreamDestination();
    this.uzelHlasitost.connect(cil);

    const nahravac = new MediaRecorder(cil.stream);
    this.kusy = [];
    nahravac.ondataavailable = (e) => {
      if (e.data.size > 0) this.kusy.push(e.data);
    };
    nahravac.onstop = () => {
      this.posledniNahravka = new Blob(this.kusy, { type: nahravac.mimeType || 'audio/webm' });
      try {
        this.uzelHlasitost?.disconnect(cil);
      } catch {
        /* už odpojené */
      }
      this.oznam({ nahrava: false });
    };
    nahravac.start();
    this.nahravac = nahravac;
    this.zacatekNahravky = performance.now();
    this.oznam({ nahrava: true, nahranoS: 0 });
  }

  public zastavNahravani(): void {
    this.nahravac?.stop();
    this.nahravac = null;
  }

  /** Vyzvedne poslední nahrávku; podruhé už nic nevrátí. */
  public vyzvedniNahravku(): Blob | null {
    const b = this.posledniNahravka;
    this.posledniNahravka = null;
    return b;
  }
}

export const kytaraKanal = new KytaraKanal();
