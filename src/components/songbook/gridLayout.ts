import { ModuleConfig } from '../SongModularWorkspace';

/**
 * Převod mezi sestavou modulů a mřížkou.
 *
 * Plocha běží na react-grid-layout, který pracuje se souřadnicemi. Sestava
 * uložená u písně je ale popsaná slovy („1/2 na šířku", „střední výška") a
 * takové zůstanou i sestavy uložené dřív. Tenhle soubor je jediné místo,
 * kde se ty dva světy potkávají.
 */

export interface Pozice {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SLOUPCU = 12;
export const VYSKA_RADKU = 40;
export const MEZERA: [number, number] = [16, 16];

/** Šířka ve sloupcích. Sestavy z dřívějška ji mají popsanou zlomkem. */
function sloupcu(m: ModuleConfig): number {
  if (m.customColSpan) return Math.min(SLOUPCU, m.customColSpan);
  switch (m.width) {
    case '1/3': return 4;
    case '1/2': return 6;
    case '2/3': return 8;
    default: return SLOUPCU;
  }
}

/**
 * Výška v řádcích mřížky. Řádek má 40 px a mezi řádky je 16 px mezera,
 * takže `h` řádků zabere `h*40 + (h-1)*16` pixelů — pět řádků je 264 px,
 * což odpovídá dosavadní „malé" výšce.
 */
function radku(m: ModuleConfig): number {
  if (m.customHeight) return Math.max(3, Math.round((m.customHeight + MEZERA[1]) / (VYSKA_RADKU + MEZERA[1])));
  switch (m.height) {
    case 'sm': return 5;
    case 'lg': return 11;
    case 'auto': return 6;
    default: return 7;
  }
}

/**
 * Rozvržení pro mřížku.
 *
 * Modul s uloženou pozicí ji dostane zpátky. Ostatní se skládají zleva
 * doprava podle pořadí a zalamují se, až se do řádku nevejdou — díky tomu
 * sestava z doby před mřížkou vypadá stejně jako předtím, místo aby se
 * všechny moduly svalily na sebe.
 */
export function naRozvrzeni(moduly: ModuleConfig[]): (Pozice & { i: string })[] {
  const out: (Pozice & { i: string })[] = [];
  let x = 0;
  let y = 0;
  let vyskaRadku = 0;

  for (const m of [...moduly].sort((a, b) => a.order - b.order)) {
    if (m.grid) {
      out.push({ i: m.id, ...m.grid });
      continue;
    }
    const w = sloupcu(m);
    const h = radku(m);
    if (x + w > SLOUPCU) {
      x = 0;
      y += vyskaRadku;
      vyskaRadku = 0;
    }
    out.push({ i: m.id, x, y, w, h });
    x += w;
    vyskaRadku = Math.max(vyskaRadku, h);
  }
  return out;
}

/** Zapíše pozice z mřížky zpět do sestavy. */
export function zRozvrzeni(
  moduly: ModuleConfig[],
  rozvrzeni: { i: string; x: number; y: number; w: number; h: number }[]
): ModuleConfig[] {
  const podleId = new Map(rozvrzeni.map((p) => [p.i, p]));
  return moduly.map((m) => {
    const p = podleId.get(m.id);
    if (!p) return m;
    return {
      ...m,
      grid: { x: p.x, y: p.y, w: p.w, h: p.h },
      // `order` se drží srovnané s mřížkou, aby modul bez uložené pozice
      // (třeba nově přidaný) přistál tam, kam podle pořadí patří.
      order: p.y * SLOUPCU + p.x,
    };
  });
}

/**
 * Rozvržení pro úzkou obrazovku: všechno pod sebe na plnou šířku.
 *
 * Mřížka drží dvanáct sloupců na všech šířkách — kdyby se počet sloupců
 * mezi zlomy měnil, souřadnice uložené u písně by v užším režimu znamenaly
 * něco jiného a dlaždice by přetekly ven z plochy. Mění se tedy rozvržení,
 * ne mřížka pod ním.
 */
export function naRozvrzeniPodSebe(moduly: ModuleConfig[]): (Pozice & { i: string })[] {
  let y = 0;
  return naRozvrzeni(moduly).map((p) => {
    const polozka = { ...p, x: 0, y, w: SLOUPCU };
    y += p.h;
    return polozka;
  });
}
