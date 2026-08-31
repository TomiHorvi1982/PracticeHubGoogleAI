/**
 * Veřejná adresa aplikace pro pozvánky.
 *
 * Adresa v pozvánce nesmí být ta, kde zrovna sedí správce. Když pozvánku
 * vyrábí na localhostu, pozvaný by dostal odkaz na localhost a nikam se
 * nedostal. Proto se bere v tomhle pořadí:
 *
 *  1. `APP_URL` — jediné, co platí i při práci z vlastního stroje.
 *  2. doména, kterou o sobě hlásí Vercel.
 *  3. odkud požadavek přišel — na produkci to vyjde správně samo,
 *     protože správce tam appku obsluhuje na její vlastní doméně.
 *
 * Oddělené od `server.ts`, aby šlo ověřit každou větev zvlášť.
 */
export interface ZdrojeAdresy {
  appUrl?: string;
  vercelProductionUrl?: string;
  vercelUrl?: string;
  origin?: string;
  host?: string;
  protocol?: string;
}

function bezLomitka(s: string): string {
  return s.replace(/\/+$/, '');
}

export function verejnaAdresa(z: ZdrojeAdresy): string {
  const zEnv = String(z.appUrl || '').trim();
  if (/^https?:\/\//.test(zEnv)) return bezLomitka(zEnv);

  const zVercelu = String(z.vercelProductionUrl || z.vercelUrl || '').trim();
  if (zVercelu) return `https://${bezLomitka(zVercelu.replace(/^https?:\/\//, ''))}`;

  const puvod = String(z.origin || '').trim();
  if (/^https?:\/\//.test(puvod)) return bezLomitka(puvod);

  const host = String(z.host || '').trim();
  return host ? `${z.protocol || 'https'}://${host}` : '';
}
