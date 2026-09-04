/**
 * Ověření souboru `.nam`.
 *
 * Soubor je JSON s hlavičkou a vahami. Načíst neplatný do zvukového
 * vlákna znamená v lepším případě ticho, v horším praskání — a přijít
 * na to podle sluchu je otrava. Proto se kontroluje dřív, než se
 * pošle do enginu.
 *
 * Kontroluje se jen to, na čem stojí načtení: že je to JSON, že má
 * verzi a architekturu a že váhy vůbec jsou. Do hloubky se nechodí —
 * na to je engine sám a rozumí tomu líp.
 */

export interface UdajeModelu {
  verze?: string;
  architektura?: string;
  vzorkovaci?: number;
  autor?: string;
  vah?: number;
}

export interface VysledekKontroly {
  platny: boolean;
  /** Proč ne — do hlášky uživateli. */
  duvod?: string;
  udaje?: UdajeModelu;
}

/** Architektury, které Neural Amp Modeler používá. */
const ZNAME = ['WaveNet', 'LSTM', 'ConvNet', 'CatWaveNet', 'CatLSTM', 'Linear'];

export function platnyNamModel(text: string): VysledekKontroly {
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    return { platny: false, duvod: 'Soubor není JSON.' };
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { platny: false, duvod: 'Soubor nemá strukturu modelu.' };
  }

  const architektura = typeof d.architecture === 'string' ? d.architecture : undefined;
  if (!architektura) return { platny: false, duvod: 'Chybí architecture.' };
  // Neznámá architektura se nezamítá: NAM jich přidává a odmítnout
  // model jen proto, že jsme o ní neslyšeli, by bylo horší než zkusit
  // ho načíst. Zamítá se jen to, co architekturu nemá vůbec.
  const verze = typeof d.version === 'string' ? d.version : undefined;
  if (!verze) return { platny: false, duvod: 'Chybí version.' };

  const vahy = d.weights;
  if (!Array.isArray(vahy) || vahy.length === 0) {
    return { platny: false, duvod: 'Model nemá žádné váhy.' };
  }
  if (!vahy.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))) {
    return { platny: false, duvod: 'Váhy nejsou čísla.' };
  }

  return {
    platny: true,
    udaje: {
      verze,
      architektura,
      vzorkovaci: Number(d.sample_rate) || undefined,
      autor: typeof d?.metadata?.modeled_by === 'string' ? d.metadata.modeled_by : undefined,
      vah: vahy.length,
    },
  };
}

/** Je architektura mezi těmi, které známe? Jen do popisku, ne k zamítnutí. */
export function znamaArchitektura(a?: string): boolean {
  return !!a && ZNAME.includes(a);
}
