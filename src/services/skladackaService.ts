import { audioBus } from './audioBus';
import { contentRequest } from './assetLibraryService';

/**
 * Skládání samplů.
 *
 * Několik stop hraje naráz a dokola, jako v beatboxu: bicí smyčka, pod ní
 * basa, nad tím kytara. Jedna smyčka sama o sobě je jen podklad; teprve
 * když se dají dohromady, vznikne z toho něco, na co jde hrát.
 *
 * Skladba se dělí na části (intro, sloka, refrén…) a v každé může mít
 * stopa jiný sampl — nebo žádný. Přehrává se buď jedna část dokola, nebo
 * celá stavba za sebou.
 */

export interface Sampl {
  id: string;
  nazev: string;
  bpm: number;
  tonina: string;
  takt: string;
}

export interface Stopa {
  id: string;
  nazev: string;
  /** Sampl v každé části; klíčem je id části. */
  vCastech: Record<string, Sampl | null>;
  hlasitost: number;
  ztlumena: boolean;
}

export interface Cast {
  id: string;
  nazev: string;
  /** Kolikrát se část zopakuje, než se jde dál. */
  opakovani: number;
}

export interface StavSkladacky {
  stopy: Stopa[];
  casti: Cast[];
  hraje: boolean;
  /** Která část zrovna zní. */
  aktivniCast: string | null;
  /** Přehrávat jen jednu část dokola, nebo celou stavbu. */
  rezim: 'cast' | 'stavba';
  bpm: number;
  nacita: boolean;
  chyba: string | null;
}

const VYCHOZI_CASTI: Cast[] = [
  { id: 'intro', nazev: 'Intro', opakovani: 1 },
  { id: 'verse', nazev: 'Sloka', opakovani: 2 },
  { id: 'chorus', nazev: 'Refrén', opakovani: 2 },
  { id: 'solo', nazev: 'Sólo', opakovani: 1 },
  { id: 'outro', nazev: 'Outro', opakovani: 1 },
];

type Posluchac = (s: StavSkladacky) => void;

class SkladackaService {
  private ctx: AudioContext | null = null;
  private stav: StavSkladacky = {
    stopy: [],
    casti: [...VYCHOZI_CASTI],
    hraje: false,
    aktivniCast: 'verse',
    rezim: 'cast',
    bpm: 120,
    nacita: false,
    chyba: null,
  };
  private posluchaci = new Set<Posluchac>();
  /** Načtené zvuky podle id samplu. Stejný sampl ve dvou částech se
   *  nestahuje dvakrát. */
  private zvuky = new Map<string, AudioBuffer>();
  private zdroje: AudioBufferSourceNode[] = [];
  private zesileni = new Map<string, GainNode>();
  private odregistruj: (() => void) | null = null;
  private planovac: number | null = null;

