import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Přepis zpívaného textu z nahrávky.
 *
 * Běží celé na tomhle stroji: `whisper.cpp` s modelem large-v3-turbo přes
 * Metal, před ním `demucs`, když je potřeba vytáhnout zpěv z mixu. Ven
 * neodchází nic — nahrávky kapely nemají co dělat na cizím serveru.
 *
 * Oddělení zpěvu není zbytečná pečlivost. Whisper je trénovaný na řeč a
 * přes plnou kapelu si domýšlí věty, které v písni nezazněly; nad čistou
 * vokálovou stopou přepisuje to, co tam opravdu je. Když stopa v knihovně
 * už leží, separace se přeskočí — je to nejdražší část celého řetězu.
 */

export interface UsekPrepisu {
  /** Milisekundy od začátku nahrávky. */
  zacatek: number;
  konec: number;
  text: string;
}

export type FazePrepisu = 'priprava' | 'vokal' | 'prepis' | 'hotovo' | 'chyba';

export interface StavPrepisu {
  faze: FazePrepisu;
  /** 0 až 100 v rámci celého přepisu. */
  postup: number;
  zprava: string;
  useky: UsekPrepisu[];
  chyba: string | null;
}

export interface NastaveniPrepisu {
  /** Vytáhnout zpěv z mixu, než se začne přepisovat. */
  oddelitVokal: boolean;
  jazyk: string;
}

type Hlaseni = (s: Partial<StavPrepisu>) => void;

const MODEL = path.resolve(process.cwd(), 'modely/ggml-large-v3-turbo-q5_0.bin');
/**
 * Detekce hlasu.
 *
 * Bez ní model přes instrumentální předehru mlčet neumí — vyplní ji
 * větou, kterou nikdo nezazpíval. Na téhle nahrávce vyrobil „I don't
 * know." roztaženo přes třicet vteřin sóla. S VAD se ticho přeskočí a
 * přepisují se jen úseky, kde někdo opravdu zpívá.
 */
const MODEL_VAD = path.resolve(process.cwd(), 'modely/ggml-silero-v5.1.2.bin');

/**
 * Kolik z celkového postupu zabere která fáze.
 *
 * Oddělení zpěvu trvá řádově déle než samotný přepis, takže dělit postup
 * napůl by znamenalo ukazatel, který se první tři minuty nehne a pak
 * skočí.
 */
const PODIL_VOKALU = 0.75;

export function jePrepisDostupny(): { ok: boolean; chybi: string[] } {
  const chybi: string[] = [];
  if (!existsSync(MODEL)) chybi.push('model ggml-large-v3-turbo-q5_0.bin ve složce modely/');
  return { ok: chybi.length === 0, chybi };
}

/** Spustí program a vrátí jeho výstup; průběžné řádky posílá dál. */
function spust(
  program: string,
  argumenty: string[],
  naRadek?: (radek: string) => void
): Promise<{ kod: number; vystup: string }> {
  return new Promise((hotovo, selhalo) => {
    const proces = spawn(program, argumenty);
    let vystup = '';

    const cti = (data: Buffer) => {
      const kus = data.toString();
      vystup += kus;
      if (naRadek) {
        // Demucs kreslí ukazatel návraty vozíku, ne novými řádky —
        // bez rozdělení i na ně by z něj nepřišlo nic.
        for (const radek of kus.split(/[\r\n]/)) if (radek.trim()) naRadek(radek);
      }
    };

    proces.stdout.on('data', cti);
    proces.stderr.on('data', cti);
    proces.on('error', (e) => selhalo(new Error(`${program} nejde spustit: ${e.message}`)));
    proces.on('close', (kod) => hotovo({ kod: kod ?? -1, vystup }));
  });
}

/** Převede cokoli na to, co whisper.cpp umí přečíst: 16 kHz mono WAV. */
async function naWav(vstup: string, vystup: string): Promise<void> {
  const { kod, vystup: log } = await spust('ffmpeg', [
    '-y', '-i', vstup, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', vystup, '-loglevel', 'error',
  ]);
  if (kod !== 0) throw new Error(`Převod audia selhal: ${log.trim().split('\n').pop()}`);
}

/**
 * Vytáhne z nahrávky zpěv.
 *
 * Dělí se jen na dvě stopy místo čtyř — zbytek kapely nás nezajímá a
 * čtyřstopá separace trvá zbytečně dlouho.
 */
async function oddelZpev(vstup: string, slozka: string, hlas: Hlaseni): Promise<string> {
  const { kod, vystup } = await spust(
    'demucs',
    ['--two-stems', 'vocals', '-n', 'htdemucs', '-o', slozka, vstup],
    (radek) => {
      const shoda = radek.match(/(\d+)%/);
      if (shoda) {
        hlas({
          faze: 'vokal',
          postup: Math.round(Number(shoda[1]) * PODIL_VOKALU),
          zprava: `Odděluju zpěv od kapely — ${shoda[1]} %`,
        });
      }
    }
  );
  if (kod !== 0) {
    throw new Error(`Oddělení zpěvu selhalo: ${vystup.trim().split('\n').pop() || 'neznámá chyba'}`);
  }

  const zaklad = path.basename(vstup, path.extname(vstup));
  const cesta = path.join(slozka, 'htdemucs', zaklad, 'vocals.wav');
  if (!existsSync(cesta)) throw new Error('Demucs doběhl, ale vokálovou stopu nevyrobil.');
  return cesta;
}

