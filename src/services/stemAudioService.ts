import * as Tone from 'tone';
import { StemSongDocument, SongStem } from '../types';
import { generateSynchronizedStems } from './stemAudioGenerator';
import { authService } from './authService';

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = authService.getCurrentSession()?.token;
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

export interface ChannelState {
  volume: number;      // dB (-60 to +6)
  pan: number;         // -1 (Left) to +1 (Right)
  isMuted: boolean;
  isSolo: boolean;
  pitchSemi: number;   // -12 to +12 semitones
  isMono: boolean;     // For Guitar Mid/Side matrix
  stereoWidth: number; // 0 (Mono) to 2 (Super-Wide)
}

export interface StemAudioState {
  songs: StemSongDocument[];
  selectedSong: StemSongDocument | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioReady: boolean;
  loadingAudio: boolean;
  globalPitch: number;
  channels: Record<string, ChannelState>;
  meterLevels: Record<string, number>; // 0 to 1 for visual VU/peak meters
}

class StemAudioService {
  private songs: StemSongDocument[] = [];
  private selectedSong: StemSongDocument | null = null;
  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private duration: number = 180;
  private audioReady: boolean = false;
  private loadingAudio: boolean = false;
  private globalPitch: number = 0;
  private channels: Record<string, ChannelState> = {};
  private meterLevels: Record<string, number> = {};

  /** Blob adresy stažených stop, aby šly po výměně skladby uvolnit. */
  private blobAdresy: string[] = [];
  private players: Record<string, Tone.Player> = {};
  private pitchShifters: Record<string, Tone.PitchShift> = {};
  private panners: Record<string, Tone.Panner> = {};
  private gains: Record<string, Tone.Gain> = {};
  private meters: Record<string, Tone.Meter> = {};

  private guitarMsNodes: {
    splitter?: ChannelSplitterNode;
    midGain?: GainNode;
    sideGain?: GainNode;
    merger?: ChannelMergerNode;
  } = {};

  private subscribers: Set<(state: StemAudioState) => void> = new Set();
  private timeInterval: any = null;
  private meterInterval: any = null;

  constructor() {
    this.fetchSongs();
  }

