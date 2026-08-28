import { PADY, KROKU } from './padyService';

/**
 * Vyčtení rytmu ze stopy bicích.
 *
 * Rozdělit celou písničku na nástroje je těžké; rozebrat **stopu bicích**,
 * kterou už Demucs oddělil, je řešitelné — kopák, virbl a hi-hat sedí
 * každý v jiném pásmu. Pracuje se proto s hotovými stopami z knihovny,
 * ne s celým mixem.
 *
 * Postup: tři filtry rozdělí zvuk na pásma, z každého se spočítá obálka
 * hlasitosti, v ní se hledají náběhy, z jejich rozestupů se odhadne tempo
 * a údery se složí do jednoho taktu. Co se opakuje, zůstane; co zaznělo
 * jednou, vypadne — jinak by z každého přeběhu vznikla samostatná tečka.
 */

export interface VysledekDetekce {
  bpm: number;
  uderu: number;
  taktu: number;
  /** Kolik úderů padlo na který nástroj — bez toho se ladit nedá. */
  poPasmech: Record<string, number>;
  mrizka: Record<string, boolean[]>;
  /** V kolika procentech taktů ten úder padl — kvůli poznámce v UI. */
  jistota: Record<string, number[]>;
}

/** Pásma, ve kterých se hledá. Pad, filtr, mez a nejkratší rozestup. */
const PASMA: {
  pad: string;
  typ: BiquadFilterType;
  frekvence: number;
  q?: number;
  citlivost: number;
  minRozestup: number;
  /** Podlaha vůči nejsilnějšímu náběhu v pásmu. */
  podlaha: number;
}[] = [
  // Kopák sedí nízko a doznívá; delší rozestup brání tomu, aby se jeden
  // úder započítal dvakrát kvůli dozvuku.
  // Kopák má nízkou mez: v pásmu pod 120 Hz nic jiného nehraje, takže
  // šum nehrozí, a s přísnější mezí jich osm taktů smyčky našlo jedenáct.
  { pad: 'kick', typ: 'lowpass', frekvence: 120, citlivost: 1.0, minRozestup: 0.06, podlaha: 0.03 },
  /**
   * Virbl se hledá v šumu, ne v těle bubnu.
   *
   * Kolem 300 Hz má virbl základ, jenže tam sahá i kopák a tomy — pásmo
   * pak hlásilo úder skoro na každé šestnáctině. Charakteristický je pro
   * něj široký šum kolem dvou a půl kilohertzů, kde kopák nemá co dělat.
   */
  { pad: 'snare', typ: 'bandpass', frekvence: 2500, q: 1.0, citlivost: 1.9, minRozestup: 0.08, podlaha: 0.08 },
  // Hi-hat je krátký šum vysoko; hraje se hustě, takže rozestup krátký.
  { pad: 'hihat_closed', typ: 'highpass', frekvence: 9000, citlivost: 1.9, minRozestup: 0.045, podlaha: 0.08 },
];

const HOP = 512;

/** Obálka hlasitosti jednoho pásma: efektivní hodnota po blocích. */
async function obalkaPasma(
  zvuk: AudioBuffer,
  typ: BiquadFilterType,
  frekvence: number,
  q?: number,
): Promise<{ obalka: Float32Array; vzorkovani: number }> {
  const off = new OfflineAudioContext(1, zvuk.length, zvuk.sampleRate);
  const zdroj = off.createBufferSource();
  zdroj.buffer = zvuk;
  const filtr = off.createBiquadFilter();
  filtr.type = typ;
  filtr.frequency.value = frekvence;
  if (q !== undefined) filtr.Q.value = q;
  zdroj.connect(filtr);
  filtr.connect(off.destination);
  zdroj.start();

  const vysledek = await off.startRendering();
  const data = vysledek.getChannelData(0);
  const bloku = Math.floor(data.length / HOP);
  const obalka = new Float32Array(bloku);
  for (let i = 0; i < bloku; i++) {
    let soucet = 0;
    for (let j = 0; j < HOP; j++) {
      const v = data[i * HOP + j];
      soucet += v * v;
    }
    obalka[i] = Math.sqrt(soucet / HOP);
  }
  return { obalka, vzorkovani: zvuk.sampleRate / HOP };
}

/**
 * Náběhy v obálce.
 *
 * Hledá se přírůstek hlasitosti, ne hlasitost sama — jinak by se v hlasité
 * pasáži označilo všechno a v tiché nic. Mez je klouzavá: násobek průměru
 * v okolí, takže se přizpůsobí tomu, jak je která část nahraná.
 */
