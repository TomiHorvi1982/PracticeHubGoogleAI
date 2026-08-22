import { TunerEngine } from '../utils/tunerEngine';

/**
 * Detekce výšky tónu pro ladičku.
 *
 * Rozhraní zůstává stejné, jaké tu bylo — komponenta ladičky se nemusela
 * měnit. Vnitřek se ale vyměnil: dřív to byla autokorelace, která u
 * hlubokých strun často ukázala tón o oktávu výš (nejčastěji u E na šesté
 * struně). Teď za tím stojí engine z projektu MoChord, který používá YIN
 * s mediánovým filtrem — na kytaru výrazně spolehlivější.
 *
 * Původ a licence enginu: src/utils/tunerEngine.ts
 */

export interface PitchData {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  clarity: number;
  stringIndex?: number; // 0 = šestá struna (E2) … 5 = první struna (E4)
}

/** Standardní ladění kytary, od nejhlubší struny. */
const GUITAR_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

/**
 * Ke které struně detekovaný tón patří — `undefined`, když k žádné.
 *
 * Tolerance 120 centů je něco přes půltón: pokrýve i pořádně rozladěnou
 * strunu, ale nespáruje tón, který ke kytaře vůbec nepatří.
 */
function matchString(frequency: number): number | undefined {
  let index: number | undefined;
  let nejlepsi = Infinity;
  GUITAR_FREQS.forEach((gFreq, idx) => {
    const diffCents = Math.abs(1200 * Math.log2(frequency / gFreq));
    if (diffCents <= 120 && diffCents < nejlepsi) {
      nejlepsi = diffCents;
      index = idx;
    }
  });
  return index;
}

export class PitchDetector {
  private engine: TunerEngine | null = null;

  /**
   * Spustí poslech. Vrací `false`, když se mikrofon nepodařilo otevřít —
   * volající to tak měl vždycky a chování zůstává.
   */
  public async start(onPitchDetected: (data: PitchData | null) => void): Promise<boolean> {
    try {
      const engine = new TunerEngine();

      // Engine hlásí odchylku vůči nejbližšímu půltónu — stejně jako to
      // dělala původní ladička, takže se UI chová dál stejně. Ke které
      // struně tón patří, se dopočítá níž.
      await engine.start((frame) => {
        if (!frame.pitch) {
          onPitchDetected(null);
          return;
        }
        const p = frame.pitch;
        onPitchDetected({
          frequency: Math.round(p.frequency * 10) / 10,
          note: p.note,
          octave: p.octave,
          cents: Math.max(-50, Math.min(50, Math.round(p.cents))),
          clarity: p.clarity,
          stringIndex: matchString(p.frequency),
        });
      });

      this.engine = engine;
      return true;
    } catch (e) {
      console.warn('[tuner] Mikrofon se nepodařilo spustit:', e);
      this.engine = null;
      return false;
    }
  }

  public stop(): void {
    this.engine?.stop();
    this.engine = null;
  }
}
