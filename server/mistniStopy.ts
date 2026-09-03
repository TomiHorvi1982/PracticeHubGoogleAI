/**
 * Čtení stop, které vyexportoval separátor na disku.
 *
 * Neural Mix Pro rozseparuje skladbu za pár vteřin a odloží stopy do
 * složky. Tenhle modul z té složky udělá seznam skladeb, aby si je
 * mixážní pult mohl pověsit na fadery, aniž by musely projít databází.
 *
 * Rozhodovací část je schválně bez `fs`: hádání role z názvu je to
 * jediné, co se tu může splést, a testovat to proti opravdovému disku
 * by znamenalo pokládat tam soubory.
 */

import path from 'node:path';
import fs from 'node:fs';

/** Přípony, které umí přehrát prohlížeč (wav kvůli exportu z Neural Mixu). */
export const ZVUKOVE_PRIPONY = ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.aiff', '.aif'];

export { rolePodleNazvu, nazevBezRole } from '../src/services/roleStop';
import { rolePodleNazvu, nazevBezRole } from '../src/services/roleStop';

export interface MistniSoubor { jmeno: string; cesta: string; velikost: number }
export interface MistniSkladba {
  nazev: string;
  stopy: { role: string | null; jmeno: string; cesta: string; velikost: number }[];
}

/**
 * Poskládá soubory do skladeb.
 *
 * Podsložka je skladba sama o sobě; soubory ležící volně se spojují
 * podle názvu před štítkem stopy. Obojí naráz proto, že separátor umí
 * sypat všechno do jedné složky i zakládat podsložky, a uživatel si
 * mezi tím může kdykoli přepnout.
 */
export function seskupDoSkladeb(soubory: MistniSoubor[]): MistniSkladba[] {
  const podle = new Map<string, MistniSkladba>();
  for (const s of soubory) {
    // Podsložka vyhrává nad názvem souboru: když si ji uživatel založil,
    // řekl tím, co k sobě patří, líp než jakékoli hádání z názvu.
    const lomitko = s.cesta.lastIndexOf('/');
    const podslozka = lomitko > 0 ? s.cesta.slice(0, lomitko) : '';
    const zNazvu = nazevBezRole(s.jmeno);
    const nazev = podslozka || zNazvu || '(bez názvu)';
    let sk = podle.get(nazev);
    if (!sk) { sk = { nazev, stopy: [] }; podle.set(nazev, sk); }
    sk.stopy.push({ role: rolePodleNazvu(s.jmeno), jmeno: s.jmeno, cesta: s.cesta, velikost: s.velikost });
  }
  return [...podle.values()].sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Je to zvuk, o který stojíme? */
export function jeZvuk(jmeno: string): boolean {
  const i = jmeno.lastIndexOf('.');
  return i > 0 && ZVUKOVE_PRIPONY.includes(jmeno.slice(i).toLowerCase());
}

/**
 * Nepustí ven ze složky se stopami.
 *
 * Cesta chodí z prohlížeče, takže „../../.ssh/id_rsa" je otázka času.
 * Vrací se `null`, cokoli míří jinam než dovnitř kořene.
 */
export function bezpecnaCesta(koren: string, relativni: string): string | null {
  if (!relativni || relativni.includes('\0')) return null;
  const cil = path.resolve(koren, relativni);
  const k = path.resolve(koren);
  if (cil !== k && !cil.startsWith(k + path.sep)) return null;
  return cil;
}

/**
 * Rozebere hlavičku `Range` na meze.
 *
 * Wav ze separátoru má klidně čtyřicet megabajtů a prohlížeč si při
 * posunu v mixu říká o kus zprostředka. Vrací `null`, když hlavička
 * chybí nebo jí nerozumíme (pošle se celý soubor), a `'mimo'`, když
 * ukazuje za konec — na to se odpovídá 416, ne oříznutím, jinak by
 * přehrávač dostal jiná data, než o která si řekl.
 */
export function rozsahZHlavicky(
  hlavicka: string | undefined,
  velikost: number,
): { od: number; do: number } | 'mimo' | null {
  if (!hlavicka) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(hlavicka.trim());
  if (!m || (!m[1] && !m[2])) return null;
  // „bytes=-500" znamená posledních 500 bajtů, ne prvních 500.
  if (!m[1]) {
    const kolik = parseInt(m[2], 10);
    if (!Number.isFinite(kolik) || kolik <= 0) return 'mimo';
    return { od: Math.max(0, velikost - kolik), do: velikost - 1 };
  }
  const od = parseInt(m[1], 10);
  const do_ = m[2] ? parseInt(m[2], 10) : velikost - 1;
  if (!Number.isFinite(od) || !Number.isFinite(do_)) return null;
  if (od >= velikost || od > do_) return 'mimo';
  return { od, do: Math.min(do_, velikost - 1) };
}

/**
 * Projde složku se stopami.
 *
 * Kouká do kořene a o patro níž. Hlouběji schválně ne: složka bývá
 * sdílená s jinými nástroji, které si tam drží vlastní knihovny
 * vzorků, a ty do mixážního pultu nepatří. Skryté složky (`.samples`
 * a spol.) se přeskakují ze stejného důvodu.
 */
export function projdiStopy(koren: string): MistniSoubor[] {
  const nalezene: MistniSoubor[] = [];
  let vrchni: fs.Dirent[];
  try {
    vrchni = fs.readdirSync(koren, { withFileTypes: true });
  } catch {
    return nalezene;
  }
  for (const p of vrchni) {
    if (p.name.startsWith('.')) continue;
    if (p.isFile() && jeZvuk(p.name)) {
      try {
        const st = fs.statSync(path.join(koren, p.name));
        nalezene.push({ jmeno: p.name, cesta: p.name, velikost: st.size });
      } catch { /* soubor zmizel mezi výpisem a dotazem */ }
    } else if (p.isDirectory()) {
      let uvnitr: fs.Dirent[];
      try {
        uvnitr = fs.readdirSync(path.join(koren, p.name), { withFileTypes: true });
      } catch { continue; }
      for (const q of uvnitr) {
        if (q.name.startsWith('.') || !q.isFile() || !jeZvuk(q.name)) continue;
        try {
          const st = fs.statSync(path.join(koren, p.name, q.name));
          nalezene.push({ jmeno: q.name, cesta: `${p.name}/${q.name}`, velikost: st.size });
        } catch { /* totéž */ }
      }
    }
  }
  return nalezene;
}
