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
  __neverlateMetronom?: {
    casovac: number | null; doba: number; bpm: number; dobVTaktu: number;
    /** Kdy padla první doba. Podle toho se dopočítá pozice mezi tiky. */
    zacatek: number;
  };
}

function stav() {
  const w = window as OknoSMetronomem;
  if (!w.__neverlateMetronom) {
    w.__neverlateMetronom = { casovac: null, doba: 0, bpm: 120, dobVTaktu: 4, zacatek: 0 };
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
    // Strop 300 na čtvrtky: šestnáctky pak jdou dvacet za vteřinu, což
    // je rychleji, než se dá zahrát. Níž než třicet už se ztrácí pocit
    // tempa a klepe to jako hodiny.
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

    s.zacatek = performance.now();
    tik();
    s.casovac = window.setInterval(tik, 60000 / s.bpm);
  }

  /** Změna tempa za chodu. */
  public nastavTempo(bpm: number): void {
    const s = stav();
    if (this.bezi()) this.start(bpm, s.dobVTaktu);
    else s.bpm = bpm;
  }

  /**
   * Kde je metronom právě teď, v dobách od spuštění.
   *
   * Vrací i desetinnou část, aby se dala vykreslit plynulá čára mezi
   * tiky — samotné klepání je po čtvrtkách, ale šestnáctinový vzor
   * potřebuje vědět, kde se je uvnitř doby.
   *
   * Počítá se z času, ne z počitadla tiků: `setInterval` se v prohlížeči
   * opožďuje a po pár desítkách taktů by se čára rozešla se zvukem.
   */
  public pozice(): number {
    const s = stav();
    if (s.casovac === null) return 0;
    return ((performance.now() - s.zacatek) / 60000) * s.bpm;
  }

  /** Tempo, ve kterém běží (nebo poslední nastavené). */
  public tempo(): number { return stav().bpm; }

  public stop(): void {
    const s = stav();
    if (s.casovac !== null) {
      clearInterval(s.casovac);
      s.casovac = null;
    }
  }
}

export const metronomService = new MetronomService();
