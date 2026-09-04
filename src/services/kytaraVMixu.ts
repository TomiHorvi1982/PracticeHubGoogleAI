import * as Tone from 'tone';
import { namAparat } from './namAparat';
import { zvukovaKarta } from './zvukovaKarta';

/**
 * Živá kytara jako kanál stávajícího mixu.
 *
 * Řetěz: vstup → zesílení → NAM aparát → bedna (IR) → EQ → pult.
 *
 * Zásadní je, na jakém kontextu to běží. Aplikace už jeden audio engine
 * má — mix stojí na Tone.js — a druhý by znamenal dva nezávislé hodinové
 * zdroje, dvě latence a nemožnost poslat kytaru do téhož součtu jako
 * stopy. Proto se všechno staví na `Tone.getContext().rawContext`, tedy
 * na kontextu, který už mix používá.
 *
 * Dřívější `kytaraKanal` si zakládal vlastní `AudioContext` a hrál
 * rovnou do reproduktorů, mimo pult. Tenhle modul je náhrada, která
 * končí ve stejném součtu jako ostatní kanály.
 *
 * Zpracování NAM běží v AudioWorkletu (viz `namAparat`), tedy na
 * zvukovém vlákně — hlavní vlákno prohlížeče se tím nezdržuje.
 */

/** Pod jakým jménem kanál vystupuje v pultu. */
export const KANAL_KYTARY = 'kytara_live';

export interface StavKytary {
  bezi: boolean;
  chyba: string | null;
  /** Zesílení vstupu v dB, před aparátem. */
  vstupDb: number;
  /** Zesílení za řetězem, před faderem. */
  vystupDb: number;
  /** Jméno načteného modelu, nebo `null`. */
  model: string | null;
  /** Jméno načtené bedny (IR), nebo `null`. */
  bedna: string | null;
  /** Jednotlivé bloky řetězu se dají obejít. */
  bypassAparatu: boolean;
  bypassBedny: boolean;
  bypassEq: boolean;
  /** Špička vstupu 0–1, na měřák před aparátem. */
  urovenVstupu: number;
}

const VYCHOZI: StavKytary = {
  bezi: false, chyba: null, vstupDb: 0, vystupDb: 0,
  model: null, bedna: null,
  bypassAparatu: false, bypassBedny: false, bypassEq: true,
  urovenVstupu: 0,
};

type Poslucha = (s: StavKytary) => void;

const dbNaPomer = (db: number) => 10 ** (db / 20);

class KytaraVMixu {
  private stav: StavKytary = { ...VYCHOZI };
  private posluchaci = new Set<Poslucha>();

  private proud: MediaStream | null = null;
  private zdroj: MediaStreamAudioSourceNode | null = null;
  private vstupGain: GainNode | null = null;
  private analyzer: AnalyserNode | null = null;
  /** Vstup a výstup místa pro aparát; mezi nimi visí uzel NAM. */
  private aparatOd: GainNode | null = null;
  private aparatDo: GainNode | null = null;
  private bedna: ConvolverNode | null = null;
  private bednaOd: GainNode | null = null;
  private bednaDo: GainNode | null = null;
  private eq: BiquadFilterNode[] = [];
  private vystupGain: GainNode | null = null;
  private mericTimer: number | null = null;

