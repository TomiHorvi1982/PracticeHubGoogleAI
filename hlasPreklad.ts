import { AKCE, SEKCE, vyhradyKeKroku, Krok } from './src/services/hlas/katalog';

/**
 * Překlad popisu příkazu na kroky z katalogu.
 *
 * Odděleno od `server.ts`, aby šlo ověřit obojí zvlášť: sestavení zadání
 * i to, co se udělá s odpovědí. Ta druhá část je důležitější — model
 * odpovídá volným textem a může si vymyslet akci, která neexistuje.
 */

/** Katalog v podobě, ve které ho dostane model. */
export function katalogProModel() {
  return AKCE.map((a) => ({
    id: a.id,
    nazev: a.nazev,
    popis: a.popis,
    parametry: a.parametry.map((p) => ({
      klic: p.klic,
      typ: p.typ,
      ...(p.od !== undefined ? { od: p.od, do: p.do } : {}),
      ...(p.typ === 'sekce' ? { povolene: SEKCE } : {}),
    })),
  }));
}

export function postavZadani(popis: string): string {
  return [
    'Jsi překladač popisu na kroky. Dostaneš popis toho, co má udělat',
    'hlasový příkaz v hudební aplikaci, a seznam akcí, které aplikace umí.',
    'Vrať POUZE pole JSON ve tvaru [{"akce":"id.akce","hodnoty":{...}}].',
    'Použij jen akce ze seznamu a jen jejich parametry. Nic nevymýšlej —',
    'když popisu neodpovídá žádná akce, vrať prázdné pole [].',
    '',
    `Akce: ${JSON.stringify(katalogProModel())}`,
    '',
    `Popis: ${popis}`,
  ].join('\n');
}

export interface Preklad {
  kroky: Krok[];
  vyhrady: string[];
}

/**
 * Vytáhne z odpovědi kroky a zahodí, co neprojde katalogem.
 *
 * Model rád obalí JSON vysvětlením nebo značkami pro zvýraznění kódu,
 * takže se hledá první pole v textu. Co se najde, projde stejnou
 * kontrolou jako ručně sestavený krok — jinak by se do uložených
 * příkazů dostala akce, kterou nikdo neumí provést.
 */
export function zpracujOdpoved(text: string): Preklad {
  const shoda = /\[[\s\S]*\]/.exec(text || '');
  if (!shoda) return { kroky: [], vyhrady: ['Model nevrátil žádné kroky.'] };

  let navrh: unknown;
  try {
    navrh = JSON.parse(shoda[0]);
  } catch {
    return { kroky: [], vyhrady: ['Odpověď modelu nešla přečíst.'] };
  }

  const kroky: Krok[] = [];
  const vyhrady: string[] = [];
  for (const k of Array.isArray(navrh) ? navrh : []) {
    if (!k || typeof k !== 'object' || typeof (k as Krok).akce !== 'string') {
      vyhrady.push('Krok bez akce se zahodil.');
      continue;
    }
    const krok: Krok = { akce: (k as Krok).akce, hodnoty: (k as Krok).hodnoty || {} };
    const potize = vyhradyKeKroku(krok);
    if (potize.length) vyhrady.push(...potize);
    else kroky.push(krok);
  }
  return { kroky, vyhrady };
}
