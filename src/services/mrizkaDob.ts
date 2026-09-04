/**
 * Časová osa mixu: přiblížení, smyčka a mřížka dob.
 *
 * Všechno je to počítání, u kterého se chyba neprojeví pádem — jen
 * posunutou čárou nebo smyčkou, která začíná o kus vedle. Proto to
 * sedí zvlášť a je na to sada testů.
 */

/** Meze přiblížení. Nad dvacetinásobek už je vidět jednotlivé vzorky. */
/**
 * Od jaké shody se mřížka dob kreslí.
 *
 * Níž bývá skladba, která pravidelný rytmus nemá, nebo tempo odhadnuté
 * vedle. Čára uprostřed tónu je horší než žádná — člověk podle ní míří
 * a pak se diví.
 */
export const PRAH_MRIZKY = 0.66;

export const MIN_ZOOM = 1;
/**
 * Nejhlubší přiblížení.
 *
 * Padesátkrát znamená u tříminutové skladby zhruba čtyři vteřiny na
 * obraz — dost na to, aby se dal najít jeden úder.
 */
export const MAX_ZOOM = 50;

/**
 * Kus skladby, který je při daném přiblížení vidět.
 *
 * `stred` je čas, kolem kterého se přibližuje — obvykle přehrávací
 * hlava. Výřez se drží uvnitř skladby: u kraje se posune dovnitř
 * místo toho, aby ukazoval prázdno za koncem.
 */
export function vyrez(delka: number, zoom: number, stred: number): { od: number; do: number } {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom || 1));
  if (!(delka > 0)) return { od: 0, do: 0 };
  const sirka = delka / z;
  let od = stred - sirka / 2;
  if (od < 0) od = 0;
  if (od + sirka > delka) od = delka - sirka;
  return { od: Math.max(0, od), do: Math.min(delka, od + sirka) };
}

/**
 * Jak dlouhý úsek se při daném přiblížení vejde.
 *
 * Vytažené zvlášť, protože se to počítá i mimo výřez — posuvník podle
 * toho ví, jak velký má být jezdec.
 */
export function sirkaVyrezu(delka: number, zoom: number): number {
  if (!(delka > 0)) return 0;
  return delka / Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom || 1));
}

/**
 * Srovná ruční posun tak, aby výřez zůstal uvnitř skladby.
 *
 * Bez tohohle by šlo odjet za konec a koukat do prázdna.
 */
export function srovnejPosun(delka: number, zoom: number, od: number): number {
  const sirka = sirkaVyrezu(delka, zoom);
  if (!(sirka > 0)) return 0;
  return Math.max(0, Math.min(delka - sirka, Number.isFinite(od) ? od : 0));
}

/** Výřez daný začátkem, ne středem — takhle se posouvá ručně. */
export function vyrezOd(delka: number, zoom: number, od: number): { od: number; do: number } {
  const sirka = sirkaVyrezu(delka, zoom);
  if (!(sirka > 0)) return { od: 0, do: 0 };
  const zac = srovnejPosun(delka, zoom, od);
  return { od: zac, do: zac + sirka };
}

/**
 * Je čas vidět ve výřezu?
 *
 * Podle toho se pozná, kdy má obraz zase začít sledovat hlavu: dokud
 * je hlava na obraze, ruční posun platí; jakmile uteče ven, přebírá
 * to zpátky přehrávání.
 */
export function jeVidet(cas: number, v: { od: number; do: number }): boolean {
  return cas >= v.od && cas <= v.do;
}

/** Čas na vodorovnou pozici v pixelech. */
export function casNaX(cas: number, od: number, doKdy: number, sirka: number): number {
  const rozsah = doKdy - od;
  if (!(rozsah > 0) || !(sirka > 0)) return 0;
  return ((cas - od) / rozsah) * sirka;
}

/** Pozice v pixelech zpátky na čas. */
export function xNaCas(x: number, od: number, doKdy: number, sirka: number): number {
  const rozsah = doKdy - od;
  if (!(rozsah > 0) || !(sirka > 0)) return od;
  return od + (x / sirka) * rozsah;
}

/**
 * Srovná konce smyčky.
 *
 * Táhnout se dá oběma směry, takže začátek může skončit za koncem —
 * pak se prohodí. Nulová délka by znamenala smyčku, ze které se
 * nedostane ven, tak se drží aspoň desetina vteřiny.
 */
export function srovnejSmycku(a: number, b: number, delka: number): { od: number; do: number } {
  const NEJKRATSI = 0.1;
  let od = Math.max(0, Math.min(delka, Math.min(a, b)));
  let doKdy = Math.max(0, Math.min(delka, Math.max(a, b)));
  if (doKdy - od < NEJKRATSI) doKdy = Math.min(delka, od + NEJKRATSI);
  if (doKdy - od < NEJKRATSI) od = Math.max(0, doKdy - NEJKRATSI);
  return { od, do: doKdy };
}