function najdiNabehy(
  obalka: Float32Array,
  vzorkovani: number,
  citlivost: number,
  minRozestup: number,
  podlahaPomer: number,
): { cas: number; sila: number }[] {
  const prirustek = new Float32Array(obalka.length);
  for (let i = 1; i < obalka.length; i++) {
    prirustek[i] = Math.max(0, obalka[i] - obalka[i - 1]);
  }

  const OKNO = Math.round(vzorkovani * 0.35);
  const nalezy: { cas: number; sila: number }[] = [];
  let poslednim = -Infinity;

  // Podlaha podle celé stopy. Klouzavý průměr sám nestačí: většina bloků
  // je nulová, takže průměr vyjde skoro nulový a přes jeho násobek se
  // dostane i šum. Bez téhle podlahy hlásil detektor dvacet úderů za
  // sekundu.
  let maximum = 0;
  for (let i = 0; i < prirustek.length; i++) maximum = Math.max(maximum, prirustek[i]);
  const podlaha = maximum * podlahaPomer;

  for (let i = 1; i < prirustek.length - 1; i++) {
    // Jen vrchol, ne stoupání — bez toho by jeden úder dal několik teček.
    if (prirustek[i] < prirustek[i - 1] || prirustek[i] < prirustek[i + 1]) continue;
    if (prirustek[i] < podlaha) continue;

    const od = Math.max(0, i - OKNO);
    const doo = Math.min(prirustek.length, i + OKNO);
    let soucet = 0;
    let soucetCtvercu = 0;
    for (let j = od; j < doo; j++) {
      soucet += prirustek[j];
      soucetCtvercu += prirustek[j] * prirustek[j];
    }
    const n = doo - od;
    const prumer = soucet / n;
    const odchylka = Math.sqrt(Math.max(0, soucetCtvercu / n - prumer * prumer));
    // Mez podle rozptylu okolí: v hustě hraném místě povolí víc, v tichém míň.
    const mez = prumer + citlivost * odchylka;

    const cas = i / vzorkovani;
    if (prirustek[i] > mez && cas - poslednim >= minRozestup) {
      nalezy.push({ cas, sila: prirustek[i] / Math.max(mez, 1e-9) });
      poslednim = cas;
    }
  }
  return nalezy;
}

/**
 * Tempo z rozestupů mezi údery.
 *
 * Autokorelace obálky: hledá se posun, při kterém se rytmus nejvíc kryje
 * sám se sebou. Rozsah je omezený na 60–200, protože mimo něj vycházejí
 * dvojnásobky a poloviny, které jsou matematicky stejně dobré a hudebně
 * k ničemu.
 */
function odhadniTempo(nabehy: Float32Array, vzorkovani: number): number {
  // Autokorelace potřebuje průběh kolem nuly. Bez odečtení průměru vyhraje
  // vždycky nejkratší posun, protože se sčítají samá kladná čísla.
  let prumer = 0;
  for (let i = 0; i < nabehy.length; i++) prumer += nabehy[i];
  prumer /= nabehy.length;
  const stred = new Float32Array(nabehy.length);
  for (let i = 0; i < nabehy.length; i++) stred[i] = nabehy[i] - prumer;

  const minLag = Math.floor((60 / 200) * vzorkovani);
  const maxLag = Math.ceil((60 / 60) * vzorkovani);

  // Autokorelace se počítá až do čtyřnásobku hledaného rozsahu.
  // Harmonické členy níž sahají na dvoj- a čtyřnásobek posunu; kdyby
  // končila na `maxLag`, pomalejší tempa by svůj bonus nikdy nedostala
  // a rychlá by vyhrávala systematicky. Přesně na tohle vycházelo
  // u stopy se 118 BPM tempo 156.
  const acDo = Math.min(stred.length - 1, maxLag * 4);
  const ac = new Float32Array(acDo + 1);
  for (let lag = minLag; lag <= acDo; lag++) {
    let soucet = 0;
    for (let i = 0; i + lag < stred.length; i++) soucet += stred[i] * stred[i + lag];
    ac[lag] = soucet / (stred.length - lag);
  }

  /**
   * Doba se pozná podle toho, že se opakuje i po dvou a čtyřech dobách.
   * Bez tohohle sečtení vyhrává osminové nebo triolové dělení — sedí
   * matematicky stejně dobře, ale za dobu ho nikdo nepovažuje.
   *
   * Navrch jde mírné zvýhodnění temp kolem 120. Dvojnásobek i polovina
   * sedí vždycky stejně dobře, takže bez něj rozhoduje šum; lidé přitom
   * počítají dobu spíš uprostřed rozsahu než na jeho kraji.
   */
  let nejlepsi = minLag;
  let nejvic = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < stred.length; lag++) {
    let skore = ac[lag];
    if (lag * 2 <= acDo) skore += 0.6 * ac[lag * 2];
    if (lag * 4 <= acDo) skore += 0.3 * ac[lag * 4];

    const bpmKandidat = 60 / (lag / vzorkovani);
    const odchylka = Math.log2(bpmKandidat / 120);
    skore *= Math.exp(-(odchylka * odchylka) / (2 * 0.6 * 0.6));

    if (skore > nejvic) {
      nejvic = skore;
      nejlepsi = lag;
    }
  }

  const bpm = 60 / (nejlepsi / vzorkovani);
  // Krajní hodnoty jsou skoro vždy dvojnásobek nebo polovina skutečného tempa.
  if (bpm > 190) return Math.round(bpm / 2);
  if (bpm < 65) return Math.round(bpm * 2);
  return Math.round(bpm);
}

