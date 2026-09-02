import { spawn } from 'node:child_process';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Vytažení textu z PDF.
 *
 * U tabulatury je rozhodující `-layout`: bez něj pdftotext slije sloupce
 * a z tabu zbude nečitelná změť, protože jeho význam je právě ve
 * svislém zarovnání. S ním zůstanou pomlčky a čísla tam, kde byly.
 *
 * Když v PDF žádná textová vrstva není — je to sken nebo obrázek —
 * sáhne se po rozpoznávání znaků. To u tabulatury chybuje a volající
 * to musí říct dál, ne se tvářit, že je výsledek stejně jistý.
 */

export type ZpusobCteni = 'text' | 'ocr';

export interface VytazenyText {
  text: string;
  zpusob: ZpusobCteni;
  stran: number;
}

function spust(program: string, argumenty: string[]): Promise<{ kod: number; vystup: string; hlasky: string }> {
  return new Promise((hotovo) => {
    // Bez shellu: cesty a přepínače jdou jako pole, takže se do nich
    // nedá nic podstrčit.
    const proces = spawn(program, argumenty);
    let vystup = '';
    let hlasky = '';
    proces.stdout.on('data', (d) => { vystup += String(d); });
    proces.stderr.on('data', (d) => { hlasky += String(d); });
    proces.on('error', () => hotovo({ kod: -1, vystup: '', hlasky: `${program} se nepodařilo spustit` }));
    proces.on('close', (kod) => hotovo({ kod: kod ?? -1, vystup, hlasky }));
  });
}

/** Kolik stran PDF má — a zároveň ověření, že je to vůbec PDF. */
async function pocetStran(soubor: string): Promise<number> {
  const { kod, vystup } = await spust('pdfinfo', [soubor]);
  if (kod !== 0) throw new Error('Tohle nevypadá jako PDF.');
  return Number(/Pages:\s*(\d+)/.exec(vystup)?.[1]) || 0;
}

/**
 * Přečte PDF a vrátí text i s tím, jak se k němu došlo.
 *
 * Strop na počet stran je proti omylu: kdo omylem vloží stostránkovou
 * knihu, nemá čekat minuty na rozpoznávání znaků.
 */
export async function textZPdf(bajty: Uint8Array, nejvyseStran = 20): Promise<VytazenyText> {
  const zaklad = path.join(tmpdir(), `tab-${crypto.randomUUID()}`);
  const pdf = `${zaklad}.pdf`;
  const txt = `${zaklad}.txt`;

  try {
    await writeFile(pdf, bajty);
    const stran = await pocetStran(pdf);
    if (stran > nejvyseStran) {
      throw new Error(`PDF má ${stran} stran. Vlož jen tu část s tabulaturou, nejvýš ${nejvyseStran}.`);
    }

    // `-layout` drží sloupce; bez něj je tabulatura k ničemu.
    const { kod } = await spust('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, txt]);
    if (kod === 0) {
      const text = await readFile(txt, 'utf8').catch(() => '');
      // Pár znaků znamená, že textová vrstva chybí a jde o sken.
      if (text.trim().length > 40) return { text, zpusob: 'text', stran };
    }

    /**
     * Sken: rozpoznávání znaků.
     *
     * `--psm 6` bere stránku jako jeden souvislý blok. U tabulatury to
     * drží řádky pohromadě líp než výchozí režim, který se snaží hledat
     * odstavce a tab mu do nich nezapadá.
     */
    const ocr = await spust('tesseract', [pdf, zaklad, '--psm', '6', '-l', 'eng']);
    if (ocr.kod !== 0) {
      throw new Error('Text se z PDF nepodařilo přečíst ani rozpoznáváním znaků.');
    }
    const rozpoznany = await readFile(txt, 'utf8').catch(() => '');
    if (!rozpoznany.trim()) throw new Error('V PDF se nenašel žádný text.');
    return { text: rozpoznany, zpusob: 'ocr', stran };
  } finally {
    await rm(pdf, { force: true }).catch(() => {});
    await rm(txt, { force: true }).catch(() => {});
  }
}
