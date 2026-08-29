import { Midi } from '@tonejs/midi';
import { InstrumentProfile } from './audioSynth';
import { contentRequest, assetLibraryService, LibraryAsset } from './assetLibraryService';
import { audioBus } from './audioBus';
import { spessaEngine } from './spessaEngine';

/**
 * Přehrávač MIDI souborů z knihovny kapely.
 *
 * Soubor se stáhne z úložiště, rozparsuje a přehraje přes stejný zvukový
 * engine jako virtuální nástroje — tedy přes nahrané vzorky (FluidR3),
 * ne přes syntetizovaný tón. MIDI totiž nenese zvuk, jen noty; jak to zní,
 * určuje banka, kterou se to přehraje.
 *
 * Zvuk obstarává `spessaEngine` — skutečný SoundFont syntetizátor běžící
 * v audio vlákně. Dřív si služba plánovala každou notu vlastním
 * `setTimeout`: u vícestopé skladby to znamenalo deset tisíc časovačů,
 * posuvník se kvůli tomu sekal a noty se krátily, protože jejich délku
 * držel jen odhad, ne zpráva „note off" ze souboru.
 *
 * Rozbor na stopy tady zůstává — slouží editoru not, který engine nezná.
 */

export interface MidiNote {
  /** Číslo tónu 0–127. */
  midi: number;
  /** Začátek od začátku skladby, v sekundách. */
  time: number;
  duration: number;
  velocity: number;
}

export interface MidiTrack {
  index: number;
  name: string;
  /** Nástroj podle General MIDI, jak ho určuje soubor. */
  programName: string;
  isDrum: boolean;
  notes: MidiNote[];
  /** Kterým zvukem se stopa hraje — dá se změnit. */
  profile: InstrumentProfile;
  muted: boolean;
  solo: boolean;
  /** Hlasitost stopy, 0 až 1. Násobí se hlasitostí noty. */
  hlasitost: number;
}

export interface MidiSongState {
  asset: LibraryAsset | null;
  tracks: MidiTrack[];
  duration: number;
  isPlaying: boolean;
  position: number;
  tempoFactor: number;
  loading: boolean;
  error: string | null;
}

type Listener = (state: MidiSongState) => void;

/** Hrubé přiřazení GM nástroje na zvuk, který engine umí. */
function profileForProgram(program: number, isDrum: boolean): InstrumentProfile {
  if (isDrum) return 'rock_kit';
  if (program <= 7) return 'grand_piano_steinway';
  if (program <= 23) return 'hohner_clavinet_d6';
  if (program <= 31) return 'acoustic_dreadnought';
  if (program <= 39) return 'electric_bass_precision';
  if (program <= 55) return 'string_ensemble';
  if (program <= 79) return 'brass_section';
  return 'grand_piano_steinway';
}

class MidiPlayerService {
  private state: MidiSongState = {
    asset: null,
    tracks: [],
    duration: 0,
    isPlaying: false,
    position: 0,
    tempoFactor: 1,
    loading: false,
    error: null,
  };

  private listeners = new Set<Listener>();
  private timery: number[] = [];
  private tikId: number | null = null;
  private odregistrovat: (() => void) | null = null;