export interface Nastaveni {
  /** Tempo, když ho člověk zná líp než odhad. */
  bpm?: number;
  /** Jak často musí úder padnout, aby zůstal (0–1). */
  prah?: number;
}

/**
 * Doladí tempo a začátek taktu tak, aby údery sedly na mřížku.
 *
 * Autokorelace trefí tempo na jednotky procent, jenže i chyba jednoho
 * BPM se přes šestnáct taktů nasčítá na celý krok — rytmus se pak zapíše
 * posunutý nebo rozmazaný. Měřeno na umělých bicích: při 90 BPM
 * odhadnutých jako 91 nezůstala v mřížce ani jedna tečka.
 *
 * Hledá se proto dvojice (tempo, začátek), při které padne co nejvíc
 * úderů blízko ke svému kroku.
 */
function dolad(
  casy: number[],
  hrubeBpm: number,
  tempoDano: boolean,
): { bpm: number; zacatek: number } {
  if (casy.length < 8) return { bpm: hrubeBpm, zacatek: casy[0] || 0 };

  const prvni = Math.min(...casy);
  let nej = { bpm: hrubeBpm, zacatek: prvni, skore: -1 };

  // Tempo se hýbe jen o kousek — hrubý odhad je řádově správný. Když ho
  // člověk zadal ručně, nechává se být a ladí se jen začátek.
  const rozsah = tempoDano ? [hrubeBpm] : Array.from({ length: 41 }, (_, i) => hrubeBpm * (0.97 + i * 0.0015));

  for (const bpm of rozsah) {
    const krok = (60 / bpm) / 4;
    for (let f = 0; f < 16; f++) {
      const zacatek = prvni + (f / 16) * krok;
      let skore = 0;
      for (const c of casy) {
        if (c < zacatek) continue;
        const odchylka = Math.abs(((c - zacatek) / krok) % 1);
        const vzdalenost = Math.min(odchylka, 1 - odchylka);
        // Blízko ke kroku se počítá plně, dál rychle klesá.
        if (vzdalenost < 0.2) skore += 1 - vzdalenost / 0.2;
      }
      if (skore > nej.skore) nej = { bpm, zacatek, skore };
    }
  }

  return { bpm: Math.round(nej.bpm), zacatek: nej.zacatek };
}

