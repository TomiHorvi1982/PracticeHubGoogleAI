// scripts/pick-drum-samples.ts — vybere z velké knihovny bicích vzorků
// hratelnou sadu pro appku.
//
// Sample knihovny bývají pojmenované po značce a artikulaci
// (`Ludwig_Bassdrum_24_Standard_100a.wav`) a mívají stovky souborů na
// jeden buben. Appka ale potřebuje vědět, který pad vzorek obsluhuje a jak
// silný úder představuje — tedy `pad_dynamika_rrN.wav`. Tenhle skript
// vybere pár vzorků na každý pad a zkopíruje je pod správnými názvy do
// nové složky sady, odkud je vezme sync-folder.ts.
//
// Originály nechává být — jen kopíruje.
//
// Použití:
//   bun run scripts/pick-drum-samples.ts "<zdrojová sada>" "<cílová sada>" [--per-pad 3]

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(process.argv[2] || '');
const DST = path.resolve(process.argv[3] || '');
const perPadIdx = process.argv.indexOf('--per-pad');
const PER_PAD = perPadIdx > -1 ? parseInt(process.argv[perPadIdx + 1], 10) : 3;

if (!SRC || !fs.existsSync(SRC) || !DST) {
  console.error('BLOCKED: zadejte zdrojovou a cílovou složku sady.');
  console.error('Použití: bun run scripts/pick-drum-samples.ts "<zdroj>" "<cíl>" [--per-pad 3]');
  process.exit(1);
}

/**
 * Které pady appka zná a kde k nim v knihovně hledat vzorky.
 * `folder` je podsložka nástroje, `match` musí sedět na název souboru,
 * `avoid` odfiltruje modely, které patří jinému padu (dva crashe se liší
 * jen značkou, ne artikulací).
 */
interface PadSpec {
  padId: string;
  folder: string;
  match: RegExp;
  avoid?: RegExp;
}

/**
 * Balíčky jednorázových samplů (one-shot). Nemají dynamické vrstvy — každý
 * soubor je jeden úder — takže se z nich dělají varianty pro střídání
 * (round-robin) na jedné dynamice. Opakovaný úder pak nezní identicky.
 *
 * Mapuje se JEN tam, kde zdroj sám říká, o jaký nástroj jde. Pady jako
 * rimshot, hi-hat na pedál nebo zvonec činelu tenhle typ balíčku
 * nerozlišuje a zůstanou prázdné — dosadit do nich náhodný soubor by
 * znamenalo hádat a znělo by to špatně.
 */
const PADS_ONESHOT: PadSpec[] = [
  { padId: 'kick', folder: '.', match: /(TB_KICK|Riddim Kick)/i },
  { padId: 'snare', folder: '.', match: /(TB_SNARE|Riddim Snare \d)/i },
  { padId: 'handclap', folder: '.', match: /Riddim Clap/i },
  { padId: 'hihat_closed', folder: '.', match: /(TB_HAT|Riddim CH)/i },
  { padId: 'hihat_open', folder: '.', match: /Riddim OH/i },
  { padId: 'ride_bow', folder: '.', match: /Riddim Ride/i },
  // Dva crashe musí znít jinak, takže si nesmí brát tytéž soubory.
  { padId: 'crash_left', folder: '.', match: /Riddim Crash [1-5]\b/i },
  { padId: 'crash_right', folder: '.', match: /Riddim Crash (?:[6-9]|10)\b/i },
  // Balíček výšku tomů nerozlišuje. Rozdělují se po pořadí, což je u těchhle
  // sad obvyklé řazení — ale je to odhad, který je potřeba ověřit poslechem.
  { padId: 'tom_high', folder: '.', match: /TB_TOM_0(0[1-9])/i },
  { padId: 'tom_mid', folder: '.', match: /TB_TOM_0(1[0-7])/i },
  { padId: 'tom_low', folder: '.', match: /TB_TOM_0(1[89]|2[0-5])/i },
];

const PADS: PadSpec[] = [
  { padId: 'kick', folder: 'Kick', match: /Bassdrum.*_Standard_/i },
  { padId: 'snare', folder: 'Snare', match: /_Standard_/i, avoid: /snares_off/i },
  { padId: 'snare_sidestick', folder: 'Snare', match: /_Sidestick_/i, avoid: /snares_off/i },
  { padId: 'hihat_closed', folder: 'Hat', match: /_Closed_/i },
  { padId: 'hihat_semi', folder: 'Hat', match: /_Half_Open_/i },
  { padId: 'hihat_open', folder: 'Hat', match: /_Open_/i, avoid: /Half_Open/i },
  { padId: 'hihat_pedal', folder: 'Hat', match: /_Foot_/i },
  { padId: 'tom_high', folder: 'Tom', match: /Tom_1[012]_Standard_/i },
  { padId: 'tom_mid', folder: 'Tom', match: /Tom_1[45]_Standard_/i },
  { padId: 'tom_low', folder: 'Floortom', match: /Floortom.*_Standard_/i },
  { padId: 'crash_left', folder: 'Crash', match: /Dark_Crash.*_Standard_/i },
  { padId: 'crash_right', folder: 'Crash', match: /Crash_Ride.*_Standard_/i },
  { padId: 'ride_bow', folder: 'Ride', match: /Ride.*_Standard_/i },
  { padId: 'ride_bell', folder: 'Ride', match: /Ride.*_Bell_/i },
  { padId: 'china', folder: 'China', match: /China.*_Standard_/i },
  { padId: 'splash', folder: 'Splash', match: /Splash.*_Standard_/i },
];

