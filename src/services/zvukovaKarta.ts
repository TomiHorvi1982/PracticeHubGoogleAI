/**
 * Volba zvukové karty.
 *
 * Vestavěný mikrofon v notebooku slyší kytaru přes vzduch a přidává
 * k tomu ozvěnu místnosti; externí karta ji má rovnou z kabelu. Rozdíl
 * je v přesnosti rozpoznání i ve zpoždění, takže výběr patří do
 * nastavení, ne do kódu.
 *
 * Názvy zařízení prohlížeč vydá až po povolení mikrofonu — do té doby
 * vrací prázdné popisky. Proto se nabízí i tlačítko, které o povolení
 * požádá, jinak by seznam vypadal jako „Zařízení 1, Zařízení 2".
 */

const KLIC_VSTUP = 'neverlate_zvuk_vstup';
const KLIC_VYSTUP = 'neverlate_zvuk_vystup';
const KLIC_PAR = 'neverlate_zvuk_par';

export interface Zarizeni {
  id: string;
  nazev: string;
}

export interface StavKarty {
  vstupy: Zarizeni[];
  vystupy: Zarizeni[];
  vstup: string | null;
  vystup: string | null;
  /** `false`, dokud prohlížeč nevydá názvy — tedy než se povolí mikrofon. */
  nazvyZname: boolean;
  /**
   * Který pár vstupních kanálů poslouchat, číslováno od nuly.
   *
   * Zvukovky s loopbackem mají víc kanálů než fyzických vstupů — na těch
   * dalších vracejí zvuk počítače. Právě tudy se poslouchá aparát běžící
   * ve vlastní aplikaci.
   */
  par: number;
  /** Kolik kanálů vstup opravdu dal. Zjistí se až po otevření proudu. */
  kanalu: number;
  chyba: string | null;
}

type Poslucha = (s: StavKarty) => void;

class ZvukovaKarta {
  private stav: StavKarty = {
    vstupy: [],
    vystupy: [],
    vstup: localStorage.getItem(KLIC_VSTUP),
    vystup: localStorage.getItem(KLIC_VYSTUP),
    par: Number(localStorage.getItem(KLIC_PAR)) || 0,
    kanalu: 0,
    nazvyZname: false,
    chyba: null,
  };
  private posluchaci = new Set<Poslucha>();

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  private oznam(z: Partial<StavKarty>) {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  public getStav(): StavKarty {
    return this.stav;
  }

  public async nactiZarizeni(): Promise<void> {
    try {
      const vse = await navigator.mediaDevices.enumerateDevices();
      const vstupy = vse
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ id: d.deviceId, nazev: d.label || `Vstup ${i + 1}` }));
      const vystupy = vse
        .filter((d) => d.kind === 'audiooutput')
        .map((d, i) => ({ id: d.deviceId, nazev: d.label || `Výstup ${i + 1}` }));
      this.oznam({
        vstupy,
        vystupy,
        nazvyZname: vstupy.some((v) => v.nazev && !v.nazev.startsWith('Vstup ')),
        chyba: null,
      });
    } catch (e: any) {
      this.oznam({ chyba: e?.message || 'Zařízení se nepodařilo načíst.' });
    }
  }

  /** Požádá o mikrofon jen proto, aby prohlížeč vydal názvy zařízení. */
  public async povolitANacist(): Promise<void> {
    try {
      const proud = await navigator.mediaDevices.getUserMedia({ audio: true });
      proud.getTracks().forEach((t) => t.stop());
    } catch (e: any) {
      this.oznam({ chyba: `Mikrofon nepovolen: ${e?.message || e}` });
      return;
    }
    await this.nactiZarizeni();
  }

  public nastavVstup(id: string | null): void {
    if (id) localStorage.setItem(KLIC_VSTUP, id);
    else localStorage.removeItem(KLIC_VSTUP);
    this.oznam({ vstup: id });
  }

  /** Který pár kanálů poslouchat. Projeví se po novém spuštění vstupu. */
  public nastavPar(index: number): void {
    const i = Math.max(0, Math.floor(index) || 0);
    localStorage.setItem(KLIC_PAR, String(i));
    this.oznam({ par: i });
  }

  /** Ohlásí, kolik kanálů otevřený proud doopravdy dal. */
  public zaznamenejKanaly(pocet: number): void {
    if (pocet !== this.stav.kanalu) this.oznam({ kanalu: pocet });
  }

  public nastavVystup(id: string | null): void {
    if (id) localStorage.setItem(KLIC_VYSTUP, id);
    else localStorage.removeItem(KLIC_VYSTUP);
    this.oznam({ vystup: id });
  }

  /** Omezení pro `getUserMedia` — vybraná karta a nic, co by kazilo tón. */
  public omezeniVstupu(): MediaStreamConstraints {
    return {
      audio: {
        ...(this.stav.vstup ? { deviceId: { exact: this.stav.vstup } } : {}),
        // Úpravy pro řeč musí pryč: potlačení šumu a automatická hlasitost
        // by kytaře ubíraly právě to, podle čeho se výška pozná.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Bez tohohle dá prohlížeč jen první dva kanály, takže na
        // loopback zvukovky se vůbec nedostaneme. `ideal` proto, aby
        // běžný stereo vstup nepřestal fungovat.
        channelCount: { ideal: 8 },
      },
    };
  }

  /**
   * Pošle zvuk do vybraného výstupu.
   *
   * `setSinkId` na zvukovém kontextu umí zatím jen část prohlížečů;
   * kde chybí, hraje se do systémového výstupu a nic se nerozbije.
   */
  public async pouzijVystup(ctx: AudioContext): Promise<boolean> {
    const id = this.stav.vystup;
    const kontext = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!id || typeof kontext.setSinkId !== 'function') return false;
    try {
      await kontext.setSinkId(id);
      return true;
    } catch {
      return false;
    }
  }
}

export const zvukovaKarta = new ZvukovaKarta();
