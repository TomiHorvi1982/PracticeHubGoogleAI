import { audioBus } from './audioBus';

/**
 * AI sólista — Magenta RealTime 2 běžící na tomhle stroji.
 *
 * Model má 230 milionů parametrů a v reálném čase běží jen na Apple
 * Silicon, takže do prohlížeče nepatří. Běží jako místní služba
 * (`worker/magenta/run.sh`) a sem chodí proud zvuku po sekundových
 * kouscích přes WebSocket.
 *
 * Kousky se řadí za sebe na zvukových hodinách, ne „až dojdou": kdyby
 * se každý pouštěl v okamžiku doručení, mezi nimi by byly slyšet díry
 * podle toho, jak zrovna stíhá síť a model.
 *
 * Bez běžící služby appka řekne, že sólista není k dispozici, a kapela
 * hraje dál bez něj.
 */

const ADRESA = 'ws://127.0.0.1:8770';

export interface StavSolisty {
  stav: 'vypnuto' | 'pripojuji' | 'hraje' | 'chyba';
  styl: string;
  chyba: string | null;
  /** Kolik kousků už dorazilo — poznat, že to opravdu teče. */
  kusu: number;
}

type Poslucha = (s: StavSolisty) => void;

class AiSolista {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private hlasitost: GainNode | null = null;
  /** Kdy má začít další kousek. Drží návaznost. */
  private dalsiCas = 0;
  private stav: StavSolisty = { stav: 'vypnuto', styl: '', chyba: null, kusu: 0 };
  private posluchaci = new Set<Poslucha>();

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavSolisty>) {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public nastavHlasitost(v: number): void {
    if (this.hlasitost) this.hlasitost.gain.value = Math.max(0, Math.min(1, v));
  }

  public async start(styl: string): Promise<void> {
    if (this.stav.stav === 'hraje' || this.stav.stav === 'pripojuji') {
      this.zmenStyl(styl);
      return;
    }
    this.oznam({ stav: 'pripojuji', chyba: null, kusu: 0, styl });

    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.hlasitost = this.ctx.createGain();
    this.hlasitost.gain.value = 0.7;
    this.hlasitost.connect(this.ctx.destination);
    await this.ctx.resume();
    // Malý náskok, aby první kousek nedorazil pozdě.
    this.dalsiCas = this.ctx.currentTime + 0.3;

    try {
      this.ws = new WebSocket(ADRESA);
      this.ws.binaryType = 'arraybuffer';
    } catch (e: any) {
      this.oznam({ stav: 'chyba', chyba: `Připojení selhalo: ${e?.message || e}` });
      return;
    }

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ typ: 'start', styl }));
      audioBus.claim('ai-solista', `AI sólista — ${styl}`, 'Jam Room');
    };

    this.ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const z = JSON.parse(e.data);
        if (z.typ === 'hraje') this.oznam({ stav: 'hraje' });
        return;
      }
      this.prehrajKus(e.data as ArrayBuffer);
    };

    this.ws.onerror = () => {
      this.oznam({
        stav: 'chyba',
        chyba: 'Sólista neběží. Spusť ho příkazem ./worker/magenta/run.sh',
      });
    };

    this.ws.onclose = () => {
      if (this.stav.stav !== 'chyba') this.oznam({ stav: 'vypnuto' });
    };
  }

  /**
   * Zařadí došlý kousek do fronty na zvukových hodinách.
   *
   * Hlavička nese vzorkovací kmitočet a počet kanálů — model vrací 48 kHz
   * stereo, ale spoléhat se na to natvrdo by znamenalo, že jiná verze
   * modelu bude hrát v jiné rychlosti a nikdo nepozná proč.
   */
  private prehrajKus(data: ArrayBuffer): void {
    if (!this.ctx || !this.hlasitost) return;
    const hlavicka = new DataView(data, 0, 8);
    const sr = hlavicka.getUint32(0, true);
    const kanalu = Math.max(1, hlavicka.getUint32(4, true));

    const pcm = new Int16Array(data, 8);
    const delka = Math.floor(pcm.length / kanalu);
    if (delka === 0) return;

    const buffer = this.ctx.createBuffer(kanalu, delka, sr);
    for (let k = 0; k < kanalu; k++) {
      const kanal = buffer.getChannelData(k);
      for (let i = 0; i < delka; i++) kanal[i] = pcm[i * kanalu + k] / 32768;
    }

    const zdroj = this.ctx.createBufferSource();
    zdroj.buffer = buffer;
    zdroj.connect(this.hlasitost);

    // Když se zpozdí síť nebo model, fronta by zůstala v minulosti a
    // všechno by se sesypalo do jednoho okamžiku. Radši se navážeme
    // znovu na přítomnost a přizná se díra.
    const ted = this.ctx.currentTime;
    if (this.dalsiCas < ted) this.dalsiCas = ted + 0.05;
    zdroj.start(this.dalsiCas);
    this.dalsiCas += buffer.duration;

    this.oznam({ kusu: this.stav.kusu + 1 });
  }

  public zmenStyl(styl: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ typ: 'styl', styl }));
      this.oznam({ styl });
    }
  }

  public stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ typ: 'stop' }));
    }
    this.ws?.close();
    this.ws = null;
    void this.ctx?.close();
    this.ctx = null;
    this.hlasitost = null;
    audioBus.release('ai-solista');
    this.oznam({ stav: 'vypnuto', kusu: 0 });
  }
}

export const aiSolista = new AiSolista();
