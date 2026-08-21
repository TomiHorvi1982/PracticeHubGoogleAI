import { authService } from './authService';

/**
 * Podepsané odkazy na soubory kapely.
 *
 * Soubory leží v Cloudflare R2. Podepsat odkaz vyžaduje tajný klíč, který
 * v prohlížeči být nesmí, takže se o podpis žádá server. Ten zvládne obojí —
 * R2 i zbylé soubory v Supabase Storage — takže volající nemusí řešit,
 * kde soubor je.
 *
 * Odkazy mají omezenou platnost, proto se drží krátkodobá paměť: v rámci
 * jednoho sezení se stejný soubor nepodepisuje pořád dokola, ale po
 * vypršení se vyžádá znovu.
 */

export interface FileRef {
  bucket: string;
  path: string;
}

const klic = (r: FileRef) => `${r.bucket}/${r.path}`;

/** Doba, po kterou se odkaz drží v paměti — o něco kratší než jeho platnost. */
const PLATNOST_MS = 10 * 60 * 60 * 1000;

const cache = new Map<string, { url: string; do: number }>();

async function podepsat(refs: FileRef[]): Promise<Record<string, string>> {
  const token = authService.getCurrentSession()?.token;
  const res = await fetch('/api/files/sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ items: refs }),
  });
  if (!res.ok) {
    throw new Error(`Podepsání odkazů selhalo (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return data?.urls || {};
}

export const fileUrlService = {
  /**
   * Odkazy pro celou dávku najednou. Vrací mapu `bucket/path -> url`;
   * soubor, který se podepsat nepodařilo, v mapě prostě není — volající
   * pak může říct proč, místo aby ukázal rozbitý odkaz.
   *
   * Server bere nejvýš 200 souborů na dotaz, delší seznam se rozdělí.
   */
  async getMany(refs: FileRef[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ted = Date.now();
    const chybejici: FileRef[] = [];

    for (const r of refs) {
      const k = klic(r);
      const z = cache.get(k);
      if (z && z.do > ted) out.set(k, z.url);
      else chybejici.push(r);
    }
    if (chybejici.length === 0) return out;

    const DAVKA = 200;
    for (let i = 0; i < chybejici.length; i += DAVKA) {
      try {
        const urls = await podepsat(chybejici.slice(i, i + DAVKA));
        for (const [k, url] of Object.entries(urls)) {
          cache.set(k, { url: url as string, do: ted + PLATNOST_MS });
          out.set(k, url as string);
        }
      } catch (e: any) {
        console.warn('[fileUrl] ', e?.message);
      }
    }
    return out;
  },

  /** Odkaz na jeden soubor, nebo `null` když ho nejde podepsat. */
  async getOne(bucket: string, path: string): Promise<string | null> {
    const m = await this.getMany([{ bucket, path }]);
    return m.get(`${bucket}/${path}`) || null;
  },

  /** Zapomene uložené odkazy — po odhlášení, aby nezůstaly platné v paměti. */
  clear() {
    cache.clear();
  },
};
