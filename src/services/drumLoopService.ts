import { audioBus } from './audioBus';
import { authService } from './authService';

/**
 * Přehrávání bicích smyček ve WAV.
 *
 * Nahradilo MIDI groovy. Smyčka je hotová nahrávka, takže zní tak, jak ji
 * nahrál bubeník — MIDI se muselo skládat ze vzorků a znělo jen tak dobře,
 * jak dobrou sadu k němu appka zrovna měla.
 *
 * Opakování řeší `loop` na zdroji zvuku, ne přeplánovávání v časovači.
 * Zvuková karta si střih pohlídá sama a smyčka se nerozjíždí.
 */

export interface Smycka {
  id: string;
  nazev: string;
  bpm: number;
  balik: string;
  velikost: number;
}

export interface StavSmycky {
  smycka: Smycka | null;
  hraje: boolean;
  nacita: boolean;
  /** Tempo, ve kterém se hraje. Mění se rychlostí přehrávání. */
  tempo: number;
  puvodniTempo: number;
  hlasitost: number;
  chyba: string | null;
}

type Listener = (s: StavSmycky) => void;

class DrumLoopService {
  private stav: StavSmycky = {
    smycka: null,
    hraje: false,
    nacita: false,
    tempo: 120,
    puvodniTempo: 120,
    hlasitost: 0.8,
    chyba: null,
  };

  private listeners = new Set<Listener>();
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private zdroj: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private odregistruj: (() => void) | null = null;

  constructor() {
    this.odregistruj = audioBus.register('drum-loops', () => this.stop());
  }

  public subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.stav);
    return () => this.listeners.delete(cb);
  }

  private oznam() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.stav);
      } catch {
        /* posluchač si chybu řeší sám */
      }
    });
  }

  public getState(): StavSmycky {
    return this.stav;
  }

  private zvuk(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.stav.hlasitost;
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Načte smyčku a rozehraje ji. Výběr má znít hned, ne po dalším kliknutí. */
  public async nacti(s: Smycka, rovnouHrat = true): Promise<void> {
    this.stop();
    this.stav = { ...this.stav, smycka: s, nacita: true, chyba: null };
    this.oznam();

    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/assets/${s.id}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Stažení selhalo (HTTP ${res.status}).`);

      const ctx = this.zvuk();
      this.buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      this.stav = {
        ...this.stav,
        nacita: false,
        puvodniTempo: s.bpm,
        tempo: s.bpm,
      };
      this.oznam();
      if (rovnouHrat) this.play();
    } catch (e: any) {
      this.stav = { ...this.stav, nacita: false, chyba: e?.message || 'Smyčku se nepodařilo načíst.' };
      this.oznam();
    }
  }

  public play(): void {
    if (!this.buffer || this.stav.hraje) return;
    audioBus.claim('drum-loops');

    const ctx = this.zvuk();
    if (ctx.state === 'suspended') void ctx.resume();

    const zdroj = ctx.createBufferSource();
    zdroj.buffer = this.buffer;
    zdroj.loop = true;
    // Tempo se mění rychlostí přehrávání. U bicích to je v pořádku —
    // posun výšky je při rozumné změně sotva slyšet a smyčka zůstane celá.
    zdroj.playbackRate.value = this.stav.tempo / Math.max(1, this.stav.puvodniTempo);
    zdroj.connect(this.gain!);
    zdroj.start();

    this.zdroj = zdroj;
    this.stav = { ...this.stav, hraje: true };
    this.oznam();
  }

  public stop(): void {
    if (this.zdroj) {
      try {
        this.zdroj.stop();
      } catch {
        /* zastavený zdroj se zastavit nedá — nevadí */
      }
      this.zdroj = null;
    }
    if (this.stav.hraje) {
      this.stav = { ...this.stav, hraje: false };
      this.oznam();
    }
  }

  public toggle(): void {
    this.stav.hraje ? this.stop() : this.play();
  }

  public setTempo(bpm: number): void {
    const novy = Math.max(40, Math.min(300, Math.round(bpm)));
    this.stav = { ...this.stav, tempo: novy };
    // Za běhu se mění rovnou, aby se nemuselo zastavovat a spouštět znovu.
    if (this.zdroj) {
      this.zdroj.playbackRate.value = novy / Math.max(1, this.stav.puvodniTempo);
    }
    this.oznam();
  }

  public setHlasitost(v: number): void {
    const h = Math.max(0, Math.min(1, v));
    this.stav = { ...this.stav, hlasitost: h };
    if (this.gain && this.ctx) {
      // Plynule — skok v hlasitosti je slyšet jako lupnutí.
      this.gain.gain.setTargetAtTime(h, this.ctx.currentTime, 0.02);
    }
    this.oznam();
  }

  public dispose(): void {
    this.stop();
    this.odregistruj?.();
  }
}

export const drumLoopService = new DrumLoopService();
