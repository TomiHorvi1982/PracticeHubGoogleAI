// r2.ts — přístup k úložišti Cloudflare R2.
//
// Soubory kapely (stopy, taby, vzorky bicích, fotky) leží v R2, ne
// v Supabase Storage: Supabase má ve volném tarifu 1 GB, R2 deset a navíc
// neúčtuje přenos dat ven. Databáze, přihlašování a rejstříky zůstávají
// v Supabase.
//
// Bucket je soukromý. Ven se vydávají jen podepsané odkazy s omezenou
// platností — ověřeno, že bez podpisu R2 požadavek odmítne.
//
// Tenhle modul běží VÝHRADNĚ na serveru. Podepisování vyžaduje tajný klíč,
// takže se nesmí dostat do kódu, který jde do prohlížeče. Proto se
// proměnné nejmenují `VITE_*` — cokoliv s tou předponou Vite zapeče do
// balíčku staženého každým návštěvníkem.

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Proměnné se čtou až při použití, ne při načtení modulu.
 *
 * Importy se v ES modulech vyhodnotí dřív než tělo souboru, který je
 * importuje — tedy i dřív než `dotenv.config()` v server.ts. Kdyby se
 * hodnoty přečetly rovnou tady, byly by při běhu z `.env` vždycky prázdné
 * a R2 by se tvářilo jako nenastavené, i když nastavené je. Na Vercelu,
 * kde proměnné přicházejí z prostředí, by to naopak fungovalo — což je
 * přesně ten druh rozdílu mezi lokálem a produkcí, který se hledá těžko.
 */
const env = () => ({
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
});

export const R2_BUCKET_NAME = () => process.env.R2_BUCKET || 'neverlate-studio';

/** `false`, když R2 není nakonfigurované — volající pak sáhne po Supabase. */
export function isR2Configured(): boolean {
  const e = env();
  return Boolean(e.accountId && e.accessKeyId && e.secretAccessKey);
}

let client: S3Client | null = null;

export function r2(): S3Client {
  const e = env();
  if (!e.accountId || !e.accessKeyId || !e.secretAccessKey) {
    throw new Error('R2 není nastavené — chybí R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${e.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: e.accessKeyId, secretAccessKey: e.secretAccessKey },
    });
  }
  return client;
}

/**
 * Podepsaná adresa ke stažení. Výchozích 12 hodin je kompromis: zkouška
 * kapely na jeden odkaz dojede, ale zatoulaná adresa nezůstane použitelná
 * navěky.
 */
export async function signedDownloadUrl(key: string, expiresIn = 60 * 60 * 12): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET_NAME(), Key: key }), { expiresIn });
}

/**
 * Podepsaná adresa pro nahrání přímo do R2.
 *
 * Použitelná jen tam, kde má koš povolený CORS pro náš původ — jinak
 * prohlížeč požadavek odmítne. Dokud to nastavené není, jde nahrávání
 * přes server, který CORS neřeší.
 */
export async function signedUploadUrl(
  key: string,
  contentType?: string,
  expiresIn = 60 * 15
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME(), Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export async function uploadObject(key: string, body: Uint8Array | Buffer, contentType?: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME(), Key: key }));
}

/** Velikost objektu, nebo `null` když v bucketu není. Slouží k ověření přenosu. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME(), Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

/**
 * Stáhne objekt na server.
 *
 * Slouží tomu, aby soubory mohl prohlížeči podávat náš vlastní server.
 * Podepsaný odkaz vede přímo do R2, tedy na cizí doménu, a `fetch` na ni
 * potřebuje povolený původ. Ten se musí ručně dopsat do nastavení bucketu
 * pro každou adresu, ze které se appka spustí — včetně náhodných portů
 * vývojového serveru. Když bajty projdou přes náš server, žádné povolování
 * není potřeba, protože jde o stejný původ jako appka.
 */
export async function getObjectBytes(
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  try {
    const out = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME(), Key: key })
    );
    if (!out.Body) return null;
    const chunks: Uint8Array[] = [];
    // @ts-expect-error tělo je v Node.js čitelný proud
    for await (const chunk of out.Body) chunks.push(chunk);
    const celkem = chunks.reduce((n, c) => n + c.length, 0);
    const body = new Uint8Array(celkem);
    let pozice = 0;
    for (const c of chunks) {
      body.set(c, pozice);
      pozice += c.length;
    }
    return { body, contentType: out.ContentType };
  } catch {
    return null;
  }
}