  public subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.state);
    if (!this.odregistrovat) {
      // Spuštění jiného zvuku v appce tenhle přehrávač zastaví.
      this.odregistrovat = audioBus.register('midi-player', () => this.pause());
    }
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const cb of this.listeners) {
      try {
        cb({ ...this.state, tracks: this.state.tracks.map((t) => ({ ...t })) });
      } catch (e) {
        console.error('[midiPlayer] chyba odběratele', e);
      }
    }
  }

  public getState(): MidiSongState {
    return this.state;
  }

  /** Načte MIDI soubor z knihovny a připraví ho k přehrání. */
  /**
   * Načte MIDI z hotové adresy.
   *
   * Přílohy písní nemusí mít protějšek v knihovně — tabulatura připojená
   * doplňováním odkazuje rovnou do úložiště. `loadFromLibrary` by pro ni
   * neměla `asset.id`, na kterém stojí.
   */
  public async loadFromUrl(url: string, nazev: string): Promise<void> {
    this.stop();
    this.state = {
      ...this.state,
      loading: true,
      error: null,
      asset: { id: url, name: nazev } as unknown as LibraryAsset,
      tracks: [],
      duration: 0,
    };
    this.notify();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Stažení selhalo (HTTP ${res.status}).`);
      this.zpracujMidi(new Midi(await res.arrayBuffer()));
    } catch (e: any) {
      this.state = { ...this.state, loading: false, error: e?.message || 'Soubor se nepodařilo načíst.' };
      this.notify();
    }
  }

  public async loadFromLibrary(asset: LibraryAsset): Promise<void> {
    this.stop();
    this.state = { ...this.state, loading: true, error: null, asset, tracks: [], duration: 0 };
    this.notify();

    try {
      // Přes náš server, ne podepsaným odkazem do R2 — ten je pro `fetch`
      // cizí původ a prohlížeč ho blokuje, dokud se adresa ručně nepovolí
      // v nastavení bucketu.
      const url = contentRequest(asset.id);

      const res = await fetch(url.adresa, { headers: url.hlavicky });
      if (!res.ok) throw new Error(`Stažení selhalo (HTTP ${res.status}).`);
      const bajty = await res.arrayBuffer();
      const midi = new Midi(bajty.slice(0));

      this.zpracujMidi(midi);
      // Engine dostává soubor tak, jak přišel: sekvencer si tempo, změny
      // nástrojů i pedál přečte sám a lépe, než by to šlo z rozebraných not.
      await spessaEngine.nactiSkladbu(bajty, asset.name);
      this.uplatniStopy();
    } catch (e: any) {
      this.state = { ...this.state, loading: false, error: e?.message || 'Soubor se nepodařilo načíst.' };
      this.notify();
    }
  }

  /** Rozebrání souboru na stopy. Sdílí ho načtení z knihovny i z adresy. */
  private zpracujMidi(midi: Midi): void {
    const tracks: MidiTrack[] = midi.tracks
      // Stopy bez not jsou v souborech běžné (jen názvy a nastavení) a
      // v seznamu by jen překážely.
      .filter((t) => t.notes.length > 0)
      .map((t, i) => ({
        index: i,
        name: t.name?.trim() || `Stopa ${i + 1}`,
        programName: t.instrument?.name || 'neznámý',
        isDrum: Boolean(t.instrument?.percussion),
        notes: t.notes.map((n) => ({
          midi: n.midi,
          time: n.time,
          duration: n.duration,
          velocity: n.velocity,
        })),
        profile: profileForProgram(t.instrument?.number ?? 0, Boolean(t.instrument?.percussion)),
        muted: false,
        solo: false,
        hlasitost: 0.7,
      }));

    this.state = { ...this.state, tracks, duration: midi.duration, loading: false, position: 0 };
    this.notify();
  }

  public play(): void {
    if (this.state.isPlaying || this.state.tracks.length === 0) return;
    audioBus.claim('midi-player', this.state.asset?.name || 'MIDI', 'MIDI přehrávač');

    this.state = { ...this.state, isPlaying: true };
    this.notify();
    void spessaEngine.prehraj(this.state.position);
    this.sleduj();
  }

  /**
   * Posun ukazatele.
   *
   * Hlásí se desetkrát za sekundu, ne při každém překreslení. Dřív se
   * s každým snímkem vyráběl nový stav a celý panel se překresloval
   * šedesátkrát za sekundu — u vícestopé skladby se kvůli tomu posuvník
   * sekal.
   */
  private sleduj(): void {
    const tik = () => {
      if (!this.state.isPlaying) return;
      const pozice = spessaEngine.pozice;
      if (spessaEngine.delka > 0 && pozice >= spessaEngine.delka - 0.05) {
        this.stop();
        return;
      }
      this.state = { ...this.state, position: pozice };
      this.notify();
      this.tikId = window.setTimeout(tik, 100) as unknown as number;
    };
    tik();
  }

  public pause(): void {
    if (!this.state.isPlaying) return;
    spessaEngine.pauza();
    this.zrusPlan();
    this.state = { ...this.state, isPlaying: false, position: spessaEngine.pozice };
    this.notify();
    audioBus.release('midi-player');
  }

  public stop(): void {
    spessaEngine.zastav();
    this.zrusPlan();
    this.state = { ...this.state, isPlaying: false, position: 0 };
    this.notify();
    audioBus.release('midi-player');
  }

  public seek(seconds: number): void {
    const cil = Math.max(0, Math.min(seconds, this.state.duration));
    // Sekvencer umí skočit za běhu, takže se přehrávání nemusí zastavit
    // a znovu rozjet — dřív z toho bylo při každém tažení posuvníku ticho.
    spessaEngine.skoc(cil);
    this.state = { ...this.state, position: cil };
    this.notify();
  }

  public setTempoFactor(factor: number): void {
    const nove = Math.max(0.25, Math.min(2, factor));
    // Sekvencer mění rychlost za chodu; zastavovat a spouštět znovu
    // není potřeba.
    spessaEngine.nastavTempo(nove);
    this.state = { ...this.state, tempoFactor: nove };
    this.notify();
  }

  /**
   * Promítne ztlumení, sóla a hlasitosti do kanálů syntetizátoru.
   *
   * Stopa v souboru a kanál v syntetizátoru nejsou totéž — soubor může mít
   * víc stop na jednom kanálu. Bere se pořadí stop, což u drtivé většiny
   * souborů odpovídá, a bicí zůstávají na kanálu 10 podle normy.
   */
  private uplatniStopy(): void {
    const jeSolo = this.state.tracks.some((t) => t.solo);
    this.state.tracks.forEach((t, i) => {
      const kanal = t.isDrum ? 9 : i < 9 ? i : i + 1;
      const hraje = jeSolo ? t.solo : !t.muted;
      spessaEngine.hlasitostKanalu(kanal, hraje ? t.hlasitost : 0);
    });
  }

  public setTrackVolume(index: number, hlasitost: number): void {
    this.upravStopu(index, (t) => ({ ...t, hlasitost: Math.max(0, Math.min(1, hlasitost)) }));
  }

  public setTrackProfile(index: number, profile: InstrumentProfile): void {
    this.upravStopu(index, (t) => ({ ...t, profile }));
  }

  public toggleMute(index: number): void {
    this.upravStopu(index, (t) => ({ ...t, muted: !t.muted }));
  }

  public toggleSolo(index: number): void {
    this.upravStopu(index, (t) => ({ ...t, solo: !t.solo }));
  }

  /** Úpravy not — přidání, posun, smazání. Přepis zvuku se projeví po novém spuštění. */
  public setTrackNotes(index: number, notes: MidiNote[]): void {
    this.upravStopu(index, (t) => ({ ...t, notes: [...notes].sort((a, b) => a.time - b.time) }));
  }

  /**
   * Změna stopy se projeví okamžitě, i za běhu.
   *
   * Ztlumení, sólo a hlasitost jsou zprávy pro syntetizátor, ne důvod
   * přehrávání přerušit — dřív se kvůli posunutí jednoho jezdce skladba
   * zastavila a rozjela znovu.
   */
  private upravStopu(index: number, uprav: (t: MidiTrack) => MidiTrack): void {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) => (t.index === index ? uprav(t) : t)),
    };
    this.notify();
    this.uplatniStopy();
  }

  /** Zruší naplánované noty i odpočet. Zvuk už znějící dozní sám. */
  private zrusPlan(): void {
    if (this.tikId !== null) {
      window.clearTimeout(this.tikId);
      this.tikId = null;
    }
  }
}

export const midiPlayerService = new MidiPlayerService();