  private zvuk(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.odregistruj = audioBus.register('skladacka', () => this.stop());
    }
    return this.ctx;
  }

  private oznam(): void {
    for (const f of this.posluchaci) f(this.stav);
  }

  public subscribe(f: Posluchac): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => this.posluchaci.delete(f);
  }

  public getState(): StavSkladacky {
    return this.stav;
  }

  public pridejStopu(nazev: string): void {
    const stopa: Stopa = {
      id: `stopa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nazev,
      vCastech: {},
      hlasitost: 0.8,
      ztlumena: false,
    };
    this.stav = { ...this.stav, stopy: [...this.stav.stopy, stopa] };
    this.oznam();
  }

  public smazStopu(id: string): void {
    this.stav = { ...this.stav, stopy: this.stav.stopy.filter((s) => s.id !== id) };
    this.oznam();
  }

  public nastavStopu(id: string, zmena: Partial<Stopa>): void {
    this.stav = {
      ...this.stav,
      stopy: this.stav.stopy.map((s) => (s.id === id ? { ...s, ...zmena } : s)),
    };
    const g = this.zesileni.get(id);
    if (g && this.ctx) {
      const s = this.stav.stopy.find((x) => x.id === id);
      g.gain.setValueAtTime(s?.ztlumena ? 0 : (s?.hlasitost ?? 0.8), this.ctx.currentTime);
    }
    this.oznam();
  }

  /** Vloží sampl do políčka stopa × část. `null` políčko vyprázdní. */
  public vloz(stopaId: string, castId: string, sampl: Sampl | null): void {
    this.stav = {
      ...this.stav,
      stopy: this.stav.stopy.map((s) =>
        s.id === stopaId ? { ...s, vCastech: { ...s.vCastech, [castId]: sampl } } : s
      ),
      // Tempo se převezme z prvního vloženého samplu, který ho zná —
      // ručně ho pak jde přepsat. Bez toho by se všechno srovnávalo
      // na 120 a znělo špatně.
      bpm: sampl?.bpm && this.stav.stopy.every((s) => Object.values(s.vCastech).every((x) => !x))
        ? sampl.bpm
        : this.stav.bpm,
    };
    this.oznam();
  }

  public nastavCast(id: string, zmena: Partial<Cast>): void {
    this.stav = {
      ...this.stav,
      casti: this.stav.casti.map((c) => (c.id === id ? { ...c, ...zmena } : c)),
    };
    this.oznam();
  }

  public vyberCast(id: string): void {
    this.stav = { ...this.stav, aktivniCast: id };
    this.oznam();
    if (this.stav.hraje && this.stav.rezim === 'cast') void this.prehraj();
  }

  public nastavRezim(r: 'cast' | 'stavba'): void {
    this.stav = { ...this.stav, rezim: r };
    this.oznam();
  }

  public nastavBpm(bpm: number): void {
    this.stav = { ...this.stav, bpm: Math.max(40, Math.min(260, bpm)) };
    this.oznam();
    if (this.stav.hraje) void this.prehraj();
  }

  /** Stáhne zvuk samplu. Přes vlastní server, ne přes podepsanou adresu —
   *  tu by prohlížeč kvůli CORS odmítl. */
  private async nactiZvuk(sampl: Sampl): Promise<AudioBuffer | null> {
    const hotovy = this.zvuky.get(sampl.id);
    if (hotovy) return hotovy;
    try {
      const { adresa, hlavicky } = contentRequest(sampl.id);
      const r = await fetch(adresa, { headers: hlavicky });
      if (!r.ok) throw new Error(`Server vrátil ${r.status}`);
      const buf = await this.zvuk().decodeAudioData(await r.arrayBuffer());
      this.zvuky.set(sampl.id, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /**
   * Spustí, co je naskládané.
   *
   * Všechny stopy jedné části startují na tutéž značku v čase — kdyby se
   * pouštěly „hned, jak se načtou", rozešly by se o desítky milisekund a
   * znělo by to jako nedbale zahraný nástup.
   */
  public async prehraj(): Promise<void> {
    this.zastavZdroje();
    const ctx = this.zvuk();
    if (ctx.state === 'suspended') await ctx.resume();

    const casti =
      this.stav.rezim === 'cast'
        ? this.stav.casti.filter((c) => c.id === this.stav.aktivniCast)
        : this.stav.casti;

    // Načte se všechno napřed, ať se stopy nerozejdou.
    this.stav = { ...this.stav, nacita: true, chyba: null };
    this.oznam();

    const potreba = new Set<string>();
    const podleId = new Map<string, Sampl>();
    for (const c of casti) {
      for (const s of this.stav.stopy) {
        const x = s.vCastech[c.id];
        if (x) {
          potreba.add(x.id);
          podleId.set(x.id, x);
        }
      }
    }
    await Promise.all([...potreba].map((id) => this.nactiZvuk(podleId.get(id)!)));

    this.stav = { ...this.stav, nacita: false };
    if (potreba.size === 0) {
      this.stav = { ...this.stav, chyba: 'Není co hrát — vlož do políček nějaké samply.' };
      this.oznam();
      return;
    }

    audioBus.claim('skladacka', this.stav.rezim === 'cast' ? 'Skládačka — část' : 'Skládačka', 'Samples');

    let kdy = ctx.currentTime + 0.15;
    const zacatek = kdy;
    const naplanovane: { cas: number; castId: string }[] = [];

    for (const c of casti) {
      for (let i = 0; i < Math.max(1, c.opakovani); i++) {
        let nejdelsi = 0;
        naplanovane.push({ cas: kdy, castId: c.id });

        for (const stopa of this.stav.stopy) {
          const sampl = stopa.vCastech[c.id];
          const buf = sampl ? this.zvuky.get(sampl.id) : null;
          if (!buf) continue;

          const zdroj = ctx.createBufferSource();
          zdroj.buffer = buf;
          // Sampl s vlastním tempem se srovná na tempo skládačky; bez
          // tempa se nechá být, protože natahovat něco naslepo zní hůř
          // než to nechat, jak je.
          zdroj.playbackRate.value = sampl?.bpm ? this.stav.bpm / sampl.bpm : 1;

          let g = this.zesileni.get(stopa.id);
          if (!g) {
            g = ctx.createGain();
            g.connect(ctx.destination);
            this.zesileni.set(stopa.id, g);
          }
          g.gain.setValueAtTime(stopa.ztlumena ? 0 : stopa.hlasitost, ctx.currentTime);

          zdroj.connect(g);
          zdroj.start(kdy);
          this.zdroje.push(zdroj);
          nejdelsi = Math.max(nejdelsi, buf.duration / zdroj.playbackRate.value);
        }

        // Prázdná část by jinak trvala nula a celá stavba by proběhla naráz.
        kdy += nejdelsi || 2;
      }
    }

    // Jedna část dokola: naplánuje se znovu, až tahle doběhne.
    const konec = kdy;
    if (this.stav.rezim === 'cast') {
      this.planovac = window.setTimeout(
        () => void this.prehraj(),
        Math.max(200, (konec - ctx.currentTime) * 1000 - 80)
      );
    } else {
      this.planovac = window.setTimeout(() => this.stop(), (konec - ctx.currentTime) * 1000 + 100);
    }

    // Ukazatel právě hrající části.
    for (const n of naplanovane) {
      const za = (n.cas - ctx.currentTime) * 1000;
      window.setTimeout(() => {
        if (this.stav.hraje) {
          this.stav = { ...this.stav, aktivniCast: n.castId };
          this.oznam();
        }
      }, Math.max(0, za));
    }

    this.stav = { ...this.stav, hraje: true };
    this.oznam();
    void zacatek;
  }

  private zastavZdroje(): void {
    if (this.planovac !== null) {
      clearTimeout(this.planovac);
      this.planovac = null;
    }
    for (const z of this.zdroje) {
      try {
        z.stop();
      } catch {
        /* zdroj už mohl doběhnout sám */
      }
    }
    this.zdroje = [];
  }

  public stop(): void {
    this.zastavZdroje();
    if (this.stav.hraje) {
      this.stav = { ...this.stav, hraje: false };
      audioBus.release('skladacka');
      this.oznam();
    }
  }

  public zrus(): void {
    this.stop();
    this.odregistruj?.();
    this.odregistruj = null;
  }
}

export const skladackaService = new SkladackaService();