export async function vyctiRytmus(
  zvuk: AudioBuffer,
  nastaveni: Nastaveni = {},
): Promise<VysledekDetekce> {
  /**
   * Nejdřív kdy, potom co.
   *
   * Hledat údery v každém pásmu zvlášť nefunguje: virbl i hi-hat jsou
   * široký šum, takže se ozvou i tam, kde nemají, a jeden úder se ohlásí
   * třikrát. Měřeno proti umělým bicím se známým zadáním z toho vycházelo
   * čtyřicet chybných teček ze čtyřiceti pěti.
   *
   * Proto se nejdřív najde, *kdy* se udeřilo — ze součtu všech pásem —
   * a teprve pak se podle poměru energií rozhodne, *do čeho*. Nástroj se
   * pozná tím, které pásmo je vůči svému běžnému stavu nejvýraznější;
   * absolutní hlasitost neřekne nic, protože každé pásmo má jinou.
   */
  const pasma: { pad: string; obalka: Float32Array }[] = [];
  let vzorkovani = 0;

  for (const p of PASMA) {
    const v = await obalkaPasma(zvuk, p.typ, p.frekvence, p.q);
    vzorkovani = v.vzorkovani;
    pasma.push({ pad: p.pad, obalka: v.obalka });
  }

  const delka = Math.min(...pasma.map((p) => p.obalka.length));

  /** Náběhy sečtené přes všechna pásma — kdy se vůbec udeřilo. */
  const spolecne = new Float32Array(delka);
  for (const p of pasma) {
    let max = 0;
    for (let i = 1; i < delka; i++) max = Math.max(max, p.obalka[i] - p.obalka[i - 1]);
    if (max <= 0) continue;
    for (let i = 1; i < delka; i++) {
      spolecne[i] += Math.max(0, p.obalka[i] - p.obalka[i - 1]) / max;
    }
  }

  const casy = najdiNabehy(spolecne, vzorkovani, 1.4, 0.04, 0.05);

  /** Obvyklá výše pásma — podle ní se pozná, co je pro něj výrazné. */
  const typicka: Record<string, number> = {};
  for (const p of pasma) {
    const hodnoty = Array.from(p.obalka.slice(0, delka)).filter((v) => v > 0).sort((a, b) => a - b);
    typicka[p.pad] = hodnoty.length ? hodnoty[Math.floor(hodnoty.length * 0.75)] : 1e-9;
  }

  const jedinecne: { cas: number; pad: string; sila: number }[] = [];
  for (const c of casy) {
    const i = Math.round(c.cas * vzorkovani);
    const skore: Record<string, number> = {};
    for (const p of pasma) {
      // Vrchol krátce po náběhu: úder má náběh i doznění, špička nemusí
      // padnout přesně na ten blok, ve kterém se náběh poznal.
      let vrchol = 0;
      for (let j = i; j < Math.min(delka, i + 4); j++) vrchol = Math.max(vrchol, p.obalka[j]);
      skore[p.pad] = vrchol / Math.max(typicka[p.pad], 1e-9);
    }

    const nizke = skore['kick'] || 0;
    const stredni = skore['snare'] || 0;
    const vysoke = skore['hihat_closed'] || 0;

    /**
     * Jeden okamžik může nést víc nástrojů.
     *
     * Kopák s hi-hatem na jedné době je běžný a dřív se z nich zapsal jen
     * ten silnější — hi-hat pak v rytmu chyběl přesně na dobách, kde ho
     * bubeník hraje nejjistěji. Zapíše se proto každé pásmo, které je
     * vůči svému běžnému stavu výrazné, ne jen to nejvýraznější.
     */
    const nejvic = Math.max(nizke, stredni, vysoke);
    const vyrazne = (v: number) => v >= 1.6 && v >= nejvic * 0.45;

    // Kopák musí mít sílu dole a zároveň málo nahoře. Samotná mez dole
    // nestačí: rána do virblu rozezní i basové pásmo a kopák se pak
    // hlásil i na druhé a čtvrté době.
    if (vyrazne(nizke) && nizke > vysoke * 1.1) {
      jedinecne.push({ cas: c.cas, pad: 'kick', sila: nizke });
    }
    // Hi-hat a virbl se posuzují každý zvlášť, ne jeden místo druhého:
    // na druhé době se hraje obojí najednou a dřív z toho zůstal jen
    // jeden.
    if (vyrazne(vysoke)) {
      jedinecne.push({ cas: c.cas, pad: 'hihat_closed', sila: vysoke });
    }
    // Virbl má proti hi-hatu tělo ve středech — tím se od něj pozná.
    if (vyrazne(stredni) && stredni > vysoke * 0.45) {
      jedinecne.push({ cas: c.cas, pad: 'snare', sila: stredni });
    }
  }

  /** Náběhy sečtené přes pásma slouží i k odhadu tempa. */
  const hrubeBpm = nastaveni.bpm || odhadniTempo(spolecne, vzorkovani);
  const { bpm, zacatek } = dolad(jedinecne.map((n) => n.cas), hrubeBpm, nastaveni.bpm !== undefined);

  const delkaTaktu = (60 / bpm) * 4;
  const delkaKroku = delkaTaktu / KROKU;
  const taktu = Math.max(1, Math.floor((zvuk.duration - zacatek) / delkaTaktu));

  const pocty: Record<string, number[]> = Object.fromEntries(
    PADY.map((p) => [p.id, new Array(KROKU).fill(0)]),
  );

  for (const n of jedinecne) {
    if (n.cas < zacatek) continue;
    const krokCelkem = Math.round((n.cas - zacatek) / delkaKroku);
    if (Math.floor(krokCelkem / KROKU) >= taktu) continue;
    pocty[n.pad][krokCelkem % KROKU]++;
  }

  const prah = nastaveni.prah ?? 0.4;
  const mrizka: Record<string, boolean[]> = {};
  const jistota: Record<string, number[]> = {};
  for (const p of PADY) {
    jistota[p.id] = pocty[p.id].map((c) => c / taktu);
    // Druhá mez je poměrná k tomu, jak často ten nástroj hraje vůbec.
    // Pevná mez sama nestačí: hi-hat jede pořád, takže by prošlo všech
    // šestnáct kroků, kdežto crash by nepustil ani jeden.
    const nejvic = Math.max(...jistota[p.id]);
    mrizka[p.id] = jistota[p.id].map((j) => j >= prah && j >= nejvic * 0.55);
  }

  const poPasmech: Record<string, number> = {};
  for (const n of jedinecne) poPasmech[n.pad] = (poPasmech[n.pad] || 0) + 1;

  return { bpm, uderu: jedinecne.length, taktu, poPasmech, mrizka, jistota };
}