  public subscribe(cb: (state: StemAudioState) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getState());
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    const state = this.getState();
    this.subscribers.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('StemAudioService subscriber error:', err);
      }
    });
  }

  public getState(): StemAudioState {
    return {
      songs: this.songs,
      selectedSong: this.selectedSong,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
      audioReady: this.audioReady,
      loadingAudio: this.loadingAudio,
      globalPitch: this.globalPitch,
      channels: { ...this.channels },
      meterLevels: { ...this.meterLevels },
    };
  }

  public async fetchSongs(): Promise<StemSongDocument[]> {
    try {
      const res = await authorizedFetch('/api/stems');
      if (res.ok) {
        const data = await res.json();
        this.songs = data.songs || [];
        if (this.songs.length > 0 && !this.selectedSong) {
          this.selectSong(this.songs[0]);
        } else if (this.selectedSong) {
          const updated = this.songs.find((s) => s.id === this.selectedSong!.id);
          if (updated) {
            const wasProcessing = this.selectedSong.status === 'processing';
            const isNowCompleted = updated.status === 'completed';
            this.selectedSong = updated;
            if (wasProcessing && isNowCompleted) {
              this.selectSong(updated, true);
            }
          }
          this.notify();
        } else {
          this.notify();
        }
        return this.songs;
      }
    } catch (err) {
      console.error('[StemAudioService] Failed to fetch stem songs:', err);
    }
    return this.songs;
  }

  public selectSong(song: StemSongDocument | null, forceReload: boolean = false) {
    if (!song) return;
    if (!forceReload && song.id === this.selectedSong?.id && this.audioReady) return;
    this.stop();
    this.selectedSong = song;
    this.duration = song.durationSeconds || 60;
    this.currentTime = 0;
    this.audioReady = false;

    // Initialize channel defaults
    const initial: Record<string, ChannelState> = {};
    if (song.stems) {
      song.stems.forEach((stem) => {
        initial[stem.id] = this.channels[stem.id] || {
          volume: 0,
          pan: 0,
          isMuted: false,
          isSolo: false,
          pitchSemi: 0,
          isMono: false,
          stereoWidth: 1.0,
        };
        this.meterLevels[stem.id] = 0;
      });
    }
    this.channels = initial;
    this.notify();

    if (song.status === 'completed' && song.stems && song.stems.length > 0) {
      this.setupAudioNodes(song);
    }
  }

  /**
   * Poskládá pult z vlastních souborů z knihovny.
   *
   * Fadery zůstávají tytéž — zpěv, kytara, basa, bicí, ostatní — a na
   * každý se dá pověsit libovolný soubor. Hotových rozdělených sad je pár,
   * kdežto jednotlivých stop leží v knihovně spousta a bez tohohle se
   * z nich nedal mix poskládat.
   *
   * Staví se z toho běžný dokument sady, takže zbytek pultu ani zvukový
   * engine nemusí vědět, že stopy nepocházejí ze separace.
   */
  public pouzijVlastniStopy(
    prirazeni: { role: string; nazev: string; assetId: string; popisRole?: string }[]
  ): void {
    if (prirazeni.length === 0) {
      this.selectSong(null);
      return;
    }
    const dokument: StemSongDocument = {
      id: `vlastni-${prirazeni.map((p) => p.assetId).join('-').slice(0, 60)}`,
      youtubeUrl: '',
      youtubeId: '',
      title: 'Vlastní mix',
      artist: 'z knihovny',
      durationSeconds: 0,
      status: 'completed',
      progressPercentage: 100,
      stems: prirazeni.map((p) => ({
        id: p.role,
        // Na faderu je role, ne název souboru. Fader je pořád „Basa";
        // co na něm zrovna visí, se čte v seznamu přiřazení.
        name: p.popisRole || p.role,
        // Adresa přes vlastní server: engine si ji stáhne s přihlášením
        // a udělá z ní blob. Podepsaný odkaz přímo do úložiště by
        // prohlížeč zablokoval jako cizí původ.
        storagePath: '',
        downloadUrl: `/api/assets/${p.assetId}/content`,
        format: 'wav' as const,
        bitrateKbps: 0,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.selectSong(dokument, true);
  }

  /**
   * Serverová separace je vypnutá — endpoint odpovídá 410.
   *
   * Vzdálený worker na ni potřeboval desítky minut. Stopy se teď dělají
   * lokálně ve StemDecku a přenesou se v Mixážním pultu; tahle metoda
   * zbyla proto, aby volající dostal srozumitelné vysvětlení místo
   * tichého selhání, a smaže se, až na ni nikdo nebude sahat.
   */
  public async processYoutubeUrl(youtubeUrl: string, title?: string, artist?: string): Promise<StemSongDocument> {
    const res = await authorizedFetch('/api/stems/process', {
      method: 'POST',
      body: JSON.stringify({ youtubeUrl, title, artist }),
    });
    const data = await res.json();
    if (!res.ok || !data.song) {
      throw new Error(data.error || 'Nepodařilo se zahájit separaci.');
    }
    await this.fetchSongs();
    this.selectSong(data.song, true);
    return data.song;
  }

  /** Deletes a stem set (and its audio) server-side, then refreshes the
   * list. Used to clear out failed separations, which would otherwise sit
   * in the mixer forever with no stems. */
  public async deleteStemSet(id: string): Promise<void> {
    const res = await authorizedFetch(`/api/stems/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Nepodařilo se smazat sadu stop.');
    }
    if (this.selectedSong?.id === id) {
      this.stop();
      this.selectedSong = null;
      this.audioReady = false;
    }
    await this.fetchSongs();
  }

  public selectSongByTitleOrArtist(title: string, artist?: string): boolean {
    if (!this.songs.length) return false;
    const cleanTitle = title.toLowerCase().trim();
    const cleanArtist = artist ? artist.toLowerCase().trim() : '';

    const matched = this.songs.find((s) => {
      const sTitle = s.title.toLowerCase();
      const sArtist = s.artist.toLowerCase();
      return (
        (cleanTitle && sTitle.includes(cleanTitle)) ||
        (cleanArtist && sArtist.includes(cleanArtist)) ||
        (cleanTitle && cleanArtist && `${sArtist} ${sTitle}`.includes(cleanTitle))
      );
    });

    if (matched) {
      this.selectSong(matched);
      return true;
    }
    return false;
  }

  private async setupAudioNodes(song: StemSongDocument) {
    this.loadingAudio = true;
    this.audioReady = false;
    this.notify();

    try {
      await Tone.start();

      // Dispose existing nodes
      Object.values(this.players).forEach((p) => p.dispose());
      Object.values(this.pitchShifters).forEach((p) => p.dispose());
      Object.values(this.panners).forEach((p) => p.dispose());
      Object.values(this.gains).forEach((p) => p.dispose());
      Object.values(this.meters).forEach((p) => p.dispose());

      this.players = {};
      this.pitchShifters = {};
      this.panners = {};
      this.gains = {};
      this.meters = {};

      // Blob adresy z minulé skladby už nikdo nepotřebuje.
      this.blobAdresy.forEach((u) => URL.revokeObjectURL(u));
      this.blobAdresy = [];

      let loadedCount = 0;
      const totalStems = song.stems.length;
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const synthTracks = generateSynchronizedStems(rawCtx, 60, 108);

      for (const stem of song.stems) {
        const fallbackBuffer = (synthTracks as any)[stem.id] || synthTracks.other;

        // Stopa se stáhne s přihlášením a předá se jako blob adresa.
        // Tone.Player si soubor tahá sám a hlavičku s přihlášením neposílá,
        // takže na chráněnou adresu nedosáhne — a podepsaný odkaz přímo do
        // R2 zase prohlížeč blokuje jako cizí původ. Blob adresa obojí
        // obchází a uvolní se při dalším načtení.
        let adresa = stem.downloadUrl;
        if (adresa.startsWith('/api/')) {
          try {
            const res = await authorizedFetch(adresa);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            adresa = URL.createObjectURL(await res.blob());
            this.blobAdresy.push(adresa);
          } catch (e) {
            console.warn(`[StemAudioService] Stopu ${stem.id} se nepodařilo stáhnout:`, e);
          }
        }

        const player = new Tone.Player({
          url: adresa,
          loop: true,
          autostart: false,
          onload: () => {
            loadedCount++;
            if (player.buffer && player.buffer.duration) {
              this.duration = Math.max(this.duration, player.buffer.duration);
            }
            if (loadedCount >= totalStems) {
              this.audioReady = true;
              this.loadingAudio = false;
              this.notify();
            }
          },
          onerror: (loadErr) => {
            console.warn(`[StemAudioService] Remote URL load failed for ${stem.id}, using high-fidelity generated stem audio.`, loadErr);
            try {
              player.buffer = new Tone.ToneAudioBuffer(fallbackBuffer);
            } catch (e) {
              console.error('Error assigning fallback buffer:', e);
            }
            loadedCount++;
            if (loadedCount >= totalStems) {
              this.audioReady = true;
              this.loadingAudio = false;
              this.duration = 60;
              this.notify();
            }
          },
        });

        const pitchShift = new Tone.PitchShift(0);
        const panner = new Tone.Panner(0);
        const gainNode = new Tone.Gain(1);
        const meter = new Tone.Meter({ smoothing: 0.8 });

        player.connect(pitchShift);
        pitchShift.connect(panner);

        // Guitar Mid/Side Processing Matrix
        if (stem.id === 'guitar') {
          const rawCtx = Tone.getContext().rawContext as AudioContext;
          const splitter = rawCtx.createChannelSplitter(2);
          const merger = rawCtx.createChannelMerger(2);

          const midGain = rawCtx.createGain();
          const sideGain = rawCtx.createGain();

          midGain.gain.value = 1.0;
          sideGain.gain.value = 1.0;

          Tone.connect(panner, splitter);

          const midL = rawCtx.createGain();
          const midR = rawCtx.createGain();
          midL.gain.value = 0.5;
          midR.gain.value = 0.5;

          splitter.connect(midL, 0);
          splitter.connect(midR, 1);
          midL.connect(midGain);
          midR.connect(midGain);

          const sideL = rawCtx.createGain();
          const sideR = rawCtx.createGain();
          sideL.gain.value = 0.5;
          sideR.gain.value = -0.5;

          splitter.connect(sideL, 0);
          splitter.connect(sideR, 1);
          sideL.connect(sideGain);
          sideR.connect(sideGain);

          const sideRInvert = rawCtx.createGain();
          sideRInvert.gain.value = -1.0;
          sideGain.connect(sideRInvert);

          midGain.connect(merger, 0, 0);
          midGain.connect(merger, 0, 1);
          sideGain.connect(merger, 0, 0);
          sideRInvert.connect(merger, 0, 1);

          if (gainNode.input) {
            merger.connect(gainNode.input as any);
          } else {
            Tone.connect(merger, gainNode);
          }
          this.guitarMsNodes = { splitter, midGain, sideGain, merger };
        } else {
          panner.connect(gainNode);
        }

        gainNode.connect(meter);
        gainNode.toDestination();

        this.players[stem.id] = player;
        this.pitchShifters[stem.id] = pitchShift;
        this.panners[stem.id] = panner;
        this.gains[stem.id] = gainNode;
        this.meters[stem.id] = meter;
      }

      this.applyChannelParams();
    } catch (err) {
      console.error('[StemAudioService] Audio setup error:', err);
      this.loadingAudio = false;
      this.notify();
    }
  }

  public applyChannelParams() {
    const anySolo = Object.values(this.channels).some((ch) => ch.isSolo);

    Object.entries(this.channels).forEach(([stemId, ch]) => {
      const gainNode = this.gains[stemId];
      if (!gainNode) return;

      let shouldPlay = true;
      if (anySolo) {
        shouldPlay = ch.isSolo;
      } else if (ch.isMuted) {
        shouldPlay = false;
      }

      const targetGain = shouldPlay ? Tone.dbToGain(ch.volume) : 0;
      gainNode.gain.rampTo(targetGain, 0.04);

      if (this.panners[stemId]) {
        this.panners[stemId].pan.value = ch.pan;
      }
      if (this.pitchShifters[stemId]) {
        this.pitchShifters[stemId].pitch = ch.pitchSemi + this.globalPitch;
      }

      if (stemId === 'guitar' && this.guitarMsNodes.sideGain) {
        const effectiveWidth = ch.isMono ? 0 : ch.stereoWidth;
        this.guitarMsNodes.sideGain.gain.value = effectiveWidth;
      }
    });
  }

  public updateChannel(id: string, updates: Partial<ChannelState>) {
    if (!this.channels[id]) return;
    this.channels[id] = { ...this.channels[id], ...updates };
    this.applyChannelParams();
    this.notify();
  }

  public setGlobalPitch(pitch: number) {
    this.globalPitch = pitch;
    this.applyChannelParams();
    this.notify();
  }

  public async togglePlay() {
    await Tone.start();
    if (!this.isPlaying) {
      Tone.Transport.start();
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      let synthTracks: any = null;

      // Nejdřív doplnit, co chybí. Dogenerovat buffer uprostřed spouštění
      // trvá desítky milisekund a stopy za ním by naskočily později —
      // pult by hrál rozházeně a nebylo by poznat proč.
      Object.entries(this.players).forEach(([stemId, p]) => {
        if (!p.loaded || !p.buffer || !p.buffer.loaded) {
          if (!synthTracks) {
            synthTracks = generateSynchronizedStems(rawCtx, 60, 108);
          }
          const buf = synthTracks[stemId] || synthTracks.other;
          try {
            p.buffer = new Tone.ToneAudioBuffer(buf);
          } catch (e) {}
        }
      });

      // Teprve teď se spouští, a všechny na jeden společný okamžik kousek
      // v budoucnosti. Bez něj by každá stopa začala tehdy, kdy na ni
      // v cyklu došlo.
      const kdy = Tone.now() + 0.12;
      Object.entries(this.players).forEach(([stemId, p]) => {
        try {
          p.start(kdy, this.currentTime);
        } catch (err) {
          console.warn(`[StemAudioService] Error starting player for ${stemId}:`, err);
        }
      });
      this.isPlaying = true;
      this.startTimeTracking();
      this.startMeterTracking();
    } else {
      this.stop();
    }
    this.notify();
  }

  public stop() {
    Object.values(this.players).forEach((p) => p.stop());
    Tone.Transport.stop();
    this.isPlaying = false;
    this.stopTimeTracking();
    this.stopMeterTracking();
    // Reset visual meters
    Object.keys(this.meterLevels).forEach((k) => (this.meterLevels[k] = 0));
    this.notify();
  }

  public seek(seconds: number) {
    this.currentTime = seconds;
    if (this.isPlaying) {
      Tone.Transport.seconds = seconds;
      // Přeskočení je totéž spouštění — taky na jeden společný okamžik,
      // jinak se stopy po každém posunu v čase rozejdou.
      const kdy = Tone.now() + 0.12;
      Object.values(this.players).forEach((p) => {
        if (p.loaded || p.buffer) {
          try {
            p.stop();
            p.start(kdy, seconds);
          } catch (e) {}
        }
      });
      this.startTimeTracking();
    }
    this.notify();
  }

  private startTimeTracking() {
    if (this.timeInterval) clearInterval(this.timeInterval);
    const startTimestamp = Date.now() - this.currentTime * 1000;
    this.timeInterval = setInterval(() => {
      if (this.isPlaying) {
        const elapsed = (Date.now() - startTimestamp) / 1000;
        this.currentTime = elapsed % (this.duration || 60);
        this.notify();
      }
    }, 200);
  }

  private stopTimeTracking() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
  }

  private startMeterTracking() {
    if (this.meterInterval) clearInterval(this.meterInterval);
    this.meterInterval = setInterval(() => {
      if (!this.isPlaying) return;
      let hasChanges = false;
      const anySolo = Object.values(this.channels).some((ch) => ch.isSolo);

      Object.entries(this.meters).forEach(([stemId, meter]) => {
        const ch = this.channels[stemId];
        if (!ch) return;

        let shouldMeasure = true;
        if (anySolo) {
          shouldMeasure = ch.isSolo;
        } else if (ch.isMuted) {
          shouldMeasure = false;
        }

        if (!shouldMeasure) {
          if (this.meterLevels[stemId] !== 0) {
            this.meterLevels[stemId] = 0;
            hasChanges = true;
          }
          return;
        }

        try {
          const val = meter.getValue();
          // meter value is in dB (-Infinity to 0+) or array
          const db = Array.isArray(val) ? val[0] : val;
          // Map -60dB..+6dB to 0..1 scale
          let norm = 0;
          if (typeof db === 'number' && !isNaN(db) && db > -60) {
            norm = Math.min(1, Math.max(0, (db + 60) / 66));
          }
          // Pod -60 dB nebo bez čitelné hodnoty zůstává ukazatel na nule.
          //
          // Dřív se v tom případě dosazovalo náhodné číslo odvozené od
          // nastavené hlasitosti, takže ukazatel poskakoval i u stopy, která
          // nehrála. Právě to má přitom prozradit — ukazatel, který se hýbe
          // vždycky, neříká nic.

          if (Math.abs((this.meterLevels[stemId] || 0) - norm) > 0.02) {
            this.meterLevels[stemId] = norm;
            hasChanges = true;
          }
        } catch {
          // ignore
        }
      });

      if (hasChanges) {
        this.notify();
      }
    }, 80);
  }

  private stopMeterTracking() {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }
}

export const stemAudioService = new StemAudioService();