/** Hlasitost z názvu (`..._100a.wav` -> 100) na dynamickou vrstvu appky. */
const TIER_BY_LEVEL: Record<number, string> = { 50: 'med', 100: 'hard', 150: 'very_hard' };

function levelOf(file: string): number | null {
  const m = path.basename(file).match(/_(\d+)[a-z]*\.wav$/i);
  return m ? parseInt(m[1], 10) : null;
}

function tierOf(level: number | null): string {
  if (level === null) return 'hard';
  return TIER_BY_LEVEL[level] || (level >= 120 ? 'very_hard' : level <= 60 ? 'med' : 'hard');
}

/**
 * Vybere `PER_PAD` vzorků a rozloží je pokud možno přes dostupné hlasitosti —
 * pad pak reaguje na sílu úderu. Když je k dispozici jen jedna hlasitost,
 * vezme různé varianty téhož úderu, aby opakované rány nezněly identicky.
 */
function pick(files: string[]): string[] {
  const byLevel = new Map<number, string[]>();
  for (const f of files.sort()) {
    const lvl = levelOf(f) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(f);
  }

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const out: string[] = [];
  let round = 0;
  while (out.length < PER_PAD && round < 20) {
    for (const lvl of levels) {
      const bucket = byLevel.get(lvl)!;
      if (round < bucket.length && out.length < PER_PAD) out.push(bucket[round]);
    }
    round++;
  }
  return out;
}

/** Projde i podsložky — one-shot balíčky bývají členěné po nástrojích. */
function vsechnyWav(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...vsechnyWav(abs));
    else if (e.name.toLowerCase().endsWith('.wav')) out.push(abs);
  }
  return out;
}

function main() {
  console.log(`Zdroj: ${SRC}`);
  console.log(`Cíl:   ${DST}`);
  console.log(`Na pad: ${PER_PAD} vzorků\n`);

  fs.mkdirSync(DST, { recursive: true });

  let zkopirovano = 0;
  let bajtu = 0;
  const chybejici: string[] = [];

  // Profil se volí podle toho, co ve složce je: knihovna členěná podle
  // značky a artikulace (Kick/, Snare/…), nebo balíček jednorázových samplů.
  const maSlozkyNastroju = PADS.some((p) => fs.existsSync(path.join(SRC, p.folder)));
  const profil = maSlozkyNastroju ? PADS : PADS_ONESHOT;
  const vsechny = maSlozkyNastroju ? [] : vsechnyWav(SRC);
  console.log(`Profil: ${maSlozkyNastroju ? 'knihovna s vrstvami' : 'jednorázové samply (round-robin)'}\n`);

  for (const spec of profil) {
    const dir = path.join(SRC, spec.folder);
    if (maSlozkyNastroju && !fs.existsSync(dir)) {
      chybejici.push(`${spec.padId}: složka ${spec.folder}/ neexistuje`);
      continue;
    }

    const kandidati = (maSlozkyNastroju
        ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav') && !f.startsWith('.'))
        : vsechny.map((f) => path.relative(SRC, f)))
      .filter((f) => spec.match.test(path.basename(f)))
      .filter((f) => !spec.avoid || !spec.avoid.test(path.basename(f)));

    if (kandidati.length === 0) {
      chybejici.push(`${spec.padId}: v ${spec.folder}/ nic neodpovídá ${spec.match}`);
      continue;
    }

    const vybrane = pick(kandidati);
    const poradiVTieru = new Map<string, number>();

    for (const file of vybrane) {
      // U jednorázových balíčků je číslo v názvu pořadí, ne síla úderu.
      // Odvozovat z něj dynamiku by pady rozházelo do vrstev náhodně —
      // `TB_TOM_001` není tišší než `TB_TOM_020`. Všechny jdou do jedné
      // vrstvy a liší se jen pořadím střídání.
      const tier = maSlozkyNastroju ? tierOf(levelOf(file)) : 'hard';
      const rr = (poradiVTieru.get(tier) || 0) + 1;
      poradiVTieru.set(tier, rr);

      const cilovyNazev = `${spec.padId}_${tier}_rr${rr}.wav`;
      const src = path.join(dir, file);
      fs.copyFileSync(src, path.join(DST, cilovyNazev));
      bajtu += fs.statSync(src).size;
      zkopirovano++;
      console.log(`  ${cilovyNazev.padEnd(28)} <- ${spec.folder}/${file}`);
    }
  }

  console.log(`\nHotovo: ${zkopirovano} vzorků, ${(bajtu / 1024 / 1024).toFixed(1)} MB.`);
  if (chybejici.length) {
    console.log(`\nBez vzorku zůstalo ${chybejici.length} padů:`);
    for (const c of chybejici) console.log(`  • ${c}`);
  }
}

main();
