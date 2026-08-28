import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Převod velkých zvuků na MP3 ještě před nahráním.
 *
 * Jedna stopa ve WAV zabere padesát megabajtů a stop bývá u písně pět;
 * z desetigigového úložiště by pak jedna zkouška ukousla dvacetinu.
 * Převádí se v prohlížeči, ne na serveru — nahrává se pak rovnou to
 * menší, takže se ušetří i čas a přenos.
 *
 * MP3 je ztrátové. Na zkoušku a poslech je to jedno, ale mistr pásky to
 * není: kdo bude stopy dál mixovat načisto, ať si originál nechá na disku.
 *
 * Ztrátové formáty se nepřevádějí. Překódovat MP3 na MP3 ubere zvuk
 * podruhé a skoro nic neušetří.
 */

/** Přípony, u kterých má převod smysl — bezeztrátové nebo nekomprimované. */
const BEZEZTRATOVE = ['wav', 'wave', 'aif', 'aiff', 'aifc', 'flac', 'caf'];

export type Kvalita = 128 | 192 | 256 | 320;

export interface VysledekPrevodu {
  soubor: File;
  puvodniBajtu: number;
  noveBajtu: number;
  /** `false` znamená, že se soubor nechal, jak byl — a proč. */
  prevedeno: boolean;
  duvod?: string;
}

export function jePrevoditelny(nazev: string): boolean {
  const p = nazev.split('.').pop()?.toLowerCase() || '';
  return BEZEZTRATOVE.includes(p);
}

/** Float -1..1 na celá čísla, se kterými kodér počítá. */
function naInt16(vzorky: Float32Array): Int16Array {
  const out = new Int16Array(vzorky.length);
  for (let i = 0; i < vzorky.length; i++) {
    // Ořez patří sem: hodnota nad rozsahem by po přetečení přeskočila
    // na opačné znaménko a v nahrávce by lupla.
    const v = Math.max(-1, Math.min(1, vzorky[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/**
 * Převede soubor na MP3. Vrací původní soubor, když převádět nemá cenu
 * nebo když se to nepovede — nahrát něco je vždycky lepší než nenahrát nic.
 */
export async function prevedNaMp3(
  soubor: File,
  kvalita: Kvalita = 192,
  onPokrok?: (procent: number) => void,
): Promise<VysledekPrevodu> {
  const puvodniBajtu = soubor.size;
  const nic = (duvod: string): VysledekPrevodu => ({
    soubor,
    puvodniBajtu,
    noveBajtu: puvodniBajtu,
    prevedeno: false,
    duvod,
  });

  if (!jePrevoditelny(soubor.name)) return nic('není bezeztrátový');

  let zvuk: AudioBuffer;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    zvuk = await ctx.decodeAudioData(await soubor.arrayBuffer());
    void ctx.close();
  } catch (e: any) {
    return nic(`nepodařilo se přečíst zvuk (${e?.message || e})`);
  }

  try {
    const kanalu = Math.min(2, zvuk.numberOfChannels);
    const kodér = new Mp3Encoder(kanalu, zvuk.sampleRate, kvalita);
    const levy = naInt16(zvuk.getChannelData(0));
    const pravy = kanalu > 1 ? naInt16(zvuk.getChannelData(1)) : undefined;

    const kusy: Uint8Array[] = [];
    // Velikost bloku doporučená kodérem. Po blocích taky proto, aby šlo
    // hlásit postup — u pětiminutové stopy to jinak vypadá jako záseknutí.
    const BLOK = 1152;
    for (let i = 0; i < levy.length; i += BLOK) {
      const l = levy.subarray(i, i + BLOK);
      const r = pravy?.subarray(i, i + BLOK);
      const data = kodér.encodeBuffer(l, r);
      if (data.length > 0) kusy.push(data);

      if (onPokrok && i % (BLOK * 200) === 0) {
        onPokrok(Math.round((i / levy.length) * 100));
        // Prohlížeč mezitím překreslí. Bez toho stránka ztuhne až do konce.
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }
    const zbytek = kodér.flush();
    if (zbytek.length > 0) kusy.push(zbytek);
    onPokrok?.(100);

    const blob = new Blob(kusy as BlobPart[], { type: 'audio/mpeg' });
    // Když by MP3 vyšlo větší (krátký nebo tichý soubor), nechá se originál.
    if (blob.size >= puvodniBajtu) return nic('MP3 by nebylo menší');

    const novyNazev = soubor.name.replace(/\.[^.]+$/, '') + '.mp3';
    return {
      soubor: new File([blob], novyNazev, { type: 'audio/mpeg' }),
      puvodniBajtu,
      noveBajtu: blob.size,
      prevedeno: true,
    };
  } catch (e: any) {
    return nic(`převod selhal (${e?.message || e})`);
  }
}