/** Přepíše připravený WAV. */
async function prepisWav(
  wav: string,
  slozka: string,
  jazyk: string,
  odkud: number,
  hlas: Hlaseni
): Promise<UsekPrepisu[]> {
  const zaklad = path.join(slozka, 'prepis');
  const { kod, vystup } = await spust(
    'whisper-cli',
    [
      '-m', MODEL,
      '-f', wav,
      '-l', jazyk,
      '-oj', '-of', zaklad,
      '-pp',
      // Bez kontextu z předchozích úseků. Zpěv má opakující se refrény a
      // s kontextem se model do jednoho z nich zacyklí a píše ho dokola.
      '-mc', '0',
      '-sns',
      // Krátké úseky po verších, ne bloky přes celou sloku. Detekce hlasu
      // jinak spojí všechno mezi dvěma pauzami do jednoho záznamu a
      // z časů nezbude nic, s čím by se dal text pustit vedle přehrávače.
      '-ml', '70', '-sow',
      // VAD je volitelný: bez modelu se přepisuje postaru, jen s větším
      // rizikem vymyšlených vět v instrumentálních pasážích.
      ...(existsSync(MODEL_VAD)
        ? ['--vad', '-vm', MODEL_VAD, '-vsd', '400', '-vp', '150']
        : []),
      // Dvě jádra se nechávají serveru, ať appka během přepisu nezamrzne.
      '-t', String(Math.max(2, Math.min(8, cpus().length - 2))),
    ],
    (radek) => {
      const shoda = radek.match(/progress\s*=\s*(\d+)%/);
      if (shoda) {
        const v = Number(shoda[1]);
        hlas({
          faze: 'prepis',
          postup: Math.round(odkud + (v / 100) * (100 - odkud)),
          zprava: `Přepisuju text — ${v} %`,
        });
      }
    }
  );
  if (kod !== 0) {
    throw new Error(`Přepis selhal: ${vystup.trim().split('\n').pop() || 'neznámá chyba'}`);
  }

  const syrove = JSON.parse(await readFile(`${zaklad}.json`, 'utf8'));
  const useky: UsekPrepisu[] = (syrove.transcription || [])
    .map((s: any) => ({
      zacatek: Number(s.offsets?.from ?? 0),
      konec: Number(s.offsets?.to ?? 0),
      text: String(s.text || '').trim(),
    }))
    .filter((u: UsekPrepisu) => u.text.length > 0);

  return sluc(useky);
}

/**
 * Spojí úseky, které patří k sobě, a vyhodí opakování.
 *
 * Whisper se nad hudbou občas zasekne a napíše tentýž řádek pětkrát za
 * sebou. Tři a víc stejných řádků po sobě je vždycky chyba modelu, ne
 * refrén — ten se v písni opakuje po slokách, ne po dvou vteřinách.
 */
export function sluc(useky: UsekPrepisu[]): UsekPrepisu[] {
  const ven: UsekPrepisu[] = [];
  for (const u of useky) {
    // Dlouhé ticho popsané pár slovy je vymyšlená věta, ne zpěv. Nikdo
    // nezpívá třináct písmen přes půl minuty; model tak vyplňuje mezery,
    // kde hraje jen kapela.
    if (u.konec - u.zacatek > 6000 && u.text.length < 25) continue;

    const posledni = ven[ven.length - 1];
    if (posledni && posledni.text === u.text && u.zacatek - posledni.konec < 2000) {
      posledni.konec = u.konec;
      continue;
    }
    ven.push({ ...u });
  }
  return ven;
}

/**
 * Celý řetěz od souboru k řádkům textu.
 *
 * `vstup` je cesta k audiu na disku; volající si ho stáhne, kam potřebuje.
 */
export async function prepisSoubor(
  vstup: string,
  nastaveni: NastaveniPrepisu,
  hlas: Hlaseni
): Promise<UsekPrepisu[]> {
  const dostupnost = jePrepisDostupny();
  if (!dostupnost.ok) throw new Error(`Přepis není připravený — chybí ${dostupnost.chybi.join(', ')}.`);

  const slozka = await mkdtemp(path.join(tmpdir(), 'neverlate-prepis-'));
  try {
    hlas({ faze: 'priprava', postup: 2, zprava: 'Připravuju nahrávku…' });

    let kPrepisu = vstup;
    let odkud = 5;

    if (nastaveni.oddelitVokal) {
      hlas({ faze: 'vokal', postup: 5, zprava: 'Odděluju zpěv od kapely…' });
      kPrepisu = await oddelZpev(vstup, slozka, hlas);
      odkud = Math.round(PODIL_VOKALU * 100);
    }

    const wav = path.join(slozka, 'vstup.wav');
    await naWav(kPrepisu, wav);

    hlas({ faze: 'prepis', postup: odkud, zprava: 'Přepisuju text…' });
    return await prepisWav(wav, slozka, nastaveni.jazyk, odkud, hlas);
  } finally {
    await rm(slozka, { recursive: true, force: true }).catch(() => {});
  }
}

/** Uloží bajty do dočasného souboru, ať je co podat ffmpegu. */
export async function docasnySoubor(bajty: Uint8Array, nazev: string): Promise<{ cesta: string; uklid: () => Promise<void> }> {
  const slozka = await mkdtemp(path.join(tmpdir(), 'neverlate-audio-'));
  const cesta = path.join(slozka, nazev.replace(/[^\w.\-]/g, '_') || 'audio');
  await writeFile(cesta, bajty);
  return { cesta, uklid: () => rm(slozka, { recursive: true, force: true }).catch(() => {}) };
}
