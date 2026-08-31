import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Přepis krátkého hlasového příkazu.
 *
 * Jiná úloha než přepis textů písní, a proto jiné nastavení: jde o dvě
 * vteřiny řeči, u kterých rozhoduje odezva, ne dokonalé rozdělení na
 * verše. Odpadá tedy oddělování zpěvu, detekce hlasu i časové značky.
 *
 * Běží jen tam, kde běží server s whisperem — tedy na Macu, ne na
 * Vercelu. Členům kapely obsluhuje hlas prohlížeč; tenhle modul o tom
 * neví a jen poctivě řekne, jestli je k dispozici.
 */

const MODEL = path.resolve(process.cwd(), 'modely/ggml-large-v3-turbo-q5_0.bin');

/**
 * Adresa už načteného whisperu.
 *
 * Naměřeno na M1 Pro: `whisper-cli` spustí dvouvteřinový příkaz za
 * 1,45 s, z čehož je většina načítání modelu. Přes trvale běžící
 * `whisper-server` to je 0,99 s. Zbytek je daň za to, že whisper počítá
 * vždycky třicetivteřinové okno, ať se řekne cokoli.
 *
 * Spouští se zvlášť a je nepovinný — bez něj se sáhne po `whisper-cli`:
 *   whisper-server -m modely/ggml-large-v3-turbo-q5_0.bin -l cs --port 8178
 */
const SERVER = process.env.WHISPER_SERVER || 'http://127.0.0.1:8178';

/** Delší nahrávka není příkaz. Strop drží odezvu i zátěž na uzdě. */
export const NEJDELSI_PRIKAZ_S = 15;

export function jeHlasDostupny(): { ok: boolean; chybi: string[] } {
  const chybi: string[] = [];
  if (!existsSync(MODEL)) chybi.push('model ggml-large-v3-turbo-q5_0.bin ve složce modely/');
  return { ok: chybi.length === 0, chybi };
}

/**
 * Spustí program a vrátí oba výstupy zvlášť.
 *
 * Oddělené schválně: whisper píše přepis na stdout, ale na stderr sype
 * desítky řádků o načtených knihovnách a Metalu. Slité dohromady se to
 * nedá spolehlivě rozplést filtrem — a co proklouzne, jde rovnou do
 * porovnávání příkazů.
 */
function spust(
  program: string,
  argumenty: string[],
): Promise<{ kod: number; vystup: string; hlasky: string }> {
  return new Promise((hotovo) => {
    const proces = spawn(program, argumenty);
    let vystup = '';
    let hlasky = '';
    proces.stdout.on('data', (d) => { vystup += String(d); });
    proces.stderr.on('data', (d) => { hlasky += String(d); });
    proces.on('error', () => hotovo({ kod: -1, vystup: '', hlasky: `${program} se nepodařilo spustit` }));
    proces.on('close', (kod) => hotovo({ kod: kod ?? -1, vystup, hlasky }));
  });
}

/** Whisper čte 16 kHz mono WAV; prohlížeč posílá webm nebo ogg. */
async function naWav(vstup: string, vystup: string): Promise<void> {
  const { kod, hlasky: log } = await spust('ffmpeg', [
    '-y', '-i', vstup,
    '-t', String(NEJDELSI_PRIKAZ_S),
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
    vystup, '-loglevel', 'error',
  ]);
  if (kod !== 0) throw new Error(`Zvuk se nepodařilo převést: ${log.trim().split('\n').pop()}`);
}

/** Zkusí už načtený whisper. Vrací null, když neběží — volající sáhne po `whisper-cli`. */
async function presServer(wav: string): Promise<string | null> {
  try {
    const telo = new FormData();
    telo.append('file', new Blob([await readFile(wav)]), 'prikaz.wav');
    telo.append('language', 'cs');
    telo.append('response_format', 'json');
    // Krátká lhůta: když server neběží, nemá smysl na něj čekat —
    // `whisper-cli` mezitím stihne skoro celý přepis.
    const odpoved = await fetch(`${SERVER}/inference`, {
      method: 'POST',
      body: telo,
      signal: AbortSignal.timeout(10_000),
    });
    if (!odpoved.ok) return null;
    const data = await odpoved.json();
    return typeof data?.text === 'string' ? data.text.trim() : null;
  } catch {
    return null;
  }
}

async function presCli(wav: string): Promise<string> {
  const { kod, vystup, hlasky } = await spust('whisper-cli', [
    '-m', MODEL,
    '-f', wav,
    '-l', 'cs',
    // Bez časových značek a bez kontextu: u jedné věty není co navazovat
    // a kontext svádí model k opakování předchozího příkazu.
    '-nt', '-mc', '0',
  ]);
  if (kod !== 0) throw new Error(`Přepis selhal: ${hlasky.trim().split('\n').pop() || 'neznámá chyba'}`);
  return vystup.replace(/\s+/g, ' ').trim();
}

/**
 * Převede nahraný příkaz na text.
 *
 * Co z toho vyjde, se dál porovnává s uloženými frázemi — a protože
 * whisper na ticho a hluk vymýšlí celé věty, samotný text ještě nic
 * nespouští. To rozhoduje až porovnání v `src/services/hlas/shoda.ts`.
 */
export async function prepisPrikaz(bajty: Uint8Array, pripona = 'webm'): Promise<string> {
  const zaklad = path.join(tmpdir(), `hlas-${crypto.randomUUID()}`);
  const vstup = `${zaklad}.${pripona.replace(/[^a-z0-9]/gi, '') || 'webm'}`;
  const wav = `${zaklad}.wav`;
  try {
    await writeFile(vstup, bajty);
    await naWav(vstup, wav);
    return (await presServer(wav)) ?? (await presCli(wav));
  } finally {
    await rm(vstup, { force: true }).catch(() => {});
    await rm(wav, { force: true }).catch(() => {});
  }
}
