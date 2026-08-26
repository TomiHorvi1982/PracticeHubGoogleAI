import { Midi } from '@tonejs/midi';
import { sampledDrumEngine, DrumArticulation } from './SampledDrumEngine';
import { audioBus } from './audioBus';
import { authService } from './authService';

/**
 * Přehrávač bicích grooves z knihovny.
 *
 * Groove je krátká MIDI smyčka — pár taktů, desítky úderů. Přehrát ji
 * znamená posílat čísla not do sady vzorků a po dojetí začít znovu.
 *
 * Časování je tady to podstatné. Kdyby se každý úder spouštěl až ve chvíli,
 * kdy doběhne `setTimeout`, groove by se rozjížděl — časovač prohlížeče se
 * zpožďuje o desítky milisekund a nezvedne se, když je karta na pozadí.
 * Údery se proto plánují dopředu na audio hodiny: krátký budík se dívá o
 * kousek do budoucnosti a všechno, co v tom okně padne, předá enginu i s
 * přesným časem. O samotné spuštění se pak stará zvuková karta.
 */

export interface Groove {
  id: string;
  name: string;
  pack: string;
  packLabel: string;
  group: string;
  style: string;
  role: 'groove' | 'fill' | 'intro' | 'end';
  bars: number | null;
  bpm: number | null;
}

export interface GroovePackFacet {
  id: string;
  label: string;
  count: number;
  styles: { style: string; count: number }[];
}

/** Jeden úder: kdy od začátku smyčky, jak silně a na který díl sady. */
interface Uder {
  cas: number;
  velocity: number;
  artikulace: DrumArticulation;
}

export interface LoopState {
  groove: Groove | null;
  hraje: boolean;
  nacita: boolean;
  /** Tempo, ve kterém se právě hraje. */
  bpm: number;
  /** Tempo zapsané v souboru — podle něj se počítá roztažení smyčky. */
  puvodniBpm: number;
  loop: boolean;
  /** Kolikátý takt smyčky zrovna běží, pro ukazatel. */
  pozice: number;
  delkaTaktu: number;
  /** Díly sady, které jsou vypnuté — „tohle hrát nechci“. */
  vypnute: Set<DrumArticulation>;
  /** Co všechno groove obsahuje, aby šlo nabídnout jen to. */
  obsazene: DrumArticulation[];
  chyba: string | null;
  /**
   * Kolik úderů poslední smyčka poslala enginu a kolik z nich opravdu
   * znělo. Když sada nemá pro danou artikulaci vzorek, engine tiše nic
   * nezahraje — bez tohohle čísla vypadá prázdná sada úplně stejně jako
   * rozbitý přehrávač.
   */
  poslano: number;
  zaznelo: number;
}

type Listener = (s: LoopState) => void;

/** Jak daleko dopředu se plánuje a jak často se budík dívá. */
const VYHLED_S = 0.15;
const BUDIK_MS = 40;

class DrumGrooveService {
  private stav: LoopState = {
    groove: null,
    hraje: false,
    nacita: false,
    bpm: 120,
    puvodniBpm: 120,
    loop: true,
    pozice: 0,
    delkaTaktu: 0,
    vypnute: new Set(),
    obsazene: [],
    chyba: null,
    poslano: 0,
    zaznelo: 0,
  };

  private listeners = new Set<Listener>();
  private udery: Uder[] = [];
  /** Délka smyčky v sekundách při původním tempu. */
  private delkaS = 0;
  private budik: ReturnType<typeof setInterval> | null = null;
  private poslanoVeSmycce = 0;
  private zaznelVeSmycce = 0;
  private zacatekSmycky = 0;
  private dalsiUder = 0;
  private odregistruj: (() => void) | null = null;

  constructor() {
    this.odregistruj = audioBus.register('drum-looper', () => this.stop());
  }

