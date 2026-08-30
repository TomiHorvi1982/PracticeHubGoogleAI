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
  /**
   * Kolik vteřin zvuku už přišlo.
   *
   * Sčítá se ze skutečné délky kousků, ne z jejich počtu: kolik je
   * v jednom kusu, rozhoduje služba a v prohlížeči se to neví.
   */
  vterin: number;
  /** Jak silně se sólista drží podaných akordů, 0 až 8. */
  drzeniAkordu: number;
  /** Co se mu naposledy poslalo — kvůli kontrole v UI. */
  posledniAkord: string;
  /** Průběh renderu mimo reálný čas, nebo null, když žádný neběží. */
  render: { hotovo: number; celkem: number } | null;
}

/** Jeden takt pro render: harmonie a jestli v něm bouchají bicí. */
export interface TaktRenderu {
  tony: number[];
  bici: boolean;
}

/** Kolik tónů má klavírní role, kterou model přijímá. */
const TONU = 128;
/** Hodnoty v roli: ticho, úder, držení. */
const TICHO = 0;
const UDER = 1;
const DRZENI = 2;

type Poslucha = (s: StavSolisty) => void;

class AiSolista {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private hlasitost: GainNode | null = null;
  /** Kdy má začít další kousek. Drží návaznost. */
  private dalsiCas = 0;
  private stav: StavSolisty = {
    stav: 'vypnuto',
    styl: '',
    chyba: null,
    kusu: 0,
    vterin: 0,
    drzeniAkordu: 2,
    posledniAkord: '',
    render: null,
  };
  /** Rozdělaný render — čeká na binární data, která přijdou po hlášce. */
  private cekaNaRender: ((b: Blob) => void) | null = null;
  /** Aby se táž podmínka neposílala pořád dokola. */
  private posledniPodminka = '';
  /** Příznak, že příští binární zpráva je vyrenderovaný soubor. */
  private dalsiBinarniJeRender = false;
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
    // Staré spojení musí pryč, ne jen zapomenout.
    //
    // Zůstávalo otevřené a jeho generující smyčka na serveru běžela dál;
    // dvě smyčky nad jedním modelem si přepisovaly rozehraný stav a
    // model pak volání odmítl. Poznalo se to tak, že sólista po
    // opětovném spuštění chvíli hrál a pak zmlkl.
    if (this.ws) {
      const stare = this.ws;
      this.ws = null;
      stare.onmessage = null;
      stare.onclose = null;
      stare.onerror = null;
      try {
        stare.close();
      } catch {
        /* už zavřené */
      }
    }

    this.oznam({ stav: 'pripojuji', chyba: null, kusu: 0, vterin: 0, styl });

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
        // Render si bere stroj pro sebe, takže živé hraní skončí.
        else if (z.typ === 'stojí') this.oznam({ stav: 'vypnuto', kusu: 0, vterin: 0 });
        else if (z.typ === 'render-postup') {
          this.oznam({ render: { hotovo: z.hotovo, celkem: z.celkem } });
        } else if (z.typ === 'render-hotovo') {
          // Data přijdou hned za touhle hláškou; příští binární zpráva
          // není kus k přehrání, ale hotový soubor.
          this.dalsiBinarniJeRender = true;
        } else if (z.typ === 'render-chyba') {
          this.oznam({ render: null, chyba: z.chyba || 'Render selhal.' });
          this.cekaNaRender = null;
        }
        return;
      }

      if (this.dalsiBinarniJeRender) {
        this.dalsiBinarniJeRender = false;
        const hotovo = this.cekaNaRender;
        this.cekaNaRender = null;
        this.oznam({ render: null });
        hotovo?.(new Blob([e.data as ArrayBuffer], { type: 'audio/wav' }));
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

    this.oznam({ kusu: this.stav.kusu + 1, vterin: this.stav.vterin + buffer.duration });
  }

  public nastavDrzeniAkordu(v: number): void {
    const nove = Math.max(0, Math.min(8, v));
    this.oznam({ drzeniAkordu: nove });
    // Pošle se hned, ať je změna slyšet do dvou desetin sekundy.
    this.posli({ typ: 'noty', cfg: nove });
  }

  /**
   * Řekne sólistovi, co kapela zrovna hraje.
   *
   * Posílá se klavírní role — 128 hodnot, jedna na každý tón — a jestli
   * v tom okamžiku bouchly bicí. Model si podle toho drží harmonii, takže
   * nehraje jen „ve stylu", ale do našich akordů.
   *
   * `uder` odlišuje začátek akordu od jeho držení: bez toho by model
   * neměl jak poznat, kdy se harmonie změnila.
   */
  public posliAkord(tony: number[], nazev: string, uder: boolean, bici = false): void {
    if (this.stav.stav !== 'hraje') return;

    const otisk = `${nazev}|${uder}|${bici}`;
    if (otisk === this.posledniPodminka) return;
    this.posledniPodminka = otisk;

    // Tón se podá ve třech oktávách: model tak ví, že jde o harmonii,
    // ne o jednu konkrétní polohu, a může si sólo položit, kam chce.
    const role = this.role(tony);
    if (!uder) {
      for (let i = 0; i < role.length; i++) if (role[i] === UDER) role[i] = DRZENI;
    }

    this.posli({
      typ: 'noty',
      noty: role,
      bici: bici ? 1 : 0,
      cfg: this.stav.drzeniAkordu,
    });
    this.oznam({ posledniAkord: nazev });
  }

  private posli(zprava: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(zprava));
    }
  }

  /**
   * Nechá sólo vyrenderovat dopředu větším modelem.
   *
   * Živě hraje ten malý, protože větší na tomhle stroji nestíhá. Když se
   * ale na výsledek počká, na rychlosti nezáleží a je slyšet rozdíl.
   * Navíc se harmonie podá přesně na takt, ne dopředu na blok, který
   * model zrovna počítá — takže sólo drží akordy líp než živě.
   *
   * Živé hraní se přitom zastaví: dva modely naráz by se přetahovaly.
   */
  public vyrenderuj(
    styl: string,
    bpm: number,
    dobVTaktu: number,
    takty: TaktRenderu[]
  ): Promise<Blob> {
    return new Promise((hotovo, selhalo) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        selhalo(new Error('Sólista neběží. Spusť ho příkazem ./worker/magenta/run.sh'));
        return;
      }
      if (this.cekaNaRender) {
        selhalo(new Error('Jeden render už běží.'));
        return;
      }

      this.cekaNaRender = hotovo;
      this.oznam({ render: { hotovo: 0, celkem: takty.length }, chyba: null });

      this.posli({
        typ: 'render',
        styl,
        bpm,
        dobVTaktu,
        cfg: this.stav.drzeniAkordu,
        takty: takty.map((t) => ({ noty: this.role(t.tony), bici: t.bici ? 1 : 0 })),
      });
    });
  }

  /** Klavírní role z tónů akordu, ve třech oktávách. */
  private role(tony: number[]): number[] {
    const role = new Array(TONU).fill(TICHO);
    for (const t of tony) {
      for (const oktava of [-12, 0, 12]) {
        const n = t + oktava;
        if (n >= 0 && n < TONU) role[n] = UDER;
      }
    }
    return role;
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
    this.posledniPodminka = '';
    this.oznam({ stav: 'vypnuto', kusu: 0, vterin: 0, posledniAkord: '' });
  }
}

export const aiSolista = new AiSolista();
