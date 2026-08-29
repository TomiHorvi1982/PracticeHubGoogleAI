import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib';
// Zpracování zvuku běží ve worklet vlákně; Vite ho musí vydat jako
// samostatný soubor, ne ho zabalit do hlavního balíku.
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';
import { authService } from './authService';

/**
 * Přehrávání MIDI přes skutečnou zvukovou banku.
 *
 * Původní přehrávač plánoval každou notu vlastním `setTimeout` a hrál ji
 * jednorázovou metodou syntetizátoru. Mělo to dvě vady, kterých si kapela
 * všimla: noty se krátily, protože délku držel jen odhad obálky vzorku,
 * a u vícestopých skladeb se sekal posuvník, protože se pro deset tisíc
 * not vyrobilo deset tisíc časovačů.
 *
 * SpessaSynth je proti tomu opravdový SoundFont syntetizátor: běží
 * v audio vlákně, noty drží podle zprávy „note off" ze souboru a má
 * vlastní sekvencer s přesnými hodinami. Banku bere tutéž, kterou hraje
 * přehrávač tabulatur — jeden zvuk pro obojí.
 */

/** Kde leží banka kapely. Stahuje se přes vlastní server kvůli přihlášení. */
const BANKA_URL = '/api/assets/d64c3a5e-4267-4aec-8750-970e6868e175/content';

export interface StavEngine {
  pripraven: boolean;
  nacita: boolean;
  chyba: string | null;
  /** Odkud se vzal zvuk — kvůli poznámce v UI. */
  banka: string | null;
}

class SpessaEngine {
  private ctx: AudioContext | null = null;
  private synth: WorkletSynthesizer | null = null;
  private seq: Sequencer | null = null;
  private priprava: Promise<void> | null = null;
  private stav: StavEngine = { pripraven: false, nacita: false, chyba: null, banka: null };
  private posluchaci = new Set<(s: StavEngine) => void>();

  public subscribe(f: (s: StavEngine) => void): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavEngine>) {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  /**
   * Připraví syntetizátor. Volá se líně, až když je opravdu potřeba —
   * banka má čtyřicet megabajtů a stahovat ji při otevření sekce, kde si
   * člověk jen prohlíží noty, by bylo plýtvání.
   */
  public pripravit(): Promise<void> {
    if (this.priprava) return this.priprava;
    this.priprava = (async () => {
      this.oznam({ nacita: true, chyba: null });
      try {
        this.ctx = new AudioContext();
        await this.ctx.audioWorklet.addModule(processorUrl);
        this.synth = new WorkletSynthesizer(this.ctx);
        this.synth.connect(this.ctx.destination);
        await this.synth.isReady;

        const token = authService.getCurrentSession()?.token;
        const res = await fetch(BANKA_URL, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`banku se nepodařilo stáhnout (HTTP ${res.status})`);
        await this.synth.soundBankManager.addSoundBank(await res.arrayBuffer(), 'hlavni');

        this.seq = new Sequencer(this.synth);
        // Ticho na začátku souboru se přeskočí: skladby ho mívají takt
        // i dva a vypadá to, jako by se přehrávání nespustilo.
        this.seq.skipToFirstNoteOn = true;
        this.oznam({ pripraven: true, nacita: false, banka: 'Zvuková banka kapely (SF3)' });
      } catch (e: any) {
        this.oznam({ nacita: false, chyba: e?.message || String(e) });
        // Další pokus musí být možný — výpadek sítě není trvalý stav.
        this.priprava = null;
        throw e;
      }
    })();
    return this.priprava;
  }

  public async nactiSkladbu(data: ArrayBuffer, nazev: string): Promise<number> {
    await this.pripravit();
    if (!this.seq) throw new Error('Sekvencer není připravený.');
    this.seq.loadNewSongList([{ binary: data, fileName: nazev }]);
    this.seq.pause();
    // Délku sekvencer zná až po načtení; UI si o ni řekne hned potom.
    return this.seq.duration || 0;
  }

  public async prehraj(od?: number): Promise<void> {
    await this.pripravit();
    if (!this.seq || !this.ctx) return;
    await this.ctx.resume();
    if (od !== undefined) this.seq.currentTime = od;
    this.seq.play();
  }

  public pauza(): void {
    this.seq?.pause();
  }

  public zastav(): void {
    if (!this.seq) return;
    this.seq.pause();
    this.seq.currentTime = 0;
  }

  public skoc(sekundy: number): void {
    if (this.seq) this.seq.currentTime = sekundy;
  }

  public get pozice(): number {
    return this.seq?.currentTime ?? 0;
  }

  public get delka(): number {
    return this.seq?.duration ?? 0;
  }

  public get bezi(): boolean {
    return this.seq ? !this.seq.paused : false;
  }

  public nastavTempo(nasobek: number): void {
    if (this.seq) this.seq.playbackRate = Math.max(0.25, Math.min(4, nasobek));
  }

  /**
   * Ztlumení stopy.
   *
   * Knihovna vlastní přepínač ztlumení nemá, takže se posílá hlasitost
   * kanálu — v MIDI je to řídicí změna číslo 7 a syntetizátor jí rozumí
   * stejně jako skutečný nástroj.
   */
  public hlasitostKanalu(kanal: number, hlasitost: number): void {
    this.synth?.controllerChange(kanal, 7, Math.round(Math.max(0, Math.min(1, hlasitost)) * 127));
  }

  public zmenNastroj(kanal: number, program: number): void {
    this.synth?.programChange(kanal, program);
  }

  /**
   * Zahraje notu v přesně daný okamžik zvukových hodin.
   *
   * Kdyby se noty spouštěly „teď hned" z časovače prohlížeče, kapela by
   * drhla — časovač se opozdí pokaždé, když se něco vykresluje.
   * Syntetizátor umí přijmout čas dopředu a zahrát přesně.
   */
  public notaOd(kanal: number, nota: number, sila: number, kdy: number): void {
    this.synth?.noteOn(kanal, nota, Math.round(Math.max(1, Math.min(127, sila))), { time: kdy });
  }

  public notaDo(kanal: number, nota: number, kdy: number): void {
    this.synth?.noteOff(kanal, nota, { time: kdy });
  }

  /** Čas zvukových hodin — podle něj se plánuje dopředu. */
  public get cas(): number {
    return this.ctx?.currentTime ?? 0;
  }

  public get pripraveny(): boolean {
    return this.stav.pripraven;
  }
}

export const spessaEngine = new SpessaEngine();
