/**
 * Čeština v textech písní: slabiky a rýmy.
 *
 * Pravidla, ne data — počítá se v prohlížeči při psaní, takže tenhle
 * soubor schválně nic neimportuje. Kdyby si přitáhl přihlášení nebo
 * databázi, nešel by spustit ani ověřit bez celé aplikace kolem.
 */

const SAMOHLASKY = 'aáeéěiíoóuúůyý';

/**
 * Vyhodí z řádku všechno, co se nezpívá.
 *
 * Akordy v hranatých závorkách a časy ve složených jsou poznámky pro
 * hráče, ne slova písně. Počítat je do slabik by znamenalo, že se řádek
 * s akordy tváří jako delší, než jak se zpívá.
 */
function bezZnacek(radek: string): string {
  return radek.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
}

/**
 * Kolik má řádek slabik.
 *
 * Slabika je jádro, ne písmeno: souvislá skupina samohlásek se počítá za
 * jednu, protože „ou" ani „au" se nezpívá na dvě doby. Slova úplně bez
 * samohlásky mají slabičné r nebo l — „vlk", „krk", „smrt" — a bez nich
 * by vyšla nula tam, kde se zpívá.
 *
 * Je to odhad, ne pravidlo. U textu je potřeba vědět, jestli má řádek
 * osm slabik nebo jedenáct; na desetinu slabiky nikdo nehraje.
 */
export function slabiky(radek: string): number {
  const slova = bezZnacek(radek).toLowerCase().split(/[^a-záčďéěíňóřšťúůýž]+/i).filter(Boolean);
  let celkem = 0;

  for (const slovo of slova) {
    let vSlove = 0;
    let vSkupine = false;
    for (const znak of slovo) {
      const jeSamohlaska = SAMOHLASKY.includes(znak);
      if (jeSamohlaska && !vSkupine) vSlove++;
      vSkupine = jeSamohlaska;
    }
    // Slabičné r/l: „prst" má jednu slabiku, ne žádnou.
    if (vSlove === 0) vSlove = (slovo.match(/[rl]/g) || []).length || 1;
    celkem += vSlove;
  }
  return celkem;
}

/** Poslední slovo řádku — na něm rým stojí. */
export function posledniSlovo(radek: string): string {
  const slova = bezZnacek(radek).trim().split(/[^a-záčďéěíňóřšťúůýž]+/i).filter(Boolean);
  return (slova[slova.length - 1] || '').toLowerCase();
}

/**
 * Zvuková koncovka slova, na které rým stojí.
 *
 * Klíč je poslední samohláska a všechno za ní; u víceslabičných slov se
 * před ni přidá ještě jedna souhláska. Obojí je potřeba: kdyby se braly
 * jen koncovky, rýmovalo by se všechno, co končí na „-í", a kdyby se
 * bral celý předposlední slabičný celek, nerýmovalo by se „kouří" s
 * „moří" — což každý zpěvák použije.
 *
 * „ů" a „ú" jsou tentýž zvuk, takže se sjednotí; jinak by se „dům"
 * nerýmoval s ničím psaným přes „ú".
 */
export function rymovyKlic(slovo: string): string {
  const s = slovo.toLowerCase().replace(/ů/g, 'ú');
  const pozice: number[] = [];
  for (let i = 0; i < s.length; i++) if (SAMOHLASKY.includes(s[i])) pozice.push(i);
  if (!pozice.length) return s.slice(-2);

  // Začátek poslední skupiny samohlásek — „ou" je jedna, ne dvě.
  let od = pozice[pozice.length - 1];
  while (od > 0 && SAMOHLASKY.includes(s[od - 1])) od--;

  // Jednoslabičné slovo souhlásku před sebou nepřibírá — jinak by se
  // rým lišil podle prvního písmene a nenašel by se žádný.
  const slabicne = pozice.filter((p, i) => i === 0 || p !== pozice[i - 1] + 1).length;
  if (slabicne >= 2 && od > 0) od--;

  return s.slice(od);
}

/** Rýmují se dvě slova? Stejné slovo se za rým nepočítá. */
export function rymuje(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  return rymovyKlic(a) === rymovyKlic(b);
}

/**
 * Schéma rýmů: A B A B, A A B B a tak dál.
 *
 * Ukazuje se, aby bylo vidět, co se rozpadlo — v rozepsané sloce se
 * ztratí i to, co člověk sám před chvílí napsal. Řádek bez dvojice
 * dostane tečku, ne písmeno; písmeno by tvrdilo, že se něčemu rýmuje.
 */
export function schemaRymu(radky: string[]): string[] {
  const klice = radky.map((r) => (r.trim() ? rymovyKlic(posledniSlovo(r)) : ''));
  const skupiny = new Map<string, number[]>();
  klice.forEach((k, i) => {
    if (!k) return;
    const seznam = skupiny.get(k) || [];
    seznam.push(i);
    skupiny.set(k, seznam);
  });

  const znacky = new Array(radky.length).fill('·');
  let pismeno = 0;
  for (const [, indexy] of skupiny) {
    if (indexy.length < 2) continue;
    const znak = String.fromCharCode(65 + (pismeno % 26));
    pismeno++;
    for (const i of indexy) znacky[i] = znak;
  }
  return znacky;
}

/**
 * Co se rýmuje se zadaným slovem.
 *
 * Hledá se ve vlastních textech — v tom, co kapela zpívá. Stažený
 * rýmový slovník by nabízel spisovná slova, která si do písně nikdo
 * nedá; tady se vrací slovník, který si člověk sám napsal.
 */
export function najdiRymy(slovo: string, korpus: string[], kolik = 24): string[] {
  const cil = slovo.toLowerCase();
  if (!cil) return [];
  const klic = rymovyKlic(cil);
  const cetnost = new Map<string, number>();

  for (const text of korpus) {
    for (const s of text.toLowerCase().split(/[^a-záčďéěíňóřšťúůýž]+/i)) {
      if (s.length < 2 || s === cil) continue;
      if (rymovyKlic(s) !== klic) continue;
      cetnost.set(s, (cetnost.get(s) || 0) + 1);
    }
  }

  return [...cetnost.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs'))
    .slice(0, kolik)
    .map(([s]) => s);
}

/** Čas ve tvaru 1:23. */
export function cas(ms: number): string {
  const v = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}
