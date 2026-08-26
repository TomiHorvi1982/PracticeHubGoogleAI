import { audioSynth } from './audioSynth';

/**
 * Metronom, který běží pořád.
 *
 * Klepání bylo dřív uvnitř sekce Metronom a uvnitř okna Ladička — tedy
 * jen tam, kde zrovna stojíš. Tlačítko ve vrchní liště se přepnulo,
 * rozsvítilo, a nic. Přitom právě odtud ho člověk zapíná, když si chce
 * dát tempo k něčemu jinému na obrazovce.
 *
 * Odsud tiká odkudkoli a přežije přepnutí sekce.
 */

/**
 * Časovač visí na okně, ne na instanci.
 *
 * Vývojový server umí modul načíst znovu a vyrobit tím druhou instanci
 * služby. Ta o časovači té první neví, takže klepaly obě naráz a
 * metronom šel dvakrát rychleji, než měl. Na okně je časovač jeden bez
 * ohledu na to, kolikrát se modul vyhodnotí.
 */
interface OknoSMetronomem extends Window {
  __neverlateMetronom?: { casovac: number | null; doba: number; bpm: number; dobVTaktu: number };
}

function stav() {
  const w = window as OknoSMetronomem;
  if (!w.__neverlateMetronom) {
    w.__neverlateMetronom = { casovac: null, doba: 0, bpm: 120, dobVTaktu: 4 };
  }
  return w.__neverlateMetronom;
}

class MetronomService {
  public bezi(): boolean {
    return stav().casovac !== null;
  }

  /**
   * Spustí klepání.
   *
   * Když už běží ve stejném tempu, nechá ho být. Restartovat metronom při
   * každém překreslení znamená klepnutí navíc a posunutý takt — a přesně
   * to dělal, protože efekt v Reactu se pouští znovu při každé změně
   * závislostí, i když se výsledek nemění.
   */
  public start(bpm: number, dobVTaktu = 4): void {
    const s = stav();
    const nove = Math.max(30, Math.min(300, bpm));
    if (this.bezi() && s.bpm === nove && s.dobVTaktu === dobVTaktu) return;

    this.stop();
    s.bpm = nove;
    s.dobVTaktu = Math.max(1, dobVTaktu);
    s.doba = 0;

    const tik = () => {
      // Důraz na první dobu: bez něj se v taktu nedá poznat, kde je
      // začátek, a metronom je pak jen tikot.
      audioSynth.playMetronomeClick(s.doba % s.dobVTaktu === 0);
      s.doba++;
    };

    tik();
    s.casovac = window.setInterval(tik, 60000 / s.bpm);
  }

  /** Změna tempa za chodu. */
  public nastavTempo(bpm: number): void {
    const s = stav();
    if (this.bezi()) this.start(bpm, s.dobVTaktu);
    else s.bpm = bpm;
  }

  public stop(): void {
    const s = stav();
    if (s.casovac !== null) {
      clearInterval(s.casovac);
      s.casovac = null;
    }
  }
}

export const metronomService = new MetronomService();