/**
 * Doby v daném úseku podle tempa.
 *
 * `faze` je čas první doby. Bez ní by mřížka sice měla správné rozestupy,
 * ale ležela by kdekoli — a čára uprostřed tónu je horší než žádná.
 */
export function dobyVRozsahu(bpm: number, faze: number, od: number, doKdy: number): number[] {
  if (!(bpm > 0) || !(doKdy > od)) return [];
  const krok = 60 / bpm;
  // Moc hustou mřížku nemá smysl kreslit — z tisíce čar se stane šeď.
  if ((doKdy - od) / krok > 400) return [];
  const prvni = Math.ceil((od - faze) / krok);
  const doby: number[] = [];
  for (let i = prvni; ; i++) {
    const t = faze + i * krok;
    if (t > doKdy) break;
    if (t >= od) doby.push(t);
  }
  return doby;
}

/** Kolikátá doba v taktu to je (0 = první, přízvučná). */
export function dobaVTaktu(cas: number, bpm: number, faze: number, dobVTaktu = 4): number {
  if (!(bpm > 0) || dobVTaktu < 1) return 0;
  const krok = 60 / bpm;
  const i = Math.round((cas - faze) / krok);
  return ((i % dobVTaktu) + dobVTaktu) % dobVTaktu;
}

/**
 * Najde fázi, na které mřížka nejlíp sedí na skutečné nástupy.
 *
 * Měří se podíl čar, které mají pod sebou úder — ne průměrná
 * vzdálenost nástupů k čarám. Ten rozdíl je zásadní: detektor najde
 * i hi-hat a ozdoby, takže na jednu dobu vyjde pět nástupů, a průměrná
 * vzdálenost je pak mizerná i u skladby, která je rytmicky v pořádku.
 * Zjištěno měřením na skutečné nahrávce: shoda vycházela 0,015,
 * přestože bicí hrály pravidelně.
 *
 * Otázka, na kterou se ptáme, zní „má skladba v tomhle tempu
 * pravidelné doby", a na tu odpovídá podíl trefených čar.
 *
 * Vrací `shoda` 0–1, aby volající poznal, jestli výsledku věřit.
 */
export function najdiFazi(nastupy: number[], bpm: number): { faze: number; shoda: number } {
  if (!(bpm > 0) || nastupy.length < 4) return { faze: 0, shoda: 0 };
  const krok = 60 / bpm;
  // Úder se počítá jako trefa, když leží do desetiny doby od čáry.
  const tolerance = krok * 0.1;
  const KROKU = 64;

  const od = nastupy[0];
  const doKdy = nastupy[nastupy.length - 1];
  const carCelkem = Math.max(1, Math.floor((doKdy - od) / krok));

  let nej = { faze: 0, trefy: -1 };
  for (let k = 0; k < KROKU; k++) {
    const f = od + (k / KROKU) * krok;
    let trefy = 0;
    for (let c = 0; c < carCelkem; c++) {
      const cara = f + c * krok;
      // Stačí, že u čáry něco je — kolik toho je, nerozhoduje.
      if (nastupy.some((n) => Math.abs(n - cara) <= tolerance)) trefy++;
    }
    if (trefy > nej.trefy) nej = { faze: f, trefy };
  }

  // Podíl čar, které mají pod sebou úder. Tohle je otázka, na kterou
  // se ptáme: má skladba pravidelné doby v tomhle tempu?
  return { faze: nej.faze % krok, shoda: Math.max(0, Math.min(1, nej.trefy / carCelkem)) };
}


/**
 * Tempo odvozené přímo z nástupů.
 *
 * Uložené BPM z rozboru se s tím, co je v nahrávce slyšet, nemusí
 * shodovat — u jedné zkoušené skladby vyšlo 117, kdežto údery bicích
 * chodily po 0,44 s, tedy kolem 136. Mřížka postavená na špatném čísle
 * se nezarovná nikdy, takže si tempo pro ni radši spočítáme z těch
 * nástupů, které opravdu jsou.
 *
 * Bere se medián mezer, ne průměr: jeden vynechaný úder posune průměr,
 * medián ne.
 */
export function tempoZNastupu(nastupy: number[]): number {
  if (nastupy.length < 8) return 0;
  const mezery = nastupy.slice(1)
    .map((x, i) => x - nastupy[i])
    // Mezery mimo hudební rozsah jsou pauzy mezi frázemi, ne doby.
    .filter((m) => m >= 0.2 && m <= 1.5)
    .sort((a, b) => a - b);
  if (mezery.length < 6) return 0;
  const median = mezery[Math.floor(mezery.length / 2)];
  if (!(median > 0)) return 0;

  let bpm = 60 / median;
  // Nástupy bývají na osminách nebo naopak na půlkách. Srovná se to do
  // obvyklého rozsahu, aby z toho nevyšlo 240 nebo 35.
  while (bpm > 180) bpm /= 2;
  while (bpm > 0 && bpm < 60) bpm *= 2;
  return Math.round(bpm);
}