  public subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.stav);
    return () => this.listeners.delete(cb);
  }

  private oznam() {
    const kopie = { ...this.stav, vypnute: new Set(this.stav.vypnute) };
    this.listeners.forEach((cb) => {
      try {
        cb(kopie);
      } catch {
        /* posluchač si chybu řeší sám, nesmí shodit ostatní */
      }
    });
  }

  public getState(): LoopState {
    return this.stav;
  }

  private async autorizovanyFetch(cesta: string): Promise<Response> {
    const token = authService.getCurrentSession()?.token;
    return fetch(cesta, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  /** Členění sbírky — balíky a styly s počty. */
  public async facets(): Promise<{ total: number; packs: GroovePackFacet[] }> {
    const res = await this.autorizovanyFetch('/api/drum-grooves/facets');
    if (!res.ok) throw new Error('Nepodařilo se načíst členění sbírky.');
    return res.json();
  }

  public async browse(params: {
    pack?: string;
    style?: string;
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ grooves: Groove[]; total: number }> {
    const q = new URLSearchParams();
    if (params.pack) q.set('pack', params.pack);
    if (params.style) q.set('style', params.style);
    if (params.role) q.set('role', params.role);
    if (params.search) q.set('search', params.search);
    q.set('limit', String(params.limit ?? 100));
    q.set('offset', String(params.offset ?? 0));

    const res = await this.autorizovanyFetch(`/api/drum-grooves?${q.toString()}`);
    if (!res.ok) throw new Error('Nepodařilo se načíst grooves.');
    return res.json();
  }

  /**
   * Načte groove a rovnou ho rozehraje. Výběr ze seznamu má znít hned —
   * krok „a teď ještě zmáčkni play“ mezi tím nikdo nechce.
   */
  public async load(groove: Groove, rovnouHrat = true): Promise<void> {
    this.stop();
    this.stav = { ...this.stav, groove, nacita: true, chyba: null };
    this.oznam();

    try {
      // Bajty podává náš server, ne podepsaný odkaz do R2. Ten míří na cizí
      // doménu, kterou prohlížeč pro `fetch` blokuje, dokud se původ ručně
      // nepovolí v nastavení bucketu — a právě proto smyčky nehrály: groove
      // se nikdy nestáhl.
      const res = await this.autorizovanyFetch(`/api/assets/${groove.id}/content`);
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? 'Nejste přihlášeni.'
            : `Groove se nepodařilo stáhnout (server vrátil ${res.status}).`
        );
      }
      const midi = new Midi(await res.arrayBuffer());

      const udery: Uder[] = [];
      const obsazene = new Set<DrumArticulation>();

      for (const track of midi.tracks) {
        for (const note of track.notes) {
          const art = sampledDrumEngine.midiNoteToArticulation(note.midi);
          // Noty, které sada nezná, se tiše přeskakují. Bicí balíky často
          // obsahují artikulace, které naše pady nemají (dvojité šlapky,
          // exotická perkuse) — spadnout kvůli nim by bylo horší.
          if (!art) continue;
          udery.push({
            cas: note.time,
            velocity: Math.max(1, Math.min(127, Math.round(note.velocity * 127))),
            artikulace: art,
          });
          obsazene.add(art);
        }
      }

      udery.sort((a, b) => a.cas - b.cas);
      this.udery = udery;

      // Tempo v souboru je základ. Když ho soubor neuvádí, bere se to,
      // co stálo v názvu složky balíku — jinak by se smyčka roztáhla podle
      // výchozích 120 BPM a hrála v úplně jiném tempu, než byla nahraná.
      const puvodniBpm = Math.round(midi.header.tempos[0]?.bpm || groove.bpm || 120);

      // Délka smyčky: přednost má počet taktů z názvu, protože poslední
      // úder často doznívá dřív, než takt doopravdy skončí. Bez toho by
      // smyčka naskakovala předčasně a groove by kulhal.
      const [citatel, jmenovatel] = [
        midi.header.timeSignatures[0]?.timeSignature?.[0] || 4,
        midi.header.timeSignatures[0]?.timeSignature?.[1] || 4,
      ];
      const dobaNaTakt = (60 / puvodniBpm) * citatel * (4 / jmenovatel);
      const poslední = udery.length ? udery[udery.length - 1].cas : 0;
      const delkaS = groove.bars
        ? groove.bars * dobaNaTakt
        : Math.max(dobaNaTakt, Math.ceil((poslední + 0.001) / dobaNaTakt) * dobaNaTakt);

      this.delkaS = delkaS;
      this.stav = {
        ...this.stav,
        nacita: false,
        puvodniBpm,
        bpm: puvodniBpm,
        delkaTaktu: dobaNaTakt,
        obsazene: [...obsazene],
        pozice: 0,
      };
      this.oznam();

      if (rovnouHrat) this.play();
    } catch (e: any) {
      this.stav = { ...this.stav, nacita: false, chyba: e.message || 'Groove se nepodařilo načíst.' };
      this.oznam();
    }
  }

  public play(): void {
    if (!this.udery.length || this.stav.hraje) return;
    audioBus.claim('drum-looper', (this.stav.groove as any)?.nazev || (this.stav.groove as any)?.name || 'Groove', 'Bicí looper');

    const ctx = sampledDrumEngine.ensureAudioGraph();
    // Prohlížeč nechá zvuk běžet až po skutečném kliknutí; bez tohohle by
    // se smyčka „přehrávala“ potichu do zavřené karty.
    if (ctx.state === 'suspended') void ctx.resume();

    this.zacatekSmycky = ctx.currentTime + 0.08;
    this.dalsiUder = 0;
    this.poslanoVeSmycce = 0;
    this.zaznelVeSmycce = 0;
    this.stav = { ...this.stav, hraje: true };
    this.oznam();

    this.budik = setInterval(() => this.naplanuj(), BUDIK_MS);
    this.naplanuj();
  }

  /**
   * Předá enginu všechny údery, které mají zaznít v nejbližším okně.
   * Běží často a krátce — plánovat celou smyčku naráz by znamenalo, že
   * změna tempa nebo vypnutí dílu se projeví až za několik taktů.
   */
  private naplanuj(): void {
    const ctx = sampledDrumEngine.ensureAudioGraph();
    const roztazeni = this.stav.puvodniBpm / Math.max(1, this.stav.bpm);
    const hranice = ctx.currentTime + VYHLED_S;

    while (this.dalsiUder < this.udery.length) {
      const u = this.udery[this.dalsiUder];
      const kdy = this.zacatekSmycky + u.cas * roztazeni;
      if (kdy > hranice) break;

      if (!this.stav.vypnute.has(u.artikulace)) {
        const zdroj = sampledDrumEngine.triggerPad(
          u.artikulace,
          u.velocity,
          sampledDrumEngine.getActiveKitId(),
          kdy
        );
        // `null` znamená, že sada pro tenhle díl nemá načtený vzorek.
        this.poslanoVeSmycce++;
        if (zdroj) this.zaznelVeSmycce++;
      }
      this.dalsiUder++;
    }

    const konec = this.zacatekSmycky + this.delkaS * roztazeni;

    // Ukazatel pozice ve smyčce.
    const ubehlo = Math.max(0, ctx.currentTime - this.zacatekSmycky);
    const pozice = Math.min(1, ubehlo / Math.max(0.001, this.delkaS * roztazeni));
    if (Math.abs(pozice - this.stav.pozice) > 0.01) {
      this.stav = { ...this.stav, pozice };
      this.oznam();
    }

    // Nová smyčka se nasadí přesně na konec té předchozí, ne na „teď“ —
    // jinak by se s každým opakováním nasčítalo zpoždění budíku.
    if (this.dalsiUder >= this.udery.length && ctx.currentTime >= konec - VYHLED_S) {
      if (this.stav.loop) {
        this.stav = { ...this.stav, poslano: this.poslanoVeSmycce, zaznelo: this.zaznelVeSmycce };
        this.oznam();
        this.poslanoVeSmycce = 0;
        this.zaznelVeSmycce = 0;
        this.zacatekSmycky = konec;
        this.dalsiUder = 0;
      } else if (ctx.currentTime >= konec) {
        this.stop();
      }
    }
  }

  public stop(): void {
    if (this.budik) {
      clearInterval(this.budik);
      this.budik = null;
    }
    if (this.stav.hraje || this.stav.pozice !== 0) {
      this.stav = { ...this.stav, hraje: false, pozice: 0 };
      this.oznam();
    }
  }

  public toggle(): void {
    if (this.stav.hraje) this.stop();
    else this.play();
  }

  public setBpm(bpm: number): void {
    const novy = Math.max(40, Math.min(300, Math.round(bpm)));
    if (novy === this.stav.bpm) return;

    // Změna tempa za běhu: smyčka se přepočítá tak, aby zůstala na místě,
    // kde právě je. Bez toho by skočila na začátek při každém posunutí.
    if (this.stav.hraje) {
      const ctx = sampledDrumEngine.ensureAudioGraph();
      const stareRoztazeni = this.stav.puvodniBpm / Math.max(1, this.stav.bpm);
      const ubehlo = ctx.currentTime - this.zacatekSmycky;
      const podil = ubehlo / Math.max(0.001, this.delkaS * stareRoztazeni);
      const noveRoztazeni = this.stav.puvodniBpm / novy;
      this.zacatekSmycky = ctx.currentTime - podil * this.delkaS * noveRoztazeni;
    }

    this.stav = { ...this.stav, bpm: novy };
    this.oznam();
  }

  public setLoop(loop: boolean): void {
    this.stav = { ...this.stav, loop };
    this.oznam();
  }

  /** Vypne nebo zapne jeden díl sady — „hi-hat teď hrát nechci“. */
  public togglePart(art: DrumArticulation): void {
    const vypnute = new Set(this.stav.vypnute);
    if (vypnute.has(art)) vypnute.delete(art);
    else vypnute.add(art);
    this.stav = { ...this.stav, vypnute };
    this.oznam();
  }

  public dispose(): void {
    this.stop();
    this.odregistruj?.();
  }
}

export const drumGrooveService = new DrumGrooveService();