  public getStav(): StavKytary { return this.stav; }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => { this.posluchaci.delete(f); };
  }

  private oznam(z: Partial<StavKytary>): void {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  /** Kontext mixu. Nikdy se nezakládá nový. */
  private kontext(): AudioContext {
    return Tone.getContext().rawContext as unknown as AudioContext;
  }

  /**
   * Spustí kytaru a zapojí ji do pultu.
   *
   * `cil` je uzel, do kterého kanál ústí — pult mu posílá svůj panner,
   * takže kytara projde týmž faderem, ztlumením a sólem jako stopy.
   */
  public async spust(cil: AudioNode): Promise<boolean> {
    if (this.stav.bezi) return true;
    // Bez tohohle je kontext v prohlížeči zastavený, dokud uživatel
    // někam neklikne — a kytara by tiše nehrála.
    await Tone.start();
    const ctx = this.kontext();

    try {
      this.proud = await navigator.mediaDevices.getUserMedia(zvukovaKarta.omezeniVstupu());
    } catch (e: any) {
      this.oznam({
        chyba: e?.name === 'NotAllowedError'
          ? 'Přístup k mikrofonu jsi nepovolil.'
          : (e?.message || 'Vstup se nepodařilo otevřít.'),
      });
      return false;
    }

    this.zdroj = ctx.createMediaStreamSource(this.proud);

    this.vstupGain = ctx.createGain();
    this.vstupGain.gain.value = dbNaPomer(this.stav.vstupDb);

    // Měřák sedí hned za vstupním zesílením, aby bylo poznat, jestli
    // do aparátu vůbec něco jde — ne až co z něj leze.
    this.analyzer = ctx.createAnalyser();
    this.analyzer.fftSize = 1024;

    this.aparatOd = ctx.createGain();
    this.aparatDo = ctx.createGain();
    this.bednaOd = ctx.createGain();
    this.bednaDo = ctx.createGain();

    // Tři pásma stačí: co kytaře chybí nebo přebývá, se řeší dole,
    // uprostřed a nahoře. Ve výchozím stavu jsou ploché.
    this.eq = (['lowshelf', 'peaking', 'highshelf'] as BiquadFilterType[]).map((typ, i) => {
      const f = ctx.createBiquadFilter();
      f.type = typ;
      f.frequency.value = [120, 800, 4000][i];
      f.gain.value = 0;
      if (typ === 'peaking') f.Q.value = 0.9;
      return f;
    });

    this.vystupGain = ctx.createGain();
    this.vystupGain.gain.value = dbNaPomer(this.stav.vystupDb);

    // Propojení. Místa pro aparát a bednu jsou zatím přemostěná —
    // uzly se do nich vloží, až když se model načte.
    this.zdroj.connect(this.vstupGain);
    this.vstupGain.connect(this.analyzer);
    this.vstupGain.connect(this.aparatOd);
    this.aparatOd.connect(this.aparatDo);
    this.aparatDo.connect(this.bednaOd);
    this.bednaOd.connect(this.bednaDo);
    this.bednaDo.connect(this.eq[0]);
    this.eq[0].connect(this.eq[1]);
    this.eq[1].connect(this.eq[2]);
    this.eq[2].connect(this.vystupGain);
    this.vystupGain.connect(cil);

    // Aparát se připojuje na týž kontext jako pult.
    await namAparat.pripoj(ctx);

    this.spustMeric();
    this.oznam({ bezi: true, chyba: null });
    return true;
  }

  public stop(): void {
    if (this.mericTimer) { clearInterval(this.mericTimer); this.mericTimer = null; }
    this.proud?.getTracks().forEach((t) => t.stop());
    [this.zdroj, this.vstupGain, this.analyzer, this.aparatOd, this.aparatDo,
      this.bednaOd, this.bednaDo, this.vystupGain, ...this.eq].forEach((u) => {
      try { u?.disconnect(); } catch { /* uzel už mohl zmizet */ }
    });
    namAparat.odpoj();
    this.proud = null;
    this.zdroj = null;
    this.vstupGain = null;
    this.analyzer = null;
    this.aparatOd = null;
    this.aparatDo = null;
    this.bedna = null;
    this.bednaOd = null;
    this.bednaDo = null;
    this.eq = [];
    this.vystupGain = null;
    this.oznam({ ...VYCHOZI });
  }

  private spustMeric(): void {
    const data = new Float32Array(this.analyzer?.fftSize || 1024);
    this.mericTimer = window.setInterval(() => {
      if (!this.analyzer) return;
      this.analyzer.getFloatTimeDomainData(data);
      let max = 0;
      for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
      if (Math.abs(max - this.stav.urovenVstupu) > 0.01) this.oznam({ urovenVstupu: max });
    }, 100);
  }

  public nastavVstupDb(db: number): void {
    this.oznam({ vstupDb: db });
    if (this.vstupGain) this.vstupGain.gain.value = dbNaPomer(db);
  }

  public nastavVystupDb(db: number): void {
    this.oznam({ vystupDb: db });
    if (this.vystupGain) this.vystupGain.gain.value = dbNaPomer(db);
  }

  /**
   * Vloží uzel aparátu do jeho místa v řetězu.
   *
   * Přemostění se nejdřív rozpojí, jinak by signál šel oběma cestami
   * naráz a čistá kytara by se mísila se zkreslenou.
   */
  private prepojAparat(): void {
    if (!this.aparatOd || !this.aparatDo) return;
    try { this.aparatOd.disconnect(); } catch { /* nic */ }
    const uzel = this.stav.bypassAparatu ? null : namAparat.dejUzel();
    if (uzel) {
      this.aparatOd.connect(uzel as unknown as AudioNode);
      (uzel as unknown as AudioNode).connect(this.aparatDo);
    } else {
      this.aparatOd.connect(this.aparatDo);
    }
  }

  public async nactiModel(json: string, jmeno: string): Promise<boolean> {
    const ok = await namAparat.nactiModel(json, jmeno);
    if (ok) {
      this.oznam({ model: jmeno });
      this.prepojAparat();
    }
    return ok;
  }

  public vyndejModel(): void {
    namAparat.vyndejModel();
    this.oznam({ model: null });
    this.prepojAparat();
  }

  public setBypassAparatu(b: boolean): void {
    this.oznam({ bypassAparatu: b });
    this.prepojAparat();
  }

  /**
   * Bedna zvlášť od aparátu.
   *
   * Model aparátu neznamená, že je v něm i reprobedna — mnoho snímků
   * je jen předzesilovač a bez impulzu zní tence. Proto se nabízí
   * samostatně a dá se obejít.
   */
  public async nactiBednu(data: ArrayBuffer, jmeno: string): Promise<boolean> {
    const ctx = this.kontext();
    try {
      const buf = await ctx.decodeAudioData(data.slice(0));
      this.bedna = ctx.createConvolver();
      this.bedna.normalize = true;
      this.bedna.buffer = buf;
      this.oznam({ bedna: jmeno });
      this.prepojBednu();
      return true;
    } catch {
      this.oznam({ chyba: 'Impuls se nepodařilo načíst — není to platný zvukový soubor.' });
      return false;
    }
  }

  public vyndejBednu(): void {
    this.bedna = null;
    this.oznam({ bedna: null });
    this.prepojBednu();
  }

  public setBypassBedny(b: boolean): void {
    this.oznam({ bypassBedny: b });
    this.prepojBednu();
  }

  private prepojBednu(): void {
    if (!this.bednaOd || !this.bednaDo) return;
    try { this.bednaOd.disconnect(); } catch { /* nic */ }
    if (this.bedna && !this.stav.bypassBedny) {
      this.bednaOd.connect(this.bedna);
      this.bedna.connect(this.bednaDo);
    } else {
      this.bednaOd.connect(this.bednaDo);
    }
  }

  public nastavEq(pasmo: 0 | 1 | 2, db: number): void {
    if (this.eq[pasmo]) this.eq[pasmo].gain.value = this.stav.bypassEq ? 0 : db;
  }

  public setBypassEq(b: boolean): void {
    this.oznam({ bypassEq: b });
    this.eq.forEach((f) => { if (b) f.gain.value = 0; });
  }
}

export const kytaraVMixu = new KytaraVMixu();
