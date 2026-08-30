import { Note } from 'tonal';
import { poslechKytary } from './poslechKytary';
import { midiService } from './midiService';
import { audioSynth, InstrumentProfile } from './audioSynth';
import { BASE_PIANO_LAYOUT } from '../data/pcKlavesnice';

/**
 * Co hráč zahrál — bez ohledu na to, na co.
 *
 * Cvičení v Testing Room nezajímá, jestli tón přišel z kytary do
 * mikrofonu, z MIDI klaviatury nebo z počítačové klávesnice; zajímá ho
 * jen výška a čas. Kdyby si každé cvičení řešilo vstup samo, byla by to
 * třikrát tatáž práce a pokaždé trochu jinak přesná.
 *
 * Čas je vždycky `performance.now()`. MIDI ho tak hlásí samo, mikrofon
 * je na něj převedený a metronom cvičení si na něj přepočítá své doby —
 * jinak by se hrálo proti dvěma hodinám, které spolu nesouvisí.
 */

export type ZdrojVstupu = 'mikrofon' | 'midi' | 'klavesnice';

export interface UderHrace {
  /** Číslo MIDI noty, 60 = C4. */
  midi: number;
  /** Znějící tón i s oktávou, třeba „E2". */
  ton: string;
  /** Třída tónu bez oktávy, třeba „E". */
  trida: string;
  /**
   * Odchylka od čisté výšky v centech.
   *
   * Má smysl jen u mikrofonu — klávesa je vždycky přesně na tónu, takže
   * z ní chodí nula.
   */
  centy: number;
  cas: number;
  zdroj: ZdrojVstupu;
}

type Poslucha = (u: UderHrace) => void;

/** Odkud se počítají oktávy počítačové klávesnice. */
const VYCHOZI_OKTAVA = 4;

class VstupHrace {
  private posluchaci = new Set<Poslucha>();
  private odhlasMikrofon: (() => void) | null = null;
  private odhlasMidi: (() => void) | null = null;
  private klavesniceZapnuta = false;
  private oktava = VYCHOZI_OKTAVA;
  /** Ozvučit stisk počítačové klávesy — bez zvuku se hraje naslepo. */
  private nastrojKlavesnice: InstrumentProfile = 'grand_piano_steinway';
  /** Držené klávesy, ať opakování od operačního systému nedělá údery. */
  private drzene = new Set<string>();

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    return () => this.posluchaci.delete(f);
  }

  private oznam(u: UderHrace): void {
    this.posluchaci.forEach((f) => f(u));
  }

  public async zapniMikrofon(): Promise<void> {
    if (this.odhlasMikrofon) return;
    await poslechKytary.start();
    this.odhlasMikrofon = poslechKytary.naUder((u) =>
      this.oznam({
        midi: u.midi,
        ton: u.ton,
        trida: Note.pitchClass(u.ton) || u.ton,
        centy: u.centy,
        cas: u.cas,
        zdroj: 'mikrofon',
      })
    );
  }

  public vypniMikrofon(): void {
    this.odhlasMikrofon?.();
    this.odhlasMikrofon = null;
    poslechKytary.stop();
  }

  public async zapniMidi(): Promise<void> {
    if (this.odhlasMidi) return;
    await midiService.initMidi();
    this.odhlasMidi = midiService.subscribe((e) => {
      if (e.type !== 'noteon' || !e.note) return;
      const ton = e.noteName || Note.fromMidi(e.note);
      this.oznam({
        midi: e.note,
        ton,
        trida: Note.pitchClass(ton) || ton,
        centy: 0,
        cas: e.timestamp,
        zdroj: 'midi',
      });
    });
  }

  public vypniMidi(): void {
    this.odhlasMidi?.();
    this.odhlasMidi = null;
  }

  public zapniKlavesnici(nastroj?: InstrumentProfile): void {
    if (nastroj) this.nastrojKlavesnice = nastroj;
    if (this.klavesniceZapnuta) return;
    this.klavesniceZapnuta = true;
    window.addEventListener('keydown', this.dolu);
    window.addEventListener('keyup', this.nahoru);
  }

  public vypniKlavesnici(): void {
    if (!this.klavesniceZapnuta) return;
    this.klavesniceZapnuta = false;
    this.drzene.clear();
    window.removeEventListener('keydown', this.dolu);
    window.removeEventListener('keyup', this.nahoru);
  }

  /** O kolik oktáv výš nebo níž hraje počítačová klávesnice. */
  public nastavOktavu(o: number): void {
    this.oktava = Math.max(1, Math.min(7, o));
  }

  public getOktava(): number {
    return this.oktava;
  }

  public vypniVse(): void {
    this.vypniMikrofon();
    this.vypniMidi();
    this.vypniKlavesnici();
  }

  private dolu = (e: KeyboardEvent): void => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement)?.isContentEditable
    ) {
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const klavesa = e.key.toLowerCase();
    // Držená klávesa se v systému opakuje desetkrát za vteřinu; jeden
    // stisk je jeden úder.
    if (this.drzene.has(klavesa)) return;

    const nalezena = BASE_PIANO_LAYOUT.find((k) => k.keyShortcut === klavesa);
    if (!nalezena) return;

    e.preventDefault();
    this.drzene.add(klavesa);
    const ton = `${nalezena.root}${this.oktava + nalezena.relOctave}`;
    audioSynth.playNote(ton, this.nastrojKlavesnice, 1.2, 0.5);
    this.oznam({
      midi: Note.midi(ton) ?? 0,
      ton,
      trida: nalezena.root,
      centy: 0,
      cas: performance.now(),
      zdroj: 'klavesnice',
    });
  };

  private nahoru = (e: KeyboardEvent): void => {
    this.drzene.delete(e.key.toLowerCase());
  };
}

export const vstupHrace = new VstupHrace();
