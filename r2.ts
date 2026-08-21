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

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET || 'neverlate-studio';

/** `false`, když R2 není nakonfigurované — volající pak sáhne po Supabase. */
export const isR2Configured = Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

let client: S3Client | null = null;

export function r2(): S3Client {
  if (!isR2Configured) {
    throw new Error('R2 není nastavené — chybí R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
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
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn });
}

export async function uploadObject(key: string, body: Uint8Array | Buffer, contentType?: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/** Velikost objektu, nebo `null` když v bucketu není. Slouží k ověření přenosu. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}
