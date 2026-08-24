import { Midi } from '@tonejs/midi';
import { audioSynth, InstrumentProfile, midiToNoteName } from './audioSynth';
import { contentRequest, assetLibraryService, LibraryAsset } from './assetLibraryService';
import { audioBus } from './audioBus';

/**
 * Přehrávač MIDI souborů z knihovny kapely.
 *
 * Soubor se stáhne z úložiště, rozparsuje a přehraje přes stejný zvukový
 * engine jako virtuální nástroje — tedy přes nahrané vzorky (FluidR3),
 * ne přes syntetizovaný tón. MIDI totiž nenese zvuk, jen noty; jak to zní,
 * určuje banka, kterou se to přehraje.
 *
 * Časování si vede sám přes `setTimeout` nad jedním časovým počátkem místo
 * plánovače Tone: noty se hrají už existující metodou `audioSynth.playNote`,
 * která je nedělitelná (spustí se hned), takže není co plánovat dopředu —
 * a odpadá tím druhý zvukový graf, který by běžel vedle nástrojů.
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
  private zacatek = 0;
  private odkud = 0;
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
      const midi = new Midi(await res.arrayBuffer());

      this.zpracujMidi(midi);
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
    audioBus.claim('midi-player');

    this.zacatek = performance.now();
    this.odkud = this.state.position;
    this.state = { ...this.state, isPlaying: true };
    this.notify();

    const anySolo = this.state.tracks.some((t) => t.solo);

    for (const track of this.state.tracks) {
      if (anySolo ? !track.solo : track.muted) continue;
      for (const note of track.notes) {
        const za = (note.time - this.odkud) / this.state.tempoFactor;
        if (za < 0) continue;
        const id = window.setTimeout(() => {
          audioSynth.playNote(
            midiToNoteName(note.midi),
            track.profile,
            note.duration / this.state.tempoFactor,
            track.hlasitost,
            note.velocity
          );
        }, za * 1000);
        this.timery.push(id);
      }
    }

    const tik = () => {
      if (!this.state.isPlaying) return;
      const ubehlo = ((performance.now() - this.zacatek) / 1000) * this.state.tempoFactor;
      const pozice = this.odkud + ubehlo;
      if (pozice >= this.state.duration) {
        this.stop();
        return;
      }
      this.state = { ...this.state, position: pozice };
      this.notify();
      this.tikId = window.requestAnimationFrame(tik);
    };
    this.tikId = window.requestAnimationFrame(tik);
  }

  public pause(): void {
    if (!this.state.isPlaying) return;
    const ubehlo = ((performance.now() - this.zacatek) / 1000) * this.state.tempoFactor;
    this.zrusPlan();
    this.state = { ...this.state, isPlaying: false, position: this.odkud + ubehlo };
    this.notify();
    audioBus.release('midi-player');
  }

  public stop(): void {
    this.zrusPlan();
    this.state = { ...this.state, isPlaying: false, position: 0 };
    this.notify();
    audioBus.release('midi-player');
  }

  public seek(seconds: number): void {
    const bezel = this.state.isPlaying;
    this.zrusPlan();
    this.state = { ...this.state, isPlaying: false, position: Math.max(0, Math.min(seconds, this.state.duration)) };
    this.notify();
    if (bezel) this.play();
  }

  public setTempoFactor(factor: number): void {
    const bezel = this.state.isPlaying;
    if (bezel) this.pause();
    this.state = { ...this.state, tempoFactor: Math.max(0.25, Math.min(2, factor)) };
    this.notify();
    if (bezel) this.play();
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

  private upravStopu(index: number, uprav: (t: MidiTrack) => MidiTrack): void {
    const bezel = this.state.isPlaying;
    if (bezel) this.pause();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) => (t.index === index ? uprav(t) : t)),
    };
    this.notify();
    if (bezel) this.play();
  }

  /** Zruší naplánované noty i odpočet. Zvuk už znějící dozní sám. */
  private zrusPlan(): void {
    for (const id of this.timery) window.clearTimeout(id);
    this.timery = [];
    if (this.tikId !== null) {
      window.cancelAnimationFrame(this.tikId);
      this.tikId = null;
    }
  }
}

export const midiPlayerService = new MidiPlayerService();
