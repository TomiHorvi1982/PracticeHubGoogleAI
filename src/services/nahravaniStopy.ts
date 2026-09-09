import { doWav, jmenoNahravky, spicka, spojKusy } from './wav';

/**
 * Nahrávání stopy z libovolného místa řetězu.
 *
 * Používá se hlavně na DI: čistý signál z kytary před aparátem. Ten se
 * dá později přehnat jiným modelem z TONE3000, jinou bednou nebo jinými
 * efekty — kdežto nahrávka už zkreslená aparátem je hotová a nedá se
 * vrátit.
 *
 * Zapisuje se přes worklet, tedy na zvukovém vlákně. Podrobnosti proč
 * a jak v `audio/nahravaniWorklet.js`.
 */

export interface HotovaNahravka {
  wav: Uint8Array;
  jmeno: string;
  vterin: number;
  /** Nejvyšší výchylka. Nula znamená, že se nic nenahrálo. */
  spicka: number;
  vzorkovaci: number;
}

/** Delší nahrávka než tohle nejspíš znamená, že na to někdo zapomněl. */
const STROP_VTERIN = 10 * 60;

class NahravaniStopy {
  private uzel: AudioWorkletNode | null = null;
  private zdroj: AudioNode | null = null;
  private kusy: Float32Array[] = [];
  private pripraveno: Promise<void> | null = null;
  private hlidac: number | null = null;
  private dokonci: ((n: HotovaNahravka) => void) | null = null;

  public bezi(): boolean { return this.uzel !== null; }

  /** Kolik vteřin už se nahrává. Na počitadlo v rozhraní. */
  public vterin(vzorkovaci: number): number {
    return this.kusy.reduce((n, k) => n + k.length, 0) / vzorkovaci;
  }

  private pripravWorklet(ctx: BaseAudioContext): Promise<void> {
    if (!this.pripraveno) {
      // `import.meta.url` schválně: Vite z toho udělá adresu souboru
      // v hotovém balíčku. Ručně psaná cesta by fungovala jen ve vývoji.
      const adresa = new URL('../audio/nahravaniWorklet.js', import.meta.url);
      this.pripraveno = (ctx as AudioContext).audioWorklet.addModule(adresa).catch((e) => {
        this.pripraveno = null;
        throw e;
      });
    }
    return this.pripraveno;
  }

  /**
   * Začne nahrávat, co jde ze zadaného uzlu.
   *
   * Zdroj se jen odposlouchává — připojení do nahrávače nic neodpojuje,
   * takže kytara během nahrávání hraje dál do pultu.
   */
  public async spust(zdroj: AudioNode, ctx: AudioContext): Promise<boolean> {
    if (this.uzel) return false;
    try {
      await this.pripravWorklet(ctx);
    } catch {
      return false;
    }

    this.kusy = [];
    this.uzel = new AudioWorkletNode(ctx, 'zaznamnik');
    this.zdroj = zdroj;

    this.uzel.port.onmessage = (e) => {
      if (e.data?.kusy) this.kusy.push(...e.data.kusy);
      if (e.data?.konec) this.uzavri(ctx.sampleRate);
    };

    zdroj.connect(this.uzel);
    /*
     * Worklet musí někam ústit, jinak ho prohlížeč nezavolá.
     *
     * Ústí do uzlu s nulovým ziskem — do reproduktorů se nic nedostane,
     * ale zpracování běží. Bez toho by nahrávka zůstala prázdná a nikde
     * by se to neohlásilo.
     */
    const doNikam = ctx.createGain();
    doNikam.gain.value = 0;
    this.uzel.connect(doNikam);
    doNikam.connect(ctx.destination);

    // Pojistka pro případ, že se na běžící nahrávání zapomene.
    this.hlidac = window.setTimeout(() => { void this.zastav(); }, STROP_VTERIN * 1000);
    return true;
  }

  /** Zastaví nahrávání a vrátí hotový WAV. */
  public zastav(predpona = 'di'): Promise<HotovaNahravka | null> {
    if (!this.uzel) return Promise.resolve(null);
    if (this.hlidac) { window.clearTimeout(this.hlidac); this.hlidac = null; }
    this.predpona = predpona;
    return new Promise((vyres) => {
      this.dokonci = vyres;
      this.uzel?.port.postMessage('stop');
    });
  }

  private predpona = 'di';

  private uzavri(vzorkovaci: number): void {
    const vzorky = spojKusy(this.kusy);
    try { this.zdroj?.disconnect(this.uzel!); } catch { /* už mohl zmizet */ }
    try { this.uzel?.disconnect(); } catch { /* dtto */ }
    this.uzel = null;
    this.zdroj = null;
    this.kusy = [];

    const hotovo: HotovaNahravka = {
      wav: doWav([vzorky], vzorkovaci),
      jmeno: jmenoNahravky(this.predpona),
      vterin: vzorky.length / vzorkovaci,
      spicka: spicka(vzorky),
      vzorkovaci,
    };
    this.dokonci?.(hotovo);
    this.dokonci = null;
  }
}

export const nahravaniStopy = new NahravaniStopy();
