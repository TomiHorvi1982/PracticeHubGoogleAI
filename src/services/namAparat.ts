import { NamEngine, NamNode, NamModelInfo } from 'neural-amp-modeler-wasm/engine';

/**
 * Aparát z modelu Neural Amp Modeler.
 *
 * Model (.nam) je nasnímaný skutečný zesilovač; hraje se přes něj
 * v AudioWorkletu, tedy na zvukovém vlákně, ne v hlavním. Odsud se jen
 * říká, co načíst a kam to zapojit.
 *
 * Uzel je mono dovnitř i ven a chová se jako každý jiný ve Web Audio,
 * takže patří do kanálu na místo pro efekt.
 */

export interface StavAparatu {
  nacita: boolean;
  /** Jméno souboru načteného modelu, nebo `null`. */
  model: string | null;
  info: NamModelInfo | null;
  chyba: string | null;
  /**
   * Model je trénovaný na jinou frekvenci, než na jaké běží zvuk.
   *
   * Nezní pak jako předloha — je posunutý. Nejde o chybu, na kterou se
   * dá spadnout, ale slyšet to je, tak se to hlásí.
   */
  neshodaFrekvence: number | null;
}

type Poslucha = (s: StavAparatu) => void;

class NamAparat {
  private engine: NamEngine | null = null;
  private uzel: NamNode | null = null;
  private ctx: AudioContext | null = null;
  private posluchaci = new Set<Poslucha>();
  private stav: StavAparatu = {
    nacita: false, model: null, info: null, chyba: null, neshodaFrekvence: null,
  };

  public getStav(): StavAparatu {
    return this.stav;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavAparatu>): void {
    this.stav = { ...this.stav, ...z };
    for (const f of this.posluchaci) f(this.stav);
  }

  /**
   * Postaví uzel nad daným kontextem.
   *
   * Motor se váže na kontext, takže při jeho výměně (zastavení a nové
   * spuštění kanálu) se staví znovu. Vrací uzel k zapojení do řetězu.
   */
  /**
   * Uzel aparátu k zapojení do řetězu, nebo `null`.
   *
   * Vystavuje se, protože kytarový kanál si řetěz staví sám a musí uzel
   * umět vložit i vyndat, aniž by ho zakládal znovu — přestavba uzlu
   * při každém obejití aparátu by lupla.
   */
  public dejUzel(): NamNode | null {
    return this.uzel;
  }

  public async pripoj(ctx: AudioContext): Promise<NamNode | null> {
    if (this.uzel && this.ctx === ctx) return this.uzel;
    await this.odpoj();
    this.oznam({ nacita: true, chyba: null });
    try {
      this.engine = await NamEngine.attach(ctx);
      this.uzel = await this.engine.createNode();
      this.ctx = ctx;
      this.oznam({ nacita: false });
      return this.uzel;
    } catch (e: any) {
      this.oznam({ nacita: false, chyba: e?.message || 'Aparát se nepodařilo spustit.' });
      return null;
    }
  }

  /** Načte model z obsahu .nam souboru. */
  public async nactiModel(json: string, jmeno: string): Promise<boolean> {
    if (!this.uzel) {
      this.oznam({ chyba: 'Aparát není zapojený — nejdřív spusť vstup.' });
      return false;
    }
    this.oznam({ nacita: true, chyba: null });
    try {
      const info = await this.uzel.loadModel(json);
      const vlastni = this.ctx?.sampleRate ?? 0;
      const ocekavana = info.expectedSampleRate;
      this.oznam({
        nacita: false,
        model: jmeno,
        info,
        // −1 znamená, že model svou frekvenci nehlásí; to není neshoda.
        neshodaFrekvence:
          ocekavana > 0 && vlastni > 0 && Math.abs(ocekavana - vlastni) > 1 ? ocekavana : null,
      });
      return true;
    } catch (e: any) {
      this.oznam({ nacita: false, chyba: e?.message || 'Model se nepodařilo načíst.' });
      return false;
    }
  }

  /** Vyndá model; uzel pak pouští signál beze změny. */
  public async vyndejModel(): Promise<void> {
    if (!this.uzel) return;
    try {
      await this.uzel.unloadModel();
      this.oznam({ model: null, info: null, neshodaFrekvence: null });
    } catch { /* nevadí, uzel zůstává průchozí */ }
  }

  public async odpoj(): Promise<void> {
    try { await this.uzel?.dispose(); } catch { /* už zrušený */ }
    this.uzel = null;
    this.engine = null;
    this.ctx = null;
    this.oznam({ model: null, info: null, neshodaFrekvence: null });
  }
}

export const namAparat = new NamAparat();
