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

function main() {
  console.log(`Zdroj: ${SRC}`);
  console.log(`Cíl:   ${DST}`);
  console.log(`Na pad: ${PER_PAD} vzorků\n`);

  fs.mkdirSync(DST, { recursive: true });

  let zkopirovano = 0;
  let bajtu = 0;
  const chybejici: string[] = [];

  for (const spec of PADS) {
    const dir = path.join(SRC, spec.folder);
    if (!fs.existsSync(dir)) {
      chybejici.push(`${spec.padId}: složka ${spec.folder}/ neexistuje`);
      continue;
    }

    const kandidati = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.wav') && !f.startsWith('.'))
      .filter((f) => spec.match.test(f))
      .filter((f) => !spec.avoid || !spec.avoid.test(f));

    if (kandidati.length === 0) {
      chybejici.push(`${spec.padId}: v ${spec.folder}/ nic neodpovídá ${spec.match}`);
      continue;
    }

    const vybrane = pick(kandidati);
    const poradiVTieru = new Map<string, number>();

    for (const file of vybrane) {
      const tier = tierOf(levelOf(file));
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
